'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  ClipboardPaste,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { readClipboardText } from '@/lib/clipboard';
import { PageContainer } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

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
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full ring-1 ring-inset ring-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        নির্ভরযোগ্য
      </span>
    );
  }
  if (score >= 0.4) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full ring-1 ring-inset ring-amber-200">
        <AlertCircle className="w-3 h-3" />
        একটু যাচাই করুন
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full ring-1 ring-inset ring-red-200">
      <AlertCircle className="w-3 h-3" />
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
    <PageContainer>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        ড্যাশবোর্ডে ফিরুন
      </Link>

      {stage === 'paste' && (
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900 mb-1">
            চ্যাট থেকে অর্ডার তৈরি করুন
          </h1>
          <p className="text-sm text-neutral-500 mb-5">
            Messenger বা WhatsApp চ্যাটের অংশটুকু paste করুন — নাম, ফোন, ঠিকানা, item ও COD
            automatically বের হয়ে আসবে।
          </p>

          {errorMsg && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-3">
                <label htmlFor="chat-text" className="text-sm font-medium text-neutral-700">
                  চ্যাটের অংশ
                </label>
                <button
                  onClick={handlePasteFromClipboard}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:text-primary-800"
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
                className="w-full h-56 md:h-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-y placeholder:text-neutral-400"
              />
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-neutral-400 tabular-nums">{rawText.length}/৫০০০ অক্ষর</p>
                <Button
                  size="lg"
                  onClick={handleParse}
                  disabled={rawText.trim().length < 5}
                  loading={parseMutation.isPending}
                  leftIcon={!parseMutation.isPending && <Sparkles className="w-4 h-4" />}
                >
                  পার্স করুন
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {stage === 'review' && parsed && confidence && (
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900 mb-1">
            যাচাই করে save করুন
          </h1>
          <p className="text-sm text-neutral-500 mb-5">
            ভুল কিছু থাকলে এখনই ঠিক করুন। সব ফিল্ড edit-able।
          </p>

          {errorMsg && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="space-y-5">
            <Card>
              <CardHeader title="গ্রাহকের তথ্য" />
              <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Item সমূহ"
                action={<ConfidenceChip score={confidence.fields.items} />}
              />
              <CardBody className="space-y-3">
                {parsed.items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-6">
                      <label className="text-xs font-medium text-neutral-700 mb-1 block">নাম</label>
                      <Input
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-xs font-medium text-neutral-700 mb-1 block">পরিমাণ</label>
                      <Input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(idx, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <label className="text-xs font-medium text-neutral-700 mb-1 block">দাম (৳)</label>
                      <Input
                        type="number"
                        min={0}
                        value={toTaka(it.unitPriceCents)}
                        onChange={(e) =>
                          updateItem(idx, { unitPriceCents: fromTaka(e.target.value) })
                        }
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <button
                        onClick={() => removeItem(idx)}
                        className="w-full h-9 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50 transition-colors"
                      >
                        মুছুন
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addItem}
                  className="text-sm text-primary-700 hover:text-primary-800 font-medium"
                >
                  + আরেকটি item
                </button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="মূল্য (৳)"
                action={<ConfidenceChip score={confidence.fields.codAmount} />}
              />
              <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              </CardBody>
            </Card>

            <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3">
              <Button variant="secondary" onClick={() => setStage('paste')}>
                আবার paste করুন
              </Button>
              <Button
                size="lg"
                onClick={handleSave}
                loading={saveMutation.isPending}
                leftIcon={!saveMutation.isPending && <CheckCircle2 className="w-4 h-4" />}
              >
                Save করুন
              </Button>
            </div>
          </div>
        </div>
      )}

      {stage === 'saved' && (
        <Card className="p-10 text-center">
          <div className="mx-auto w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-4 ring-4 ring-emerald-100/50">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-1">অর্ডার save হয়েছে! 🎉</h2>
          <p className="text-sm text-neutral-500 mb-2">হাতে লিখে ৪–৫ মিনিট সময় বাঁচল।</p>
          {savedAt && (
            <p className="text-xs text-neutral-400 mb-6">{savedAt.toLocaleTimeString('bn-BD')}</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setRawText('');
                setParsed(null);
                setConfidence(null);
                setSavedOrderId(null);
                setStage('paste');
              }}
            >
              আরেকটি অর্ডার
            </Button>
            {savedOrderId && (
              <Button onClick={() => router.push(`/orders/${savedOrderId}`)}>
                কুরিয়ারে dispatch করুন
              </Button>
            )}
            <Button variant="secondary" onClick={() => router.push('/dashboard')}>
              ড্যাশবোর্ডে
            </Button>
          </div>
        </Card>
      )}
    </PageContainer>
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
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-neutral-700">{label}</label>
        <ConfidenceChip score={score} />
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
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
      <label className="text-xs font-medium text-neutral-700 mb-1.5 block">{label}</label>
      <Input
        type="number"
        min={0}
        value={value == null ? '' : toTaka(value)}
        onChange={(e) => {
          if (e.target.value === '') onChange(null);
          else onChange(fromTaka(e.target.value));
        }}
      />
    </div>
  );
}
