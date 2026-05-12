import type {
  CourierAdapter,
  ConsignmentRequest,
  ConsignmentResponse,
  TrackingStatus,
  FraudCheckResult,
  PathaoCredentials,
} from '../types.js';
import { OrderStatus } from '../types.js';

const PROD_BASE = 'https://api-hermes.pathao.com';
const SANDBOX_BASE = 'https://courier-api-sandbox.pathao.com';

// Pathao publishes a small fixed set of status strings.
const STATUS_MAP: Record<string, OrderStatus> = {
  Pickup_Requested: OrderStatus.in_pickup,
  Pickup: OrderStatus.in_pickup,
  Pickup_Failed: OrderStatus.pending,
  Pickup_Cancelled: OrderStatus.cancelled,
  At_the_Sorting_HUB: OrderStatus.in_transit,
  In_Transit: OrderStatus.in_transit,
  Received_at_Last_Mile_Hub: OrderStatus.in_transit,
  Assigned_for_Delivery: OrderStatus.out_for_delivery,
  Delivered: OrderStatus.delivered,
  Partial_Delivery: OrderStatus.delivered,
  Return: OrderStatus.returned,
  Returned: OrderStatus.returned,
  Hold: OrderStatus.hold,
  Cancelled: OrderStatus.cancelled,
};

function normalizeStatus(raw: string): OrderStatus {
  const key = raw.replace(/\s+/g, '_');
  return STATUS_MAP[key] ?? OrderStatus.pending;
}

interface PathaoTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

interface PathaoLocation {
  city_id?: number;
  zone_id?: number;
  area_id?: number;
  city_name?: string;
  zone_name?: string;
  area_name?: string;
}

interface PathaoCreateOrderResponse {
  code: number;
  message: string;
  type: string;
  data: {
    consignment_id: string;
    merchant_order_id: string;
    order_status: string;
    delivery_fee: number;
  };
}

interface PathaoOrderInfoResponse {
  code: number;
  data: {
    consignment_id: string;
    order_status: string;
    updated_at?: string;
  };
}

interface PathaoListResponse<T> {
  data: { data: T[] };
}

export class PathaoAdapter implements CourierAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly username: string;
  private readonly password: string;
  private readonly storeId: number;
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  // In-memory location ID cache. Keyed by `${kind}:${parentId}:${name}` (lowercased).
  private static locationCache = new Map<string, number>();

  constructor(credentials: PathaoCredentials) {
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.username = credentials.username;
    this.password = credentials.password;
    this.storeId = credentials.storeId;
    this.baseUrl = credentials.sandbox ? SANDBOX_BASE : PROD_BASE;
  }

  private async refreshToken(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/aladdin/api/v1/issue-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username: this.username,
        password: this.password,
        grant_type: 'password',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Pathao token refresh failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as PathaoTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);
  }

  private async ensureToken(): Promise<string> {
    if (
      !this.accessToken ||
      !this.tokenExpiresAt ||
      this.tokenExpiresAt <= new Date()
    ) {
      await this.refreshToken();
    }
    if (!this.accessToken) throw new Error('Pathao: no access token');
    return this.accessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Pathao ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`
      );
    }
    return res.json() as Promise<T>;
  }

  // ── Location resolution ───────────────────────────────────────────────────
  // Pathao requires numeric city / zone / area IDs. Adapter resolves them
  // from human-readable names by walking three list endpoints, cached by name.

  private async lookupCityId(cityName: string): Promise<number | null> {
    const key = `city::${cityName.toLowerCase()}`;
    const cached = PathaoAdapter.locationCache.get(key);
    if (cached != null) return cached;
    const res = await this.request<PathaoListResponse<PathaoLocation>>(
      'GET',
      '/aladdin/api/v1/city-list'
    );
    for (const c of res.data.data) {
      if (c.city_id != null && c.city_name) {
        const k = `city::${c.city_name.toLowerCase()}`;
        PathaoAdapter.locationCache.set(k, c.city_id);
      }
    }
    return PathaoAdapter.locationCache.get(key) ?? null;
  }

  private async lookupZoneId(
    cityId: number,
    zoneName: string
  ): Promise<number | null> {
    const key = `zone:${cityId}:${zoneName.toLowerCase()}`;
    const cached = PathaoAdapter.locationCache.get(key);
    if (cached != null) return cached;
    const res = await this.request<PathaoListResponse<PathaoLocation>>(
      'GET',
      `/aladdin/api/v1/cities/${cityId}/zone-list`
    );
    for (const z of res.data.data) {
      if (z.zone_id != null && z.zone_name) {
        const k = `zone:${cityId}:${z.zone_name.toLowerCase()}`;
        PathaoAdapter.locationCache.set(k, z.zone_id);
      }
    }
    return PathaoAdapter.locationCache.get(key) ?? null;
  }

  private async lookupAreaId(
    zoneId: number,
    areaName: string
  ): Promise<number | null> {
    const key = `area:${zoneId}:${areaName.toLowerCase()}`;
    const cached = PathaoAdapter.locationCache.get(key);
    if (cached != null) return cached;
    const res = await this.request<PathaoListResponse<PathaoLocation>>(
      'GET',
      `/aladdin/api/v1/zones/${zoneId}/area-list`
    );
    for (const a of res.data.data) {
      if (a.area_id != null && a.area_name) {
        const k = `area:${zoneId}:${a.area_name.toLowerCase()}`;
        PathaoAdapter.locationCache.set(k, a.area_id);
      }
    }
    return PathaoAdapter.locationCache.get(key) ?? null;
  }

  async createConsignment(
    req: ConsignmentRequest
  ): Promise<ConsignmentResponse> {
    const cityId = await this.lookupCityId(req.city);
    if (cityId == null) {
      throw new Error(`Pathao: city "${req.city}" not found`);
    }
    const zoneId = req.zone ? await this.lookupZoneId(cityId, req.zone) : null;
    const areaId =
      zoneId != null && req.area
        ? await this.lookupAreaId(zoneId, req.area)
        : null;

    const payload = {
      store_id: this.storeId,
      merchant_order_id: req.invoiceId,
      recipient_name: req.recipientName,
      recipient_phone: req.phone,
      recipient_address: req.address,
      recipient_city: cityId,
      ...(zoneId != null ? { recipient_zone: zoneId } : {}),
      ...(areaId != null ? { recipient_area: areaId } : {}),
      delivery_type: 48, // 48 = normal, 12 = on-demand
      item_type: 2, // 2 = parcel
      item_quantity: 1,
      item_weight: req.weight ?? 0.5,
      amount_to_collect: req.codAmount,
      item_description: req.itemDescription.slice(0, 200),
    };

    const data = await this.request<PathaoCreateOrderResponse>(
      'POST',
      '/aladdin/api/v1/orders',
      payload
    );
    return {
      consignmentId: data.data.consignment_id,
      trackingCode: data.data.consignment_id,
      invoiceId: data.data.merchant_order_id,
      status: data.data.order_status,
      rawResponse: data,
    };
  }

  async getTrackingStatus(consignmentId: string): Promise<TrackingStatus> {
    const data = await this.request<PathaoOrderInfoResponse>(
      'GET',
      `/aladdin/api/v1/orders/${consignmentId}/info`
    );
    return {
      consignmentId: data.data.consignment_id,
      status: data.data.order_status,
      normalizedStatus: normalizeStatus(data.data.order_status),
      occurredAt: data.data.updated_at ? new Date(data.data.updated_at) : new Date(),
      rawPayload: data,
    };
  }

  async checkFraud(phone: string): Promise<FraudCheckResult> {
    // Pathao publishes a customer-info endpoint that returns success/cancel counts.
    type PathaoCustomerInfo = {
      data?: {
        customer?: {
          phone?: string;
          total_delivery?: number;
          successful_delivery?: number;
        };
      };
    };
    try {
      const data = await this.request<PathaoCustomerInfo>(
        'GET',
        `/aladdin/api/v1/user/info?phone=${encodeURIComponent(phone)}`
      );
      const customer = data.data?.customer;
      const total = customer?.total_delivery ?? 0;
      const success = customer?.successful_delivery ?? 0;
      const cancel = Math.max(0, total - success);
      const ratio = total > 0 ? cancel / total : 0;
      const riskScore = Math.max(0, Math.min(100, Math.round(ratio * 100)));
      const riskBand: 'green' | 'yellow' | 'red' =
        riskScore >= 70 ? 'red' : riskScore >= 40 ? 'yellow' : 'green';
      return {
        phone,
        totalOrders: total,
        successfulOrders: success,
        canceledOrders: cancel,
        riskScore,
        riskBand,
        courier: 'pathao',
        rawPayload: data,
      };
    } catch (err) {
      // Pathao's fraud endpoint is not universally available — fall back to neutral.
      return {
        phone,
        totalOrders: 0,
        successfulOrders: 0,
        canceledOrders: 0,
        riskScore: 0,
        riskBand: 'green',
        courier: 'pathao',
        rawPayload: { error: String(err) },
      };
    }
  }

  async getBalance(): Promise<number> {
    type PathaoBalance = { data?: { current_balance?: number } };
    try {
      const data = await this.request<PathaoBalance>(
        'GET',
        '/aladdin/api/v1/user/balance'
      );
      return data.data?.current_balance ?? 0;
    } catch {
      return 0;
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.ensureToken();
      return true;
    } catch {
      return false;
    }
  }
}
