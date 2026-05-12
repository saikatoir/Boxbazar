/**
 * Dev-only helper: seed a fake Consignment for the given order so we can
 * exercise the webhook + label PDF endpoints without a real courier account.
 *
 * Usage:  pnpm -F @fcommerce/api tsx src/scripts/seed-test-consignment.ts <orderId>
 */
import { prisma } from '../lib/prisma.js';

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Usage: tsx seed-test-consignment.ts <orderId>');
    process.exit(1);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { consignment: true },
  });
  if (!order) {
    console.error('Order not found:', orderId);
    process.exit(1);
  }
  if (order.consignment) {
    console.log('Existing consignment:', order.consignment.id);
    return;
  }

  const consignment = await prisma.consignment.create({
    data: {
      orderId: order.id,
      courier: 'steadfast',
      consignmentId: '9999001',
      trackingCode: 'TST9999001',
      invoiceId: `FC-${order.id.slice(0, 8).toUpperCase()}`,
      currentStatus: 'pending',
      rawCreationResponse: { test: true },
    },
  });
  console.log('Seeded consignment:', consignment.id);
  console.log('Tracking code:', consignment.trackingCode);
  console.log('Steadfast consignment_id:', consignment.consignmentId);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
