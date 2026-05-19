import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
  name: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  publicId?: string | null;
  isAdmin?: boolean;
  isOwner?: boolean;
  mfaEnabled?: boolean;
}

/**
 * When the owner impersonates a user, we stash the owner's prior session here
 * and replace `user`/`token` with the target user's identity. The dashboard
 * banner reads `impersonation` to render itself and to drive "stop impersonating".
 */
export interface ImpersonationState {
  /** The target user the session is currently scoped to. */
  target: {
    id: string;
    publicId: string | null;
    name: string;
    email: string | null;
    phone: string | null;
  };
  /** The owner's saved auth so we can swap back. */
  owner: {
    user: AuthUser;
    token: string;
    refreshToken: string | null;
    mfaVerifiedAt: number | null;
  };
  /** When the impersonation token was issued (so we can show a countdown if we want). */
  startedAt: number;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  /** Unix ms timestamp of the last successful MFA verification on this session. */
  mfaVerifiedAt: number | null;
  /** Set when the active session is owner-impersonating a user. */
  impersonation: ImpersonationState | null;
  setAuth: (user: AuthUser, token: string, refreshToken: string) => void;
  setToken: (token: string, mfaVerifiedAt?: number | null) => void;
  setUser: (user: AuthUser) => void;
  startImpersonation: (target: ImpersonationState['target'], impersonationToken: string) => void;
  stopImpersonation: () => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
  hasRecentMfa: () => boolean;
}

/** Mirror of MFA_SESSION_MAX_AGE_MS on the server. Keep these in sync. */
export const MFA_SESSION_MAX_AGE_MS = 15 * 60 * 1000;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      mfaVerifiedAt: null,
      impersonation: null,
      setAuth: (user, token, refreshToken) =>
        set({ user, token, refreshToken, mfaVerifiedAt: null, impersonation: null }),
      setToken: (token, mfaVerifiedAt) =>
        set((s) => ({
          token,
          mfaVerifiedAt:
            mfaVerifiedAt === undefined ? s.mfaVerifiedAt : mfaVerifiedAt,
        })),
      setUser: (user) => set({ user }),
      startImpersonation: (target, impersonationToken) => {
        const s = get();
        if (!s.user || !s.token) return;
        set({
          impersonation: {
            target,
            owner: {
              user: s.user,
              token: s.token,
              refreshToken: s.refreshToken,
              mfaVerifiedAt: s.mfaVerifiedAt,
            },
            startedAt: Date.now(),
          },
          // Replace the active session with a synthetic target-user view. We
          // keep the impersonation token in `token` so every fetch hits the
          // API as the target. mfaVerifiedAt is dropped on purpose — impersonation
          // sessions cannot edit admin-gated platform config.
          user: {
            id: target.id,
            name: target.name,
            email: target.email,
            phone: target.phone,
            subscriptionTier: 'trial',
            subscriptionStatus: 'active',
            publicId: target.publicId,
          },
          token: impersonationToken,
          mfaVerifiedAt: null,
          // refreshToken intentionally unchanged — refreshing under
          // impersonation isn't supported; the 15-min token suffices.
        });
      },
      stopImpersonation: () => {
        const s = get();
        if (!s.impersonation) return;
        const { owner } = s.impersonation;
        set({
          user: owner.user,
          token: owner.token,
          refreshToken: owner.refreshToken,
          mfaVerifiedAt: owner.mfaVerifiedAt,
          impersonation: null,
        });
      },
      clearAuth: () =>
        set({
          user: null,
          token: null,
          refreshToken: null,
          mfaVerifiedAt: null,
          impersonation: null,
        }),
      isAuthenticated: () => {
        const s = get();
        return s.token !== null && s.user !== null;
      },
      hasRecentMfa: () => {
        const s = get();
        return (
          typeof s.mfaVerifiedAt === 'number' &&
          Date.now() - s.mfaVerifiedAt < MFA_SESSION_MAX_AGE_MS
        );
      },
    }),
    {
      name: 'fcommerce-auth',
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        refreshToken: s.refreshToken,
        mfaVerifiedAt: s.mfaVerifiedAt,
        impersonation: s.impersonation,
      }),
    },
  ),
);
