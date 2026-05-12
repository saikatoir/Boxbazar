'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bot,
  BotOff,
  Send,
  Loader2,
  AlertTriangle,
  CheckCheck,
  Package,
  Paperclip,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { STATE_META, HANDOFF_LABELS, ORDER_STATUS_LABELS, type ConvState } from '@/lib/conv-meta';

type Source = 'customer' | 'ai' | 'seller';

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  source: Source;
  text: string | null;
  attachments: Array<{ type: string; url: string | null }>;
  aiConfidence: number | null;
  aiIntentClassification: { intent?: string; confidence?: number } | null;
  metaMessageId: string | null;
  createdAt: string;
}

interface HandoffFlag {
  id: string;
  reason: string;
  detail: string | null;
  resolved: boolean;
  createdAt: string;
}

interface RelatedOrder {
  id: string;
  status: string;
  source: 'ai' | 'manual';
  subtotalCents: number;
  deliveryCents: number;
  codCents: number;
  items: Array<{ name?: string; productName?: string; quantity?: number }>;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  state: ConvState;
  channel: string;
  aiEnabled: boolean;
  lastAiActionAt: string | null;
  customer: { id: string; name: string; phone: string | null; messengerPsid: string | null };
  messages: Message[];
  handoffFlags: HandoffFlag[];
  orders: RelatedOrder[];
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('bn-BD', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => apiClient.get<{ conversation: ConversationDetail }>(`/api/conversations/${id}`),
    enabled: !!id,
    refetchInterval: 8000,
  });
  const convo = data?.conversation;

  const messageCount = convo?.messages.length ?? 0;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messageCount]);

  const sendMsg = useMutation({
    mutationFn: (text: string) => apiClient.post(`/api/conversations/${id}/messages`, { text }),
    onSuccess: () => {
      setDraft('');
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const toggleAi = useMutation({
    mutationFn: (aiEnabled: boolean) => apiClient.patch(`/api/conversations/${id}`, { aiEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const resolveHandoffs = useMutation({
    mutationFn: () => apiClient.post(`/api/conversations/${id}/resolve-handoffs`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  if (isLoading) return <div className="p-8 text-gray-400">লোড হচ্ছে…</div>;
  if (!convo) return <div className="p-8 text-gray-500">কথোপকথন পাওয়া যায়নি।</div>;

  const unresolved = convo.handoffFlags.filter((f) => !f.resolved);
  const stateMeta = STATE_META[convo.state] ?? { label: convo.state, cls: 'bg-gray-100 text-gray-600' };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 md:px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <Link href="/inbox" className="text-gray-400 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 truncate">{convo.customer.name}</p>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${stateMeta.cls}`}>{stateMeta.label}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">
            {convo.customer.phone ?? 'ফোন নম্বর নেই'} · {convo.channel}
          </p>
        </div>
        <button
          onClick={() => toggleAi.mutate(!convo.aiEnabled)}
          disabled={toggleAi.isPending}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            convo.aiEnabled
              ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
          }`}
          title={convo.aiEnabled ? 'এই কথোপকথনে AI বন্ধ করুন' : 'এই কথোপকথনে AI চালু করুন'}
        >
          {convo.aiEnabled ? <Bot className="w-4 h-4" /> : <BotOff className="w-4 h-4" />}
          {convo.aiEnabled ? 'AI চালু' : 'AI বন্ধ'}
        </button>
      </div>

      {/* Handoff banner */}
      {unresolved.length > 0 && (
        <div className="bg-red-50 border-b border-red-100 px-4 md:px-6 py-3 flex items-start gap-3 flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-red-800">
            <p className="font-medium">এই কথোপকথন আপনার নজর দরকার:</p>
            <ul className="mt-1 space-y-0.5">
              {unresolved.map((f) => (
                <li key={f.id} className="text-red-700">
                  • {HANDOFF_LABELS[f.reason] ?? f.reason}
                  {f.detail ? <span className="text-red-500"> — {f.detail}</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => resolveHandoffs.mutate()}
            disabled={resolveHandoffs.isPending}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-100 flex-shrink-0"
          >
            সব সমাধান হয়েছে
          </button>
        </div>
      )}

      {/* Related orders */}
      {convo.orders.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex gap-2 overflow-x-auto flex-shrink-0">
          {convo.orders.map((o) => {
            const meta = ORDER_STATUS_LABELS[o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-600' };
            const href = o.status === 'pending_approval' ? '/orders/pending' : `/orders/${o.id}`;
            return (
              <Link
                key={o.id}
                href={href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-blue-300 text-sm flex-shrink-0"
              >
                <Package className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">৳{Math.round(o.codCents / 100).toLocaleString('en-IN')}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 px-4 md:px-6 py-4 space-y-3">
        {convo.messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">এখনও কোনো বার্তা নেই।</p>
        )}
        {convo.messages.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}
      </div>

      {/* Reply box */}
      <div className="border-t border-gray-200 bg-white px-4 md:px-6 py-3 flex-shrink-0">
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
        {convo.aiEnabled && (
          <p className="text-[11px] text-amber-600 mb-1.5">
            AI চালু আছে — নিজে handle করতে চাইলে উপরে “AI বন্ধ” করুন।
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (t) sendMsg.mutate(t);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const t = draft.trim();
                if (t) sendMsg.mutate(t);
              }
            }}
            rows={2}
            placeholder="গ্রাহককে বার্তা লিখুন…"
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sendMsg.isPending}
            className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendMsg.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            পাঠান
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const isInbound = m.direction === 'inbound';
  const align = isInbound ? 'items-start' : 'items-end';
  const bubble = isInbound
    ? 'bg-white border border-gray-200 text-gray-800'
    : m.source === 'ai'
    ? 'bg-blue-600 text-white'
    : 'bg-green-600 text-white';
  const sourceLabel = isInbound ? 'গ্রাহক' : m.source === 'ai' ? 'AI' : 'আপনি';
  const conf = m.aiConfidence ?? m.aiIntentClassification?.confidence;

  return (
    <div className={`flex flex-col ${align}`}>
      <div className={`max-w-[80%] md:max-w-[65%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${bubble}`}>
        {m.text || <span className="opacity-70 italic">[সংযুক্তি]</span>}
        {m.attachments?.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {m.attachments.map((a, i) =>
              a.url ? (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1 text-xs underline ${isInbound ? 'text-blue-600' : 'text-white/90'}`}
                >
                  <Paperclip className="w-3 h-3" /> {a.type}
                </a>
              ) : (
                <span key={i} className="text-xs opacity-70 flex items-center gap-1">
                  <Paperclip className="w-3 h-3" /> {a.type}
                </span>
              ),
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-gray-400">
        <span>{sourceLabel}</span>
        {m.source === 'ai' && typeof conf === 'number' && <span>· {Math.round(conf * 100)}%</span>}
        <span>· {fmtTime(m.createdAt)}</span>
        {!isInbound && m.metaMessageId && <CheckCheck className="w-3 h-3 text-gray-300" />}
      </div>
    </div>
  );
}
