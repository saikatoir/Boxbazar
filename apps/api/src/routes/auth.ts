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

const BD_PHONE_RE = /^01[3-9]\d{8}$/;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) return '0' + digits.slice(3);
  return digits;
}

function makeAccessToken(fastify: FastifyInstance, userId: string, user: {
  name: string; phone: string | null; email: string | null; subscriptionTier: string;
}): string {
  return fastify.jwt.sign(
    {
      sub: userId,
      name: user.name,
      phone: user.phone,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
    },
    { expiresIn: '15m' }
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

export async function authRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Phone: request OTP ──────────────────────────────────────────────────────
  fastify.post('/auth/phone/request-otp', async (request, reply) => {
    const body = z.object({ phone: z.string() }).parse(request.body);
    const phone = normalizePhone(body.phone);
    if (!BD_PHONE_RE.test(phone)) {
      return reply.status(400).send({ message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)' });
    }

    // rate-limit: max 3 OTPs per phone per 10 min
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
    const body = z.object({
      phone: z.string(),
      otp: z.string().length(6),
      name: z.string().min(2).max(80).optional(),
    }).parse(request.body);

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
    if (!user) {
      if (!body.name) {
        return reply.status(422).send({ needsName: true, message: 'নতুন অ্যাকাউন্টের জন্য আপনার নাম দিন।' });
      }
      user = await prisma.user.create({ data: { phone, name: body.name } });
      await createSubscription(user.id);
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = makeAccessToken(fastify, user.id, user);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken);

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
      },
    });
  });

  // ── Email: register ─────────────────────────────────────────────────────────
  fastify.post('/auth/email/register', async (request, reply) => {
    const body = z.object({
      email: z.string().email('সঠিক ইমেইল ঠিকানা দিন'),
      name: z.string().min(2, 'নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(80),
      password: z.string().min(8, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে'),
    }).parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ message: 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে। লগইন করুন।' });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: { email: body.email, name: body.name, passwordHash },
    });
    await createSubscription(user.id);

    const accessToken = makeAccessToken(fastify, user.id, user);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken);

    return reply.status(201).send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
      },
    });
  });

  // ── Email: login ────────────────────────────────────────────────────────────
  fastify.post('/auth/email/login', async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string(),
    }).parse(request.body);

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

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
      },
    });
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
    const accessToken = makeAccessToken(fastify, user.id, user);
    return reply.send({ accessToken });
  });

  // ── Logout ──────────────────────────────────────────────────────────────────
  fastify.post('/auth/logout', async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(request.body);
    await revokeRefreshToken(refreshToken);
    return reply.send({ ok: true });
  });
}
