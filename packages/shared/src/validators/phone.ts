const BD_PHONE_REGEX = /^01[3-9]\d{8}$/;

export function isValidBDPhone(phone: string): boolean {
  return BD_PHONE_REGEX.test(phone);
}

export function normalizeBDPhone(phone: string): string {
  let normalized = phone.replace(/[\s\-().]/g, '');

  if (normalized.startsWith('+880')) {
    normalized = '0' + normalized.slice(4);
  }

  if (normalized.startsWith('880') && normalized.length === 13) {
    normalized = '0' + normalized.slice(3);
  }

  return normalized;
}

/**
 * Pulls every plausible BD mobile number out of a free-form chat block.
 * Returns them in order of first appearance, deduplicated, normalized.
 */
export function extractBDPhones(text: string): string[] {
  if (!text) return [];
  // Bangla digits → ASCII so we can match Banglish + Bangla numerals uniformly.
  const banglaDigits = '০১২৩৪৫৬৭৮৯';
  const asciiText = text.replace(/[০-৯]/g, (c) =>
    String(banglaDigits.indexOf(c))
  );

  const candidatePattern = /(?:\+?88)?[\s\-().]?0?1[\s\-]?[3-9](?:[\s\-]?\d){8}/g;
  const matches = asciiText.match(candidatePattern) ?? [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const normalized = normalizeBDPhone(raw);
    if (isValidBDPhone(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}
