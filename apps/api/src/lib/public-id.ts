import { randomInt } from 'node:crypto';
import { prisma } from './prisma.js';

/**
 * Public-facing 4-character user IDs. Format:
 *   - exactly 2 uppercase letters from A-Z minus I and O
 *   - exactly 2 digits from 2-9 minus 0 and 1
 *   - letters and digits at random positions (mixed)
 *
 * Examples: K3X7, 4A2B, 9P5N, 2W7J.
 *
 * Keyspace = C(4, 2) × 24² × 8² ≈ 22K — fine for hundreds of users. Collisions
 * are handled by retrying; the unique index on `users.publicId` is the source
 * of truth.
 */

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const MAX_GENERATION_ATTEMPTS = 50;

function pick(arr: string): string {
  return arr[randomInt(0, arr.length)] as string;
}

/** Generate one candidate publicId (no DB check). */
export function buildPublicId(): string {
  // Two distinct slots (0..3) get letters; the rest get digits.
  const a = randomInt(0, 4);
  let b = randomInt(0, 4);
  while (b === a) b = randomInt(0, 4);
  const isLetter = (i: number) => i === a || i === b;
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += isLetter(i) ? pick(ALPHA) : pick(DIGITS);
  }
  return out;
}

/**
 * Generate a publicId that isn't already in use. Falls back to throwing only
 * if the keyspace is wildly exhausted — extremely unlikely at the scale this
 * SaaS will operate at.
 */
export async function generateUniquePublicId(): Promise<string> {
  for (let i = 0; i < MAX_GENERATION_ATTEMPTS; i++) {
    const candidate = buildPublicId();
    const exists = await prisma.user.findUnique({
      where: { publicId: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  throw new Error('Exhausted attempts generating a unique publicId — keyspace too full');
}
