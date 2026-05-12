'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface StoreSummary {
  id: string;
  name: string;
  category: string;
  fbPageId: string | null;
  fbPageName: string | null;
  aiEnabled: boolean;
  aiToneProfile: string;
}

/**
 * The seller's stores. v1 sellers have exactly one, so most callers just want
 * `useCurrentStore()`.
 */
export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: () => apiClient.get<{ stores: StoreSummary[] }>('/api/stores'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCurrentStore() {
  const q = useStores();
  return {
    ...q,
    store: q.data?.stores?.[0] ?? null,
    storeId: q.data?.stores?.[0]?.id ?? null,
  };
}
