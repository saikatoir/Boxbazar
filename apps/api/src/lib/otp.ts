import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

const OTP_TTL_MINUTES = 5;
const OTP_SALT_ROUNDS = 10;

export function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, OTP_SALT_ROUNDS);
}

export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

export function otpExpiresAt(): Date {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
}
