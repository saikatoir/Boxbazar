import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from './prisma.js';

const REFRESH_TOKEN_TTL_DAYS = 30;

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

export async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const hash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: hash, expiresAt } });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const records = await prisma.refreshToken.findMany({
    where: { expiresAt: { gt: new Date() } },
    select: { id: true, tokenHash: true },
  });
  for (const record of records) {
    if (await bcrypt.compare(token, record.tokenHash)) {
      await prisma.refreshToken.delete({ where: { id: record.id } });
      return;
    }
  }
}

export async function validateRefreshToken(
  token: string
): Promise<{ userId: string } | null> {
  const records = await prisma.refreshToken.findMany({
    where: { expiresAt: { gt: new Date() } },
    select: { id: true, userId: true, tokenHash: true },
  });
  for (const record of records) {
    if (await bcrypt.compare(token, record.tokenHash)) {
      return { userId: record.userId };
    }
  }
  return null;
}
