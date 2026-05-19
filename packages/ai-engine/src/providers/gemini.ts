import type { LlmProvider, LlmRequest, LlmResponse } from '../types.js';

export interface GeminiProviderOptions {
  apiKey: string;
  /** Default: gemini-2.5-flash */
  model?: string;
  /** Override base URL (mostly for testing). */
  baseUrl?: string;
  /** Per-call timeout in ms. Default 12000. */
  timeoutMs?: number;
}

/**
 * A single content part in Gemini's `contents` array — either text or an
 * inline image. The Gemini REST API accepts mixed parts on the same turn,
 * so we can send `[{ text: "what is this?" }, { inlineData: <img> }]`.
 */
type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponseBody {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

/**
 * Thin wrapper over the Gemini `generateContent` REST endpoint. Uses the
 * global `fetch` (Node 18+). No SDK dependency on purpose — keeps the
 * package light and the request shape transparent.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: GeminiProviderOptions) {
    if (!opts.apiKey) throw new Error('GeminiProvider requires an apiKey');
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gemini-2.5-flash';
    this.baseUrl = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.timeoutMs = opts.timeoutMs ?? 12_000;
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const contents: GeminiContent[] = [];
    for (const turn of req.history ?? []) {
      if (!turn.text?.trim()) continue;
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
    // Latest user turn: text first, then any image parts. Order matters —
    // putting text first gives the model the question before the image.
    const userParts: GeminiPart[] = [{ text: req.user }];
    for (const img of req.images ?? []) {
      if (!img.bytes || img.bytes.length === 0) continue;
      userParts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: Buffer.from(img.bytes).toString('base64'),
        },
      });
    }
    contents.push({ role: 'user', parts: userParts });

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxOutputTokens ?? 1024,
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    };

    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new Error(`Gemini request failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    const json = (await res.json().catch(() => ({}))) as GeminiResponseBody;
    if (!res.ok || json.error) {
      throw new Error(
        `Gemini API error ${res.status}: ${json.error?.message ?? res.statusText}`,
      );
    }

    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) {
      throw new Error('Gemini returned an empty response');
    }

    return {
      text,
      raw: json,
      usage: {
        inputTokens: json.usageMetadata?.promptTokenCount,
        outputTokens: json.usageMetadata?.candidatesTokenCount,
      },
    };
  }
}
