import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@fcommerce/db';
import { prisma } from '../lib/prisma.js';

const variantSchema = z.object({
  type: z.string().min(1).max(40),
  options: z.array(z.string().min(1).max(60)).min(1).max(50),
});

const productCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  basePriceCents: z.number().int().nonnegative(),
  floorPriceCents: z.number().int().nonnegative().optional(),
  variants: z.array(variantSchema).max(20).optional(),
  stockStatus: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
  photoUrl: z.string().url().optional(),
  keywords: z.array(z.string().min(1).max(40)).max(50).optional(),
  active: z.boolean().optional(),
});

const productUpdateSchema = productCreateSchema.partial();

function serializeProduct<T extends { basePriceCents: bigint; floorPriceCents: bigint }>(p: T) {
  return { ...p, basePriceCents: Number(p.basePriceCents), floorPriceCents: Number(p.floorPriceCents) };
}

async function ownedStoreOr404(userId: string, storeId: string) {
  return prisma.store.findFirst({ where: { id: storeId, userId } });
}

export async function productRoutes(fastify: FastifyInstance): Promise<void> {
  // List products for a store.
  fastify.get<{ Params: { storeId: string } }>(
    '/stores/:storeId/products',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const store = await ownedStoreOr404(request.user.sub, request.params.storeId);
      if (!store) return reply.status(404).send({ message: 'Store পাওয়া যায়নি।' });
      const products = await prisma.product.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: 'asc' },
      });
      return reply.send({ products: products.map(serializeProduct) });
    },
  );

  // Create a product.
  fastify.post<{ Params: { storeId: string } }>(
    '/stores/:storeId/products',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const store = await ownedStoreOr404(request.user.sub, request.params.storeId);
      if (!store) return reply.status(404).send({ message: 'Store পাওয়া যায়নি।' });
      const body = productCreateSchema.parse(request.body);
      const floor = body.floorPriceCents ?? body.basePriceCents;
      if (floor > body.basePriceCents) {
        return reply.status(400).send({ message: 'floorPriceCents cannot exceed basePriceCents' });
      }
      const product = await prisma.product.create({
        data: {
          storeId: store.id,
          name: body.name,
          description: body.description ?? null,
          basePriceCents: BigInt(body.basePriceCents),
          floorPriceCents: BigInt(floor),
          variants: (body.variants ?? []) as unknown as Prisma.InputJsonValue,
          stockStatus: body.stockStatus ?? 'in_stock',
          photoUrl: body.photoUrl ?? null,
          keywords: body.keywords ?? [],
          active: body.active ?? true,
        },
      });
      return reply.status(201).send({ product: serializeProduct(product) });
    },
  );

  // Update a product.
  fastify.patch<{ Params: { id: string } }>(
    '/products/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const existing = await prisma.product.findFirst({
        where: { id: request.params.id, store: { userId: request.user.sub } },
      });
      if (!existing) return reply.status(404).send({ message: 'Product পাওয়া যায়নি।' });
      const body = productUpdateSchema.parse(request.body);

      const nextBase = body.basePriceCents ?? Number(existing.basePriceCents);
      const nextFloor = body.floorPriceCents ?? Number(existing.floorPriceCents);
      if (nextFloor > nextBase) {
        return reply.status(400).send({ message: 'floorPriceCents cannot exceed basePriceCents' });
      }

      const data: Prisma.ProductUpdateInput = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.description !== undefined) data.description = body.description;
      if (body.basePriceCents !== undefined) data.basePriceCents = BigInt(body.basePriceCents);
      if (body.floorPriceCents !== undefined) data.floorPriceCents = BigInt(body.floorPriceCents);
      if (body.variants !== undefined) data.variants = body.variants as unknown as Prisma.InputJsonValue;
      if (body.stockStatus !== undefined) data.stockStatus = body.stockStatus;
      if (body.photoUrl !== undefined) data.photoUrl = body.photoUrl;
      if (body.keywords !== undefined) data.keywords = body.keywords;
      if (body.active !== undefined) data.active = body.active;

      const product = await prisma.product.update({ where: { id: existing.id }, data });
      return reply.send({ product: serializeProduct(product) });
    },
  );

  // Soft-delete (deactivate) a product. Pass ?hard=true to remove the row.
  fastify.delete<{ Params: { id: string }; Querystring: { hard?: string } }>(
    '/products/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const existing = await prisma.product.findFirst({
        where: { id: request.params.id, store: { userId: request.user.sub } },
      });
      if (!existing) return reply.status(404).send({ message: 'Product পাওয়া যায়নি।' });
      if (request.query.hard === 'true') {
        await prisma.product.delete({ where: { id: existing.id } });
        return reply.send({ deleted: true });
      }
      await prisma.product.update({ where: { id: existing.id }, data: { active: false } });
      return reply.send({ deactivated: true });
    },
  );
}
