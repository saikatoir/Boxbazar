import type {
  AttachmentInput,
  CatalogProduct,
  ConversationState,
  ConversationTurn,
  CustomerProfile,
  ExampleConversation,
  IntentClassification,
  LlmProvider,
  LlmResponse,
  StoreProfile,
} from './types.js';
import { buildResponsePrompt } from './prompts.js';
import { parseJsonLoose } from './util.js';
import type { RawOrderDraft } from './order-extraction.js';

/**
 * Defensive per-image cap. The Meta SDK fetcher already enforces this;
 * we re-check here so the engine package stays safe even when callers pass
 * bytes from another source. Oversized images are silently dropped.
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface ResponseOutput {
  reply: string;
  catalogMiss: boolean;
  discountRequested: boolean;
  offTopic: boolean;
  needsHuman: boolean;
  orderDraftRaw: RawOrderDraft | null;
  raw: unknown;
  /**
   * True when the model's output could not be parsed as JSON even after one
   * retry. Caller (engine.ts) treats this as a soft handoff. Distinct from
   * `needsHuman`, which reflects what the model itself said.
   */
  parseFailed: boolean;
  /** Token accounting from the model, when the provider returns it. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    /** LLM calls made for this single generation (1 normal, 2 if retry kicked in). */
    calls: number;
  };
}

function coerceOrderDraft(v: unknown): RawOrderDraft | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const itemsIn = Array.isArray(o['items']) ? (o['items'] as unknown[]) : [];
  const items = itemsIn
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      productName: String(x['productName'] ?? '').trim(),
      variant: x['variant'] == null ? null : String(x['variant']),
      quantity: Number(x['quantity'] ?? 1),
    }))
    .filter((x) => x.productName.length > 0);
  return {
    recipientName: o['recipientName'] == null ? null : String(o['recipientName']),
    phone: o['phone'] == null ? null : String(o['phone']),
    address: o['address'] == null ? null : String(o['address']),
    items,
    stateTotalCents:
      o['stateTotalCents'] == null || !Number.isFinite(Number(o['stateTotalCents']))
        ? null
        : Math.round(Number(o['stateTotalCents'])),
    customerConfirmedTotal: o['customerConfirmedTotal'] === true,
    notes: o['notes'] == null ? null : String(o['notes']),
  };
}

/**
 * Trim the attachment list to images whose byte length is within the cap.
 * Returns the safe-to-send images. `undefined` when nothing survives so the
 * provider call doesn't include an empty `images` array.
 */
function sanitizeImages(
  attachments: AttachmentInput[] | undefined,
): Array<{ mimeType: string; bytes: Uint8Array }> | undefined {
  if (!attachments?.length) return undefined;
  const safe = attachments
    .filter((a) => a.bytes && a.bytes.length > 0 && a.bytes.length <= MAX_IMAGE_BYTES)
    .map((a) => ({ mimeType: a.mimeType, bytes: a.bytes }));
  return safe.length > 0 ? safe : undefined;
}

/**
 * Stage-2 nudge appended on retry. Kept short to minimise extra input tokens.
 */
const RETRY_NUDGE =
  '\n\nIMPORTANT: your previous response could not be parsed. Return ONLY a single JSON object, no markdown fences, no commentary, no explanatory prose. Start directly with { and end with }.';

function tryParse(text: string): Record<string, unknown> | null {
  try {
    return parseJsonLoose<Record<string, unknown>>(text);
  } catch {
    return null;
  }
}

function sumDefined(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null && b == null) return undefined;
  return (a ?? 0) + (b ?? 0);
}

/** Stage 2 — response generation + order entity extraction. */
export async function generateResponse(args: {
  incomingText: string;
  history: ConversationTurn[];
  store: StoreProfile;
  catalog: CatalogProduct[];
  customer: CustomerProfile;
  state: ConversationState;
  intent: IntentClassification;
  provider: LlmProvider;
  examples?: ExampleConversation[];
  attachments?: AttachmentInput[];
}): Promise<ResponseOutput> {
  const hasImages = (args.attachments?.length ?? 0) > 0;
  const images = sanitizeImages(args.attachments);
  const { system, user, geminiHistory } = buildResponsePrompt({
    incomingText: args.incomingText,
    history: args.history,
    store: args.store,
    catalog: args.catalog,
    customer: args.customer,
    state: args.state,
    intent: args.intent,
    examples: args.examples,
    hasImages,
  });

  // First attempt — natural-variation temperature.
  // Provider errors propagate; engine.ts wraps them as `llm_error` handoffs.
  const res: LlmResponse = await args.provider.generate({
    system,
    user,
    history: geminiHistory,
    json: true,
    images,
    // Higher temperature so phrasing varies turn-to-turn (combats the
    // "same robotic line every time" feel). Low enough that order math
    // and structured output stay deterministic.
    temperature: 0.7,
    // Generous output budget so the model can actually answer questions
    // like "what do you sell" with a 2-3 product overview instead of
    // a one-liner.
    maxOutputTokens: 2048,
  });

  let calls = 1;
  let lastRaw: unknown = res.raw;
  let inputTokens = res.usage?.inputTokens;
  let outputTokens = res.usage?.outputTokens;

  let parsed = tryParse(res.text);

  // Retry once with a stricter, lower-temperature pass if the model
  // returned unparseable JSON. Recovers the common "stray ```json fence" /
  // "explanatory preamble" failure modes without falling back to a template.
  if (!parsed) {
    try {
      const retry = await args.provider.generate({
        system: system + RETRY_NUDGE,
        user,
        history: geminiHistory,
        json: true,
        images,
        temperature: 0.1,
        maxOutputTokens: 2048,
      });
      calls = 2;
      lastRaw = retry.raw;
      inputTokens = sumDefined(inputTokens, retry.usage?.inputTokens);
      outputTokens = sumDefined(outputTokens, retry.usage?.outputTokens);
      parsed = tryParse(retry.text);
    } catch {
      // Retry itself errored: fall through to parseFailed below with the
      // first call's raw output. Don't escalate to engine-level error —
      // the original call succeeded structurally, just unparseably.
    }
  }

  const usage = { inputTokens, outputTokens, calls };

  if (!parsed) {
    return {
      reply: '',
      catalogMiss: false,
      discountRequested: false,
      offTopic: false,
      // The model itself said nothing about needing a human — that's the
      // engine's call based on `parseFailed`. Keep these flags faithful to
      // the model's intent only.
      needsHuman: false,
      orderDraftRaw: null,
      raw: lastRaw,
      parseFailed: true,
      usage,
    };
  }

  return {
    reply: typeof parsed['reply'] === 'string' ? (parsed['reply'] as string).trim() : '',
    catalogMiss: parsed['catalogMiss'] === true,
    discountRequested: parsed['discountRequested'] === true,
    offTopic: parsed['offTopic'] === true,
    needsHuman: parsed['needsHuman'] === true,
    orderDraftRaw: coerceOrderDraft(parsed['orderDraft']),
    raw: lastRaw,
    parseFailed: false,
    usage,
  };
}
