'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  ClipboardPaste,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { readClipboardText } from '@/lib/clipboard';

type ParsedItem = {
  name: string;
  quantity: number;
  unitPriceCents: number;
};

type ParsedChat = {
  recipientName: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  zone: string | null;
  area: string | null;
  items: ParsedItem[];
  subtotalCents: number | null;
  deliveryCents: number | null;
  codCents: number | null;
  notes: string | null;
};

type FieldConfidence = {
  overall: number;
  fields: {
    recipientName: number;
    phone: number;
    address: number;
    items: number;
    codAmount: number;
  };
};

type ParseResponse = {
  parsed: ParsedChat;
  confidence: FieldConfidence;
  source: 'cache' | 'gemini' | 'heuristic';
};

type Stage = 'paste' | 'review' | 'saved';

function ConfidenceChip({ score }: { score: number }) {
  if (score >= 0.75) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        নির্ভরযোগ্য
      </span>
    );
  }
  if (score >= 0.4) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
        <AlertCircle className="w-3.5 h-3.5" />
        একটু যাচাই করুন
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
      <AlertCircle className="w-3.5 h-3.5" />
      নিজে পূরণ করুন
    </span>
  );
}

function toTaka(cents: number | null | undefined): string {
  if (cents == null) return '';
  return String(Math.round(cents / 100));
}

function fromTaka(value: string): number {
  const n = Number(String(value).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export default function NewOrderPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('paste');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedChat | null>(null);
  const [confidence, setConfidence] = useState<FieldConfidence | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parseMutation = useMutation({
    mutationFn: async (text: string) =>
      apiClient.post<ParseResponse>('/api/chat-parse', { text }),
    onSuccess: (data) => {
      setParsed(data.parsed);
      setConfidence(data.confidence);
      setStage('review');
      setErrorMsg(null);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: async (payload: unknown) =>
      apiClient.post<{ order: { id: string } }>('/api/orders', payload),
    onSuccess: (data) => {
      setSavedAt(new Date());
      setSavedOrderId(data.order.id);
      setStage('saved');
      setErrorMsg(null);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  async function handlePasteFromClipboard() {
    try {
      const t = await readClipboardText();
      if (t) setRawText(t);
    } catch (err) {
      setErrorMsg('Clipboard পড়া যায়নি — সরাসরি paste করুন।');
    }
  }

  function handleParse() {
    if (rawText.trim().length < 5) {
      setErrorMsg('কমপক্ষে কিছু চ্যাট-টেক্সট দিন।');
      return;
    }
    parseMutation.mutate(rawText);
  }

  function handleSave() {
    if (!parsed) return;
    if (!parsed.recipientName || !parsed.phone || !parsed.addressLine || !parsed.city) {
      setErrorMsg('নাম, ফোন, ঠিকানা ও শহর — চারটিই দরকার।');
      return;
    }
    if (!parsed.items.length) {
      setErrorMsg('কমপক্ষে একটি item দিন।');
      return;
    }
    const subtotalCents =
      parsed.subtotalCents ??
      parsed.items.reduce(
        (sum, it) => sum + it.unitPriceCents * Math.max(1, it.quantity),
        0
      );
    const deliveryCents = parsed.deliveryCents ?? 0;
    const codCents = parsed.codCents ?? subtotalCents + deliveryCents;

    saveMutation.mutate({
      customer: {
        name: parsed.recipientName,
        phone: parsed.phone,
        addressLine: parsed.addressLine,
        city: parsed.city,
        zone: parsed.zone ?? '',
        area: parsed.area ?? '',
      },
      items: parsed.items,
      subtotalCents,
      deliveryCents,
      codCents,
      notes: parsed.notes ?? undefined,
      sourceChat: rawText,
      parsedConfidence: confidence,
    });
  }

  function updateField<K extends keyof ParsedChat>(key: K, value: ParsedChat[K]) {
    if (!parsed) return;
    setParsed({ ...parsed, [key]: value });
  }

  function updateItem(idx: number, patch: Partial<ParsedItem>) {
    if (!parsed) return;
    const items = parsed.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setParsed({ ...parsed, items });
  }

  function addItem() {
    if (!parsed) return;
    setParsed({
      ...parsed,
      items: [...parsed.items, { name: '', quantity: 1, unitPriceCents: 0 }],
    });
  }

  function removeItem(idx: number) {
    if (!parsed) return;
    setParsed({ ...parsed, items: parsed.items.filter((_, i) => i !== idx) });
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        ড্যাশবোর্ডে ফিরুন
      </Link>

      {stage === 'paste' && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            চ্যাট থেকে অর্ডার তৈরি করুন
          </h1>
          <p className="text-gray-500 mb-6">
            Messenger বা WhatsApp চ্যাটের অংশটুকু paste করুন — আমরা automatically
            customer-র নাম, ফোন, ঠিকানা, item এবং COD বের করে দেব।
          </p>

          {errorMsg && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <label
                htmlFor="chat-text"
                className="text-sm font-medium text-gray-700"
              >
                চ্যাটের অংশ
              </label>
              <button
                onClick={handlePasteFromClipboard}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                <ClipboardPaste className="w-4 h-4" />
                Clipboard থেকে paste
              </button>
            </div>
            <textarea
              id="chat-text"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`উদাহরণ:\nনাম: রহিমা আক্তার\n01712345678\nমিরপুর ১০, ঢাকা — বাড়ি ১২, রোড ৪\n১ x শাড়ি — ১২০০ টাকা\nডেলিভারি ৬০ টাকা\nমোট ১২৬০`}
              className="w-full h-56 md:h-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {rawText.length}/৫০০০ অক্ষর
              </p>
              <button
                onClick={handleParse}
                disabled={parseMutation.isPending || rawText.trim().length < 5}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {parseMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                পার্স করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'review' && parsed && confidence && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            যাচাই করে save করুন
          </h1>
          <p className="text-gray-500 mb-4">
            ভুল কিছু থাকলে এখনই ঠিক করুন। সব ফিল্ড edit-able।
          </p>

          {errorMsg && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="space-y-6">
            <section className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                গ্রাহকের তথ্য
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="নাম"
                  score={confidence.fields.recipientName}
                  value={parsed.recipientName ?? ''}
                  onChange={(v) => updateField('recipientName', v)}
                />
                <Field
                  label="ফোন (01XXXXXXXXX)"
                  score={confidence.fields.phone}
                  value={parsed.phone ?? ''}
                  onChange={(v) => updateField('phone', v)}
                />
                <Field
                  label="ঠিকানা"
                  score={confidence.fields.address}
                  value={parsed.addressLine ?? ''}
                  onChange={(v) => updateField('addressLine', v)}
                  fullWidth
                />
                <Field
                  label="জেলা / শহর"
                  score={confidence.fields.address}
                  value={parsed.city ?? ''}
                  onChange={(v) => updateField('city', v)}
                />
                <Field
                  label="থানা / উপজেলা"
                  score={confidence.fields.address}
                  value={parsed.zone ?? ''}
                  onChange={(v) => updateField('zone', v)}
                />
                <Field
                  label="এলাকা / সেক্টর"
                  score={confidence.fields.address}
                  value={parsed.area ?? ''}
                  onChange={(v) => updateField('area', v)}
                  fullWidth
                />
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  Item সমূহ
                </h2>
                <ConfidenceChip score={confidence.fields.items} />
              </div>
              <div className="space-y-3">
                {parsed.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-end"
                  >
                    <div className="col-span-12 md:col-span-6">
                      <label className="text-xs text-gray-500">নাম</label>
                      <input
                        value={it.name}
                        onChange={(e) =>
                          updateItem(idx, { name: e.target.value })
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-xs text-gray-500">পরিমাণ</label>
                      <input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(idx, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <label className="text-xs text-gray-500">দাম (৳)</label>
                      <input
                        type="number"
                        min={0}
                        value={toTaka(it.unitPriceCents)}
                        onChange={(e) =>
                          updateItem(idx, {
                            unitPriceCents: fromTaka(e.target.value),
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <button
                        onClick={() => removeItem(idx)}
                        className="w-full rounded-md border border-red-200 text-red-600 px-2 py-1.5 text-xs hover:bg-red-50"
                      >
                        মুছুন
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addItem}
                  className="text-sm text-blue-700 hover:text-blue-800 font-medium"
                >
                  + আরেকটি item
                </button>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  মূল্য (৳)
                </h2>
                <ConfidenceChip score={confidence.fields.codAmount} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MoneyField
                  label="সাব-টোটাল"
                  value={parsed.subtotalCents}
                  onChange={(v) => updateField('subtotalCents', v)}
                />
                <MoneyField
                  label="ডেলিভারি"
                  value={parsed.deliveryCents}
                  onChange={(v) => updateField('deliveryCents', v)}
                />
                <MoneyField
                  label="COD মোট"
                  value={parsed.codCents}
                  onChange={(v) => updateField('codCents', v)}
                />
              </div>
            </section>

            <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3">
              <button
                onClick={() => setStage('paste')}
                className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                আবার paste করুন
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Save করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'saved' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            অর্ডার save হয়েছে!
          </h2>
          <p className="text-gray-500 mb-2">
            হাতে লিখে ৪–৫ মিনিট সময় বাঁচল। 🎉
          </p>
          {savedAt && (
            <p className="text-xs text-gray-400 mb-6">
              {savedAt.toLocaleTimeString('bn-BD')}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                setRawText('');
                setParsed(null);
                setConfidence(null);
                setSavedOrderId(null);
                setStage('paste');
              }}
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              আরেকটি অর্ডার
            </button>
            {savedOrderId && (
              <button
                onClick={() => router.push(`/orders/${savedOrderId}`)}
                className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                কুরিয়ারে dispatch করুন
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ড্যাশবোর্ডে
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  score,
  fullWidth,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  score: number;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-500">{label}</label>
        <ConfidenceChip score={score} />
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input
        type="number"
        min={0}
        value={value == null ? '' : toTaka(value)}
        onChange={(e) => {
          if (e.target.value === '') onChange(null);
          else onChange(fromTaka(e.target.value));
        }}
        className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}
