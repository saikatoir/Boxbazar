'use client';

import { useEffect } from 'react';
import { useAuthStore, type AuthUser } from '@/store/auth';

interface MeResponse {
  user: AuthUser;
  mfaVerifiedAt: number | null;
}

/**
 * Refreshes the cached user (especially `isAdmin`, `isOwner`, `mfaEnabled`)
 * from the server. Admin/owner status can change between sessions (e.g. via
 * a migration backfill), so we re-fetch on every dashboard load instead of
 * trusting the persisted login payload indefinitely.
 *
 * `skip` lets callers pause the sync — used while impersonating, where
 * /api/auth/me would return the target user's view and stomp the cached
 * owner-side flags.
 *
 * Intentionally minimal: no react-query, no SWR — one fetch per mount.
 */
export function useMe(skip = false): void {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    if (!token || skip) return;
    let cancelled = false;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
      .then((d) => {
        if (cancelled || !d) return;
        setUser(d.user);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, setUser, skip]);
}
