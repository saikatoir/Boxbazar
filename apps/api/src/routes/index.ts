import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { authRoutes } from './auth.js';
import { storeRoutes } from './stores.js';
import { courierAccountRoutes } from './courier-accounts.js';
import { chatParseRoutes } from './chat-parse.js';
import { orderRoutes } from './orders.js';
import { consignmentRoutes } from './consignments.js';
import { webhookRoutes } from './webhooks.js';
import { productRoutes } from './products.js';
import { conversationRoutes } from './conversations.js';
import { facebookRoutes } from './facebook.js';
import { platformConfigRoutes } from './platform-config.js';
import { ownerRoutes } from './owner.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: '/api' });
  await fastify.register(storeRoutes, { prefix: '/api' });
  await fastify.register(courierAccountRoutes, { prefix: '/api' });
  await fastify.register(chatParseRoutes, { prefix: '/api' });
  await fastify.register(orderRoutes, { prefix: '/api' });
  await fastify.register(consignmentRoutes, { prefix: '/api' });
  await fastify.register(webhookRoutes, { prefix: '/api' });
  await fastify.register(productRoutes, { prefix: '/api' });
  await fastify.register(conversationRoutes, { prefix: '/api' });
  await fastify.register(facebookRoutes, { prefix: '/api' });
  await fastify.register(platformConfigRoutes, { prefix: '/api' });
  await fastify.register(ownerRoutes, { prefix: '/api' });
}
