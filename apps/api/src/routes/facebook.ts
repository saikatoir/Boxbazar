import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listManagedPages,
  MessengerClient,
  MetaAuthError,
  exchangeForLongLivedUserToken,
} from '@fcommerce/meta-sdk';
import { Prisma } from '@fcommerce/db';
import { prisma } from '../lib/prisma.js';
import { encryptPageToken } from '../lib/meta.js';
import { getPlatformConfig } from '../lib/platform-config.js';

/** Minimum products required before the AI receptionist can be switched on. */
const MIN_PRODUCTS_FOR_AI = 5;

async function ownedStoreOr404(userId: string, storeId: string) {
  return prisma.store.findFirst({ where: { id: storeId, userId } });
}

function publicStore(s: {
  id: string;
  name: string;
  fbPageId: string | null;
  fbPageName: string | null;
  fbConnectedAt: Date | null;
  aiEnabled: boolean;
  aiToneProfile: string;
  aiDisclosureFooterEnabled: boolean;
  deliveryChargeInsideDhakaCents: bigint;
  deliveryChargeOutsideDhakaCents: bigint;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
  returnPolicyText: string | null;
  pickupAddress: Prisma.JsonValue;
}) {
  return {
    id: s.id,
    name: s.name,
    facebook: s.fbPageId ? { pageId: s.fbPageId, pageName: s.fbPageName, connectedAt: s.fbConnectedAt } : null,
    ai: {
      enabled: s.aiEnabled,
      toneProfile: s.aiToneProfile,
      disclosureFooterEnabled: s.aiDisclosureFooterEnabled,
    },
    deliveryChargeInsideDhakaCents: Number(s.deliveryChargeInsideDhakaCents),
    deliveryChargeOutsideDhakaCents: Number(s.deliveryChargeOutsideDhakaCents),
    workingHoursStart: s.workingHoursStart,
    workingHoursEnd: s.workingHoursEnd,
    returnPolicyText: s.returnPolicyText,
    pickupAddress: s.pickupAddress,
  };
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM (24h)');

export async function facebookRoutes(fastify: FastifyInstance): Promise<void> {
  // List the Facebook pages a user manages, given their (short-lived) user token.
  // Never returns page access tokens to the client.
  fastify.post(
    '/facebook/pages',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userAccessToken } = z.object({ userAccessToken: z.string().min(10) }).parse(request.body);
      try {
        const { metaGraphVersion } = await getPlatformConfig();
        const pages = await listManagedPages(userAccessToken, { graphVersion: metaGraphVersion });
        return reply.send({
          pages: pages.map((p) => ({ id: p.id, name: p.name, category: p.category ?? null })),
        });
      } catch (err) {
        if (err instanceof MetaAuthError) return reply.status(401).send({ message: 'Invalid Facebook access token.' });
        fastify.log.error({ err }, 'listManagedPages failed');
        return reply.status(502).send({ message: 'Could not reach Facebook. Try again.' });
      }
    },
  );

  // Connect a page to a store: store the encrypted Page Access Token and
  // subscribe our app to the page's message webhooks.
  fastify.post<{ Params: { storeId: string } }>(
    '/stores/:storeId/connect-facebook',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userAccessToken, pageId } = z
        .object({ userAccessToken: z.string().min(10), pageId: z.string().min(1) })
        .parse(request.body);
      const store = await ownedStoreOr404(request.user.sub, request.params.storeId);
      if (!store) return reply.status(404).send({ message: 'Store পাওয়া যায়নি।' });

      // Don't let two stores claim the same page.
      const taken = await prisma.store.findUnique({ where: { fbPageId: pageId } });
      if (taken && taken.id !== store.id) {
        return reply.status(409).send({ message: 'This Facebook page is already connected to another store.' });
      }

      const platform = await getPlatformConfig();
      const { metaGraphVersion } = platform;

      // Exchange the short-lived Graph-Explorer token for a long-lived (60-day)
      // user token *before* fetching pages — page tokens derived from a
      // long-lived user token effectively never expire, which is what we want
      // so the seller doesn't have to reconnect every 1-2 hours.
      let effectiveUserToken = userAccessToken;
      let tokenLifetime: 'long_lived' | 'short_lived' = 'short_lived';
      let tokenWarning: string | null = null;
      if (platform.metaAppId && platform.metaAppSecret) {
        try {
          const exchanged = await exchangeForLongLivedUserToken(
            userAccessToken,
            platform.metaAppId,
            platform.metaAppSecret,
            { graphVersion: metaGraphVersion },
          );
          effectiveUserToken = exchanged.access_token;
          tokenLifetime = 'long_lived';
        } catch (err) {
          // Soft-fail: still let the connect proceed with the short token so
          // the seller isn't completely blocked, but flag it loudly.
          if (err instanceof MetaAuthError) {
            fastify.log.warn(
              { err },
              'long-lived token exchange rejected — proceeding with short token',
            );
            tokenWarning =
              'Long-lived token exchange failed. Page token will likely expire in ~1 hour. Verify Meta App ID + App Secret in /platform-setup.';
          } else {
            fastify.log.error({ err }, 'long-lived token exchange errored');
            tokenWarning =
              'Could not exchange for a long-lived token. Page token may expire soon.';
          }
        }
      } else {
        tokenWarning =
          'Save your Meta App ID and App Secret in /platform-setup to get a non-expiring page token. Without them, this page will need re-connection every ~1 hour.';
      }

      let page;
      try {
        const pages = await listManagedPages(effectiveUserToken, { graphVersion: metaGraphVersion });
        page = pages.find((p) => p.id === pageId);
      } catch (err) {
        if (err instanceof MetaAuthError) return reply.status(401).send({ message: 'Invalid Facebook access token.' });
        fastify.log.error({ err }, 'connect-facebook: listManagedPages failed');
        return reply.status(502).send({ message: 'Could not reach Facebook. Try again.' });
      }
      if (!page) return reply.status(404).send({ message: 'You do not manage that page, or it was not found.' });

      // Subscribe the app to the page's webhook events.
      try {
        const client = new MessengerClient({ pageAccessToken: page.access_token, graphVersion: metaGraphVersion });
        const ok = await client.subscribeAppToPage();
        if (!ok) fastify.log.warn({ pageId }, 'subscribeAppToPage returned falsy');
      } catch (err) {
        if (err instanceof MetaAuthError) return reply.status(401).send({ message: 'Facebook rejected the page token.' });
        fastify.log.error({ err }, 'subscribeAppToPage failed');
        return reply.status(502).send({ message: 'Could not subscribe to the page. Try again.' });
      }

      const updated = await prisma.store.update({
        where: { id: store.id },
        data: {
          fbPageId: page.id,
          fbPageName: page.name,
          fbPageAccessTokenEncrypted: encryptPageToken(page.access_token),
          fbConnectedAt: new Date(),
        },
      });
      return reply.send({
        store: publicStore(updated),
        tokenLifetime,
        tokenWarning,
      });
    },
  );

  // Disconnect the page; also disables the AI.
  fastify.post<{ Params: { storeId: string } }>(
    '/stores/:storeId/disconnect-facebook',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const store = await ownedStoreOr404(request.user.sub, request.params.storeId);
      if (!store) return reply.status(404).send({ message: 'Store পাওয়া যায়নি।' });
      const updated = await prisma.store.update({
        where: { id: store.id },
        data: {
          fbPageId: null,
          fbPageName: null,
          fbPageAccessTokenEncrypted: null,
          fbConnectedAt: null,
          aiEnabled: false,
        },
      });
      return reply.send({ store: publicStore(updated) });
    },
  );

  // Update AI receptionist settings + seller policies.
  fastify.patch<{ Params: { storeId: string } }>(
    '/stores/:storeId/ai-settings',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z
        .object({
          aiEnabled: z.boolean().optional(),
          aiToneProfile: z.enum(['formal_apu', 'casual_apu', 'friendly_bhai']).optional(),
          aiDisclosureFooterEnabled: z.boolean().optional(),
          deliveryChargeInsideDhakaCents: z.number().int().nonnegative().optional(),
          deliveryChargeOutsideDhakaCents: z.number().int().nonnegative().optional(),
          workingHoursStart: hhmm.nullable().optional(),
          workingHoursEnd: hhmm.nullable().optional(),
          returnPolicyText: z.string().max(2000).nullable().optional(),
          pickupAddress: z.record(z.unknown()).nullable().optional(),
        })
        .parse(request.body);

      const store = await ownedStoreOr404(request.user.sub, request.params.storeId);
      if (!store) return reply.status(404).send({ message: 'Store পাওয়া যায়নি।' });

      if (body.aiEnabled === true) {
        if (!store.fbPageId) {
          return reply.status(409).send({ message: 'Connect a Facebook page before enabling the AI.' });
        }
        const productCount = await prisma.product.count({ where: { storeId: store.id, active: true } });
        if (productCount < MIN_PRODUCTS_FOR_AI) {
          return reply.status(409).send({
            message: `Add at least ${MIN_PRODUCTS_FOR_AI} products before enabling the AI (you have ${productCount}).`,
          });
        }
      }

      const data: Prisma.StoreUpdateInput = {};
      if (body.aiEnabled !== undefined) data.aiEnabled = body.aiEnabled;
      if (body.aiToneProfile !== undefined) data.aiToneProfile = body.aiToneProfile;
      if (body.aiDisclosureFooterEnabled !== undefined) data.aiDisclosureFooterEnabled = body.aiDisclosureFooterEnabled;
      if (body.deliveryChargeInsideDhakaCents !== undefined)
        data.deliveryChargeInsideDhakaCents = BigInt(body.deliveryChargeInsideDhakaCents);
      if (body.deliveryChargeOutsideDhakaCents !== undefined)
        data.deliveryChargeOutsideDhakaCents = BigInt(body.deliveryChargeOutsideDhakaCents);
      if (body.workingHoursStart !== undefined) data.workingHoursStart = body.workingHoursStart;
      if (body.workingHoursEnd !== undefined) data.workingHoursEnd = body.workingHoursEnd;
      if (body.returnPolicyText !== undefined) data.returnPolicyText = body.returnPolicyText;
      if (body.pickupAddress !== undefined)
        data.pickupAddress = body.pickupAddress === null ? Prisma.JsonNull : (body.pickupAddress as Prisma.InputJsonValue);

      const updated = await prisma.store.update({ where: { id: store.id }, data });
      return reply.send({ store: publicStore(updated) });
    },
  );

  // Current store config (for the dashboard settings page).
  fastify.get<{ Params: { storeId: string } }>(
    '/stores/:storeId/ai-settings',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const store = await ownedStoreOr404(request.user.sub, request.params.storeId);
      if (!store) return reply.status(404).send({ message: 'Store পাওয়া যায়নি।' });
      const productCount = await prisma.product.count({ where: { storeId: store.id, active: true } });
      return reply.send({ store: publicStore(store), productCount, minProductsForAi: MIN_PRODUCTS_FOR_AI });
    },
  );
}
