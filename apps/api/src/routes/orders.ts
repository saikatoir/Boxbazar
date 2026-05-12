import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getCourierAdapter,
  type ConsignmentRequest,
} from '@fcommerce/courier-sdk';
import { isValidBDPhone, normalizeBDPhone } from '@fcommerce/shared';
import { prisma } from '../lib/prisma.js';
import { decryptCredentials } from '../lib/encryption.js';

const itemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});

const createOrderBody = z.object({
  storeId: z.string().uuid().optional(),
  customer: z.object({
    name: z.string().min(1).max(200),
    phone: z.string().refine(
      (raw) => isValidBDPhone(normalizeBDPhone(raw)),
      { message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন' }
    ),
    addressLine: z.string().min(1).max(500),
    city: z.string().min(1).max(100),
    zone: z.string().max(100).optional().default(''),
    area: z.string().max(100).optional().default(''),
  }),
  items: z.array(itemSchema).min(1).max(50),
  subtotalCents: z.number().int().nonnegative(),
  deliveryCents: z.number().int().nonnegative(),
  codCents: z.number().int().nonnegative(),
  notes: z.string().max(1000).optional(),
  sourceChat: z.string().max(10000).optional(),
  parsedConfidence: z.unknown().optional(),
});

const dispatchBody = z.object({
  courier: z.enum(['steadfast', 'pathao', 'redx']),
  weightKg: z.number().positive().max(50).optional(),
});

function serializeOrder<T extends { subtotalCents: bigint; deliveryCents: bigint; codCents: bigint }>(o: T) {
  return {
    ...o,
    subtotalCents: Number(o.subtotalCents),
    deliveryCents: Number(o.deliveryCents),
    codCents: Number(o.codCents),
  };
}

function buildInvoiceId(orderId: string): string {
  // Short, human-friendly invoice ID derived from the order UUID.
  return `FC-${orderId.slice(0, 8).toUpperCase()}`;
}

export async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/orders',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = createOrderBody.parse(request.body);
      const userId = request.user.sub;

      let storeId = body.storeId;
      if (!storeId) {
        const firstStore = await prisma.store.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        });
        if (!firstStore) {
          return reply.status(400).send({
            message: 'কোনো store পাওয়া যায়নি। প্রথমে onboarding সম্পূর্ণ করুন।',
          });
        }
        storeId = firstStore.id;
      } else {
        const store = await prisma.store.findFirst({
          where: { id: storeId, userId },
        });
        if (!store) {
          return reply.status(404).send({ message: 'Store পাওয়া যায়নি।' });
        }
      }

      const phone = normalizeBDPhone(body.customer.phone);

      let customer = await prisma.customer.findFirst({
        where: { userId, phone },
      });
      const newAddress = {
        addressLine: body.customer.addressLine,
        city: body.customer.city,
        zone: body.customer.zone,
        area: body.customer.area,
        recordedAt: new Date().toISOString(),
      };
      if (customer) {
        const existing = Array.isArray(customer.addressHistory)
          ? (customer.addressHistory as unknown[])
          : [];
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: {
            name: body.customer.name,
            addressHistory: [newAddress, ...existing].slice(0, 10) as object,
          },
        });
      } else {
        customer = await prisma.customer.create({
          data: {
            userId,
            phone,
            name: body.customer.name,
            addressHistory: [newAddress] as object,
          },
        });
      }

      const order = await prisma.order.create({
        data: {
          userId,
          storeId,
          customerId: customer.id,
          status: 'draft',
          subtotalCents: BigInt(body.subtotalCents),
          deliveryCents: BigInt(body.deliveryCents),
          codCents: BigInt(body.codCents),
          items: body.items as unknown as object,
          notes: body.notes ?? null,
          sourceChat: body.sourceChat ?? null,
          parsedConfidence:
            (body.parsedConfidence as object | undefined) ?? undefined,
        },
      });

      return reply.status(201).send({ order: serializeOrder(order) });
    }
  );

  fastify.get(
    '/orders',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.sub;
      const orders = await prisma.order.findMany({
        where: { userId },
        include: { customer: true, consignment: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return reply.send({ orders: orders.map(serializeOrder) });
    }
  );

  fastify.get(
    '/orders/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const userId = request.user.sub;
      const order = await prisma.order.findFirst({
        where: { id, userId },
        include: {
          customer: true,
          consignment: { include: { courierEvents: { orderBy: { occurredAt: 'desc' } } } },
        },
      });
      if (!order) return reply.status(404).send({ message: 'Order পাওয়া যায়নি।' });
      return reply.send({ order: serializeOrder(order) });
    }
  );

  // ── Approve an AI-captured draft order ────────────────────────────────────
  fastify.post(
    '/orders/:id/approve',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const userId = request.user.sub;
      const order = await prisma.order.findFirst({ where: { id, userId } });
      if (!order) return reply.status(404).send({ message: 'Order পাওয়া যায়নি।' });
      if (order.status !== 'pending_approval') {
        return reply.status(409).send({ message: 'এই অর্ডার approval-এর অপেক্ষায় নেই।', status: order.status });
      }
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'approved', approvedAt: new Date(), approvedByUserId: userId },
        include: { customer: true, consignment: true },
      });
      return reply.send({ order: serializeOrder(updated) });
    }
  );

  // ── Reject an AI-captured draft order ─────────────────────────────────────
  fastify.post(
    '/orders/:id/reject',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(request.body ?? {});
      const userId = request.user.sub;
      const order = await prisma.order.findFirst({ where: { id, userId } });
      if (!order) return reply.status(404).send({ message: 'Order পাওয়া যায়নি।' });
      if (order.status !== 'pending_approval' && order.status !== 'approved') {
        return reply.status(409).send({ message: 'এই অর্ডার reject করা যাবে না।', status: order.status });
      }
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'rejected', rejectionReason: reason ?? null },
        include: { customer: true, consignment: true },
      });
      return reply.send({ order: serializeOrder(updated) });
    }
  );

  // ── Dispatch: book the order with a chosen courier ─────────────────────────
  fastify.post(
    '/orders/:id/dispatch',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = dispatchBody.parse(request.body);
      const userId = request.user.sub;

      const order = await prisma.order.findFirst({
        where: { id, userId },
        include: { customer: true, consignment: true, store: true },
      });
      if (!order) return reply.status(404).send({ message: 'Order পাওয়া যায়নি।' });

      if (order.consignment) {
        return reply.status(409).send({
          message: 'এই অর্ডার আগেই dispatch করা হয়েছে।',
          consignmentId: order.consignment.id,
        });
      }

      const courierAccount = await prisma.courierAccount.findUnique({
        where: { storeId_courier: { storeId: order.storeId, courier: body.courier } },
      });
      if (!courierAccount) {
        return reply.status(400).send({
          message: `${body.courier.toUpperCase()} কুরিয়ার এই store-এ যুক্ত নেই। Settings থেকে যোগ করুন।`,
        });
      }

      const creds = decryptCredentials(courierAccount.encryptedCredentials as string);
      const adapter = getCourierAdapter(body.courier, {
        courier: body.courier,
        ...creds,
      } as object);

      const customerAddress = order.customer.addressHistory as unknown as Array<{
        addressLine?: string;
        city?: string;
        zone?: string;
        area?: string;
      }>;
      const latestAddress = Array.isArray(customerAddress) ? customerAddress[0] : undefined;

      const itemDescription = Array.isArray(order.items)
        ? (order.items as Array<{ name: string; quantity: number }>)
            .map((it) => `${it.quantity}x ${it.name}`)
            .join(', ')
            .slice(0, 200)
        : 'Order';

      const req: ConsignmentRequest = {
        recipientName: order.customer.name,
        phone: order.customer.phone ?? '',
        address: latestAddress?.addressLine ?? '',
        city: latestAddress?.city ?? '',
        zone: latestAddress?.zone ?? '',
        area: latestAddress?.area ?? '',
        codAmount: Math.round(Number(order.codCents) / 100),
        invoiceId: buildInvoiceId(order.id),
        itemDescription,
        weight: body.weightKg,
      };

      let resp;
      try {
        resp = await adapter.createConsignment(req);
      } catch (err) {
        fastify.log.error({ err }, 'Courier createConsignment failed');
        return reply.status(502).send({
          message: 'কুরিয়ার সংযোগে সমস্যা হয়েছে।',
          detail: err instanceof Error ? err.message : String(err),
        });
      }

      const consignment = await prisma.consignment.create({
        data: {
          orderId: order.id,
          courier: body.courier,
          consignmentId: resp.consignmentId,
          trackingCode: resp.trackingCode,
          invoiceId: req.invoiceId,
          currentStatus: resp.status,
          rawCreationResponse: resp.rawResponse as object,
        },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'shipped' },
      });

      return reply.status(201).send({
        consignment: {
          ...consignment,
          labelUrl: `/api/consignments/${consignment.id}/label.pdf`,
          trackingUrl: buildTrackingUrl(body.courier, resp.trackingCode),
        },
      });
    }
  );
}

function buildTrackingUrl(courier: 'steadfast' | 'pathao' | 'redx', code: string): string {
  switch (courier) {
    case 'steadfast':
      return `https://steadfast.com.bd/t/${code}`;
    case 'pathao':
      return `https://merchant.pathao.com/tracking?consignment_id=${code}`;
    case 'redx':
      return `https://redx.com.bd/track-parcel/?trackingId=${code}`;
  }
}
