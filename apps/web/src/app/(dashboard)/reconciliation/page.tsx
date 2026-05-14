'use client';

import { Wallet, Clock } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ReconciliationPage() {
  return (
    <PageContainer>
      <PageHeader
        title="কুরিয়ার পেমেন্ট"
        description="কুরিয়ার থেকে কত টাকা পাবেন, কতটা মিলেছে, কতটা বকেয়া — এক জায়গায়।"
      />
      <EmptyState
        icon={<Clock className="w-5 h-5" />}
        title="শীঘ্রই আসছে"
        description="COD reconciliation feature নির্মাণাধীন। Steadfast/Pathao/RedX-এর settlement রিপোর্ট import করে অর্ডারের সাথে মিলিয়ে দেবে।"
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
            <Wallet className="w-3.5 h-3.5" /> Phase 2 roadmap
          </span>
        }
      />
    </PageContainer>
  );
}
