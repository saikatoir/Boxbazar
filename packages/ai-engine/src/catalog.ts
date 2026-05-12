import type { CatalogProduct } from './types.js';

function taka(cents: number): string {
  // Money is stored in paisa (BDT × 100). Display whole-taka where clean.
  const whole = cents / 100;
  return Number.isInteger(whole) ? `${whole}` : whole.toFixed(2);
}

/**
 * Compact, LLM-friendly serialization of the seller's catalog. Kept terse on
 * purpose — this block is re-sent on most calls, so it dominates input tokens.
 */
export function serializeCatalog(products: CatalogProduct[]): string {
  const active = products.filter((p) => p.stockStatus !== 'out_of_stock');
  if (active.length === 0) return '(the seller has no products listed — you cannot take any orders)';
  return active
    .map((p, i) => {
      const variants =
        p.variants && p.variants.length
          ? p.variants.map((v) => `${v.type}: [${v.options.join(', ')}]`).join('; ')
          : 'no variants';
      const stock = p.stockStatus === 'low_stock' ? ' (LOW STOCK)' : '';
      const desc = p.description ? ` — ${p.description}` : '';
      return `${i + 1}. id=${p.id} | "${p.name}" | price ৳${taka(p.basePriceCents)}${stock} | ${variants}${desc}`;
    })
    .join('\n');
}

/** Lightweight name/keyword match used to resolve LLM-extracted item names to catalog rows. */
export function matchProduct(products: CatalogProduct[], name: string): CatalogProduct | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  // exact (case-insensitive) name match wins
  let hit = products.find((p) => p.name.toLowerCase().trim() === n);
  if (hit) return hit;
  // substring either direction
  hit = products.find(
    (p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()),
  );
  if (hit) return hit;
  // keyword overlap
  hit = products.find((p) => (p.keywords ?? []).some((k) => n.includes(k.toLowerCase())));
  return hit ?? null;
}
