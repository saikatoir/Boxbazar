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
  AlertTriangle,
  CheckCheck,
  Package,
  Paperclip,
  Star,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  STATE_META,
  HANDOFF_LABELS,
  ORDER_STATUS_LABELS,
  type ConvState,
} from '@/lib/conv-meta';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

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
  useAsExample: boolean;
  lastAiActionAt: string | null;
  customer: { id: string; name: string; phone: string | null; messengerPsid: string | null };
  messages: Message[];
  handoffFlags: HandoffFlag[];
  orders: RelatedOrder[];
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('bn-BD', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
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

  // Toggle "use this conversation as a few-shot example for the AI."
  // The seller stars conversations that show their preferred voice; those
  // get injected into the system prompt so the AI mimics that style.
  const toggleExample = useMutation({
    mutationFn: (useAsExample: boolean) =>
      apiClient.patch(`/api/conversations/${id}`, { useAsExample }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
    },
  });

  const resolveHandoffs = useMutation({
    mutationFn: () => apiClient.post(`/api/conversations/${id}/resolve-handoffs`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  if (isLoading) return <div className="p-8 text-neutral-400 text-sm">লোড হচ্ছে…</div>;
  if (!convo) return <div className="p-8 text-neutral-500 text-sm">কথোপকথন পাওয়া যায়নি।</div>;

  const unresolved = convo.handoffFlags.filter((f) => !f.resolved);
  const stateMeta = STATE_META[convo.state] ?? { label: convo.state, cls: 'bg-neutral-100 text-neutral-600' };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white px-4 md:px-6 py-3 flex items-center gap-3 flex-shrink-0">
        <Link
          href="/inbox"
          className="text-neutral-400 hover:text-neutral-700 p-1 -ml-1 rounded-md hover:bg-neutral-100"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-neutral-600 ring-1 ring-neutral-200">
          {convo.customer.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-neutral-900 truncate">{convo.customer.name}</p>
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full', stateMeta.cls)}>
              {stateMeta.label}
            </span>
          </div>
          <p className="text-xs text-neutral-500 truncate mt-0.5">
            {convo.customer.phone ?? 'ফোন নম্বর নেই'} · {convo.channel}
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggleExample.mutate(!convo.useAsExample)}
          disabled={toggleExample.isPending}
          title={
            convo.useAsExample
              ? 'AI কে এই কথোপকথন থেকে শেখানো বন্ধ করুন'
              : 'AI কে এই কথোপকথন থেকে আপনার ভাষার ধরন শেখান (training example হিসেবে যোগ করুন)'
          }
          aria-label="Toggle example for AI training"
          className={cn(
            'p-1.5 rounded-md transition-colors flex-shrink-0',
            convo.useAsExample
              ? 'text-amber-500 hover:bg-amber-50'
              : 'text-neutral-300 hover:text-amber-500 hover:bg-amber-50',
          )}
        >
          <Star
            className="w-4 h-4"
            fill={convo.useAsExample ? 'currentColor' : 'none'}
            strokeWidth={2}
          />
        </button>
        <Button
          variant={convo.aiEnabled ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => toggleAi.mutate(!convo.aiEnabled)}
          loading={toggleAi.isPending}
          leftIcon={
            convo.aiEnabled ? <Bot className="w-3.5 h-3.5" /> : <BotOff className="w-3.5 h-3.5" />
          }
          title={convo.aiEnabled ? 'এই কথোপকথনে AI বন্ধ করুন' : 'এই কথোপকথনে AI চালু করুন'}
        >
          {convo.aiEnabled ? 'AI চালু' : 'AI বন্ধ'}
        </Button>
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => resolveHandoffs.mutate()}
            loading={resolveHandoffs.isPending}
            className="bg-white border-red-200 text-red-700 hover:bg-red-100"
          >
            সব সমাধান হয়েছে
          </Button>
        </div>
      )}

      {/* Related orders */}
      {convo.orders.length > 0 && (
        <div className="bg-white border-b border-neutral-100 px-4 md:px-6 py-3 flex gap-2 overflow-x-auto flex-shrink-0">
          {convo.orders.map((o) => {
            const meta =
              ORDER_STATUS_LABELS[o.status] ?? { label: o.status, cls: 'bg-neutral-100 text-neutral-600' };
            const href = o.status === 'pending_approval' ? '/orders/pending' : `/orders/${o.id}`;
            return (
              <Link
                key={o.id}
                href={href}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 hover:border-primary-300 hover:bg-primary-50/30 text-sm flex-shrink-0 transition-colors"
              >
                <Package className="w-4 h-4 text-neutral-400" />
                <span className="text-neutral-700 tabular-nums">
                  ৳{Math.round(o.codCents / 100).toLocaleString('en-IN')}
                </span>
                <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full', meta.cls)}>
                  {meta.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-neutral-50 px-4 md:px-6 py-5 space-y-3"
      >
        {convo.messages.length === 0 && (
          <p className="text-center text-sm text-neutral-400 py-8">এখনও কোনো বার্তা নেই।</p>
        )}
        {convo.messages.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}
      </div>

      {/* Reply box */}
      <div className="border-t border-neutral-200 bg-white px-4 md:px-6 py-3 flex-shrink-0">
        {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
        {convo.aiEnabled && (
          <p className="text-[11px] text-amber-700 mb-1.5 flex items-center gap-1">
            <Bot className="w-3 h-3" />
            AI চালু আছে — নিজে handle করতে চাইলে উপরে "AI বন্ধ" করুন।
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
            className="flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 placeholder:text-neutral-400"
          />
          <Button
            type="submit"
            size="lg"
            disabled={!draft.trim()}
            loading={sendMsg.isPending}
            leftIcon={!sendMsg.isPending && <Send className="w-4 h-4" />}
          >
            পাঠান
          </Button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const isInbound = m.direction === 'inbound';
  const align = isInbound ? 'items-start' : 'items-end';
  const bubble = isInbound
    ? 'bg-white border border-neutral-200 text-neutral-800 shadow-sm'
    : m.source === 'ai'
      ? 'bg-primary-600 text-white shadow-sm'
      : 'bg-emerald-600 text-white shadow-sm';
  const sourceLabel = isInbound ? 'গ্রাহক' : m.source === 'ai' ? 'AI' : 'আপনি';
  const conf = m.aiConfidence ?? m.aiIntentClassification?.confidence;

  return (
    <div className={cn('flex flex-col', align)}>
      <div
        className={cn(
          'max-w-[80%] md:max-w-[65%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words',
          isInbound ? 'rounded-tl-md' : 'rounded-tr-md',
          bubble,
        )}
      >
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
                  className={cn(
                    'flex items-center gap-1 text-xs underline',
                    isInbound ? 'text-primary-700' : 'text-white/90',
                  )}
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
      <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-neutral-400">
        <span>{sourceLabel}</span>
        {m.source === 'ai' && typeof conf === 'number' && <span>· {Math.round(conf * 100)}%</span>}
        <span>· {fmtTime(m.createdAt)}</span>
        {!isInbound && m.metaMessageId && <CheckCheck className="w-3 h-3 text-neutral-300" />}
      </div>
    </div>
  );
}
