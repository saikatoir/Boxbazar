/** Raw Messenger webhook payload shapes (the subset we consume). */

export interface MessengerWebhookBody {
  object: string; // 'page'
  entry?: MessengerEntry[];
}

export interface MessengerEntry {
  id: string; // the Page ID
  time?: number;
  messaging?: MessagingItem[];
}

export interface MessagingItem {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    app_id?: number;
    attachments?: Array<{
      type: string; // image | video | audio | file | location | fallback
      payload?: { url?: string; [k: string]: unknown };
    }>;
    quick_reply?: { payload?: string };
  };
  postback?: {
    mid?: string;
    title?: string;
    payload?: string;
  };
  read?: { watermark?: number };
  delivery?: { watermark?: number; mids?: string[] };
}

/** Normalized event the rest of our system works with. */
export interface NormalizedMessengerEvent {
  pageId: string;
  senderPsid: string;
  recipientId: string;
  mid: string | null;
  /** Message text, or the title of a tapped postback button. */
  text: string;
  attachments: Array<{ type: string; url: string | null }>;
  /** True for echoes of messages our own app/page sent. */
  isEcho: boolean;
  isPostback: boolean;
  postbackPayload: string | null;
  quickReplyPayload: string | null;
  /** Pure read/delivery receipts and other no-content events. */
  isReceiptOnly: boolean;
  timestamp: number;
  raw: MessagingItem;
}

export type SenderAction = 'typing_on' | 'typing_off' | 'mark_seen';

export interface SendResult {
  recipientId?: string;
  messageId?: string;
  raw: unknown;
}

export interface GraphPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
}
