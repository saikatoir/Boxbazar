import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  readPublicPlatformConfig,
  updatePlatformConfig,
  type PlatformConfigPatch,
} from '../lib/platform-config.js';

/**
 * Platform-level API credentials (Meta app, Gemini, SMS, courier webhooks).
 * Any authenticated user can view/edit — this is a single-tenant deployment
 * where the operator is also the seller. If multi-tenant is needed later,
 * gate these handlers on an `isAdmin` flag.
 */
export async function platformConfigRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/platform/config',
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const config = await readPublicPlatformConfig();
      return reply.send({ config });
    },
  );

  const secretSchema = z.string().max(2048);
  const patchSchema = z
    .object({
      metaAppId: z.string().max(64).nullable().optional(),
      metaGraphVersion: z
        .string()
        .regex(/^v\d+\.\d+$/i, 'expected e.g. v21.0')
        .max(16)
        .nullable()
        .optional(),
      publicWebhookUrl: z
        .string()
        .url('expected a full https:// URL')
        .max(512)
        .nullable()
        .optional(),
      geminiModel: z.string().max(64).nullable().optional(),
      aiProvider: z.enum(['gemini', 'mock']).nullable().optional(),
      bulkSmsSenderId: z.string().max(32).nullable().optional(),
      secrets: z
        .object({
          metaAppSecret: secretSchema.optional(),
          metaVerifyToken: secretSchema.optional(),
          geminiApiKey: secretSchema.optional(),
          bulkSmsApiKey: secretSchema.optional(),
          sslSmsSid: secretSchema.optional(),
          sslSmsToken: secretSchema.optional(),
          steadfastWebhookToken: secretSchema.optional(),
          pathaoWebhookToken: secretSchema.optional(),
          redxWebhookToken: secretSchema.optional(),
        })
        .optional(),
    })
    .strict();

  fastify.patch(
    '/platform/config',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          message: 'Invalid platform config payload.',
          errors: parsed.error.flatten().fieldErrors,
        });
      }
      try {
        const config = await updatePlatformConfig(parsed.data as PlatformConfigPatch);
        return reply.send({ config });
      } catch (err) {
        fastify.log.error({ err }, 'updatePlatformConfig failed');
        return reply.status(500).send({ message: 'Could not save platform config.' });
      }
    },
  );
}
