import { createHash } from 'node:crypto';
import { OrderStatus, type TrackingStatus } from '@fcommerce/courier-sdk';
import { prisma } from './prisma.js';

const TERMINAL_NORMALIZED = new Set<OrderStatus>([
  OrderStatus.delivered,
  OrderStatus.returned,
  OrderStatus.cancelled,
]);

export function isTerminalStatus(s: OrderStatus): boolean {
  return TERMINAL_NORMALIZED.has(s);
}

/**
 * Maps normalized courier status to the Order.status enum stored in Postgres.
 */
export function orderStatusFor(s: OrderStatus): 'shipped' | 'delivered' | 'returned' | 'canceled' | null {
  switch (s) {
    case OrderStatus.delivered:
      return 'delivered';
    case OrderStatus.returned:
      return 'returned';
    case OrderStatus.cancelled:
      return 'canceled';
    case OrderStatus.in_pickup:
    case OrderStatus.in_transit:
    case OrderStatus.out_for_delivery:
    case OrderStatus.hold:
    case OrderStatus.pending:
      return 'shipped';
    default:
      return null;
  }
}

/**
 * Idempotently records a courier status event for a consignment.
 *
 * `source` is `webhook` when the courier pushed the event and `poll` when
 * we discovered it via the periodic poller. Duplicate `(consignment, status,
 * occurredAt)` triples become no-ops.
 */
export async function ingestStatusEvent(
  consignmentId: string,
  status: TrackingStatus,
  source: 'webhook' | 'poll'
): Promise<{ inserted: boolean }> {
  const hash = createHash('sha256')
    .update(`${consignmentId}::${status.status}::${status.occurredAt.toISOString()}`)
    .digest('hex');

  // Use the hash as the createMany unique check by trying findFirst + create.
  const dup = await prisma.courierEvent.findFirst({
    where: {
      consignmentId,
      status: status.status,
      occurredAt: status.occurredAt,
    },
  });
  if (dup) return { inserted: false };

  await prisma.courierEvent.create({
    data: {
      consignmentId,
      status: status.status,
      occurredAt: status.occurredAt,
      rawPayload: (status.rawPayload as object) ?? {},
      source,
    },
  });

  await prisma.consignment.update({
    where: { id: consignmentId },
    data: { currentStatus: status.status },
  });

  const mapped = orderStatusFor(status.normalizedStatus);
  if (mapped) {
    const c = await prisma.consignment.findUnique({
      where: { id: consignmentId },
      select: { orderId: true },
    });
    if (c) {
      await prisma.order.update({
        where: { id: c.orderId },
        data: { status: mapped },
      });
    }
  }

  // Telemetry crumb — useful in dev.
  // eslint-disable-next-line no-console
  console.debug('[ingestStatusEvent]', { consignmentId, status: status.status, source, hash });

  return { inserted: true };
}
