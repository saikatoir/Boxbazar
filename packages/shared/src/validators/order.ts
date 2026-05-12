import { z } from 'zod';
import { isValidBDPhone } from './phone.js';

export const orderItemSchema = z.object({
  name: z.string().min(1, 'Item name is required').max(200),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unitPriceCents: z
    .number()
    .int()
    .nonnegative('Unit price must be non-negative'),
  notes: z.string().max(500).optional(),
});

export const orderAddressSchema = z.object({
  recipientName: z
    .string()
    .min(1, 'Recipient name is required')
    .max(200),
  phone: z.string().refine(isValidBDPhone, {
    message: 'Invalid Bangladeshi phone number',
  }),
  addressLine: z.string().min(1, 'Address is required').max(500),
  city: z.string().min(1, 'City is required').max(100),
  zone: z.string().min(1, 'Zone is required').max(100),
  area: z.string().min(1, 'Area is required').max(100),
});

export const createOrderSchema = z.object({
  storeId: z.string().uuid('Invalid store ID'),
  customerId: z.string().uuid('Invalid customer ID'),
  items: z
    .array(orderItemSchema)
    .min(1, 'At least one item is required')
    .max(50, 'Maximum 50 items per order'),
  address: orderAddressSchema,
  codAmountCents: z
    .number()
    .int()
    .nonnegative('COD amount must be non-negative'),
  deliveryCents: z
    .number()
    .int()
    .nonnegative('Delivery charge must be non-negative'),
  notes: z.string().max(1000).optional(),
  sourceChat: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'draft',
    'placed',
    'shipped',
    'delivered',
    'returned',
    'canceled',
  ]),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
