import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@fcommerce/db';
import { prisma } from '../lib/prisma.js';
import { generateUniquePublicId } from '../lib/public-id.js';

const BD_PHONE_RE = /^01[3-9]\d{8}$/;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) return '0' + digits.slice(3);
  return digits;
}

async function createTrialSubscription(userId: string): Promise<void> {
  const now = new Date();
  const trialEnds = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const readOnlyUntil = new Date(trialEnds.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dataPurgeAt = new Date(readOnlyUntil.getTime() + 90 * 24 * 60 * 60 * 1000);
  await prisma.subscription.create({
    data: {
      userId,
      status: 'trial',
      trialStartedAt: now,
      trialEndsAt: trialEnds,
      readOnlyUntil,
      suspendedAt: readOnlyUntil,
      dataPurgeAt,
    },
  });
}

/**
 * Owner-only routes. Two endpoints, both gated by `requireOwner`:
 *
 *   GET  /api/owner/users
 *     List every user with their stores, public ID, and a 7-day daily
 *     conversation count (most-recent-day-first). Used by /owner table.
 *
 *   POST /api/owner/users/:publicId/impersonate
 *     Mint a short-lived access token (15 min) signed for that user's id,
 *     carrying `impersonatedBy: <ownerId>`. The owner uses this token to
 *     view/operate the user's dashboard exactly as they would. Each call is
 *     audit-logged to API stdout.
 */

interface DailyCount {
  date: string; // YYYY-MM-DD (UTC)
  conversations: number;
}

interface UserRow {
  id: string;
  publicId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  isAdmin: boolean;
  isOwner: boolean;
  storeCount: number;
  totalConversations: number;
  /** 7 entries, oldest day first. */
  conversationsByDay: DailyCount[];
}

const DAYS = 7;

function emptyDayBuckets(): DailyCount[] {
  const out: DailyCount[] = [];
  const today = new Date();
  // Normalize to UTC midnight so the boundaries line up with the SQL group-by.
  today.setUTCHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    out.push({ date: d.toISOString().slice(0, 10), conversations: 0 });
  }
  return out;
}

export async function ownerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/owner/users',
    { preHandler: [fastify.authenticate, fastify.requireOwner, fastify.requireRecentMfa] },
    async (_request, reply) => {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          publicId: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          lastLoginAt: true,
          isAdmin: true,
          isOwner: true,
          _count: { select: { stores: true } },
        },
      });

      // One round-trip for all daily counts: group conversations by store-owner
      // and creation date, restricted to the last DAYS days. Pre-aggregate in
      // SQL so we don't ship a row per message back to Node.
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - (DAYS - 1));
      const rows = await prisma.$queryRaw<
        Array<{ user_id: string; bucket: Date; count: bigint }>
      >(Prisma.sql`
        SELECT s."userId"::text AS user_id,
               date_trunc('day', c."createdAt") AS bucket,
               COUNT(*)::bigint AS count
          FROM conversations c
          JOIN stores s ON s.id = c."storeId"
         WHERE c."createdAt" >= ${since}
         GROUP BY s."userId", bucket
      `);

      // Bucket the raw rows by userId then by date for O(1) merge into the
      // emptyDayBuckets() template.
      const byUser = new Map<string, Map<string, number>>();
      for (const r of rows) {
        const dKey = new Date(r.bucket).toISOString().slice(0, 10);
        const inner = byUser.get(r.user_id) ?? new Map<string, number>();
        inner.set(dKey, Number(r.count));
        byUser.set(r.user_id, inner);
      }

      const out: UserRow[] = users.map((u) => {
        const buckets = emptyDayBuckets();
        const usersCounts = byUser.get(u.id);
        let total = 0;
        if (usersCounts) {
          for (const b of buckets) {
            const v = usersCounts.get(b.date) ?? 0;
            b.conversations = v;
            total += v;
          }
        }
        return {
          id: u.id,
          publicId: u.publicId,
          name: u.name,
          email: u.email,
          phone: u.phone,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          isAdmin: u.isAdmin,
          isOwner: u.isOwner,
          storeCount: u._count.stores,
          totalConversations: total,
          conversationsByDay: buckets,
        };
      });

      return reply.send({ users: out, windowDays: DAYS });
    },
  );

  // Mint an impersonation access token for the target user. The token has the
  // target user's `sub` so every downstream user-scoped endpoint Just Works,
  // plus `impersonatedBy: <ownerId>` so the UI can render a banner and audit
  // logs can attribute actions back to the owner.
  fastify.post<{ Params: { publicId: string } }>(
    '/owner/users/:publicId/impersonate',
    { preHandler: [fastify.authenticate, fastify.requireOwner, fastify.requireRecentMfa] },
    async (request, reply) => {
      const target = await prisma.user.findUnique({
        where: { publicId: request.params.publicId },
      });
      if (!target) return reply.status(404).send({ message: 'User not found.' });
      if (target.isOwner) {
        // Don't allow the owner to impersonate themselves — confusing, no value.
        return reply.status(409).send({ message: 'Cannot impersonate another owner account.' });
      }

      const token = fastify.jwt.sign(
        {
          sub: target.id,
          name: target.name,
          phone: target.phone,
          email: target.email,
          subscriptionTier: target.subscriptionTier,
          isAdmin: target.isAdmin,
          impersonatedBy: request.user.sub,
        },
        { expiresIn: '15m' },
      );

      fastify.log.info(
        { ownerId: request.user.sub, targetUserId: target.id, targetPublicId: target.publicId },
        '[OWNER] impersonation started',
      );

      return reply.send({
        accessToken: token,
        targetUser: {
          id: target.id,
          publicId: target.publicId,
          name: target.name,
          email: target.email,
          phone: target.phone,
        },
        expiresInSeconds: 15 * 60,
      });
    },
  );

  // ── Create a new user from the admin panel ────────────────────────────────
  // Same shape as a normal self-registration: name + (email OR phone) +
  // optional password. publicId auto-assigned. The new user can then sign in
  // via the regular /login flow with whatever credentials were supplied.
  const createUserSchema = z
    .object({
      name: z.string().min(2).max(80),
      email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
      phone: z.string().optional().or(z.literal('').transform(() => undefined)),
      password: z.string().min(8).optional().or(z.literal('').transform(() => undefined)),
    })
    .refine((d) => !!d.email || !!d.phone, {
      message: 'At least one of email or phone is required.',
      path: ['email'],
    });

  fastify.post(
    '/owner/users',
    { preHandler: [fastify.authenticate, fastify.requireOwner, fastify.requireRecentMfa] },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          message: parsed.error.issues[0]?.message ?? 'Invalid user payload.',
        });
      }
      const data = parsed.data;
      const email = data.email?.trim().toLowerCase();
      const phone = data.phone ? normalizePhone(data.phone) : undefined;

      if (phone && !BD_PHONE_RE.test(phone)) {
        return reply.status(400).send({
          message: 'Phone must be a valid Bangladeshi mobile number (01XXXXXXXXX).',
        });
      }

      // Conflict checks — surface a useful message rather than 500'ing on the
      // unique constraint.
      if (email) {
        const e = await prisma.user.findUnique({ where: { email } });
        if (e) return reply.status(409).send({ message: 'Email already in use.' });
      }
      if (phone) {
        const p = await prisma.user.findUnique({ where: { phone } });
        if (p) return reply.status(409).send({ message: 'Phone already in use.' });
      }

      const publicId = await generateUniquePublicId();
      const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : null;
      const created = await prisma.user.create({
        data: {
          name: data.name.trim(),
          email: email ?? null,
          phone: phone ?? null,
          passwordHash,
          publicId,
        },
      });
      await createTrialSubscription(created.id);

      fastify.log.info(
        { ownerId: request.user.sub, newUserId: created.id, publicId },
        '[OWNER] user created',
      );

      return reply.status(201).send({
        user: {
          id: created.id,
          publicId: created.publicId,
          name: created.name,
          email: created.email,
          phone: created.phone,
          isAdmin: created.isAdmin,
          isOwner: created.isOwner,
        },
      });
    },
  );

  // ── Delete a user from the admin panel ────────────────────────────────────
  // Cascades to stores / orders / conversations / messages per the Prisma
  // schema's onDelete: Cascade relations. Cannot delete oneself or another
  // owner — those would brick the deployment.
  fastify.delete<{ Params: { publicId: string } }>(
    '/owner/users/:publicId',
    { preHandler: [fastify.authenticate, fastify.requireOwner, fastify.requireRecentMfa] },
    async (request, reply) => {
      const target = await prisma.user.findUnique({
        where: { publicId: request.params.publicId },
      });
      if (!target) return reply.status(404).send({ message: 'User not found.' });
      if (target.id === request.user.sub) {
        return reply.status(409).send({ message: 'You cannot delete your own admin account.' });
      }
      if (target.isOwner) {
        return reply.status(409).send({ message: 'Cannot delete another owner account.' });
      }

      await prisma.user.delete({ where: { id: target.id } });

      fastify.log.warn(
        { ownerId: request.user.sub, deletedUserId: target.id, publicId: target.publicId },
        '[OWNER] user deleted',
      );

      return reply.send({ ok: true });
    },
  );
}
