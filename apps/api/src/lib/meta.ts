import { MessengerClient } from '@fcommerce/meta-sdk';
import type { Store } from '@fcommerce/db';
import { encryptCredentials, decryptCredentials } from './encryption.js';
import { env } from './../env.js';

export function encryptPageToken(token: string): string {
  return encryptCredentials({ pageAccessToken: token });
}

export function decryptPageToken(encoded: string): string {
  const obj = decryptCredentials(encoded) as { pageAccessToken?: string };
  if (!obj?.pageAccessToken) throw new Error('Decrypted page token payload is malformed');
  return obj.pageAccessToken;
}

/** Build a Send-API client for a connected store, or null if it isn't connected. */
export function messengerClientForStore(
  store: Pick<Store, 'fbPageAccessTokenEncrypted'>,
): MessengerClient | null {
  if (!store.fbPageAccessTokenEncrypted) return null;
  const token = decryptPageToken(store.fbPageAccessTokenEncrypted);
  return new MessengerClient({ pageAccessToken: token, graphVersion: env.META_GRAPH_VERSION });
}
