'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Package, Pencil, X, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { PageContainer, PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Label, Select, Textarea, FieldHint } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

const STOCK_OPTIONS = [
  { value: 'in_stock', label: 'স্টকে আছে' },
  { value: 'low_stock', label: 'অল্প স্টক' },
  { value: 'out_of_stock', label: 'স্টক শেষ' },
] as const;

const STOCK_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  in_stock: { label: 'স্টকে আছে', tone: 'success' },
  low_stock: { label: 'অল্প স্টক', tone: 'warning' },
  out_of_stock: { label: 'স্টক শেষ', tone: 'danger' },
};

interface Product {
  id: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  floorPriceCents: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  photoUrl: string | null;
  keywords: string[];
  active: boolean;
}

interface Store {
  id: string;
  name: string;
}

const MIN_PRODUCTS_FOR_AI = 5;

type FormState = {
  name: string;
  description: string;
  basePrice: string;
  floorPrice: string;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  photoUrl: string;
  keywords: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  basePrice: '',
  floorPrice: '',
  stockStatus: 'in_stock',
  photoUrl: '',
  keywords: '',
};

export default function ProductsPage() {
  const { token } = useAuthStore();
  const authHeader = { Authorization: `Bearer ${token}` };
  const toast = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/stores', { headers: authHeader })
      .then((r) => r.json())
      .then((d: { stores: Store[] }) => {
        setStores(d.stores);
        setStoreId(d.stores[0]?.id ?? null);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProducts = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    fetch(`/api/stores/${storeId}/products`, { headers: authHeader })
      .then((r) => r.json())
      .then((d: { products: Product[] }) => setProducts(d.products ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(p: Product) {
    setForm({
      name: p.name,
      description: p.description ?? '',
      basePrice: (p.basePriceCents / 100).toString(),
      floorPrice:
        p.floorPriceCents !== p.basePriceCents ? (p.floorPriceCents / 100).toString() : '',
      stockStatus: p.stockStatus,
      photoUrl: p.photoUrl ?? '',
      keywords: p.keywords.join(', '),
    });
    setEditing(p);
    setCreating(true);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  async function submitForm() {
    if (!storeId) return;
    const name = form.name.trim();
    if (!name) {
      toast('পণ্যের নাম দিন।', false);
      return;
    }
    const base = Math.round(parseFloat(form.basePrice || '0') * 100);
    if (!Number.isFinite(base) || base <= 0) {
      toast('সঠিক দাম দিন।', false);
      return;
    }
    const floorRaw = form.floorPrice.trim();
    const floor = floorRaw ? Math.round(parseFloat(floorRaw) * 100) : undefined;
    if (floor !== undefined && (floor < 0 || floor > base)) {
      toast('ফ্লোর প্রাইস দামের চেয়ে বেশি হতে পারবে না।', false);
      return;
    }
    const keywords = form.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 50);

    const payload = {
      name,
      description: form.description.trim() || undefined,
      basePriceCents: base,
      floorPriceCents: floor,
      stockStatus: form.stockStatus,
      photoUrl: form.photoUrl.trim() || undefined,
      keywords,
    };

    setSaving(true);
    try {
      const url = editing ? `/api/products/${editing.id}` : `/api/stores/${storeId}/products`;
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? 'সংরক্ষণ ব্যর্থ হয়েছে।');
      toast(editing ? 'পণ্য আপডেট হয়েছে।' : 'পণ্য যোগ হয়েছে।');
      closeForm();
      loadProducts();
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Product) {
    try {
      if (p.active) {
        const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE', headers: authHeader });
        if (!res.ok) throw new Error('বন্ধ করা যায়নি।');
        toast('পণ্য নিষ্ক্রিয় করা হয়েছে।');
      } else {
        const res = await fetch(`/api/products/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ active: true }),
        });
        if (!res.ok) throw new Error('চালু করা যায়নি।');
        toast('পণ্য সক্রিয় করা হয়েছে।');
      }
      loadProducts();
    } catch (e) {
      toast((e as Error).message, false);
    }
  }

  const activeCount = products.filter((p) => p.active).length;
  const enough = activeCount >= MIN_PRODUCTS_FOR_AI;

  return (
    <PageContainer size="wide">
      <PageHeader
        title="পণ্য তালিকা"
        description="AI রিসেপশনিস্ট এই পণ্যগুলো গ্রাহকদের দেখাবে এবং অর্ডার নেবে।"
        action={
          <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
            নতুন পণ্য
          </Button>
        }
      />

      {stores.length > 1 && (
        <div className="mb-5 max-w-xs">
          <Label>দোকান</Label>
          <Select value={storeId ?? ''} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* AI-readiness banner */}
      <Card
        className={cn(
          'mb-5 px-5 py-3.5 flex items-center gap-3',
          enough ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40',
        )}
      >
        <CheckCircle2
          className={cn('w-5 h-5 flex-shrink-0', enough ? 'text-emerald-600' : 'text-amber-500')}
        />
        <div className="flex-1 text-sm">
          সক্রিয় পণ্য{' '}
          <strong className="text-neutral-900">
            {activeCount}/{MIN_PRODUCTS_FOR_AI}
          </strong>{' '}
          {enough ? (
            <span className="text-emerald-800">
              — যথেষ্ট।{' '}
              <Link href="/settings" className="font-medium underline underline-offset-2">
                সেটিংস থেকে AI চালু করুন
              </Link>
              ।
            </span>
          ) : (
            <span className="text-amber-800">
              — AI চালু করতে আরও <strong>{MIN_PRODUCTS_FOR_AI - activeCount}টি</strong> সক্রিয় পণ্য
              দরকার।
            </span>
          )}
        </div>
      </Card>

      {loading && (
        <Card className="p-10 text-center text-sm text-neutral-400">লোড হচ্ছে…</Card>
      )}

      {!loading && products.length === 0 && (
        <EmptyState
          icon={<Package className="w-5 h-5" />}
          title="এখনও কোনো পণ্য নেই"
          description="প্রথম পণ্য যোগ করুন। AI চালু করতে অন্তত ৫টি পণ্য দরকার।"
          action={
            <Button onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
              প্রথম পণ্য যোগ করুন
            </Button>
          }
        />
      )}

      {!loading && products.length > 0 && (
        <Card className="overflow-hidden">
          {products.map((p, idx) => {
            const stock = STOCK_META[p.stockStatus]!;
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 group',
                  idx < products.length - 1 && 'border-b border-neutral-100',
                  !p.active && 'opacity-60',
                )}
              >
                <div className="w-11 h-11 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-neutral-200">
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-5 h-5 text-neutral-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-900 truncate">{p.name}</p>
                    <Badge tone={stock.tone} dot>
                      {stock.label}
                    </Badge>
                    {!p.active && <Badge tone="neutral">নিষ্ক্রিয়</Badge>}
                  </div>
                  <p className="text-xs text-neutral-500 truncate mt-0.5">
                    {p.keywords.length > 0 ? p.keywords.slice(0, 5).join(' · ') : '—'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-neutral-900 tabular-nums">
                    ৳ {Math.round(p.basePriceCents / 100).toLocaleString('en-IN')}
                  </p>
                  {p.floorPriceCents !== p.basePriceCents && (
                    <p className="text-[11px] text-neutral-400 tabular-nums">
                      ফ্লোর ৳ {Math.round(p.floorPriceCents / 100).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(p)}
                    title="সম্পাদনা"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={p.active ? 'ghost' : 'secondary'}
                    size="sm"
                    onClick={() => toggleActive(p)}
                    className={p.active ? 'text-neutral-500 hover:text-red-600 hover:bg-red-50' : ''}
                  >
                    {p.active ? 'নিষ্ক্রিয়' : 'সক্রিয় করুন'}
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={closeForm}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-neutral-900">
                {editing ? 'পণ্য সম্পাদনা' : 'নতুন পণ্য'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <Label required>নাম</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="যেমন: কটন থ্রি-পিস"
                />
              </div>

              <div>
                <Label>বিবরণ</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="রঙ, সাইজ, কাপড় ইত্যাদি"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label required>দাম (৳)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.basePrice}
                    onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>সর্বনিম্ন দাম (৳)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.floorPrice}
                    onChange={(e) => setForm((f) => ({ ...f, floorPrice: e.target.value }))}
                    placeholder="ডিসকাউন্ট সীমা (ঐচ্ছিক)"
                  />
                </div>
              </div>

              <div>
                <Label>স্টক</Label>
                <Select
                  value={form.stockStatus}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, stockStatus: e.target.value as FormState['stockStatus'] }))
                  }
                >
                  {STOCK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>ছবির URL</Label>
                <Input
                  value={form.photoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div>
                <Label>কীওয়ার্ড</Label>
                <Input
                  value={form.keywords}
                  onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                  placeholder="থ্রি-পিস, ঈদ, কটন"
                />
                <FieldHint>কমা দিয়ে আলাদা করুন। গ্রাহক এই শব্দগুলো লিখলে AI এই পণ্য দেখাবে।</FieldHint>
              </div>
            </div>

            <div className="flex gap-2 p-5 border-t border-neutral-100 sticky bottom-0 bg-white">
              <Button variant="secondary" className="flex-1" onClick={closeForm}>
                বাতিল
              </Button>
              <Button className="flex-1" onClick={submitForm} loading={saving}>
                {editing ? 'আপডেট' : 'যোগ করুন'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
