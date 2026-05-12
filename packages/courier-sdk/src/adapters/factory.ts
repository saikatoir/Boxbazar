import type { CourierAdapter, CourierCredentials } from '../types.js';
import { SteadfastAdapter } from './steadfast.js';
import { PathaoAdapter } from './pathao.js';
import { RedxAdapter } from './redx.js';

export function getCourierAdapter(
  courier: 'steadfast' | 'pathao' | 'redx',
  credentials: unknown
): CourierAdapter {
  switch (courier) {
    case 'steadfast': {
      const creds = credentials as import('../types.js').SteadfastCredentials;
      if (!creds.apiKey || !creds.secretKey) {
        throw new Error(
          'Steadfast credentials must include apiKey and secretKey'
        );
      }
      return new SteadfastAdapter(creds);
    }
    case 'pathao': {
      const creds = credentials as import('../types.js').PathaoCredentials;
      if (!creds.clientId || !creds.clientSecret) {
        throw new Error(
          'Pathao credentials must include clientId and clientSecret'
        );
      }
      if (creds.storeId == null) {
        throw new Error('Pathao credentials must include storeId');
      }
      return new PathaoAdapter(creds);
    }
    case 'redx': {
      const creds = credentials as import('../types.js').RedxCredentials;
      if (!creds.apiToken) {
        throw new Error('RedX credentials must include apiToken');
      }
      return new RedxAdapter(creds);
    }
    default: {
      const _exhaustive: never = courier;
      throw new Error(`Unknown courier: ${String(_exhaustive)}`);
    }
  }
}
