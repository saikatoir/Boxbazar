import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { OrderStatus, type TrackingStatus } from '@fcommerce/courier-sdk';
import {
  verifyWebhookSubscription,
  verifySignature,
  parseMessengerEvents,
  type MessengerWebhookBody,
} from '@fcommerce/meta-sdk';
import { prisma } from '../lib/prisma.js';
import { ingestStatusEvent } from '../lib/courier-status.js';
import { enqueueMessengerEvent } from '../lib/messenger-queue.js';
import { getPlatformConfig } from '../lib/platform-config.js';

function checkBearer(
  request: FastifyRequest,
  reply: FastifyReply,
  expected: string | null | undefined,
): boolean {
  if (!expected) {
    reply.status(503).send({ message: 'Webhook token not configured' });
    return false;
  }
  const header = request.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    reply.status(401).send({ message: 'Missing bearer' });
    return false;
  }
  const token = header.slice(7).trim();
  if (token !== expected) {
    reply.status(401).send({ message: 'Invalid bearer' });
    return false;
  }
  return true;
}

const STEADFAST_STATUS_MAP: Record<string, OrderStatus> = {
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

function steadfastNormalize(raw: string): OrderStatus {
  return STEADFAST_STATUS_MAP[raw.toLowerCase()] ?? OrderStatus.pending;
}

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Meta Messenger ──────────────────────────────────────────────────────
  // GET: webhook verification handshake (hub.mode / hub.verify_token / hub.challenge).
  fastify.get('/webhooks/messenger', async (request, reply) => {
    const { metaVerifyToken } = await getPlatformConfig();
    if (!metaVerifyToken) {
      return reply.status(503).send({ message: 'Messenger webhook not configured' });
    }
    const challenge = verifyWebhookSubscription(
      request.query as Record<string, unknown>,
      metaVerifyToken,
    );
    if (challenge === null) return reply.status(403).send('Forbidden');
    return reply.status(200).type('text/plain').send(challenge);
  });

  // POST: incoming events. Validate signature, enqueue, return 200 immediately.
  fastify.post(
    '/webhooks/messenger',
    { config: { rateLimit: { max: 2000, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { metaAppSecret } = await getPlatformConfig();
      if (!metaAppSecret) {
        return reply.status(503).send({ message: 'Messenger webhook not configured' });
      }
      const raw = request.rawBody;
      const sigHeader = request.headers['x-hub-signature-256'];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!raw || !verifySignature(raw, sig, metaAppSecret)) {
        return reply.status(401).send({ message: 'Invalid signature' });
      }
      const body = request.body as MessengerWebhookBody | undefined;
      if (!body || body.object !== 'page') return reply.status(200).send({ ok: true, ignored: true });

      const events = parseMessengerEvents(body).filter((e) => !e.isEcho && !e.isReceiptOnly);
      await Promise.all(
        events.map((e) =>
          enqueueMessengerEvent(e).catch((err: unknown) =>
            fastify.log.error({ err }, 'failed to enqueue messenger event'),
          ),
        ),
      );
      return reply.status(200).send({ ok: true, queued: events.length });
    },
  );

  // ── Steadfast ───────────────────────────────────────────────────────────
  // Steadfast pushes: { notification_type: 'delivery_status', consignment_id, ... }
  fastify.post('/webhooks/steadfast', async (request, reply) => {
    const { steadfastWebhookToken } = await getPlatformConfig();
    if (!checkBearer(request, reply, steadfastWebhookToken)) return;

    const schema = z.object({
      notification_type: z.string().optional(),
      consignment_id: z.union([z.string(), z.number()]),
      invoice: z.string().optional(),
      tracking_code: z.string().optional(),
      status: z.string(),
      updated_at: z.string().optional(),
    });
    const body = schema.parse(request.body);

    const consignmentId = String(body.consignment_id);
    const consignment = await prisma.consignment.findFirst({
      where: {
        courier: 'steadfast',
        OR: [
          { consignmentId },
          ...(body.tracking_code ? [{ trackingCode: body.tracking_code }] : []),
          ...(body.invoice ? [{ invoiceId: body.invoice }] : []),
        ],
      },
    });
    if (!consignment) {
      fastify.log.warn({ consignmentId }, 'Steadfast webhook for unknown consignment');
      return reply.send({ ok: true, ignored: true });
    }

    const tracking: TrackingStatus = {
      consignmentId,
      status: body.status,
      normalizedStatus: steadfastNormalize(body.status),
      occurredAt: body.updated_at ? new Date(body.updated_at) : new Date(),
      rawPayload: body,
    };
    const { inserted } = await ingestStatusEvent(consignment.id, tracking, 'webhook');
    return reply.send({ ok: true, inserted });
  });

  // Pathao pushes order_status / order events. Structure:
  // { event: 'order.delivered', merchant_order_id, consignment_id, order_status, updated_at }
  fastify.post('/webhooks/pathao', async (request, reply) => {
    const { pathaoWebhookToken } = await getPlatformConfig();
    if (!checkBearer(request, reply, pathaoWebhookToken)) return;

    const schema = z.object({
      event: z.string().optional(),
      merchant_order_id: z.string().optional(),
      consignment_id: z.string(),
      order_status: z.string(),
      updated_at: z.string().optional(),
    });
    const body = schema.parse(request.body);

    const consignment = await prisma.consignment.findFirst({
      where: {
        courier: 'pathao',
        OR: [
          { consignmentId: body.consignment_id },
          ...(body.merchant_order_id ? [{ invoiceId: body.merchant_order_id }] : []),
        ],
      },
    });
    if (!consignment) return reply.send({ ok: true, ignored: true });

    const PATHAO_MAP: Record<string, OrderStatus> = {
      Pickup_Requested: OrderStatus.in_pickup,
      Pickup: OrderStatus.in_pickup,
      In_Transit: OrderStatus.in_transit,
      At_the_Sorting_HUB: OrderStatus.in_transit,
      Assigned_for_Delivery: OrderStatus.out_for_delivery,
      Delivered: OrderStatus.delivered,
      Returned: OrderStatus.returned,
      Cancelled: OrderStatus.cancelled,
      Hold: OrderStatus.hold,
    };
    const normalized = PATHAO_MAP[body.order_status.replace(/\s+/g, '_')] ?? OrderStatus.pending;

    const tracking: TrackingStatus = {
      consignmentId: body.consignment_id,
      status: body.order_status,
      normalizedStatus: normalized,
      occurredAt: body.updated_at ? new Date(body.updated_at) : new Date(),
      rawPayload: body,
    };
    const { inserted } = await ingestStatusEvent(consignment.id, tracking, 'webhook');
    return reply.send({ ok: true, inserted });
  });

  // RedX pushes: { tracking_id, status, updated_at, merchant_invoice_id }
  fastify.post('/webhooks/redx', async (request, reply) => {
    const { redxWebhookToken } = await getPlatformConfig();
    if (!checkBearer(request, reply, redxWebhookToken)) return;

    const schema = z.object({
      tracking_id: z.string(),
      merchant_invoice_id: z.string().optional(),
      status: z.string(),
      updated_at: z.string().optional(),
    });
    const body = schema.parse(request.body);

    const consignment = await prisma.consignment.findFirst({
      where: {
        courier: 'redx',
        OR: [
          { consignmentId: body.tracking_id },
          { trackingCode: body.tracking_id },
          ...(body.merchant_invoice_id ? [{ invoiceId: body.merchant_invoice_id }] : []),
        ],
      },
    });
    if (!consignment) return reply.send({ ok: true, ignored: true });

    const REDX_MAP: Record<string, OrderStatus> = {
      'parcel-created': OrderStatus.pending,
      'pickup-pending': OrderStatus.in_pickup,
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
    const normalized = REDX_MAP[body.status.toLowerCase()] ?? OrderStatus.pending;

    const tracking: TrackingStatus = {
      consignmentId: body.tracking_id,
      status: body.status,
      normalizedStatus: normalized,
      occurredAt: body.updated_at ? new Date(body.updated_at) : new Date(),
      rawPayload: body,
    };
    const { inserted } = await ingestStatusEvent(consignment.id, tracking, 'webhook');
    return reply.send({ ok: true, inserted });
  });
}
