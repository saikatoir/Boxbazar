'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Mail, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuthStore, type AuthUser } from '@/store/auth';
import { Input, Label, FieldHint } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

/**
 * Hidden admin (owner) login at /login/admin-p. Not linked from anywhere in
 * the UI — the operator bookmarks it directly. Passwordless: enter the owner
 * email → a 6-character code (2 letters + 4 digits) lands in the inbox →
 * enter it → server returns a session with isOwner=true + mfaVerifiedAt set.
 *
 * The endpoint masks email enumeration: requesting a code for a non-owner
 * email returns the same shape, so this URL is a dead-end for anyone who
 * doesn't already know the owner email.
 */

interface StartResponse {
  ok: true;
  codeId: string | null;
  emailedTo: string;
  emailDelivery: 'smtp' | 'console';
  expiresInSeconds: number;
}

interface VerifyResponse {
  accessToken: string;
  refreshToken: string;
  mfaVerifiedAt: number;
  user: AuthUser;
}

const CODE_PATTERN = /^[A-Z0-9]{6}$/;

export default function AdminLoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setToken = useAuthStore((s) => s.setToken);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [codeId, setCodeId] = useState<string | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<'smtp' | 'console' | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  async function sendCode() {
    if (!email.trim()) {
      setError('Enter the admin email.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/owner/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await res.json()) as StartResponse & { message?: string };
      if (!res.ok) {
        setError(body.message ?? 'Could not send the code.');
        return;
      }
      setCodeId(body.codeId);
      setEmailDelivery(body.emailDelivery);
      setStep('code');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (!codeId) {
      setError('No code was sent for this email. Confirm the admin email and try again.');
      return;
    }
    const normalized = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!CODE_PATTERN.test(normalized)) {
      setError('Enter the 6-character code (2 letters + 4 digits).');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/owner/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), codeId, code: normalized }),
      });
      const body = (await res.json()) as VerifyResponse & { message?: string };
      if (!res.ok || !body.accessToken) {
        setError(body.message ?? 'Verification failed.');
        return;
      }
      setAuth(body.user, body.accessToken, body.refreshToken);
      setToken(body.accessToken, body.mfaVerifiedAt);
      router.push('/owner');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 leading-tight">Admin login</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Passwordless — a one-time code is emailed to the admin's inbox.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {step === 'email' ? (
          <>
            <div>
              <Label htmlFor="admin-email">Admin email</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                autoComplete="email"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendCode();
                }}
              />
              <FieldHint>
                Only the configured platform-admin email will receive a code.
              </FieldHint>
            </div>
            {error && (
              <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <Button onClick={sendCode} loading={sending} leftIcon={<Mail className="w-4 h-4" />} className="w-full" size="lg">
              Email me a code
            </Button>
          </>
        ) : (
          <>
            <div className="text-sm text-neutral-700">
              Code sent to <span className="font-mono text-neutral-900">{email}</span>.
              {emailDelivery === 'console' && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
                  Dev mode: SMTP not configured. The code is in the API terminal log.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="admin-code">6-character code</Label>
              <Input
                id="admin-code"
                ref={codeRef}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="e.g. 1A2B34"
                className="tracking-[0.5em] font-mono text-base text-center uppercase"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') verify();
                }}
              />
              <FieldHint>2 letters + 4 digits, any order.</FieldHint>
            </div>
            {error && (
              <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-primary-600 underline-offset-2 hover:underline"
              >
                <ArrowLeft className="w-3 h-3" />
                Use a different email
              </button>
              <Button onClick={verify} loading={verifying}>
                Verify
              </Button>
            </div>
          </>
        )}

        <div className="pt-4 border-t border-neutral-100 text-center">
          <Link href="/login" className="text-xs text-neutral-400 hover:text-neutral-600">
            ← Regular login
          </Link>
        </div>
      </div>
    </div>
  );
}
