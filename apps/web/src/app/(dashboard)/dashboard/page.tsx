'use client';

import { useEffect, useState } from 'react';
import {
  ClipboardPaste,
  Sparkles,
  CheckCircle2,
  Circle,
  ArrowRight,
  ShoppingCart,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

interface AiSettingsResp {
  store: { facebook: unknown | null; ai: { enabled: boolean } };
  productCount: number;
  minProductsForAi: number;
}

interface PlatformStatusResp {
  ready: { messengerWebhook: boolean };
  configured: { metaApp: boolean; messengerVerifyToken: boolean; gemini: boolean };
}

function SetupChecklist({ token }: { token: string | null }) {
  const [state, setState] = useState<AiSettingsResp | null>(null);
  const [platform, setPlatform] = useState<PlatformStatusResp | null>(null);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    // Lightweight readiness probe — no admin/MFA required, only booleans.
    fetch('/api/platform/config/status', { headers })
      .then((r) => r.json())
      .then((d: PlatformStatusResp) => setPlatform(d))
      .catch(console.error);
    fetch('/api/stores', { headers })
      .then((r) => r.json())
      .then((d: { stores: { id: string }[] }) => {
        const id = d.stores[0]?.id;
        if (!id) return;
        return fetch(`/api/stores/${id}/ai-settings`, { headers })
          .then((r) => r.json())
          .then((s: AiSettingsResp) => setState(s));
      })
      .catch(console.error);
  }, [token]);

  if (!state || !platform) return null;
  const platformDone = platform.ready.messengerWebhook;
  void platform.configured;
  const fbDone = !!state.store.facebook;
  const productsDone = state.productCount >= state.minProductsForAi;
  const aiDone = state.store.ai.enabled;
  if (platformDone && fbDone && productsDone && aiDone) return null;

  const steps = [
    { done: platformDone, label: 'Platform API keys (Meta App Secret + Verify Token)', href: '/platform-setup' },
    { done: fbDone, label: 'Facebook পেজ সংযুক্ত করুন', href: '/settings' },
    {
      done: productsDone,
      label: `অন্তত ${state.minProductsForAi}টি পণ্য যোগ করুন`,
      href: '/products',
      meta: `${state.productCount}/${state.minProductsForAi}`,
    },
    { done: aiDone, label: 'সেটিংস থেকে AI চালু করুন', href: '/settings' },
  ];
  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h2 className="text-sm font-semibold text-neutral-900">
              AI রিসেপশনিস্ট সেটআপ
            </h2>
            <span className="text-xs text-neutral-500">
              {completed}/{steps.length} সম্পন্ন
            </span>
          </div>
          <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-primary-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <ul className="space-y-1.5">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-sm">
                {s.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                )}
                <Link
                  href={s.href}
                  className={cn(
                    'flex-1 hover:underline underline-offset-2',
                    s.done ? 'text-neutral-400 line-through' : 'text-neutral-700',
                  )}
                >
                  {s.label}
                </Link>
                {s.meta && (
                  <span className="text-xs text-neutral-500">{s.meta}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'neutral' | 'primary' | 'success';
}) {
  const toneCls = {
    neutral: 'bg-neutral-100 text-neutral-500',
    primary: 'bg-primary-50 text-primary-600',
    success: 'bg-emerald-50 text-emerald-600',
  }[tone];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
          {label}
        </p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', toneCls)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-neutral-900">
        {value}
        {unit && <span className="text-base font-normal text-neutral-400 ml-1">{unit}</span>}
      </p>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);

  return (
    <PageContainer size="wide">
      <PageHeader
        title={`স্বাগতম${user?.name ? `, ${user.name}` : ''}`}
        description="আজকের অর্ডার এবং AI কার্যকলাপ এক নজরে দেখুন।"
      />

      <SetupChecklist token={token} />

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="আজকের অর্ডার" value="০" unit="টি" icon={ShoppingCart} tone="primary" />
        <StatCard label="মোট বকেয়া" value="০" unit="৳" icon={Wallet} tone="neutral" />
        <StatCard label="ডেলিভারি সফল" value="০%" icon={TrendingUp} tone="success" />
      </div>

      {/* Hero: paste-to-order */}
      <Link
        href="/orders/new"
        className="block group rounded-2xl border border-primary-200/70 bg-gradient-to-br from-primary-50 via-white to-white p-5 hover:border-primary-300 hover:shadow-pop transition-all"
      >
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-white border border-primary-200 text-primary-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <ClipboardPaste className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold text-neutral-900">
                চ্যাট paste করে অর্ডার তৈরি করুন
              </h2>
              <Badge tone="warning">
                <Sparkles className="w-3 h-3" /> AI
              </Badge>
            </div>
            <p className="text-sm text-neutral-600">
              Messenger বা WhatsApp চ্যাটের অংশটুকু paste করুন — নাম, ফোন, ঠিকানা ও COD
              automatically বের হয়ে আসবে।
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity self-center flex-shrink-0" />
        </div>
      </Link>
    </PageContainer>
  );
}
