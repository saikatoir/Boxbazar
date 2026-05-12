import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export async function storeRoutes(fastify: FastifyInstance): Promise<void> {
  // Create store (called from onboarding)
  fastify.post(
    '/stores',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z.object({
        name: z.string().min(2).max(100),
        category: z.string().min(1),
        primaryCourier: z.enum(['steadfast', 'pathao', 'redx']),
        fbPageUrl: z.string().url().optional(),
      }).parse(request.body);

      const userId = request.user.sub;

      const store = await prisma.store.create({
        data: { userId, name: body.name, category: body.category, fbPageUrl: body.fbPageUrl },
      });

      return reply.status(201).send({ store });
    }
  );

  // List stores for current user. Never expose the encrypted FB page token.
  fastify.get(
    '/stores',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const stores = await prisma.store.findMany({
        where: { userId: request.user.sub },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          category: true,
          fbPageUrl: true,
          fbPageId: true,
          fbPageName: true,
          fbConnectedAt: true,
          aiEnabled: true,
          aiToneProfile: true,
          aiDisclosureFooterEnabled: true,
          createdAt: true,
          courierAccounts: {
            select: {
              id: true,
              courier: true,
              status: true,
              lastBalanceAmount: true,
              lastBalanceCheckedAt: true,
            },
          },
        },
      });
      return reply.send({ stores });
    }
  );
}
