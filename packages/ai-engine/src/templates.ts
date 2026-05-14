/**
 * Canned, non-LLM replies for fallback situations. Deliberately simple,
 * polite Banglish that works regardless of the seller's tone profile.
 */
export const TEMPLATES = {
  /** Plain greeting from a new/idle conversation. */
  greeting: 'Ji ! 🙂 Amader collection theke kichu lagbe? bolun AI.',
  /** Order fully collected & confirmed — acknowledgement to the customer. */
  orderTaken: 'Order ta nilam 🙏 owner confirm kore shiggiri janabe. dhonnobad!',
  /** Low confidence / generic uncertainty → punt to seller. */
  checkWithOwner: ' ekTu wait korun — ami owner ke check kore janacchi.',
  /** Customer asked about a product not in the catalog. */
  notInCatalog: ' eta amader collection-e ekhon nei. Owner ke check kore janabo, ektu wait korun.',
  /** Discount request below floor price. */
  noDiscount: 'ei product-er price fixed. Discount niye owner-er sathe direct kotha bolte paren.',
  /** Off-topic / non-commerce small talk. */
  offTopicRedirect: 'Ji, valo achi. Apnar kichu lagbe? Amader collection theke bolun.',
  /** Outside the seller's working hours. */
  outsideHours: 'ekhon amader off-time. Working hour-e apnার message-er reply paben, dhonnobad.',
  /** LLM/API error → temporary technical hiccup. */
  technicalIssue: 'ekTu technical issue hocche — ektu pore abar kotha bolun please.',
  /** Empty / unintelligible incoming message. */
  didNotUnderstand: 'bujhte parlam na — ekTu detail-e likhle help korte parbo.',
  /** Catalog has no products → AI can't sell. */
  noCatalog: 'ekhon owner kichu update korchen. ektu pore abar try korben please.',
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

const DISCLOSURE_FOOTER = '\n\n— Powered by BoxBazar AI';

export function applyDisclosureFooter(text: string, enabled: boolean | undefined): string {
  if (!enabled || !text.trim()) return text;
  return text.endsWith(DISCLOSURE_FOOTER) ? text : text + DISCLOSURE_FOOTER;
}
