/**
 * Static fallback replies for situations where Gemini either couldn't be
 * called (API error) or genuinely has nothing to work with (no catalog).
 *
 * In normal flow these should almost never fire. The receptionist engine
 * trusts Stage-2 to handle every "this is hard" case via its own
 * `needsHuman`, `catalogMiss`, `discountRequested`, etc. flags — Stage 2
 * always returns a tailored reply, which the engine prefers over these.
 *
 * Each entry has multiple variants. `pickTemplate(key, seed)` rotates
 * through them deterministically per conversation so the same situation
 * isn't answered with the identical string twice in a row.
 */

type Variants = readonly [string, ...string[]];

const TEMPLATE_VARIANTS = {
  /** Catalog empty → AI can't sell anything. */
  noCatalog: [
    'Apu, ekhon owner kichu update korchen. ektu pore abar try korben please.',
    'Apu owner ekhon collection update korchen. Kichu shomoy por dekhben kichu shundor add hobe.',
    'Apu collection ta refresh hocche right now. Ektu pore message diben please.',
  ] as Variants,

  /** Gemini API actually errored (timeout, 5xx, parse fail) — rare but needs a graceful exit. */
  technicalIssue: [
    'Ekta technical issue hocche — ektu pore abar message diben please.',
    'Sorry, server e ektu issue. Ektu pore try korben please, ami nije reply dibo.',
    'Ektu technical jhamela — 1-2 minute por abar likhben please.',
  ] as Variants,

  /** Outside working hours — we usually stay silent, but if a reply is needed this is it. */
  outsideHours: [
    'Ekhon amader off-time. Working hours-e apnar message er reply paben, dhonnobad!',
    'Apu / vai, ekhon shop close. Working hour-e message-er reply pabo, oneek dhonnobad bracket.',
    'Ekhon off-time. Working hour shuru hole apnar message-er reply dibo.',
  ] as Variants,

  /** Genuine punt to the seller — only when nothing else applies. */
  checkWithOwner: [
    'Ami eta owner-er sathe ekTu confirm kore janacchi.',
    'Owner ke ekTu jiggesh kore janabo — ektu wait koren please.',
    'Eta amake check kore confirm korte hobe. Ektu sময় din please.',
  ] as Variants,

  /** Order has been fully collected and confirmed. */
  orderTaken: [
    'Order ta nilam 🙏 owner confirm kore shiggiri janabe. Dhonnobad!',
    'Order confirmed! Owner check kore courier korbe — janacchi shiggiri.',
    'Got it, order ta neoa holo. Shiggiri courier hobe, dhonnobad apnake.',
  ] as Variants,

  /** Discount request below floor price (fallback only — Stage 2 normally writes this itself). */
  noDiscount: [
    'Ei product-er price fixed apu. Margin khub kom — discount possible na.',
    'Sorry, ei price-e amader fixed. Quality ar fabric dekhle bujhben.',
    'Vai/apu, ei rate-e i amader cost porche. Discount er upai nei eikhane.',
  ] as Variants,

  /** Customer asked about a product not in the catalog (fallback — Stage 2 usually replies itself). */
  notInCatalog: [
    'Eta amader collection-e ekhon nei. Owner ke check kore janabo.',
    'Sorry, ei item ta ekhon amader stock-e nei. Pore ele inshallah notun arrival e thakte pare.',
    'Eta currently amader list-e nei — onno kichu pochondo hole bolen, dekhabo.',
  ] as Variants,
} as const;

export type TemplateKey = keyof typeof TEMPLATE_VARIANTS;

/**
 * Deterministic-but-varied picker. `seed` should be something stable per
 * conversation so the same convo doesn't see different variants on retries,
 * but different convos see different variants. The customer's PSID or
 * message id works well; even a string hash is fine.
 */
export function pickTemplate(key: TemplateKey, seed?: string | number): string {
  const variants = TEMPLATE_VARIANTS[key];
  if (seed === undefined) return variants[0];
  const h = typeof seed === 'number' ? seed : hashString(seed);
  return variants[h % variants.length] ?? variants[0];
}

function hashString(s: string): number {
  // djb2; fine for distributing over <10 buckets.
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Back-compat shim — old callers expect a TEMPLATES.foo string. Returns
 * variant 0 deterministically. Newer code should call pickTemplate(key, seed).
 */
export const TEMPLATES: { [K in TemplateKey]: string } = Object.fromEntries(
  (Object.keys(TEMPLATE_VARIANTS) as TemplateKey[]).map((k) => [k, TEMPLATE_VARIANTS[k][0]]),
) as { [K in TemplateKey]: string };

const DISCLOSURE_FOOTER = '\n\n— Powered by BoxBazar AI';

export function applyDisclosureFooter(text: string, enabled: boolean | undefined): string {
  if (!enabled || !text.trim()) return text;
  return text.endsWith(DISCLOSURE_FOOTER) ? text : text + DISCLOSURE_FOOTER;
}
