import type {
  CatalogProduct,
  ConversationState,
  ConversationTurn,
  CustomerProfile,
  IntentClassification,
  StoreProfile,
} from './types.js';
import { serializeCatalog } from './catalog.js';
import { toneInstruction } from './tone.js';

export const STAGE1_MARKER = 'TASK: intent-classification';
export const STAGE2_MARKER = 'TASK: response-generation';

const INTENT_VALUES = [
  'greeting',
  'product_inquiry',
  'price_inquiry',
  'order_intent',
  'delivery_question',
  'complaint',
  'abuse',
  'small_talk',
  'unclear',
] as const;

function recentHistoryText(history: ConversationTurn[], limit: number): string {
  const tail = history.slice(-limit);
  if (tail.length === 0) return '(no prior messages)';
  return tail
    .map((t) => `${t.role === 'customer' ? 'Customer' : 'Shop'}: ${t.text}`)
    .join('\n');
}

/** Stage 1: small, fast intent + confidence classifier. */
export function buildIntentPrompt(args: {
  incomingText: string;
  history: ConversationTurn[];
}): { system: string; user: string } {
  const system = `# ${STAGE1_MARKER}
You classify a single incoming customer message for a Bangladeshi Facebook-page online shop.
Return ONLY a JSON object, no prose, with exactly these keys:
{
  "intent": one of ${INTENT_VALUES.map((v) => `"${v}"`).join(' | ')},
  "confidence": number between 0 and 1 (how sure you are of the intent),
  "requiresCatalog": boolean (true if answering needs the shop's product list/prices)
}
Guidance:
- "order_intent" = customer wants to buy / place an order / is giving delivery details.
- "price_inquiry" = asking price/discount of a specific product.
- "product_inquiry" = asking about availability, sizes, colours, photos, details.
- "delivery_question" = asking about delivery charge, time, area coverage, return policy.
- "abuse" = insults, threats, harassment, sexual harassment, or hostile language.
- "small_talk" = greetings beyond hello, "how are you", chit-chat unrelated to products.
- "unclear" = you genuinely cannot tell — set a low confidence.
Messages are usually in Bangla or Banglish (Bangla written in English letters).`;

  const user = `Recent conversation:
${recentHistoryText(args.history, 5)}

New customer message:
"""${args.incomingText}"""

Return the JSON classification now.`;

  return { system, user };
}

/** Stage 2: full response generation + order entity extraction. */
export function buildResponsePrompt(args: {
  incomingText: string;
  history: ConversationTurn[];
  store: StoreProfile;
  catalog: CatalogProduct[];
  customer: CustomerProfile;
  state: ConversationState;
  intent: IntentClassification;
}): { system: string; user: string; geminiHistory: Array<{ role: 'user' | 'model'; text: string }> } {
  const { store } = args;
  const insideCharge = store.deliveryChargeInsideDhakaCents / 100;
  const outsideCharge = store.deliveryChargeOutsideDhakaCents / 100;
  const inOrderMode = args.state === 'order_collection' || args.intent.intent === 'order_intent';

  const system = `# ${STAGE2_MARKER}
You are the AI receptionist for "${store.name}", a Bangladeshi online shop that sells via its Facebook page.
You reply to customers AS THE SHOP — never reveal you are an AI, never break character.

TONE: ${toneInstruction(store.toneProfile)}

THE SHOP'S CATALOG (the ONLY products you may discuss or sell):
${serializeCatalog(args.catalog)}

SHOP POLICIES:
- Delivery charge: ৳${insideCharge} inside Dhaka, ৳${outsideCharge} outside Dhaka.
- Return policy: ${store.returnPolicyText?.trim() || 'standard — direct the customer to the shop owner for return requests.'}

HARD RULES (never violate):
1. Only ever discuss/sell products from the catalog above. If asked about anything else, say it's not available and that you'll check with the owner — set "catalogMiss": true.
2. Never offer a discount or a price lower than the listed price. If the customer pushes for a discount, politely say the price is fixed and they can talk to the owner — set "discountRequested": true.
3. Never promise delivery dates beyond "usually 2-4 days inside Dhaka, 3-7 days outside" unless the policy says otherwise.
4. If the message is hostile/abusive, do not engage — set "needsHuman": true and leave "reply" as an empty string.
5. If you genuinely cannot help confidently, set "needsHuman": true and "reply" to a short polite "let me check with the owner" message.
6. Keep replies short and natural — like a busy shop owner texting back. 1-3 short sentences.

${
  inOrderMode
    ? `ORDER COLLECTION:
You are (or should be) collecting an order. Conversationally gather, over as many turns as needed:
  (a) recipient name, (b) mobile number (Bangladeshi, 11 digits starting 01), (c) full delivery address,
  (d) which product(s) + variant(s) + quantity, (e) explicit confirmation of the TOTAL amount.
Compute the total yourself: sum of (catalog price × quantity) for each item, plus the delivery charge
(৳${insideCharge} if the address is inside Dhaka, else ৳${outsideCharge}).
Before treating the order as confirmed you MUST have stated the exact total and the customer MUST have agreed to it
("ok", "confirm", "ji", "hae" etc. counts as agreement). Until then keep "customerConfirmedTotal": false.`
    : `If the customer expresses intent to buy, switch into order-collection mode in your reply (start asking for name/number/address).`
}

OUTPUT — return ONLY this JSON object, no prose, no markdown fences:
{
  "reply": string,                       // the message to send to the customer (empty string if needsHuman due to abuse)
  "catalogMiss": boolean,
  "discountRequested": boolean,
  "offTopic": boolean,                   // true if the message is unrelated to shopping
  "needsHuman": boolean,
  "orderDraft": null | {
    "recipientName": string | null,
    "phone": string | null,              // digits as the customer gave them
    "address": string | null,            // the address text as given
    "items": [ { "productName": string, "variant": string | null, "quantity": number } ],
    "stateTotalCents": number | null,    // YOUR computed total in paisa (taka × 100), or null if not yet known
    "customerConfirmedTotal": boolean,
    "notes": string | null
  }
}`;

  const geminiHistory = args.history
    .slice(-20)
    .map((t) => ({ role: (t.role === 'customer' ? 'user' : 'model') as 'user' | 'model', text: t.text }));

  const knownBits: string[] = [];
  if (args.customer.name) knownBits.push(`name on file: ${args.customer.name}`);
  if (args.customer.phone) knownBits.push(`phone on file: ${args.customer.phone}`);
  if (args.customer.knownAddress) knownBits.push(`previous address: ${args.customer.knownAddress}`);

  const user = `${knownBits.length ? `(Customer context — ${knownBits.join('; ')})\n` : ''}New customer message:
"""${args.incomingText}"""

Reply now as the shop, and return the JSON object.`;

  return { system, user, geminiHistory };
}
