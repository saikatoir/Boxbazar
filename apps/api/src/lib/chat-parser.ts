import { createHash } from 'node:crypto';
import {
  extractBDPhones,
  inferAddressParts,
  normalizeBDPhone,
} from '@fcommerce/shared';
import redis from './redis.js';
import { env } from '../env.js';

export type ParsedItem = {
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type ParsedChat = {
  recipientName: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  zone: string | null;
  area: string | null;
  items: ParsedItem[];
  subtotalCents: number | null;
  deliveryCents: number | null;
  codCents: number | null;
  notes: string | null;
};

export type FieldConfidence = {
  overall: number;
  fields: {
    recipientName: number;
    phone: number;
    address: number;
    items: number;
    codAmount: number;
  };
};

export type ParseResult = {
  parsed: ParsedChat;
  confidence: FieldConfidence;
  source: 'cache' | 'gemini' | 'heuristic';
};

const CACHE_PREFIX = 'chat-parse:v1:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function cacheKey(text: string): string {
  const hash = createHash('sha256').update(text.trim()).digest('hex');
  return `${CACHE_PREFIX}${hash}`;
}

function toCents(n: number | string | null | undefined): number | null {
  if (n == null) return null;
  const num = typeof n === 'string' ? Number(n.replace(/[^\d.]/g, '')) : n;
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

/**
 * Pulls explicit BDT amounts ("৳ 1200", "Tk 950", "1200 taka", "total 2050") from text.
 * The largest plausible value is treated as the COD/total, smaller values
 * marked as delivery or item prices for downstream heuristics.
 */
function extractAmounts(text: string): number[] {
  const banglaDigits = '০১২৩৪৫৬৭৮৯';
  const ascii = text.replace(/[০-৯]/g, (c) => String(banglaDigits.indexOf(c)));
  const re = /(?:৳|tk\.?|taka|bdt)\s*([\d,]+(?:\.\d+)?)|([\d,]{3,})\s*(?:tk\.?|taka|৳|bdt)/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(ascii)) != null) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    const value = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0 && value < 1_000_000) {
      out.push(value);
    }
  }
  return out;
}

/**
 * Cheap, deterministic pass that doesn't need an LLM. Used as the base
 * extraction before Gemini fills in name/items.
 */
export function heuristicParse(text: string): ParsedChat {
  const phones = extractBDPhones(text);
  const phone = phones[0] ?? null;
  const { city, zone, area } = inferAddressParts(text);

  const amounts = extractAmounts(text);
  let subtotalCents: number | null = null;
  let deliveryCents: number | null = null;
  let codCents: number | null = null;
  if (amounts.length === 1) {
    codCents = toCents(amounts[0]);
  } else if (amounts.length >= 2) {
    const sorted = [...amounts].sort((a, b) => b - a);
    codCents = toCents(sorted[0]);
    deliveryCents = toCents(sorted[sorted.length - 1]);
    if (codCents != null && deliveryCents != null && codCents > deliveryCents) {
      subtotalCents = codCents - deliveryCents;
    }
  }

  return {
    recipientName: null,
    phone,
    addressLine: null,
    city,
    zone,
    area,
    items: [],
    subtotalCents,
    deliveryCents,
    codCents,
    notes: null,
  };
}

function buildPrompt(text: string): string {
  return `You extract structured order information from a Facebook Messenger or WhatsApp chat block written by a Bangladeshi seller and their customer. The chat may mix Bangla, Banglish (Bangla typed in Latin script), and English.

Return a single JSON object with EXACTLY these keys:
{
  "recipientName": string | null,
  "phone": string | null,           // BD mobile, format 01XXXXXXXXX
  "addressLine": string | null,     // full human-readable address line without city/thana
  "city": string | null,            // district, e.g. "Dhaka", "Chattogram"
  "zone": string | null,            // thana/upazila
  "area": string | null,            // neighborhood / road / sector
  "items": [{ "name": string, "quantity": integer, "unitPrice": number }],  // unitPrice in BDT (taka, not cents)
  "subtotal": number | null,        // BDT
  "delivery": number | null,        // BDT
  "cod": number | null,             // BDT total the courier collects
  "notes": string | null
}

Rules:
- Output JSON only. No prose, no markdown fences.
- Use null when unsure. Never invent phone numbers, addresses, or amounts.
- Quantities are positive integers. If unspecified, assume 1.
- Prices are in BDT (taka). Do NOT multiply or convert.
- recipientName is the CUSTOMER's name, not the seller.
- addressLine excludes the city/thana — those go in city/zone.

Chat:
"""
${text.trim()}
"""

JSON:`;
}

type GeminiResponse = {
  recipientName?: string | null;
  phone?: string | null;
  addressLine?: string | null;
  city?: string | null;
  zone?: string | null;
  area?: string | null;
  items?: Array<{ name?: string; quantity?: number; unitPrice?: number }>;
  subtotal?: number | null;
  delivery?: number | null;
  cod?: number | null;
  notes?: string | null;
};

async function callGemini(text: string): Promise<GeminiResponse | null> {
  if (!env.GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: buildPrompt(text) }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const textOut = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textOut) return null;
  const cleaned = textOut.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned) as GeminiResponse;
  } catch {
    return null;
  }
}

function mergeParse(
  heuristic: ParsedChat,
  llm: GeminiResponse | null
): ParsedChat {
  if (!llm) return heuristic;
  const phone =
    llm.phone && extractBDPhones(llm.phone)[0]
      ? normalizeBDPhone(extractBDPhones(llm.phone)[0]!)
      : heuristic.phone;
  const items: ParsedItem[] = Array.isArray(llm.items)
    ? llm.items
        .filter((it) => it?.name && typeof it.name === 'string')
        .map((it) => ({
          name: String(it.name).trim().slice(0, 200),
          quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
          unitPriceCents: toCents(it.unitPrice ?? 0) ?? 0,
        }))
    : [];
  return {
    recipientName: llm.recipientName?.trim() || heuristic.recipientName,
    phone,
    addressLine: llm.addressLine?.trim() || heuristic.addressLine,
    city: llm.city?.trim() || heuristic.city,
    zone: llm.zone?.trim() || heuristic.zone,
    area: llm.area?.trim() || heuristic.area,
    items,
    subtotalCents: toCents(llm.subtotal ?? null) ?? heuristic.subtotalCents,
    deliveryCents: toCents(llm.delivery ?? null) ?? heuristic.deliveryCents,
    codCents: toCents(llm.cod ?? null) ?? heuristic.codCents,
    notes: llm.notes?.trim() || heuristic.notes,
  };
}

function scoreConfidence(p: ParsedChat): FieldConfidence {
  const recipientName = p.recipientName ? 0.85 : 0.0;
  const phone = p.phone ? 0.98 : 0.0;
  const addressParts = [p.addressLine, p.city, p.zone, p.area].filter(Boolean).length;
  const address = Math.min(1, addressParts / 3);
  const items = p.items.length > 0 ? Math.min(1, 0.6 + p.items.length * 0.1) : 0;
  const codAmount = p.codCents ? 0.9 : 0;
  const overall =
    (recipientName + phone + address + items + codAmount) / 5;
  return {
    overall: Number(overall.toFixed(2)),
    fields: {
      recipientName: Number(recipientName.toFixed(2)),
      phone: Number(phone.toFixed(2)),
      address: Number(address.toFixed(2)),
      items: Number(items.toFixed(2)),
      codAmount: Number(codAmount.toFixed(2)),
    },
  };
}

export async function parseChat(text: string): Promise<ParseResult> {
  const trimmed = text.trim();
  if (trimmed.length < 5) {
    const empty: ParsedChat = {
      recipientName: null,
      phone: null,
      addressLine: null,
      city: null,
      zone: null,
      area: null,
      items: [],
      subtotalCents: null,
      deliveryCents: null,
      codCents: null,
      notes: null,
    };
    return { parsed: empty, confidence: scoreConfidence(empty), source: 'heuristic' };
  }

  const key = cacheKey(trimmed);
  try {
    const cached = await redis.get(key);
    if (cached) {
      const result = JSON.parse(cached) as Omit<ParseResult, 'source'>;
      return { ...result, source: 'cache' };
    }
  } catch {
    // cache read failure is non-fatal
  }

  const heuristic = heuristicParse(trimmed);
  let llm: GeminiResponse | null = null;
  let source: ParseResult['source'] = 'heuristic';
  if (env.GEMINI_API_KEY) {
    try {
      llm = await callGemini(trimmed);
      source = 'gemini';
    } catch (err) {
      console.error('[chat-parser] Gemini call failed:', err);
    }
  }

  const merged = mergeParse(heuristic, llm);
  const confidence = scoreConfidence(merged);
  const result: ParseResult = { parsed: merged, confidence, source };

  try {
    await redis.set(
      key,
      JSON.stringify({ parsed: merged, confidence }),
      'EX',
      CACHE_TTL_SECONDS
    );
  } catch {
    // cache write failure is non-fatal
  }

  return result;
}
