'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, AlertTriangle, Bot, BotOff, Filter } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useCurrentStore } from '@/lib/use-store';
import { STATE_META, timeAgoBn, type ConvState } from '@/lib/conv-meta';

interface ConversationRow {
  id: string;
  state: ConvState;
  channel: 'messenger' | 'instagram' | 'whatsapp';
  aiEnabled: boolean;
  lastMessageAt: string | null;
  customer: { id: string; name: string; phone: string | null };
  lastMessage: { direction: 'inbound' | 'outbound'; source: 'customer' | 'ai' | 'seller'; text: string | null; createdAt: string } | null;
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
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ইনবক্স</h1>
          <p className="text-gray-500 text-sm">AI receptionist যেসব কথোপকথন সামলাচ্ছে</p>
        </div>
        <button
          onClick={() => setNeedsAttention((v) => !v)}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            needsAttention ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-4 h-4" />
          {needsAttention ? 'শুধু attention দরকার' : 'সব দেখাও'}
        </button>
      </div>

      {(storeLoading || isLoading) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-400 text-sm">লোড হচ্ছে…</div>
      )}

      {!storeLoading && !isLoading && conversations.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <MessageSquare className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">
            {needsAttention ? 'attention দরকার এমন কথোপকথন নেই 🎉' : 'এখনও কোনো কথোপকথন নেই'}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Facebook page connect করে AI চালু করলে নতুন কথোপকথন এখানে দেখা যাবে।
          </p>
        </div>
      )}

      {conversations.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
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
                className={`flex items-center gap-4 px-4 md:px-5 py-4 hover:bg-gray-50 transition-colors ${
                  idx < conversations.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-gray-600">
                  {c.customer.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.customer.name}</p>
                    {!c.aiEnabled && (
                      <span title="এই কথোপকথনে AI বন্ধ">
                        <BotOff className="w-3.5 h-3.5 text-gray-400" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {prefix}
                    {preview}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <p className="text-[11px] text-gray-400">{timeAgoBn(c.lastMessageAt)}</p>
                  <div className="flex items-center justify-end gap-1.5">
                    {c.unresolvedHandoffs > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">
                        <AlertTriangle className="w-3 h-3" />
                        {c.unresolvedHandoffs}
                      </span>
                    )}
                    <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-4 flex items-center gap-1">
        <Bot className="w-3.5 h-3.5" /> প্রতি ১৫ সেকেন্ডে নিজে থেকে রিফ্রেশ হয়।
      </p>
    </div>
  );
}
