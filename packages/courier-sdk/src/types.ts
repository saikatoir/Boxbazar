// ─── Order Status Enum ────────────────────────────────────────────────────────

export enum OrderStatus {
  pending = 'pending',
  in_pickup = 'in_pickup',
  in_transit = 'in_transit',
  out_for_delivery = 'out_for_delivery',
  delivered = 'delivered',
  returned = 'returned',
  cancelled = 'cancelled',
  hold = 'hold',
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export interface SteadfastCredentials {
  courier: 'steadfast';
  apiKey: string;
  secretKey: string;
}

export interface PathaoCredentials {
  courier: 'pathao';
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  storeId: number;
  /** Optional sandbox flag. When true the adapter calls hermes-staging instead of prod. */
  sandbox?: boolean;
}

export interface RedxCredentials {
  courier: 'redx';
  apiToken: string;
}

export type CourierCredentials =
  | SteadfastCredentials
  | PathaoCredentials
  | RedxCredentials;

// ─── Consignment ─────────────────────────────────────────────────────────────

export interface ConsignmentRequest {
  recipientName: string;
  phone: string;
  address: string;
  city: string;
  zone: string;
  area: string;
  codAmount: number;
  invoiceId: string;
  itemDescription: string;
  weight?: number;
}

export interface ConsignmentResponse {
  consignmentId: string;
  trackingCode: string;
  invoiceId: string;
  status: string;
  rawResponse: unknown;
}

// ─── Tracking ─────────────────────────────────────────────────────────────────

export interface TrackingStatus {
  consignmentId: string;
  status: string;
  normalizedStatus: OrderStatus;
  occurredAt: Date;
  rawPayload: unknown;
}

// ─── Fraud ───────────────────────────────────────────────────────────────────

export interface FraudCheckResult {
  phone: string;
  totalOrders: number;
  successfulOrders: number;
  canceledOrders: number;
  riskScore: number;
  riskBand: 'green' | 'yellow' | 'red';
  courier: string;
  rawPayload: unknown;
}

// ─── Adapter Interface ───────────────────────────────────────────────────────

export interface CourierAdapter {
  createConsignment(req: ConsignmentRequest): Promise<ConsignmentResponse>;
  getTrackingStatus(consignmentId: string): Promise<TrackingStatus>;
  checkFraud(phone: string): Promise<FraudCheckResult>;
  getBalance(): Promise<number>;
  validateCredentials(): Promise<boolean>;
}
