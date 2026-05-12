export type OrderStatus =
  | 'draft'
  | 'placed'
  | 'shipped'
  | 'delivered'
  | 'returned'
  | 'canceled';

export interface OrderItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  notes?: string;
}

export interface OrderAddress {
  recipientName: string;
  phone: string;
  addressLine: string;
  city: string;
  zone: string;
  area: string;
}

export interface Order {
  id: string;
  userId: string;
  storeId: string;
  customerId: string;
  status: OrderStatus;
  subtotalCents: number;
  deliveryCents: number;
  codCents: number;
  items: OrderItem[];
  notes: string | null;
  sourceChat: string | null;
  parsedConfidence: ParsedConfidence | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedConfidence {
  overall: number;
  fields: {
    recipientName?: number;
    phone?: number;
    address?: number;
    items?: number;
    codAmount?: number;
  };
}

export interface CreateOrderInput {
  storeId: string;
  customerId: string;
  items: OrderItem[];
  address: OrderAddress;
  codAmountCents: number;
  deliveryCents: number;
  notes?: string;
  sourceChat?: string;
}
