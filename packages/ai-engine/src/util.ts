/** Strip markdown code fences and parse the first JSON object/array found. */
export function parseJsonLoose<T = unknown>(raw: string): T {
  let s = raw.trim();
  // remove ```json ... ``` or ``` ... ``` fences
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1]!.trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    // fall back to the first {...} or [...] span
    const start = s.search(/[{[]/);
    if (start >= 0) {
      const open = s[start];
      const close = open === '{' ? '}' : ']';
      const end = s.lastIndexOf(close);
      if (end > start) {
        return JSON.parse(s.slice(start, end + 1)) as T;
      }
    }
    throw new Error('Could not parse JSON from model output');
  }
}

function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Working-hours check in Asia/Dhaka (UTC+6, no DST). Returns true if no hours
 * are configured (always-on) or `now` falls within [start, end]. Supports
 * windows that wrap past midnight (e.g. 22:00 → 02:00).
 */
export function isWithinWorkingHours(
  startHHMM: string | null | undefined,
  endHHMM: string | null | undefined,
  now: Date,
): boolean {
  const start = parseHHMM(startHHMM);
  const end = parseHHMM(endHHMM);
  if (start == null || end == null) return true;
  const dhakaMinutes = (now.getTime() / 60000 + 6 * 60) % (24 * 60);
  const cur = ((dhakaMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  if (start === end) return true; // treat as 24h
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end; // wrap-around window
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
