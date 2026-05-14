'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Package,
  Truck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { PageContainer, PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';

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

type StatusMeta = {
  label: string;
  icon: LucideIcon;
  tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
};

const STATUS_META: Record<string, StatusMeta> = {
  draft: { label: 'খসড়া', icon: Package, tone: 'neutral' },
  pending_approval: { label: 'approval দরকার', icon: Sparkles, tone: 'warning' },
  approved: { label: 'approved', icon: CheckCircle2, tone: 'success' },
  placed: { label: 'নতুন', icon: Package, tone: 'info' },
  shipped: { label: 'কুরিয়ারে', icon: Truck, tone: 'warning' },
  delivered: { label: 'ডেলিভারড', icon: CheckCircle2, tone: 'success' },
  returned: { label: 'ফেরত', icon: AlertCircle, tone: 'danger' },
  canceled: { label: 'বাতিল', icon: AlertCircle, tone: 'neutral' },
  rejected: { label: 'বাতিল (AI)', icon: AlertCircle, tone: 'danger' },
};

const DEFAULT_META: StatusMeta = { label: 'অর্ডার', icon: Package, tone: 'neutral' };

const TONE_BG: Record<StatusMeta['tone'], string> = {
  neutral: 'bg-neutral-100 text-neutral-600',
  primary: 'bg-primary-50 text-primary-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-sky-50 text-sky-700',
};

export default function OrdersListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => apiClient.get<{ orders: OrderListItem[] }>('/api/orders'),
  });

  const orders = data?.orders ?? [];
  const pendingCount = orders.filter((o) => o.status === 'pending_approval').length;

  return (
    <PageContainer size="wide">
      <PageHeader
        title="অর্ডার সমূহ"
        description="শেষ ৫০টি অর্ডার দেখানো হচ্ছে।"
        action={
          <Link href="/orders/new">
            <Button leftIcon={<Plus className="w-4 h-4" />}>নতুন অর্ডার</Button>
          </Link>
        }
      />

      {pendingCount > 0 && (
        <Link
          href="/orders/pending"
          className="flex items-center gap-3 mb-5 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 hover:bg-amber-50 transition-colors group"
        >
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-sm text-amber-900 flex-1">
            <strong>{pendingCount}টি অর্ডার</strong> AI নিয়েছে — approve করার অপেক্ষায়।
          </span>
          <ArrowRight className="w-4 h-4 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}

      {isLoading && (
        <Card className="p-10 text-center text-sm text-neutral-400">লোড হচ্ছে…</Card>
      )}

      {!isLoading && orders.length === 0 && (
        <EmptyState
          icon={<Package className="w-5 h-5" />}
          title="এখনও কোনো অর্ডার নেই"
          description="প্রথম অর্ডার তৈরি করুন। চ্যাট paste করে বা ম্যানুয়ালি লিখে।"
          action={
            <Link href="/orders/new">
              <Button leftIcon={<Plus className="w-4 h-4" />}>প্রথম অর্ডার তৈরি করুন</Button>
            </Link>
          }
        />
      )}

      {!isLoading && orders.length > 0 && (
        <Card className="overflow-hidden">
          {orders.map((o, idx) => {
            const meta = STATUS_META[o.status] ?? DEFAULT_META;
            const Icon = meta.icon;
            return (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 hover:bg-neutral-50/80 transition-colors group',
                  idx < orders.length - 1 && 'border-b border-neutral-100',
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                    TONE_BG[meta.tone],
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{o.customer.name}</p>
                  <p className="text-xs text-neutral-500 truncate mt-0.5">
                    {o.customer.phone ?? '—'}
                    {o.consignment
                      ? ` · ${o.consignment.courier.toUpperCase()} · ${o.consignment.trackingCode}`
                      : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-neutral-900 tabular-nums">
                    ৳ {Math.round(o.codCents / 100).toLocaleString('en-IN')}
                  </p>
                  <Badge tone={meta.tone} className="mt-1">
                    {meta.label}
                  </Badge>
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </Link>
            );
          })}
        </Card>
      )}
    </PageContainer>
  );
}
