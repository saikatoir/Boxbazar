/**
 * Public types for the BoxBazar AI receptionist engine.
 *
 * String-literal unions here intentionally mirror the corresponding Prisma
 * enums in `@fcommerce/db` so the API layer can pass values straight through
 * without a mapping table. The engine itself stays free of any DB dependency.
 */

export type AiToneProfile = 'formal_apu' | 'casual_apu' | 'friendly_bhai';

export type ConversationState =
  | 'new_inquiry'
  | 'product_discussion'
  | 'order_collection'
  | 'order_confirmed'
  | 'human_handoff'
  | 'closed';

export type CustomerIntent =
  | 'greeting'
  | 'product_inquiry'
  | 'price_inquiry'
  | 'order_intent'
  | 'delivery_question'
  | 'complaint'
  | 'abuse'
  | 'small_talk'
  | 'unclear';

export type HandoffReason =
  | 'low_confidence'
  | 'catalog_miss'
  | 'abuse'
  | 'discount_request'
  | 'off_topic'
  | 'llm_error'
  | 'manual';

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/** A single product as the engine sees it (subset of the DB Product row). */
export interface CatalogProduct {
  id: string;
  name: string;
  description?: string | null;
  basePriceCents: number;
  floorPriceCents: number;
  /** e.g. [{ type: 'size', options: ['M', 'L', 'XL'] }, { type: 'color', options: ['black'] }] */
  variants?: Array<{ type: string; options: string[] }>;
  stockStatus: StockStatus;
  keywords?: string[];
}

/** Seller-configured policies & profile the engine grounds itself in. */
export interface StoreProfile {
  name: string;
  toneProfile: AiToneProfile;
  deliveryChargeInsideDhakaCents: number;
  deliveryChargeOutsideDhakaCents: number;
  returnPolicyText?: string | null;
  /** 24h "HH:MM" strings; when both set, the AI stays silent outside this window. */
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
  /** Append a "Powered by BoxBazar AI" footer to AI replies. */
  disclosureFooterEnabled?: boolean;
}

export interface CustomerProfile {
  name?: string | null;
  phone?: string | null;
  knownAddress?: string | null;
}

export interface ConversationTurn {
  /** From the customer (inbound) or from the page/AI/seller (outbound). */
  role: 'customer' | 'agent';
  text: string;
  at?: Date;
}

// ─── LLM provider abstraction ────────────────────────────────────────────────

export interface LlmRequest {
  system: string;
  /** Latest user turn. */
  user: string;
  /** Prior turns, oldest first. `model` = our side, `user` = customer. */
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  /** Ask the model to return strictly a JSON object. */
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmResponse {
  text: string;
  raw: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface LlmProvider {
  readonly name: string;
  generate(req: LlmRequest): Promise<LlmResponse>;
}

// ─── Engine I/O ──────────────────────────────────────────────────────────────

export interface ReceptionistInput {
  /** The incoming customer message text. */
  incomingText: string;
  store: StoreProfile;
  catalog: CatalogProduct[];
  /** Recent conversation history (recommend last ~20 turns), oldest first. Excludes `incomingText`. */
  history: ConversationTurn[];
  conversationState: ConversationState;
  customer: CustomerProfile;
  provider: LlmProvider;
  /** Defaults to `new Date()`. Used for working-hours checks. */
  now?: Date;
  /** Stage-1 confidence below this routes to a human. Default 0.6. */
  confidenceThreshold?: number;
}

export interface IntentClassification {
  intent: CustomerIntent;
  confidence: number;
  requiresCatalog: boolean;
}

export interface ExtractedOrderItem {
  productId: string | null;
  productName: string;
  variant: string | null;
  quantity: number;
  unitPriceCents: number | null;
}

export interface ExtractedAddress {
  raw: string;
  division: string | null;
  district: string | null;
  thana: string | null;
  insideDhaka: boolean;
}

export interface DraftOrder {
  recipientName: string;
  phone: string;
  address: ExtractedAddress;
  items: ExtractedOrderItem[];
  subtotalCents: number;
  deliveryCents: number;
  codCents: number;
  notes: string | null;
  /** True only once the customer has explicitly confirmed the exact total. */
  confirmedByCustomer: boolean;
}

export type ReceptionistAction = 'reply' | 'reply_and_handoff' | 'handoff_silent' | 'silent';

export interface ReceptionistDecision {
  action: ReceptionistAction;
  /** Text to send to the customer (present unless action is *_silent). */
  replyText: string | null;
  intent: IntentClassification;
  /** Overall confidence in this turn's handling (min of stage confidences). */
  confidence: number;
  /** State the conversation should transition to. */
  nextState: ConversationState;
  /** Set when the AI is punting to the seller. */
  handoff: { reason: HandoffReason; detail: string } | null;
  /** Present once a complete, customer-confirmed order has been collected. */
  draftOrder: DraftOrder | null;
  /** Partial order data collected so far (for dashboard visibility), if any. */
  orderInProgress: Partial<DraftOrder> | null;
  /** Raw LLM payloads for audit/debugging. */
  debug: {
    stage1Raw: unknown;
    stage2Raw: unknown | null;
    notes: string[];
  };
}
