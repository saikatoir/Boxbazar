import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { generateOtp, hashOtp, verifyOtp, otpExpiresAt } from '../lib/otp.js';
import { sendOtpSMS } from '../lib/sms.js';
import {
  generateRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  validateRefreshToken,
} from '../lib/tokens.js';
import {
  generateMixedCode,
  hashCode,
  isWellFormed,
  normalizeCode,
  verifyCodeHash,
  MFA_CODE_TTL_MS,
  MFA_MAX_ATTEMPTS_PER_CODE,
  MFA_MAX_CODES_PER_WINDOW,
  MFA_CODE_RATE_WINDOW_MS,
} from '../lib/mfa.js';
import { sendMfaCodeEmail, smtpConfigured } from '../lib/mailer.js';
import { generateUniquePublicId } from '../lib/public-id.js';
import { env } from '../env.js';

const BD_PHONE_RE = /^01[3-9]\d{8}$/;

function isConfiguredOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === env.OWNER_EMAIL.toLowerCase();
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) return '0' + digits.slice(3);
  return digits;
}

interface UserForToken {
  name: string;
  phone: string | null;
  email: string | null;
  subscriptionTier: string;
  isAdmin: boolean;
  isOwner?: boolean;
}

function makeAccessToken(
  fastify: FastifyInstance,
  userId: string,
  user: UserForToken,
  opts: { mfaVerifiedAt?: number; impersonatedBy?: string; expiresIn?: string } = {},
): string {
  return fastify.jwt.sign(
    {
      sub: userId,
      name: user.name,
      phone: user.phone,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      isAdmin: user.isAdmin,
      ...(user.isOwner ? { isOwner: true } : {}),
      ...(opts.mfaVerifiedAt !== undefined ? { mfaVerifiedAt: opts.mfaVerifiedAt } : {}),
      ...(opts.impersonatedBy ? { impersonatedBy: opts.impersonatedBy } : {}),
    },
    { expiresIn: opts.expiresIn ?? '15m' },
  );
}

async function createSubscription(userId: string): Promise<void> {
  const now = new Date();
  const trialEnds = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
  const readOnlyUntil = new Date(trialEnds.getTime() + 7 * 24 * 60 * 60 * 1000);
  const suspendedAt = readOnlyUntil;
  const dataPurgeAt = new Date(suspendedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
  await prisma.subscription.create({
    data: {
      userId,
      status: 'trial',
      trialStartedAt: now,
      trialEndsAt: trialEnds,
      readOnlyUntil,
      suspendedAt,
      dataPurgeAt,
    },
  });
}

/**
 * If no admin exists yet, mark this newly created user as admin. Idempotent —
 * safe to call on every registration; once an admin exists, this is a no-op.
 * Returns whether the user was promoted (so the caller can pass the right
 * isAdmin into the new access token).
 */
async function promoteFirstUserToAdmin(userId: string): Promise<boolean> {
  const adminCount = await prisma.user.count({ where: { isAdmin: true } });
  if (adminCount > 0) return false;
  await prisma.user.update({ where: { id: userId }, data: { isAdmin: true } });
  return true;
}

function publicUser(u: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  publicId?: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  isAdmin: boolean;
  isOwner?: boolean;
  mfaEnabled: boolean;
}) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    publicId: u.publicId ?? null,
    subscriptionTier: u.subscriptionTier,
    subscriptionStatus: u.subscriptionStatus,
    isAdmin: u.isAdmin,
    isOwner: u.isOwner ?? false,
    mfaEnabled: u.mfaEnabled,
  };
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Phone: request OTP ──────────────────────────────────────────────────────
  fastify.post('/auth/phone/request-otp', async (request, reply) => {
    const body = z.object({ phone: z.string() }).parse(request.body);
    const phone = normalizePhone(body.phone);
    if (!BD_PHONE_RE.test(phone)) {
      return reply.status(400).send({ message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)' });
    }

    const recentCount = await prisma.otpCode.count({
      where: { phone, createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
    });
    if (recentCount >= 3) {
      return reply.status(429).send({ message: '১০ মিনিটে সর্বোচ্চ ৩টি OTP পাঠানো যাবে। পরে চেষ্টা করুন।' });
    }

    const otp = generateOtp();
    const codeHash = await hashOtp(otp);
    await prisma.otpCode.create({ data: { phone, codeHash, expiresAt: otpExpiresAt() } });

    try {
      await sendOtpSMS(phone, otp);
    } catch (err) {
      fastify.log.warn({ err }, 'SMS send failed — returning OTP in dev mode');
      if (process.env['NODE_ENV'] !== 'production') {
        return reply.send({ ok: true, devOtp: otp });
      }
      return reply.status(503).send({ message: 'SMS পাঠাতে ব্যর্থ হয়েছে। পরে চেষ্টা করুন।' });
    }

    return reply.send({ ok: true });
  });

  // ── Phone: verify OTP (login or register) ──────────────────────────────────
  fastify.post('/auth/phone/verify-otp', async (request, reply) => {
    const body = z
      .object({
        phone: z.string(),
        otp: z.string().length(6),
        name: z.string().min(2).max(80).optional(),
      })
      .parse(request.body);

    const phone = normalizePhone(body.phone);
    if (!BD_PHONE_RE.test(phone)) {
      return reply.status(400).send({ message: 'অবৈধ ফোন নম্বর' });
    }

    const record = await prisma.otpCode.findFirst({
      where: { phone, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      return reply.status(400).send({ message: 'OTP মেয়াদ শেষ বা পাওয়া যায়নি। নতুন OTP নিন।' });
    }
    if (!(await verifyOtp(body.otp, record.codeHash))) {
      return reply.status(400).send({ message: 'OTP কোড সঠিক নয়।' });
    }

    await prisma.otpCode.update({ where: { id: record.id }, data: { used: true } });

    let user = await prisma.user.findUnique({ where: { phone } });
    let justRegistered = false;
    if (!user) {
      if (!body.name) {
        return reply.status(422).send({ needsName: true, message: 'নতুন অ্যাকাউন্টের জন্য আপনার নাম দিন।' });
      }
      const publicId = await generateUniquePublicId();
      user = await prisma.user.create({ data: { phone, name: body.name, publicId } });
      await createSubscription(user.id);
      justRegistered = true;
    }

    if (justRegistered) {
      const promoted = await promoteFirstUserToAdmin(user.id);
      if (promoted) user = { ...user, isAdmin: true };
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = makeAccessToken(fastify, user.id, user);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken);

    return reply.send({ accessToken, refreshToken, user: publicUser(user) });
  });

  // ── Email: register ─────────────────────────────────────────────────────────
  fastify.post('/auth/email/register', async (request, reply) => {
    const body = z
      .object({
        email: z.string().email('সঠিক ইমেইল ঠিকানা দিন'),
        name: z.string().min(2, 'নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(80),
        password: z.string().min(8, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে'),
      })
      .parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ message: 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে। লগইন করুন।' });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const publicId = await generateUniquePublicId();
    let user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash, publicId },
    });
    await createSubscription(user.id);

    const promoted = await promoteFirstUserToAdmin(user.id);
    if (promoted) user = { ...user, isAdmin: true };
    if (isConfiguredOwner(user.email)) {
      // The platform-owner email registered with password — promote both flags.
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isOwner: true, isAdmin: true },
      });
    }

    const accessToken = makeAccessToken(fastify, user.id, user);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken);

    return reply.status(201).send({ accessToken, refreshToken, user: publicUser(user) });
  });

  // ── Email: login ────────────────────────────────────────────────────────────
  fastify.post('/auth/email/login', async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string(),
      })
      .parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const isValid =
      user?.passwordHash && (await bcrypt.compare(body.password, user.passwordHash));
    if (!user || !isValid) {
      return reply.status(401).send({ message: 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = makeAccessToken(fastify, user.id, user);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken);

    return reply.send({ accessToken, refreshToken, user: publicUser(user) });
  });

  // ── Refresh access token ────────────────────────────────────────────────────
  fastify.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(request.body);
    const result = await validateRefreshToken(refreshToken);
    if (!result) {
      return reply.status(401).send({ message: 'Session মেয়াদ শেষ। আবার লগইন করুন।' });
    }
    const user = await prisma.user.findUnique({ where: { id: result.userId } });
    if (!user) {
      return reply.status(401).send({ message: 'User পাওয়া যায়নি।' });
    }
    // Note: refresh drops any previous mfaVerifiedAt claim. The user must
    // re-challenge after refresh — keeps admin sessions tight.
    const accessToken = makeAccessToken(fastify, user.id, user);
    return reply.send({ accessToken });
  });

  // ── Logout ──────────────────────────────────────────────────────────────────
  fastify.post('/auth/logout', async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(request.body);
    await revokeRefreshToken(refreshToken);
    return reply.send({ ok: true });
  });

  // ── /auth/me — for the UI to render admin / MFA gates ──────────────────────
  fastify.get('/auth/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) return reply.status(404).send({ message: 'User not found' });
    return reply.send({
      user: publicUser(user),
      mfaVerifiedAt: request.user.mfaVerifiedAt ?? null,
    });
  });

  // ── MFA: code rate limit helper ────────────────────────────────────────────
  async function withinMintRateLimit(userId: string): Promise<boolean> {
    const recent = await prisma.mfaCode.count({
      where: { userId, createdAt: { gt: new Date(Date.now() - MFA_CODE_RATE_WINDOW_MS) } },
    });
    return recent < MFA_MAX_CODES_PER_WINDOW;
  }

  async function mintAndSendCode(
    userId: string,
    purpose: 'enroll' | 'challenge',
  ): Promise<{ id: string; code: string }> {
    const code = generateMixedCode();
    const codeHash = await hashCode(code);
    const row = await prisma.mfaCode.create({
      data: {
        userId,
        codeHash,
        purpose,
        expiresAt: new Date(Date.now() + MFA_CODE_TTL_MS),
      },
    });
    return { id: row.id, code };
  }

  // ── MFA: start enroll (any logged-in user; sets up 2FA on their account) ───
  fastify.post(
    '/auth/mfa/start-enroll',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) return reply.status(404).send({ message: 'User not found.' });
      if (!user.email) {
        return reply.status(409).send({
          message: 'You need a verified email on your account before enabling 2FA.',
          code: 'NO_EMAIL',
        });
      }
      if (user.mfaEnabled) {
        return reply.status(409).send({ message: '2FA is already enabled.', code: 'ALREADY_ENABLED' });
      }
      if (!(await withinMintRateLimit(user.id))) {
        return reply.status(429).send({ message: 'Too many codes requested. Try again later.' });
      }

      const { id, code } = await mintAndSendCode(user.id, 'enroll');
      try {
        await sendMfaCodeEmail({
          to: user.email,
          recipientName: user.name,
          code,
          purpose: 'enroll',
          expiresInMinutes: Math.round(MFA_CODE_TTL_MS / 60000),
        });
      } catch (err) {
        fastify.log.error({ err }, 'mfa enroll email failed');
        return reply.status(502).send({ message: 'Could not send the verification email.' });
      }
      return reply.send({
        codeId: id,
        emailedTo: user.email,
        emailDelivery: smtpConfigured() ? 'smtp' : 'console',
        expiresInSeconds: Math.round(MFA_CODE_TTL_MS / 1000),
      });
    },
  );

  // ── MFA: verify enroll → flips mfaEnabled, returns MFA-stamped access token ─
  fastify.post(
    '/auth/mfa/verify-enroll',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z
        .object({ codeId: z.string().uuid(), code: z.string().min(4).max(16) })
        .parse(request.body);
      const submitted = normalizeCode(body.code);
      if (!isWellFormed(submitted)) {
        return reply.status(400).send({ message: 'Invalid code format.' });
      }

      const row = await prisma.mfaCode.findUnique({ where: { id: body.codeId } });
      if (!row || row.userId !== request.user.sub || row.purpose !== 'enroll') {
        return reply.status(400).send({ message: 'Code not found.' });
      }
      if (row.consumedAt) return reply.status(400).send({ message: 'Code already used.' });
      if (row.expiresAt < new Date()) return reply.status(400).send({ message: 'Code expired.' });
      if (row.attempts >= MFA_MAX_ATTEMPTS_PER_CODE) {
        await prisma.mfaCode.update({
          where: { id: row.id },
          data: { consumedAt: new Date() },
        });
        return reply.status(400).send({ message: 'Too many attempts. Request a new code.' });
      }

      const ok = await verifyCodeHash(submitted, row.codeHash);
      if (!ok) {
        await prisma.mfaCode.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
        return reply.status(400).send({ message: 'Code is incorrect.' });
      }

      const now = new Date();
      await prisma.mfaCode.update({
        where: { id: row.id },
        data: { consumedAt: now },
      });
      const updatedUser = await prisma.user.update({
        where: { id: request.user.sub },
        data: { mfaEnabled: true, mfaEnrolledAt: now },
      });

      const mfaVerifiedAt = Date.now();
      const accessToken = makeAccessToken(fastify, updatedUser.id, updatedUser, { mfaVerifiedAt });
      return reply.send({
        accessToken,
        mfaVerifiedAt,
        user: publicUser(updatedUser),
      });
    },
  );

  // ── MFA: start challenge (admin needs a fresh code to re-verify) ───────────
  fastify.post(
    '/auth/mfa/start-challenge',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) return reply.status(404).send({ message: 'User not found.' });
      if (!user.mfaEnabled) {
        return reply.status(409).send({ message: '2FA is not enabled on this account.', code: 'NOT_ENROLLED' });
      }
      if (!user.email) {
        return reply.status(409).send({ message: 'Cannot deliver code — no email on account.', code: 'NO_EMAIL' });
      }
      if (!(await withinMintRateLimit(user.id))) {
        return reply.status(429).send({ message: 'Too many codes requested. Try again later.' });
      }

      const { id, code } = await mintAndSendCode(user.id, 'challenge');
      try {
        await sendMfaCodeEmail({
          to: user.email,
          recipientName: user.name,
          code,
          purpose: 'challenge',
          expiresInMinutes: Math.round(MFA_CODE_TTL_MS / 60000),
        });
      } catch (err) {
        fastify.log.error({ err }, 'mfa challenge email failed');
        return reply.status(502).send({ message: 'Could not send the verification email.' });
      }
      return reply.send({
        codeId: id,
        emailedTo: user.email,
        emailDelivery: smtpConfigured() ? 'smtp' : 'console',
        expiresInSeconds: Math.round(MFA_CODE_TTL_MS / 1000),
      });
    },
  );

  // ── MFA: verify challenge → new access token w/ fresh mfaVerifiedAt ────────
  fastify.post(
    '/auth/mfa/verify-challenge',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z
        .object({ codeId: z.string().uuid(), code: z.string().min(4).max(16) })
        .parse(request.body);
      const submitted = normalizeCode(body.code);
      if (!isWellFormed(submitted)) {
        return reply.status(400).send({ message: 'Invalid code format.' });
      }

      const row = await prisma.mfaCode.findUnique({ where: { id: body.codeId } });
      if (!row || row.userId !== request.user.sub || row.purpose !== 'challenge') {
        return reply.status(400).send({ message: 'Code not found.' });
      }
      if (row.consumedAt) return reply.status(400).send({ message: 'Code already used.' });
      if (row.expiresAt < new Date()) return reply.status(400).send({ message: 'Code expired.' });
      if (row.attempts >= MFA_MAX_ATTEMPTS_PER_CODE) {
        await prisma.mfaCode.update({
          where: { id: row.id },
          data: { consumedAt: new Date() },
        });
        return reply.status(400).send({ message: 'Too many attempts. Request a new code.' });
      }

      const ok = await verifyCodeHash(submitted, row.codeHash);
      if (!ok) {
        await prisma.mfaCode.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
        return reply.status(400).send({ message: 'Code is incorrect.' });
      }

      await prisma.mfaCode.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      });
      const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
      if (!user) return reply.status(404).send({ message: 'User not found.' });

      const mfaVerifiedAt = Date.now();
      const accessToken = makeAccessToken(fastify, user.id, user, { mfaVerifiedAt });
      return reply.send({ accessToken, mfaVerifiedAt });
    },
  );

  // ── Owner email-code login ─────────────────────────────────────────────────
  // The platform owner (env.OWNER_EMAIL) signs in passwordless: request a code
  // → get it by email → submit it → receive an access token with isOwner+admin.
  // We never reveal whether an email matches; the response shape is identical
  // either way to keep this endpoint useless as an email-enumeration oracle.

  fastify.post('/auth/owner/request-code', async (request, reply) => {
    const body = z.object({ email: z.string().email() }).parse(request.body);

    if (!isConfiguredOwner(body.email)) {
      // Same shape + timing as success — don't leak whether the email matched.
      return reply.send({
        ok: true,
        emailedTo: body.email,
        emailDelivery: smtpConfigured() ? 'smtp' : 'console',
        expiresInSeconds: Math.round(MFA_CODE_TTL_MS / 1000),
        codeId: null,
      });
    }

    // Owner row may or may not exist yet — create on first request.
    let user = await prisma.user.findFirst({
      where: { email: { equals: env.OWNER_EMAIL, mode: 'insensitive' } },
    });
    if (!user) {
      const publicId = await generateUniquePublicId();
      user = await prisma.user.create({
        data: {
          email: env.OWNER_EMAIL,
          name: 'BoxBazar Owner',
          isOwner: true,
          isAdmin: true,
          publicId,
        },
      });
      await createSubscription(user.id);
    } else if (!user.isOwner || !user.isAdmin) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isOwner: true, isAdmin: true },
      });
    }

    // Rate-limit: same MFA rolling window as the regular flow.
    const recent = await prisma.mfaCode.count({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - MFA_CODE_RATE_WINDOW_MS) },
      },
    });
    if (recent >= MFA_MAX_CODES_PER_WINDOW) {
      return reply.status(429).send({ message: 'Too many codes requested. Try again later.' });
    }

    const code = generateMixedCode();
    const codeHash = await hashCode(code);
    const row = await prisma.mfaCode.create({
      data: {
        userId: user.id,
        codeHash,
        purpose: 'owner_login',
        expiresAt: new Date(Date.now() + MFA_CODE_TTL_MS),
      },
    });
    try {
      await sendMfaCodeEmail({
        to: user.email!,
        recipientName: user.name,
        code,
        purpose: 'challenge',
        expiresInMinutes: Math.round(MFA_CODE_TTL_MS / 60000),
      });
    } catch (err) {
      fastify.log.error({ err }, 'owner-login email failed');
      return reply.status(502).send({ message: 'Could not send the verification email.' });
    }
    fastify.log.info({ ownerId: user.id }, '[OWNER] login code requested');
    return reply.send({
      ok: true,
      codeId: row.id,
      emailedTo: user.email,
      emailDelivery: smtpConfigured() ? 'smtp' : 'console',
      expiresInSeconds: Math.round(MFA_CODE_TTL_MS / 1000),
    });
  });

  fastify.post('/auth/owner/verify-code', async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        codeId: z.string().uuid(),
        code: z.string().min(4).max(16),
      })
      .parse(request.body);

    if (!isConfiguredOwner(body.email)) {
      return reply.status(400).send({ message: 'Code not found.' });
    }
    const submitted = normalizeCode(body.code);
    if (!isWellFormed(submitted)) {
      return reply.status(400).send({ message: 'Invalid code format.' });
    }

    const row = await prisma.mfaCode.findUnique({ where: { id: body.codeId } });
    if (!row || row.purpose !== 'owner_login') {
      return reply.status(400).send({ message: 'Code not found.' });
    }
    if (row.consumedAt) return reply.status(400).send({ message: 'Code already used.' });
    if (row.expiresAt < new Date()) return reply.status(400).send({ message: 'Code expired.' });
    if (row.attempts >= MFA_MAX_ATTEMPTS_PER_CODE) {
      await prisma.mfaCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
      return reply.status(400).send({ message: 'Too many attempts. Request a new code.' });
    }

    const ok = await verifyCodeHash(submitted, row.codeHash);
    if (!ok) {
      await prisma.mfaCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      return reply.status(400).send({ message: 'Code is incorrect.' });
    }

    await prisma.mfaCode.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });

    const owner = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!owner) return reply.status(404).send({ message: 'Owner user missing.' });

    await prisma.user.update({ where: { id: owner.id }, data: { lastLoginAt: new Date() } });

    // Owner-login implicitly counts as MFA verification (the emailed code
    // *is* the second factor).
    const mfaVerifiedAt = Date.now();
    const accessToken = makeAccessToken(fastify, owner.id, owner, { mfaVerifiedAt });
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(owner.id, refreshToken);
    fastify.log.info({ ownerId: owner.id }, '[OWNER] login succeeded');

    return reply.send({
      accessToken,
      refreshToken,
      mfaVerifiedAt,
      user: publicUser(owner),
    });
  });
}
