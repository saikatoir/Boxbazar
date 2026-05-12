import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { generateLabelPdf, type LabelData } from '../lib/label-pdf.js';

export async function consignmentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/consignments/:id/label.pdf',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const userId = request.user.sub;

      const consignment = await prisma.consignment.findFirst({
        where: { id },
        include: {
          order: {
            include: { customer: true, store: true, user: true },
          },
        },
      });
      if (!consignment || consignment.order.userId !== userId) {
        return reply.status(404).send({ message: 'Label পাওয়া যায়নি।' });
      }

      const order = consignment.order;
      const addresses = Array.isArray(order.customer.addressHistory)
        ? (order.customer.addressHistory as Array<{
            addressLine?: string;
            city?: string;
            zone?: string;
            area?: string;
          }>)
        : [];
      const latest = addresses[0] ?? {};

      const itemDescription = Array.isArray(order.items)
        ? (order.items as Array<{ name: string; quantity: number }>)
            .map((it) => `${it.quantity}x ${it.name}`)
            .join(', ')
        : 'Order';

      const data: LabelData = {
        courier: consignment.courier as 'steadfast' | 'pathao' | 'redx',
        trackingCode: consignment.trackingCode,
        invoiceId: consignment.invoiceId,
        consignmentId: consignment.consignmentId,
        storeName: order.store.name,
        recipient: {
          name: order.customer.name,
          phone: order.customer.phone ?? '',
          addressLine: latest.addressLine ?? '',
          city: latest.city ?? '',
          zone: latest.zone,
          area: latest.area,
        },
        codAmount: Math.round(Number(order.codCents) / 100),
        itemDescription,
        createdAt: consignment.createdAt,
      };

      const bytes = await generateLabelPdf(data);
      reply
        .header('Content-Type', 'application/pdf')
        .header(
          'Content-Disposition',
          `inline; filename="${consignment.invoiceId}.pdf"`
        )
        .send(Buffer.from(bytes));
    }
  );
}
