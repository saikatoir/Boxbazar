import { useAuthStore } from '@/store/auth';

const API_BASE_URL =
  process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().token;
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().refreshToken;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

async function rawFetch<T>(
  path: string,
  options: RequestOptions,
  token: string | null
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });
}

async function apiFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  let token = getToken();
  let response = await rawFetch<T>(path, options, token);

  // Try one silent refresh on 401.
  if (response.status === 401) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (refreshRes.ok) {
          const refreshed = (await refreshRes.json()) as { accessToken: string };
          useAuthStore.getState().setToken(refreshed.accessToken);
          token = refreshed.accessToken;
          response = await rawFetch<T>(path, options, token);
        }
      } catch {
        // fall through to the 401 handler below
      }
    }
  }

  if (response.status === 401) {
    useAuthStore.getState().clearAuth();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new Error(
      errorBody.message ?? errorBody.error ?? `HTTP ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return apiFetch<T>(path, { method: 'GET', headers });
  },
  post<T>(
    path: string,
    body: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    return apiFetch<T>(path, { method: 'POST', body, headers });
  },
  put<T>(
    path: string,
    body: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    return apiFetch<T>(path, { method: 'PUT', body, headers });
  },
  patch<T>(
    path: string,
    body: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    return apiFetch<T>(path, { method: 'PATCH', body, headers });
  },
  delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return apiFetch<T>(path, { method: 'DELETE', headers });
  },
};
