import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { encryptCredentials, decryptCredentials } from '../lib/encryption.js';
import { getCourierAdapter } from '@fcommerce/courier-sdk';

export async function courierAccountRoutes(fastify: FastifyInstance): Promise<void> {
  // Add or update courier credentials for a store
  fastify.put(
    '/stores/:storeId/couriers/:courier',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { storeId, courier } = z.object({
        storeId: z.string().uuid(),
        courier: z.enum(['steadfast', 'pathao', 'redx']),
      }).parse(request.params);

      const credentials = z.record(z.string()).parse(request.body);

      // Verify this store belongs to the authenticated user
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store || store.userId !== request.user.sub) {
        return reply.status(403).send({ message: 'Access denied' });
      }

      const encryptedCredentials = encryptCredentials(credentials);

      const account = await prisma.courierAccount.upsert({
        where: { storeId_courier: { storeId, courier } },
        create: { storeId, courier, encryptedCredentials, status: 'active' },
        update: { encryptedCredentials, status: 'active' },
      });

      return reply.send({ id: account.id, courier: account.courier, status: account.status });
    }
  );

  // Test courier connection + get balance
  fastify.post(
    '/stores/:storeId/couriers/:courier/test',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { storeId, courier } = z.object({
        storeId: z.string().uuid(),
        courier: z.enum(['steadfast', 'pathao', 'redx']),
      }).parse(request.params);

      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store || store.userId !== request.user.sub) {
        return reply.status(403).send({ message: 'Access denied' });
      }

      const account = await prisma.courierAccount.findUnique({
        where: { storeId_courier: { storeId, courier } },
      });
      if (!account) {
        return reply.status(404).send({ message: 'কুরিয়ার সংযোগ পাওয়া যায়নি।' });
      }

      const creds = decryptCredentials(account.encryptedCredentials as string);
      const adapter = getCourierAdapter(courier, creds);

      const balance = await adapter.getBalance();
      await prisma.courierAccount.update({
        where: { id: account.id },
        data: {
          status: 'active',
          lastBalanceCheckedAt: new Date(),
          lastBalanceAmount: Math.round(balance * 100),
        },
      });

      return reply.send({ ok: true, balance });
    }
  );

  // List courier accounts for a store (masks credentials)
  fastify.get(
    '/stores/:storeId/couriers',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { storeId } = z.object({ storeId: z.string().uuid() }).parse(request.params);

      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store || store.userId !== request.user.sub) {
        return reply.status(403).send({ message: 'Access denied' });
      }

      const accounts = await prisma.courierAccount.findMany({
        where: { storeId },
        select: {
          id: true,
          courier: true,
          status: true,
          lastBalanceCheckedAt: true,
          lastBalanceAmount: true,
        },
      });

      return reply.send({ accounts });
    }
  );
}
