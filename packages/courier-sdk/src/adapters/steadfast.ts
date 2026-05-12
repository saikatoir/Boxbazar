import type {
  CourierAdapter,
  ConsignmentRequest,
  ConsignmentResponse,
  TrackingStatus,
  FraudCheckResult,
  SteadfastCredentials,
} from '../types.js';
import { OrderStatus } from '../types.js';

const BASE_URL = 'https://portal.packzy.com/api/v1';
const MAX_RETRIES = 3;

// Steadfast raw API response shapes
interface SteadfastCreateResponse {
  status: number;
  message: string;
  consignment: {
    consignment_id: number;
    invoice: string;
    tracking_code: string;
    recipient_name: string;
    recipient_phone: string;
    recipient_address: string;
    cod_amount: number;
    status: string;
  };
}

interface SteadfastTrackResponse {
  status: number;
  message: string;
  deliveryStatus: {
    consignment_id: number;
    tracking_code: string;
    status: string;
    updated_at: string;
  };
}

interface SteadfastBalanceResponse {
  status: number;
  message: string;
  current_balance: number;
}

interface SteadfastFraudResponse {
  status: number;
  message: string;
  total_order: number;
  total_cancel: number;
  deliveredOrder?: number;
}

// Map Steadfast statuses to normalized OrderStatus
const STATUS_MAP: Record<string, OrderStatus> = {
  pending: OrderStatus.pending,
  in_review: OrderStatus.pending,
  hold: OrderStatus.hold,
  pickup_requested: OrderStatus.in_pickup,
  picked_up: OrderStatus.in_pickup,
  in_transit: OrderStatus.in_transit,
  out_for_delivery: OrderStatus.out_for_delivery,
  delivered: OrderStatus.delivered,
  partial_delivered: OrderStatus.delivered,
  cancelled: OrderStatus.cancelled,
  returned: OrderStatus.returned,
  partial_returned: OrderStatus.returned,
};

function normalizeStatus(raw: string): OrderStatus {
  return STATUS_MAP[raw.toLowerCase()] ?? OrderStatus.pending;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  attempt = 1
): Promise<Response> {
  const response = await fetch(url, options);

  if (
    (response.status === 429 || response.status >= 500) &&
    attempt < MAX_RETRIES
  ) {
    const backoffMs = Math.pow(2, attempt) * 1000;
    await sleep(backoffMs);
    return fetchWithRetry(url, options, attempt + 1);
  }

  return response;
}

export class SteadfastAdapter implements CourierAdapter {
  private readonly apiKey: string;
  private readonly secretKey: string;

  constructor(credentials: SteadfastCredentials) {
    this.apiKey = credentials.apiKey;
    this.secretKey = credentials.secretKey;
  }

  private get headers(): Record<string, string> {
    return {
      'Api-Key': this.apiKey,
      'Secret-Key': this.secretKey,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetchWithRetry(`${BASE_URL}${path}`, {
      method,
      headers: this.headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Steadfast API error ${response.status} at ${path}: ${text}`
      );
    }

    return response.json() as Promise<T>;
  }

  async createConsignment(
    req: ConsignmentRequest
  ): Promise<ConsignmentResponse> {
    const payload = {
      invoice: req.invoiceId,
      recipient_name: req.recipientName,
      recipient_phone: req.phone,
      recipient_address: req.address,
      cod_amount: req.codAmount,
      note: req.itemDescription,
      ...(req.weight != null ? { weight: req.weight } : {}),
    };

    const data = await this.request<SteadfastCreateResponse>(
      'POST',
      '/create_order',
      payload
    );

    return {
      consignmentId: String(data.consignment.consignment_id),
      trackingCode: data.consignment.tracking_code,
      invoiceId: data.consignment.invoice,
      status: data.consignment.status,
      rawResponse: data,
    };
  }

  async getTrackingStatus(consignmentId: string): Promise<TrackingStatus> {
    const data = await this.request<SteadfastTrackResponse>(
      'GET',
      `/status_by_cid/${consignmentId}`
    );

    const rawStatus = data.deliveryStatus.status;
    return {
      consignmentId: String(data.deliveryStatus.consignment_id),
      status: rawStatus,
      normalizedStatus: normalizeStatus(rawStatus),
      occurredAt: new Date(data.deliveryStatus.updated_at),
      rawPayload: data,
    };
  }

  async checkFraud(phone: string): Promise<FraudCheckResult> {
    const data = await this.request<SteadfastFraudResponse>(
      'GET',
      `/fraud_check/${phone}`
    );

    const totalOrders = data.total_order;
    const canceledOrders = data.total_cancel;
    const successfulOrders = data.deliveredOrder ?? 0;
    const cancelRatio = totalOrders > 0 ? canceledOrders / totalOrders : 0;

    let riskScore = Math.round(cancelRatio * 100);
    riskScore = Math.max(0, Math.min(100, riskScore));

    const riskBand: 'green' | 'yellow' | 'red' =
      riskScore >= 70 ? 'red' : riskScore >= 40 ? 'yellow' : 'green';

    return {
      phone,
      totalOrders,
      successfulOrders,
      canceledOrders,
      riskScore,
      riskBand,
      courier: 'steadfast',
      rawPayload: data,
    };
  }

  async getBalance(): Promise<number> {
    const data = await this.request<SteadfastBalanceResponse>(
      'GET',
      '/get_balance'
    );
    return data.current_balance;
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
