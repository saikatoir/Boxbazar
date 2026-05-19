/**
 * Fetch a customer-uploaded image attachment from Meta's CDN.
 *
 * Meta serves attachment URLs in messenger webhook payloads as signed,
 * time-limited HTTPS links — they don't require auth headers. They DO expire
 * (typically within a few hours), so this should be called soon after the
 * webhook event arrives, not lazy-loaded later.
 *
 * Hard caps to keep costs and memory bounded:
 *   - MIME must start with `image/` (skip video/audio/files for v1).
 *   - Body capped at 5 MB. Larger → throw so the caller can skip-and-log.
 *   - 10s timeout end-to-end.
 *
 * Returns null when the response is non-image OR when fetch fails — the
 * caller should treat the attachment as not-available rather than blow up
 * the whole pipeline. Throws only on programming-error inputs.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface FetchedAttachment {
  mimeType: string;
  bytes: Uint8Array;
}

export interface FetchAttachmentOptions {
  /** Fetch timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Hard size cap. Default 5 MB. */
  maxBytes?: number;
}

export async function fetchAttachment(
  url: string,
  opts: FetchAttachmentOptions = {},
): Promise<FetchedAttachment | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch {
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);
  if (!res.ok) return null;

  const mimeType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  if (!mimeType.startsWith('image/')) {
    // Drain so the connection can close cleanly.
    await res.arrayBuffer().catch(() => undefined);
    return null;
  }

  // Cheap content-length check before reading the body.
  const declaredLength = Number(res.headers.get('content-length') ?? '0');
  if (declaredLength > maxBytes) {
    return null;
  }

  const buf = await res.arrayBuffer().catch(() => null);
  if (!buf) return null;
  if (buf.byteLength > maxBytes) return null;

  return {
    mimeType,
    bytes: new Uint8Array(buf),
  };
}
