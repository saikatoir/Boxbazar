import type { GraphPage, SenderAction, SendResult } from './types.js';

const DEFAULT_GRAPH_VERSION = 'v21.0';
const DEFAULT_TIMEOUT_MS = 10_000;

export interface MessengerClientOptions {
  /** Page Access Token. */
  pageAccessToken: string;
  /** e.g. 'v21.0'. Default 'v21.0'. */
  graphVersion?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
}

async function graphFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = (await res.json().catch(() => ({}))) as unknown;
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Indicates a Page Access Token that Meta rejected (revoked / expired / wrong perms). */
export class MetaAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly raw: unknown,
  ) {
    super(message);
    this.name = 'MetaAuthError';
  }
}

export class MessengerClient {
  private readonly token: string;
  private readonly version: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: MessengerClientOptions) {
    if (!opts.pageAccessToken) throw new Error('MessengerClient requires a pageAccessToken');
    this.token = opts.pageAccessToken;
    this.version = opts.graphVersion ?? DEFAULT_GRAPH_VERSION;
    this.baseUrl = opts.baseUrl ?? 'https://graph.facebook.com';
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private endpoint(path: string): string {
    return `${this.baseUrl}/${this.version}/${path}`;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const url = `${this.endpoint(path)}?access_token=${encodeURIComponent(this.token)}`;
    const { ok, status, body: resBody } = await graphFetch(
      url,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      this.timeoutMs,
    );
    if (!ok) {
      const err = (resBody as GraphError).error;
      const msg = err?.message ?? `Graph API error ${status}`;
      if (status === 401 || status === 403 || err?.code === 190 || err?.type === 'OAuthException') {
        throw new MetaAuthError(msg, status, resBody);
      }
      throw new Error(`${msg} (status ${status})`);
    }
    return resBody;
  }

  /** Send a plain text message to a PSID using the Messenger Send API. */
  async sendText(psid: string, text: string, messagingType: 'RESPONSE' | 'UPDATE' = 'RESPONSE'): Promise<SendResult> {
    const raw = (await this.post('me/messages', {
      messaging_type: messagingType,
      recipient: { id: psid },
      message: { text },
    })) as { recipient_id?: string; message_id?: string };
    return { recipientId: raw.recipient_id, messageId: raw.message_id, raw };
  }

  /** Typing indicators / read receipts so the AI "feels" like a person. */
  async sendSenderAction(psid: string, action: SenderAction): Promise<SendResult> {
    const raw = (await this.post('me/messages', {
      recipient: { id: psid },
      sender_action: action,
    })) as { recipient_id?: string };
    return { recipientId: raw.recipient_id, raw };
  }

  /**
   * Subscribe this app to webhook events for the page the token belongs to.
   * Call once when the seller connects their page.
   */
  async subscribeAppToPage(
    fields: string[] = ['messages', 'messaging_postbacks', 'message_echoes'],
  ): Promise<boolean> {
    const raw = (await this.post('me/subscribed_apps', { subscribed_fields: fields.join(',') })) as {
      success?: boolean;
    };
    return raw.success === true;
  }
}

/**
 * Exchange a (short- or long-lived) *user* access token for the list of pages
 * the user manages, each with its own Page Access Token. Used at connect time.
 */
export async function listManagedPages(
  userAccessToken: string,
  opts: { graphVersion?: string; baseUrl?: string; timeoutMs?: number } = {},
): Promise<GraphPage[]> {
  const version = opts.graphVersion ?? DEFAULT_GRAPH_VERSION;
  const baseUrl = opts.baseUrl ?? 'https://graph.facebook.com';
  const url =
    `${baseUrl}/${version}/me/accounts?fields=id,name,access_token,category,tasks&limit=100` +
    `&access_token=${encodeURIComponent(userAccessToken)}`;
  const { ok, status, body } = await graphFetch(url, { method: 'GET' }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!ok) {
    const err = (body as GraphError).error;
    if (status === 401 || status === 403 || err?.code === 190) {
      throw new MetaAuthError(err?.message ?? 'Invalid user access token', status, body);
    }
    throw new Error(`${err?.message ?? 'Graph API error'} (status ${status})`);
  }
  const data = (body as { data?: GraphPage[] }).data ?? [];
  return data;
}
