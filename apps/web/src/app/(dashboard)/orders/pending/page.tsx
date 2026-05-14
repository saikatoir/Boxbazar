'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  CheckCircle2,
  X,
  MessageSquare,
  Truck,
  ArrowLeft,
  Inbox,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { PageContainer, PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';

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
    addressHistory: Array<{
      raw?: string;
      addressLine?: string;
      district?: string;
      city?: string;
      thana?: string;
      zone?: string;
    }>;
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
    <PageContainer>
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> সব অর্ডার
      </Link>

      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Approval-এর অপেক্ষায়
          </span>
        }
        description="AI যেসব অর্ডার গ্রাহকের কাছ থেকে নিয়েছে — চেক করে approve বা reject করুন।"
      />

      {isLoading && <Card className="p-10 text-center text-sm text-neutral-400">লোড হচ্ছে…</Card>}

      {!isLoading && pending.length === 0 && (
        <EmptyState
          icon={<Inbox className="w-5 h-5" />}
          title="approval-এর অপেক্ষায় কোনো অর্ডার নেই 🎉"
          description="AI নতুন অর্ডার নিলে এখানে দেখাবে।"
        />
      )}

      <div className="space-y-4">
        {pending.map((o) => (
          <ApprovalCard key={o.id} order={o} />
        ))}
      </div>
    </PageContainer>
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
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-neutral-900 truncate">
                {order.customer.name}
              </h2>
              {order.source === 'ai' && (
                <Badge tone="warning">
                  <Sparkles className="w-3 h-3" /> AI
                  {typeof conf === 'number' ? ` · ${Math.round(conf * 100)}%` : ''}
                </Badge>
              )}
            </div>
            <p className="text-sm text-neutral-500 mt-0.5">
              {order.customer.phone ?? 'ফোন নম্বর নেই'}
            </p>
            <p className="text-sm text-neutral-700 mt-1">{addressOf(order)}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[11px] text-neutral-400 uppercase tracking-wider font-medium">COD</p>
            <p className="text-xl font-semibold text-neutral-900 tabular-nums">
              ৳ {Math.round(order.codCents / 100).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-neutral-50/60 border border-neutral-200/70 p-3">
          <ul className="space-y-1 text-sm">
            {items.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="text-neutral-800 truncate">
                  <span className="text-neutral-400 tabular-nums">{it.quantity ?? 1} ×</span>{' '}
                  {it.name ?? it.productName ?? 'পণ্য'}
                  {it.variant ? (
                    <span className="text-neutral-400"> ({it.variant})</span>
                  ) : null}
                </span>
                <span className="text-neutral-500 tabular-nums flex-shrink-0">
                  {it.unitPriceCents != null
                    ? `৳ ${Math.round((it.unitPriceCents * (it.quantity ?? 1)) / 100)}`
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 pt-2 border-t border-neutral-200/70 text-xs text-neutral-500 space-y-0.5">
            <div className="flex justify-between tabular-nums">
              <span>পণ্য</span>
              <span>৳ {Math.round(order.subtotalCents / 100)}</span>
            </div>
            <div className="flex justify-between tabular-nums">
              <span>ডেলিভারি</span>
              <span>৳ {Math.round(order.deliveryCents / 100)}</span>
            </div>
            <div className="flex justify-between font-semibold text-neutral-800 tabular-nums pt-0.5">
              <span>মোট (COD)</span>
              <span>৳ {Math.round(order.codCents / 100)}</span>
            </div>
          </div>
        </div>

        {(order.notes || order.aiExtractedData?.notes) && (
          <p className="text-xs text-neutral-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            📝 {order.notes || order.aiExtractedData?.notes}
          </p>
        )}

        {err && <p className="text-xs text-red-600">{err}</p>}

        {!rejecting ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              onClick={() => approve.mutate()}
              loading={approve.isPending}
              leftIcon={<Truck className="w-4 h-4" />}
            >
              Approve & কুরিয়ার বুক করুন
            </Button>
            <Button
              variant="outline"
              onClick={() => setRejecting(true)}
              leftIcon={<X className="w-4 h-4" />}
            >
              Reject
            </Button>
            {order.conversationId && (
              <Link
                href={`/inbox/${order.conversationId}`}
                className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-primary-700 ml-auto"
              >
                <MessageSquare className="w-4 h-4" /> চ্যাট দেখুন
              </Link>
            )}
          </div>
        ) : (
          <div className="border-t border-neutral-100 pt-3">
            <p className="text-sm font-medium text-neutral-700 mb-2">কেন reject করছেন?</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={cn(
                    'text-xs px-2.5 py-1.5 rounded-full border transition-colors',
                    reason === r.value
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={() => reject.mutate(reason)}
                loading={reject.isPending}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                নিশ্চিত করুন
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                বাতিল
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
