'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Package, Truck, CheckCircle2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type OrderListItem = {
  id: string;
  status: string;
  source?: 'ai' | 'manual';
  codCents: number;
  createdAt: string;
  customer: { name: string; phone: string | null };
  consignment: {
    courier: string;
    trackingCode: string;
    currentStatus: string;
  } | null;
};

type StatusMeta = { label: string; icon: typeof Package; cls: string };

const STATUS_META: Record<string, StatusMeta> = {
  draft: { label: 'খসড়া', icon: Package, cls: 'bg-gray-100 text-gray-700' },
  pending_approval: { label: 'approval দরকার', icon: Sparkles, cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'approved', icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700' },
  placed: { label: 'নতুন', icon: Package, cls: 'bg-blue-50 text-blue-700' },
  shipped: { label: 'কুরিয়ারে', icon: Truck, cls: 'bg-amber-50 text-amber-700' },
  delivered: { label: 'ডেলিভারড', icon: CheckCircle2, cls: 'bg-green-50 text-green-700' },
  returned: { label: 'ফেরত', icon: AlertCircle, cls: 'bg-red-50 text-red-700' },
  canceled: { label: 'বাতিল', icon: AlertCircle, cls: 'bg-gray-100 text-gray-500' },
  rejected: { label: 'বাতিল (AI)', icon: AlertCircle, cls: 'bg-red-50 text-red-600' },
};
const DEFAULT_META: StatusMeta = { label: 'অর্ডার', icon: Package, cls: 'bg-gray-100 text-gray-600' };

export default function OrdersListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => apiClient.get<{ orders: OrderListItem[] }>('/api/orders'),
  });

  const orders = data?.orders ?? [];
  const pendingCount = orders.filter((o) => o.status === 'pending_approval').length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">অর্ডার সমূহ</h1>
          <p className="text-gray-500 text-sm">শেষ ৫০টি অর্ডার দেখানো হচ্ছে</p>
        </div>
        <Link
          href="/orders/new"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          নতুন
        </Link>
      </div>

      {pendingCount > 0 && (
        <Link
          href="/orders/pending"
          className="flex items-center gap-3 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800 flex-1">
            <strong>{pendingCount}টি অর্ডার</strong> AI নিয়েছে — approve করার অপেক্ষায়।
          </span>
          <ArrowRight className="w-4 h-4 text-amber-600" />
        </Link>
      )}

      {isLoading && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
          লোড হচ্ছে…
        </div>
      )}

      {!isLoading && orders.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <Package className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-4">এখনও কোনো অর্ডার নেই</p>
          <Link
            href="/orders/new"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            প্রথম অর্ডার তৈরি করুন
          </Link>
        </div>
      )}

      {!isLoading && orders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {orders.map((o, idx) => {
            const meta = STATUS_META[o.status] ?? DEFAULT_META;
            const Icon = meta.icon;
            return (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className={`flex items-center gap-4 px-4 md:px-6 py-4 hover:bg-gray-50 transition-colors ${
                  idx < orders.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${meta.cls}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {o.customer.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {o.customer.phone}
                    {o.consignment ? ` · ${o.consignment.courier.toUpperCase()} · ${o.consignment.trackingCode}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">
                    ৳ {Math.round(o.codCents / 100).toLocaleString('en-IN')}
                  </p>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
