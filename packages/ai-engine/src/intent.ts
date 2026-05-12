import type {
  ConversationTurn,
  CustomerIntent,
  IntentClassification,
  LlmProvider,
} from './types.js';
import { buildIntentPrompt } from './prompts.js';
import { parseJsonLoose, clamp01 } from './util.js';

const VALID_INTENTS: ReadonlySet<string> = new Set<CustomerIntent>([
  'greeting',
  'product_inquiry',
  'price_inquiry',
  'order_intent',
  'delivery_question',
  'complaint',
  'abuse',
  'small_talk',
  'unclear',
]);

export interface IntentResult {
  classification: IntentClassification;
  raw: unknown;
}

/** Stage 1 — fast intent + confidence classification. */
export async function classifyIntent(args: {
  incomingText: string;
  history: ConversationTurn[];
  provider: LlmProvider;
}): Promise<IntentResult> {
  const { system, user } = buildIntentPrompt({
    incomingText: args.incomingText,
    history: args.history,
  });

  const res = await args.provider.generate({
    system,
    user,
    json: true,
    temperature: 0,
    maxOutputTokens: 128,
  });

  let parsed: { intent?: string; confidence?: number; requiresCatalog?: boolean };
  try {
    parsed = parseJsonLoose(res.text);
  } catch {
    return {
      classification: { intent: 'unclear', confidence: 0, requiresCatalog: true },
      raw: res.raw,
    };
  }

  const intent: CustomerIntent =
    parsed.intent && VALID_INTENTS.has(parsed.intent) ? (parsed.intent as CustomerIntent) : 'unclear';
  const confidence = clamp01(Number(parsed.confidence ?? 0));

  return {
    classification: {
      intent,
      confidence,
      requiresCatalog: parsed.requiresCatalog !== false,
    },
    raw: res.raw,
  };
}
