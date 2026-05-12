import type {
  CatalogProduct,
  ConversationState,
  ConversationTurn,
  CustomerProfile,
  IntentClassification,
  LlmProvider,
  StoreProfile,
} from './types.js';
import { buildResponsePrompt } from './prompts.js';
import { parseJsonLoose } from './util.js';
import type { RawOrderDraft } from './order-extraction.js';

export interface ResponseOutput {
  reply: string;
  catalogMiss: boolean;
  discountRequested: boolean;
  offTopic: boolean;
  needsHuman: boolean;
  orderDraftRaw: RawOrderDraft | null;
  raw: unknown;
  /** True when the model output could not be parsed; caller should fall back. */
  parseFailed: boolean;
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
}): Promise<ResponseOutput> {
  const { system, user, geminiHistory } = buildResponsePrompt({
    incomingText: args.incomingText,
    history: args.history,
    store: args.store,
    catalog: args.catalog,
    customer: args.customer,
    state: args.state,
    intent: args.intent,
  });

  const res = await args.provider.generate({
    system,
    user,
    history: geminiHistory,
    json: true,
    temperature: 0.5,
    maxOutputTokens: 1024,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonLoose<Record<string, unknown>>(res.text);
  } catch {
    return {
      reply: '',
      catalogMiss: false,
      discountRequested: false,
      offTopic: false,
      needsHuman: true,
      orderDraftRaw: null,
      raw: res.raw,
      parseFailed: true,
    };
  }

  return {
    reply: typeof parsed['reply'] === 'string' ? (parsed['reply'] as string).trim() : '',
    catalogMiss: parsed['catalogMiss'] === true,
    discountRequested: parsed['discountRequested'] === true,
    offTopic: parsed['offTopic'] === true,
    needsHuman: parsed['needsHuman'] === true,
    orderDraftRaw: coerceOrderDraft(parsed['orderDraft']),
    raw: res.raw,
    parseFailed: false,
  };
}
