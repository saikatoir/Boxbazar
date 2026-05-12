import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  MessagingItem,
  MessengerWebhookBody,
  NormalizedMessengerEvent,
} from './types.js';

/**
 * Handles the GET verification handshake Meta performs when you (re)subscribe
 * a webhook. Returns the challenge string to echo back, or `null` if the
 * verify token doesn't match (caller should respond 403).
 */
export function verifyWebhookSubscription(
  query: Record<string, unknown>,
  expectedVerifyToken: string,
): string | null {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && typeof token === 'string' && token === expectedVerifyToken) {
    return typeof challenge === 'string' ? challenge : '';
  }
  return null;
}

/**
 * Validates the `X-Hub-Signature-256` header against the raw request body.
 * `appSecret` is the Meta app secret. Pass the *raw* bytes/string of the body —
 * a re-serialized object will not match.
 */
export function verifySignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const [algo, theirHex] = signatureHeader.split('=', 2);
  if (algo !== 'sha256' || !theirHex) return false;
  const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const ourHex = createHmac('sha256', appSecret).update(bodyBuf).digest('hex');
  const a = Buffer.from(ourHex, 'utf8');
  const b = Buffer.from(theirHex, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function normalizeOne(pageId: string, item: MessagingItem): NormalizedMessengerEvent {
  const senderPsid = item.sender?.id ?? '';
  const recipientId = item.recipient?.id ?? pageId;
  const msg = item.message;
  const postback = item.postback;
  const isEcho = !!msg?.is_echo;
  const isPostback = !!postback;
  const text = (postback?.payload ? postback.title ?? postback.payload : msg?.text) ?? '';
  const attachments =
    msg?.attachments?.map((a) => ({ type: a.type, url: a.payload?.url ?? null })) ?? [];
  const isReceiptOnly = !msg && !postback && (!!item.read || !!item.delivery);

  return {
    pageId,
    senderPsid,
    recipientId,
    mid: msg?.mid ?? postback?.mid ?? null,
    text: text.trim(),
    attachments,
    isEcho,
    isPostback,
    postbackPayload: postback?.payload ?? null,
    quickReplyPayload: msg?.quick_reply?.payload ?? null,
    isReceiptOnly,
    timestamp: item.timestamp ?? Date.now(),
    raw: item,
  };
}

/**
 * Flattens a Messenger webhook body into a list of normalized events.
 * Returns an empty array for non-`page` objects.
 */
export function parseMessengerEvents(body: MessengerWebhookBody): NormalizedMessengerEvent[] {
  if (!body || body.object !== 'page' || !Array.isArray(body.entry)) return [];
  const out: NormalizedMessengerEvent[] = [];
  for (const entry of body.entry) {
    const pageId = entry.id;
    for (const item of entry.messaging ?? []) {
      out.push(normalizeOne(pageId, item));
    }
  }
  return out;
}
