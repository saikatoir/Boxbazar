'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  CheckCircle2,
  X,
  Loader2,
  MessageSquare,
  Truck,
  ArrowLeft,
  Inbox,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface OrderItem {
  name?: string;
  productName?: string;
  variant?: string | null;
  quantity?: number;
  unitPriceCents?: number | null;
}

interface PendingOrder {
  id: string;
  status: string;
  source: 'ai' | 'manual';
  conversationId: string | null;
  subtotalCents: number;
  deliveryCents: number;
  codCents: number;
  notes: string | null;
  items: OrderItem[];
  aiExtractedData: { address?: { raw?: string }; confidence?: number; notes?: string | null } | null;
  createdAt: string;
  customer: {
    name: string;
    phone: string | null;
    addressHistory: Array<{ raw?: string; addressLine?: string; district?: string; city?: string; thana?: string; zone?: string }>;
  };
}

const REJECT_REASONS = [
  { value: 'customer_changed_mind', label: 'গ্রাহক মত পাল্টেছে' },
  { value: 'out_of_stock', label: 'স্টকে নেই' },
  { value: 'fraud', label: 'সন্দেহজনক / fraud' },
  { value: 'duplicate', label: 'ডুপ্লিকেট অর্ডার' },
  { value: 'other', label: 'অন্য কারণ' },
];

function addressOf(o: PendingOrder): string {
  if (o.aiExtractedData?.address?.raw) return o.aiExtractedData.address.raw;
  const a = o.customer.addressHistory?.[0];
  if (!a) return '—';
  return (
    a.raw ??
    [a.addressLine, a.zone ?? a.thana, a.city ?? a.district].filter(Boolean).join(', ') ??
    '—'
  );
}

export default function PendingOrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => apiClient.get<{ orders: PendingOrder[] }>('/api/orders'),
    refetchInterval: 20000,
  });
  const pending = (data?.orders ?? []).filter((o) => o.status === 'pending_approval');

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> সব অর্ডার
      </Link>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h1 className="text-2xl font-bold text-gray-900">Approval-এর অপেক্ষায়</h1>
      </div>
      <p className="text-gray-500 text-sm mb-6">AI যেসব অর্ডার গ্রাহকের কাছ থেকে নিয়েছে — আপনি চেক করে approve বা reject করুন।</p>

      {isLoading && <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-400 text-sm">লোড হচ্ছে…</div>}

      {!isLoading && pending.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <Inbox className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">approval-এর অপেক্ষায় কোনো অর্ডার নেই 🎉</p>
        </div>
      )}

      <div className="space-y-4">
        {pending.map((o) => (
          <ApprovalCard key={o.id} order={o} />
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({ order }: { order: PendingOrder }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REJECT_REASONS[0]!.value);
  const [err, setErr] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const approve = useMutation({
    mutationFn: () => apiClient.post(`/api/orders/${order.id}/approve`, {}),
    onSuccess: () => {
      invalidate();
      router.push(`/orders/${order.id}`);
    },
    onError: (e: Error) => setErr(e.message),
  });

  const reject = useMutation({
    mutationFn: (r: string) => apiClient.post(`/api/orders/${order.id}/reject`, { reason: r }),
    onSuccess: () => {
      invalidate();
      setRejecting(false);
    },
    onError: (e: Error) => setErr(e.message),
  });

  const items = order.items ?? [];
  const conf = order.aiExtractedData?.confidence;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900 truncate">{order.customer.name}</h2>
            {order.source === 'ai' && (
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                <Sparkles className="w-3 h-3" /> AI
                {typeof conf === 'number' ? ` · ${Math.round(conf * 100)}%` : ''}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{order.customer.phone ?? 'ফোন নম্বর নেই'}</p>
          <p className="text-sm text-gray-700 mt-1">{addressOf(order)}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-gray-400">COD</p>
          <p className="text-xl font-bold text-gray-900">৳ {Math.round(order.codCents / 100).toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <ul className="space-y-1 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between">
              <span className="text-gray-800">
                {it.quantity ?? 1} × {it.name ?? it.productName ?? 'পণ্য'}
                {it.variant ? <span className="text-gray-400"> ({it.variant})</span> : null}
              </span>
              <span className="text-gray-500">
                {it.unitPriceCents != null ? `৳ ${Math.round((it.unitPriceCents * (it.quantity ?? 1)) / 100)}` : '—'}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 space-y-0.5">
          <div className="flex justify-between"><span>পণ্য</span><span>৳ {Math.round(order.subtotalCents / 100)}</span></div>
          <div className="flex justify-between"><span>ডেলিভারি</span><span>৳ {Math.round(order.deliveryCents / 100)}</span></div>
          <div className="flex justify-between font-medium text-gray-700"><span>মোট (COD)</span><span>৳ {Math.round(order.codCents / 100)}</span></div>
        </div>
        {(order.notes || order.aiExtractedData?.notes) && (
          <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">📝 {order.notes || order.aiExtractedData?.notes}</p>
        )}
      </div>

      {err && <p className="text-xs text-red-600 mt-3">{err}</p>}

      {!rejecting ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => approve.mutate()}
            disabled={approve.isPending}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {approve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            Approve & কুরিয়ার বুক করুন
          </button>
          <button
            onClick={() => setRejecting(true)}
            className="inline-flex items-center gap-2 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <X className="w-4 h-4" /> Reject
          </button>
          {order.conversationId && (
            <Link
              href={`/inbox/${order.conversationId}`}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 ml-auto"
            >
              <MessageSquare className="w-4 h-4" /> চ্যাট দেখুন
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-sm font-medium text-gray-700 mb-2">কেন reject করছেন?</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {REJECT_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`text-xs px-2.5 py-1.5 rounded-full border ${
                  reason === r.value ? 'bg-red-50 border-red-200 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => reject.mutate(reason)}
              disabled={reject.isPending}
              className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {reject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              নিশ্চিত করুন
            </button>
            <button onClick={() => setRejecting(false)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              বাতিল
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
