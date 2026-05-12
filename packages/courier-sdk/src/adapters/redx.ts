import type {
  CourierAdapter,
  ConsignmentRequest,
  ConsignmentResponse,
  TrackingStatus,
  FraudCheckResult,
  RedxCredentials,
} from '../types.js';
import { OrderStatus } from '../types.js';

const REDX_BASE_URL = 'https://openapi.redx.com.bd/v1.0.0-beta';

const STATUS_MAP: Record<string, OrderStatus> = {
  'parcel-created': OrderStatus.pending,
  'pickup-pending': OrderStatus.in_pickup,
  'pickup-failed': OrderStatus.pending,
  picked: OrderStatus.in_pickup,
  'in-transit': OrderStatus.in_transit,
  'delivery-in-progress': OrderStatus.out_for_delivery,
  delivered: OrderStatus.delivered,
  'partial-delivered': OrderStatus.delivered,
  hold: OrderStatus.hold,
  cancelled: OrderStatus.cancelled,
  returned: OrderStatus.returned,
  'return-to-shop': OrderStatus.returned,
};

function normalizeStatus(raw: string): OrderStatus {
  return STATUS_MAP[raw.toLowerCase()] ?? OrderStatus.pending;
}

interface RedxAreaListResponse {
  areas: Array<{
    id: number;
    name: string;
    district_name?: string;
    division_name?: string;
    zone_name?: string;
    post_code?: number;
  }>;
}

interface RedxCreateParcelResponse {
  tracking_id: string;
  status?: string;
  message?: string;
}

interface RedxParcelInfoResponse {
  tracking_id: string;
  status: string;
  status_history?: Array<{ status: string; time: string }>;
  updated_at?: string;
}

interface RedxBalanceResponse {
  balance?: number;
  available_balance?: number;
}

export class RedxAdapter implements CourierAdapter {
  private readonly apiToken: string;
  private static areaCache = new Map<string, number>();

  constructor(credentials: RedxCredentials) {
    this.apiToken = credentials.apiToken;
  }

  private get headers(): Record<string, string> {
    return {
      'API-ACCESS-TOKEN': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${REDX_BASE_URL}${path}`, {
      method,
      headers: this.headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `RedX ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`
      );
    }
    return res.json() as Promise<T>;
  }

  private async lookupAreaId(area: string, city: string): Promise<number | null> {
    const key = `${city.toLowerCase()}::${area.toLowerCase()}`;
    const cached = RedxAdapter.areaCache.get(key);
    if (cached != null) return cached;

    const res = await this.request<RedxAreaListResponse>(
      'GET',
      `/areas?post_code=&district_name=${encodeURIComponent(city)}`
    ).catch(() => null);
    if (!res) return null;

    for (const a of res.areas ?? []) {
      const k = `${(a.district_name ?? '').toLowerCase()}::${a.name.toLowerCase()}`;
      RedxAdapter.areaCache.set(k, a.id);
    }
    return RedxAdapter.areaCache.get(key) ?? null;
  }

  async createConsignment(
    req: ConsignmentRequest
  ): Promise<ConsignmentResponse> {
    const areaId = await this.lookupAreaId(req.area || req.zone, req.city);
    const payload = {
      customer_name: req.recipientName,
      customer_phone: req.phone,
      delivery_area: req.area || req.zone || req.city,
      delivery_area_id: areaId,
      customer_address: req.address,
      merchant_invoice_id: req.invoiceId,
      cash_collection_amount: req.codAmount,
      parcel_weight: Math.max(1, Math.round((req.weight ?? 0.5) * 1000)), // grams
      value: req.codAmount,
      instruction: req.itemDescription.slice(0, 300),
    };

    const data = await this.request<RedxCreateParcelResponse>(
      'POST',
      '/parcel',
      payload
    );
    return {
      consignmentId: data.tracking_id,
      trackingCode: data.tracking_id,
      invoiceId: req.invoiceId,
      status: data.status ?? 'parcel-created',
      rawResponse: data,
    };
  }

  async getTrackingStatus(consignmentId: string): Promise<TrackingStatus> {
    const data = await this.request<RedxParcelInfoResponse>(
      'GET',
      `/parcel/info/${consignmentId}`
    );
    return {
      consignmentId: data.tracking_id,
      status: data.status,
      normalizedStatus: normalizeStatus(data.status),
      occurredAt: data.updated_at ? new Date(data.updated_at) : new Date(),
      rawPayload: data,
    };
  }

  async checkFraud(phone: string): Promise<FraudCheckResult> {
    // RedX does not yet expose a public fraud endpoint. Return neutral.
    return {
      phone,
      totalOrders: 0,
      successfulOrders: 0,
      canceledOrders: 0,
      riskScore: 0,
      riskBand: 'green',
      courier: 'redx',
      rawPayload: null,
    };
  }

  async getBalance(): Promise<number> {
    const data = await this.request<RedxBalanceResponse>(
      'GET',
      '/merchant/payment/balance'
    );
    return data.balance ?? data.available_balance ?? 0;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.getBalance();
      return true;
    } catch {
      return false;
    }
  }
}
