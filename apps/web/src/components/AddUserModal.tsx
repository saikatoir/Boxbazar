'use client';

import { useEffect, useState } from 'react';
import { UserPlus, X, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Button } from './ui/Button';
import { Input, Label, FieldHint } from './ui/Input';

/**
 * Admin-only flow for adding a normal user account. Same shape as a regular
 * self-registration: name + (email OR phone) + optional password. The created
 * row gets a 4-char publicId automatically.
 */

export interface CreatedUser {
  id: string;
  publicId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  isAdmin: boolean;
  isOwner: boolean;
}

export interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (user: CreatedUser) => void;
}

export function AddUserModal({ open, onClose, onCreated }: AddUserModalProps) {
  const token = useAuthStore((s) => s.token);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (!token) return;
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError('Provide at least an email or a phone number.');
      return;
    }
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters (or leave blank).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/owner/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          password: password || undefined,
        }),
      });
      const body = (await res.json()) as { user?: CreatedUser; message?: string };
      if (!res.ok || !body.user) {
        setError(body.message ?? 'Could not create the user.');
        return;
      }
      onCreated(body.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-pop border border-neutral-200">
        <div className="flex items-start justify-between p-5 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Add user</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Same shape as a normal sign-up. Public ID is generated automatically.
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
          <div>
            <Label required>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
            <FieldHint>Required if no phone number.</FieldHint>
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            <FieldHint>Bangladeshi mobile. Required if no email.</FieldHint>
          </div>
          <div>
            <Label>Password (optional)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank if user will sign in via phone OTP"
              minLength={8}
            />
            <FieldHint>Min 8 characters if set. Email-based accounts need this; phone-only accounts can sign in via OTP.</FieldHint>
          </div>
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting}>
              Create user
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
