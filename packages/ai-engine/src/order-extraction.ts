import { isValidBDPhone, normalizeBDPhone, findLocations } from '@fcommerce/shared';
import type {
  CatalogProduct,
  DraftOrder,
  ExtractedAddress,
  ExtractedOrderItem,
  StoreProfile,
} from './types.js';
import { matchProduct } from './catalog.js';

export interface RawOrderDraft {
  recipientName: string | null;
  phone: string | null;
  address: string | null;
  items: Array<{ productName: string; variant: string | null; quantity: number }>;
  stateTotalCents: number | null;
  customerConfirmedTotal: boolean;
  notes: string | null;
}

export interface OrderExtractionResult {
  /** Complete, customer-confirmed order — safe to push as a draft for seller approval. */
  draft: DraftOrder | null;
  /** Whatever has been gathered so far, even if incomplete (for dashboard visibility). */
  inProgress: Partial<DraftOrder> | null;
  /** Names the customer mentioned that don't map to any catalog product. */
  unmatchedItemNames: string[];
  /** Customer-confirmed total disagrees with the server-computed total. */
  totalMismatch: boolean;
  /** Human-readable reasons the order isn't yet complete. */
  missing: string[];
}

function parseAddress(raw: string): ExtractedAddress {
  const hits = findLocations(raw);
  let division: string | null = null;
  let district: string | null = null;
  let thana: string | null = null;
  for (const h of hits) {
    if (h.kind === 'division' && !division) division = h.canonical;
    if (h.kind === 'district') {
      if (!district) district = h.canonical;
      if (!division && h.divisionName) division = h.divisionName;
    }
    if (h.kind === 'thana' || h.kind === 'neighborhood') {
      if (!thana && h.kind === 'thana') thana = h.canonical;
      if (!district && h.districtName) district = h.districtName;
      if (!division && h.divisionName) division = h.divisionName;
    }
  }
  return {
    raw: raw.trim(),
    division,
    district,
    thana,
    insideDhaka: district === 'Dhaka',
  };
}

function normalizeItems(
  rawItems: RawOrderDraft['items'],
  catalog: CatalogProduct[],
): { items: ExtractedOrderItem[]; unmatched: string[] } {
  const items: ExtractedOrderItem[] = [];
  const unmatched: string[] = [];
  for (const it of rawItems ?? []) {
    const name = (it?.productName ?? '').toString().trim();
    if (!name) continue;
    const qty = Math.max(1, Math.floor(Number(it?.quantity ?? 1)) || 1);
    const product = matchProduct(catalog, name);
    if (!product) {
      unmatched.push(name);
      items.push({ productId: null, productName: name, variant: it?.variant ?? null, quantity: qty, unitPriceCents: null });
      continue;
    }
    items.push({
      productId: product.id,
      productName: product.name,
      variant: it?.variant ?? null,
      quantity: qty,
      unitPriceCents: product.basePriceCents,
    });
  }
  return { items, unmatched };
}

export function buildOrderFromDraft(
  raw: RawOrderDraft | null,
  catalog: CatalogProduct[],
  store: StoreProfile,
): OrderExtractionResult {
  const empty: OrderExtractionResult = {
    draft: null,
    inProgress: null,
    unmatchedItemNames: [],
    totalMismatch: false,
    missing: ['no order data'],
  };
  if (!raw) return empty;

  const { items, unmatched } = normalizeItems(raw.items ?? [], catalog);
  const address = raw.address ? parseAddress(raw.address) : null;
  const normalizedPhone = raw.phone ? normalizeBDPhone(String(raw.phone)) : null;
  const phoneValid = !!normalizedPhone && isValidBDPhone(normalizedPhone);

  const subtotalCents = items.reduce(
    (sum, it) => sum + (it.unitPriceCents ?? 0) * it.quantity,
    0,
  );
  const insideDhaka = !!address?.insideDhaka;
  const deliveryCents = insideDhaka
    ? store.deliveryChargeInsideDhakaCents
    : store.deliveryChargeOutsideDhakaCents;
  const codCents = subtotalCents + deliveryCents;

  const recipientName = raw.recipientName?.toString().trim() || null;

  const missing: string[] = [];
  if (!recipientName) missing.push('recipient name');
  if (!phoneValid) missing.push('valid mobile number');
  if (!address || !address.district) missing.push('delivery address (district)');
  if (items.length === 0) missing.push('product selection');
  if (unmatched.length) missing.push(`product(s) not in catalog: ${unmatched.join(', ')}`);
  if (!raw.customerConfirmedTotal) missing.push('customer confirmation of total');

  const inProgress: Partial<DraftOrder> = {
    ...(recipientName ? { recipientName } : {}),
    ...(phoneValid ? { phone: normalizedPhone! } : {}),
    ...(address ? { address } : {}),
    ...(items.length ? { items } : {}),
    ...(items.length ? { subtotalCents, deliveryCents, codCents } : {}),
    ...(raw.notes ? { notes: raw.notes } : {}),
    confirmedByCustomer: !!raw.customerConfirmedTotal,
  };

  const totalMismatch =
    raw.stateTotalCents != null &&
    Number.isFinite(raw.stateTotalCents) &&
    Math.abs(Number(raw.stateTotalCents) - codCents) > 0;

  const complete =
    !!recipientName &&
    phoneValid &&
    !!address?.district &&
    items.length > 0 &&
    unmatched.length === 0 &&
    !!raw.customerConfirmedTotal;

  if (!complete) {
    return { draft: null, inProgress, unmatchedItemNames: unmatched, totalMismatch, missing };
  }

  const draft: DraftOrder = {
    recipientName: recipientName!,
    phone: normalizedPhone!,
    address: address!,
    items,
    subtotalCents,
    deliveryCents,
    codCents,
    notes: raw.notes ?? null,
    confirmedByCustomer: true,
  };
  return { draft, inProgress, unmatchedItemNames: unmatched, totalMismatch, missing: [] };
}
