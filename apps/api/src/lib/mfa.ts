import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * MFA code config:
 *   - 6 characters total
 *   - exactly 2 uppercase letters (A-Z, omitting confusables I + O) at random positions
 *   - exactly 4 digits (0-9, omitting confusables 0 + 1) at the remaining positions
 *
 * Position-mixing widens the keyspace beyond a fixed LL#### template
 * (~6.7M → ~100M codes) which makes brute force infeasible alongside the
 * per-code + per-user attempt limits below.
 */

// Omit visually confusable characters: I/O (letters), 0/1 (digits).
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

/** How long a freshly minted code is valid for. */
export const MFA_CODE_TTL_MS = 10 * 60 * 1000;
/** Max attempts allowed against a single code before it's burned. */
export const MFA_MAX_ATTEMPTS_PER_CODE = 5;
/** Max codes that may be minted for one user in this rolling window. */
export const MFA_MAX_CODES_PER_WINDOW = 5;
export const MFA_CODE_RATE_WINDOW_MS = 60 * 60 * 1000;
/** How long an MFA "session" (mfaVerifiedAt claim) remains valid for admin actions. */
export const MFA_SESSION_MAX_AGE_MS = 15 * 60 * 1000;

function pick<T>(arr: ArrayLike<T>): T {
  return arr[randomInt(0, arr.length)] as T;
}

/** Generate a fresh code, e.g. `K3X729`, `4A8B9X`. */
export function generateMixedCode(): string {
  // Pick two distinct positions (0..5) where letters will sit; rest are digits.
  const positions = new Set<number>();
  while (positions.size < 2) positions.add(randomInt(0, 6));
  const letterAt = positions;

  let code = '';
  for (let i = 0; i < 6; i++) {
    code += letterAt.has(i) ? pick(ALPHA) : pick(DIGITS);
  }
  return code;
}

/** Normalize user input — strip spaces, upper-case, allow only ASCII alphanumeric. */
export function normalizeCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Validate the *shape* of a candidate code without consulting the DB.
 * Cheap check we can apply before hitting bcrypt.compare.
 */
export function isWellFormed(code: string): boolean {
  if (code.length !== 6) return false;
  let letters = 0;
  let digits = 0;
  for (const ch of code) {
    if (ch >= 'A' && ch <= 'Z') letters++;
    else if (ch >= '0' && ch <= '9') digits++;
    else return false;
  }
  return letters === 2 && digits === 4;
}

export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyCodeHash(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

/** Random opaque identifier for the issued code row. */
export function newCodeId(): string {
  return randomBytes(16).toString('hex');
}
