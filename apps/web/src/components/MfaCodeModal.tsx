'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X, Mail, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Input, Label, FieldHint } from './ui/Input';
import { useAuthStore } from '@/store/auth';

/**
 * MFA code prompt — used in two flows:
 *   - "enroll"     → after the user clicks "Enable 2FA" in /settings
 *   - "challenge"  → before /platform-setup unmasks the platform config
 *
 * The flow is identical: send code → enter 6-char code → verify → server
 * issues a new access token with mfaVerifiedAt baked in.
 */

export interface MfaCodeModalProps {
  open: boolean;
  purpose: 'enroll' | 'challenge';
  /** Called after the server returns a fresh access token. */
  onSuccess: () => void;
  onClose: () => void;
}

interface StartResponse {
  codeId: string;
  emailedTo: string;
  emailDelivery: 'smtp' | 'console';
  expiresInSeconds: number;
}

interface VerifyResponse {
  accessToken: string;
  mfaVerifiedAt: number;
  user?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    subscriptionTier: string;
    subscriptionStatus: string;
    isAdmin: boolean;
    mfaEnabled: boolean;
  };
}

const CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function MfaCodeModal({ open, purpose, onSuccess, onClose }: MfaCodeModalProps) {
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeId, setCodeId] = useState<string | null>(null);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);
  const [emailDelivery, setEmailDelivery] = useState<'smtp' | 'console' | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      // reset on close
      setCodeId(null);
      setEmailedTo(null);
      setEmailDelivery(null);
      setCode('');
      setError(null);
      setSending(false);
      setVerifying(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && codeId) codeInputRef.current?.focus();
  }, [open, codeId]);

  async function sendCode() {
    if (!token) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        purpose === 'enroll' ? '/api/auth/mfa/start-enroll' : '/api/auth/mfa/start-challenge',
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
      const body = (await res.json()) as StartResponse & { message?: string };
      if (!res.ok) {
        setError(body.message ?? 'Could not send the code. Try again.');
        return;
      }
      setCodeId(body.codeId);
      setEmailedTo(body.emailedTo);
      setEmailDelivery(body.emailDelivery);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (!token || !codeId) return;
    const normalized = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!CODE_PATTERN.test(normalized)) {
      setError('Enter the 6-character code (2 letters + 4 digits).');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(
        purpose === 'enroll' ? '/api/auth/mfa/verify-enroll' : '/api/auth/mfa/verify-challenge',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ codeId, code: normalized }),
        },
      );
      const body = (await res.json()) as VerifyResponse & { message?: string };
      if (!res.ok || !body.accessToken) {
        setError(body.message ?? 'Verification failed.');
        return;
      }
      setToken(body.accessToken, body.mfaVerifiedAt);
      if (body.user) setUser(body.user);
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-pop border border-neutral-200">
        <div className="flex items-start justify-between p-5 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">
                {purpose === 'enroll' ? 'Enable Two-Factor Authentication' : 'Admin verification'}
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {purpose === 'enroll'
                  ? 'A one-time code will be emailed to your account.'
                  : 'Confirm a fresh code to access platform settings.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!codeId ? (
            <>
              <p className="text-sm text-neutral-700">
                {purpose === 'enroll'
                  ? "We'll send a 6-character code (e.g. K3X729) to your email. Enter it here to enable 2FA."
                  : "We'll send a fresh 6-character code to your email. Enter it to unlock admin settings for 15 minutes."}
              </p>
              <Button onClick={sendCode} loading={sending} leftIcon={<Mail className="w-4 h-4" />}>
                Send code to my email
              </Button>
              {error && (
                <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-sm text-neutral-700">
                Code sent to{' '}
                <span className="font-mono text-neutral-900">{emailedTo}</span>.
                {emailDelivery === 'console' && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
                    Dev mode: SMTP not configured. The code is in the API server's terminal log.
                  </p>
                )}
              </div>
              <div>
                <Label>6-character code</Label>
                <Input
                  ref={codeInputRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="e.g. K3X729"
                  className="tracking-[0.5em] font-mono text-base text-center uppercase"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') verify();
                  }}
                />
                <FieldHint>
                  2 letters and 4 digits mixed in any order. Case-insensitive.
                </FieldHint>
              </div>
              {error && (
                <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={sending}
                  className="text-xs text-neutral-500 hover:text-primary-600 underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Resend code'}
                </button>
                <Button onClick={verify} loading={verifying}>
                  Verify
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
