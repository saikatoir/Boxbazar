import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  readPublicPlatformConfig,
  updatePlatformConfig,
  type PlatformConfigPatch,
} from '../lib/platform-config.js';

/**
 * Platform-level API credentials (Meta app, Gemini, SMS, courier webhooks).
 *
 * Gated on:
 *   1. Authenticated user (Bearer JWT)
 *   2. isAdmin === true
 *   3. mfaVerifiedAt within the last MFA_SESSION_MAX_AGE_MS (15 min)
 *
 * The first registered user (or the earliest user via migration backfill)
 * is auto-promoted to admin. Non-admins get 403 ADMIN_REQUIRED; admins
 * without a fresh MFA challenge get 403 MFA_REQUIRED so the UI knows to
 * prompt them for a code.
 */
export async function platformConfigRoutes(fastify: FastifyInstance): Promise<void> {
  // Lightweight readiness probe used by the dashboard SetupChecklist for ALL
  // logged-in users (not just admins). Returns only the boolean readiness
  // flags — no secrets, no field values, no presence-of-secret booleans.
  fastify.get(
    '/platform/config/status',
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const config = await readPublicPlatformConfig();
      return reply.send({
        ready: config.ready,
        // Echo whether the admin has configured the things sellers indirectly
        // depend on — useful for "the operator hasn't finished setup yet" UX.
        configured: {
          metaApp: !!config.metaAppId && config.hasSecret.metaAppSecret,
          messengerVerifyToken: config.hasSecret.metaVerifyToken,
          gemini: config.hasSecret.geminiApiKey,
        },
      });
    },
  );

  fastify.get(
    '/platform/config',
    { preHandler: [fastify.authenticate, fastify.requireAdmin, fastify.requireRecentMfa] },
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
    { preHandler: [fastify.authenticate, fastify.requireAdmin, fastify.requireRecentMfa] },
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
