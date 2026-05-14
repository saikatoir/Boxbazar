'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, AlertTriangle, Bot, BotOff, Filter } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useCurrentStore } from '@/lib/use-store';
import { STATE_META, timeAgoBn, type ConvState } from '@/lib/conv-meta';
import { PageContainer, PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface ConversationRow {
  id: string;
  state: ConvState;
  channel: 'messenger' | 'instagram' | 'whatsapp';
  aiEnabled: boolean;
  lastMessageAt: string | null;
  customer: { id: string; name: string; phone: string | null };
  lastMessage: {
    direction: 'inbound' | 'outbound';
    source: 'customer' | 'ai' | 'seller';
    text: string | null;
    createdAt: string;
  } | null;
  unresolvedHandoffs: number;
}

export default function InboxPage() {
  const { storeId, isLoading: storeLoading } = useCurrentStore();
  const [needsAttention, setNeedsAttention] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', storeId, needsAttention],
    queryFn: () =>
      apiClient.get<{ conversations: ConversationRow[] }>(
        `/api/stores/${storeId}/conversations${needsAttention ? '?needsAttention=true' : ''}`,
      ),
    enabled: !!storeId,
    refetchInterval: 15000,
  });

  const conversations = data?.conversations ?? [];

  return (
    <PageContainer size="wide">
      <PageHeader
        title="ইনবক্স"
        description="AI রিসেপশনিস্ট যেসব কথোপকথন সামলাচ্ছে।"
        action={
          <Button
            variant={needsAttention ? 'danger' : 'secondary'}
            size="sm"
            leftIcon={<Filter className="w-3.5 h-3.5" />}
            onClick={() => setNeedsAttention((v) => !v)}
          >
            {needsAttention ? 'শুধু attention দরকার' : 'সব দেখাও'}
          </Button>
        }
      />

      {(storeLoading || isLoading) && (
        <Card className="p-10 text-center text-sm text-neutral-400">লোড হচ্ছে…</Card>
      )}

      {!storeLoading && !isLoading && conversations.length === 0 && (
        <EmptyState
          icon={<MessageSquare className="w-5 h-5" />}
          title={needsAttention ? 'attention দরকার এমন কথোপকথন নেই 🎉' : 'এখনও কোনো কথোপকথন নেই'}
          description="Facebook page connect করে AI চালু করলে নতুন কথোপকথন এখানে দেখা যাবে।"
        />
      )}

      {conversations.length > 0 && (
        <Card className="overflow-hidden">
          {conversations.map((c, idx) => {
            const meta = STATE_META[c.state];
            const preview =
              c.lastMessage?.text ?? (c.lastMessage ? '[ছবি / সংযুক্তি]' : 'কোনো বার্তা নেই');
            const prefix =
              c.lastMessage?.direction === 'outbound'
                ? c.lastMessage.source === 'ai'
                  ? 'AI: '
                  : 'আপনি: '
                : '';
            return (
              <Link
                key={c.id}
                href={`/inbox/${c.id}`}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 hover:bg-neutral-50/80 transition-colors',
                  idx < conversations.length - 1 && 'border-b border-neutral-100',
                )}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-neutral-600 ring-1 ring-neutral-200">
                  {c.customer.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {c.customer.name}
                    </p>
                    {!c.aiEnabled && (
                      <span title="এই কথোপকথনে AI বন্ধ">
                        <BotOff className="w-3.5 h-3.5 text-neutral-400" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 truncate mt-0.5">
                    {prefix}
                    {preview}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <p className="text-[11px] text-neutral-400">{timeAgoBn(c.lastMessageAt)}</p>
                  <div className="flex items-center justify-end gap-1.5">
                    {c.unresolvedHandoffs > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">
                        <AlertTriangle className="w-3 h-3" />
                        {c.unresolvedHandoffs}
                      </span>
                    )}
                    <span className={cn('inline-block text-[11px] px-2 py-0.5 rounded-full', meta.cls)}>
                      {meta.label}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </Card>
      )}

      <p className="text-[11px] text-neutral-400 mt-4 flex items-center gap-1.5">
        <Bot className="w-3.5 h-3.5" /> প্রতি ১৫ সেকেন্ডে নিজে থেকে রিফ্রেশ হয়।
      </p>
    </PageContainer>
  );
}
