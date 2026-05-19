import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';

/**
 * Minimal SMTP wrapper used for admin MFA codes. SMTP is operator-level config
 * (lives in apps/api/.env), not seller-level — sellers never need to touch this.
 *
 * If SMTP_HOST is unset, every send falls back to a stdout banner with the
 * code in plain text and an unmissable [MFA DEV-MODE] tag. Dev convenience —
 * production deployments must configure real SMTP.
 */

let cached: { transporter: Transporter; signature: string } | null = null;

function smtpSignature(): string {
  return [env.SMTP_HOST, env.SMTP_PORT, env.SMTP_SECURE, env.SMTP_USER].join('|');
}

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  const sig = smtpSignature();
  if (cached && cached.signature === sig) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE === 'true',
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });
  cached = { transporter, signature: sig };
  return transporter;
}

export function smtpConfigured(): boolean {
  return !!env.SMTP_HOST;
}

export interface MfaCodeEmailArgs {
  to: string;
  recipientName: string | null;
  code: string;
  purpose: 'enroll' | 'challenge';
  expiresInMinutes: number;
}

function plainBody(args: MfaCodeEmailArgs): string {
  const intro =
    args.purpose === 'enroll'
      ? 'You requested to enable Two-Factor Authentication on your BoxBazar admin account.'
      : 'You requested to verify your BoxBazar admin session.';
  return `${intro}

Your verification code: ${args.code}

This code is valid for ${args.expiresInMinutes} minutes and can only be used once.
If you did not request this, ignore this email and consider rotating your password.

— BoxBazar`;
}

function htmlBody(args: MfaCodeEmailArgs): string {
  const intro =
    args.purpose === 'enroll'
      ? 'You requested to enable <strong>Two-Factor Authentication</strong> on your BoxBazar admin account.'
      : 'You requested to verify your BoxBazar admin session.';
  return `<!doctype html>
<html><body style="font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#f5f5f5;padding:24px;color:#111">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <div style="font-size:13px;color:#666;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px">BoxBazar Admin</div>
    <h1 style="font-size:18px;margin:0 0 12px">${args.purpose === 'enroll' ? 'Verify to enable 2FA' : 'Admin verification'}</h1>
    <p style="font-size:14px;line-height:1.5;color:#444;margin:0 0 18px">${intro}</p>
    <div style="text-align:center;background:#f0f3ff;border:1px solid #c7d2fe;border-radius:8px;padding:16px;margin:18px 0">
      <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:28px;letter-spacing:6px;color:#1e1b4b">${args.code}</div>
    </div>
    <p style="font-size:13px;line-height:1.5;color:#555;margin:0 0 4px">Valid for <strong>${args.expiresInMinutes} minutes</strong>. Single use.</p>
    <p style="font-size:13px;line-height:1.5;color:#555;margin:0">If you didn't request this, ignore this message and consider rotating your password.</p>
  </div>
</body></html>`;
}

export async function sendMfaCodeEmail(args: MfaCodeEmailArgs): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    // Dev fallback — print the code so the operator can still bootstrap.
    // Production must set SMTP_HOST or this is a silent UX disaster.
    console.warn(
      `[MFA DEV-MODE] SMTP not configured. Code for ${args.to} (${args.purpose}): ${args.code} ` +
        `(valid ${args.expiresInMinutes}m)`,
    );
    return;
  }
  await transporter.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER ?? 'no-reply@boxbazar.local',
    to: args.to,
    subject:
      args.purpose === 'enroll'
        ? 'Your BoxBazar 2FA enable code'
        : 'Your BoxBazar admin verification code',
    text: plainBody(args),
    html: htmlBody(args),
  });
}
