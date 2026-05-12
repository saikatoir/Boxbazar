import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
  name: string;
  subscriptionTier: string;
  subscriptionStatus: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  setAuth: (user: AuthUser, token: string, refreshToken: string) => void;
  setToken: (token: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      setAuth: (user, token, refreshToken) => set({ user, token, refreshToken }),
      setToken: (token) => set({ token }),
      clearAuth: () => set({ user: null, token: null, refreshToken: null }),
      isAuthenticated: () => {
        const s = get();
        return s.token !== null && s.user !== null;
      },
    }),
    {
      name: 'fcommerce-auth',
      partialize: (s) => ({ user: s.user, token: s.token, refreshToken: s.refreshToken }),
    }
  )
);
