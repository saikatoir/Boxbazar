'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Facebook,
  Sparkles,
  Truck,
  CheckCircle2,
  ExternalLink,
  Power,
  RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { PageContainer, PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Label, Select, Textarea, FieldHint } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

/* ---------------------------------------------------------------- couriers */

const COURIERS = [
  {
    value: 'steadfast',
    label: 'Steadfast (Packzy)',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'আপনার Steadfast API Key' },
      { key: 'secret_key', label: 'Secret Key', placeholder: 'আপনার Steadfast Secret Key' },
    ],
  },
  {
    value: 'pathao',
    label: 'Pathao Courier',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'Pathao OAuth Client ID' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Pathao OAuth Client Secret' },
    ],
  },
  {
    value: 'redx',
    label: 'RedX',
    fields: [{ key: 'api_token', label: 'API Token', placeholder: 'RedX Bearer Token' }],
  },
] as const;

type CourierValue = (typeof COURIERS)[number]['value'];

interface CourierAccount {
  id: string;
  courier: CourierValue;
  status: 'active' | 'invalid' | 'rate_limited';
  lastBalanceCheckedAt: string | null;
  lastBalanceAmount: number | null;
}

/* ------------------------------------------------------------------- types */

interface Store {
  id: string;
  name: string;
  category: string;
}

const TONE_PROFILES = [
  { value: 'formal_apu', label: 'ফরমাল আপু (Formal Apu)' },
  { value: 'casual_apu', label: 'ক্যাজুয়াল আপু (Casual Apu)' },
  { value: 'friendly_bhai', label: 'ফ্রেন্ডলি ভাই (Friendly Bhai)' },
] as const;

interface AiSettings {
  store: {
    id: string;
    name: string;
    facebook: { pageId: string; pageName: string | null; connectedAt: string | null } | null;
    ai: { enabled: boolean; toneProfile: string; disclosureFooterEnabled: boolean };
    deliveryChargeInsideDhakaCents: number;
    deliveryChargeOutsideDhakaCents: number;
    workingHoursStart: string | null;
    workingHoursEnd: string | null;
    returnPolicyText: string | null;
  };
  productCount: number;
  minProductsForAi: number;
}

interface FbPage {
  id: string;
  name: string;
  category: string | null;
}

/* -------------------------------------------------------------------- page */

export default function SettingsPage() {
  const { token } = useAuthStore();
  const authHeader = { Authorization: `Bearer ${token}` };
  const toast = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/stores', { headers: authHeader })
      .then((r) => r.json())
      .then((d: { stores: Store[] }) => {
        setStores(d.stores);
        if (d.stores.length > 0) setSelectedStore(d.stores[0]?.id ?? null);
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="সেটিংস"
        description="Meta (Facebook), AI রিসেপশনিস্ট ও কুরিয়ার API একসাথে এখানে।"
      />

      {stores.length > 1 && (
        <div className="mb-6 max-w-xs">
          <Label>দোকান</Label>
          <Select
            value={selectedStore ?? ''}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {selectedStore && (
        <div className="space-y-6">
          <FacebookCard storeId={selectedStore} authHeader={authHeader} onFlash={toast} />
          <AiReceptionistCard storeId={selectedStore} authHeader={authHeader} onFlash={toast} />
          <CourierSection storeId={selectedStore} authHeader={authHeader} onFlash={toast} />
        </div>
      )}
    </PageContainer>
  );
}

/* ----------------------------------------------------------- shared helpers */

type FlashFn = (text: string, ok?: boolean) => void;

function useAiSettings(storeId: string, authHeader: Record<string, string>) {
  const [data, setData] = useState<AiSettings | null>(null);
  const load = useCallback(() => {
    fetch(`/api/stores/${storeId}/ai-settings`, { headers: authHeader })
      .then((r) => r.json())
      .then((d: AiSettings) => setData(d))
      .catch(console.error);
  }, [storeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [load]);
  return { data, reload: load };
}

/* --------------------------------------------------------- Facebook card */

function FacebookCard({
  storeId,
  authHeader,
  onFlash,
}: {
  storeId: string;
  authHeader: Record<string, string>;
  onFlash: FlashFn;
}) {
  const { data, reload } = useAiSettings(storeId, authHeader);

  const [userToken, setUserToken] = useState('');
  const [pages, setPages] = useState<FbPage[] | null>(null);
  const [pickedPage, setPickedPage] = useState<string | null>(null);
  const [fetchingPages, setFetchingPages] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function fetchPages() {
    if (userToken.trim().length < 10) {
      onFlash('সঠিক Facebook User Access Token দিন।', false);
      return;
    }
    setFetchingPages(true);
    setPages(null);
    setPickedPage(null);
    try {
      const res = await fetch('/api/facebook/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ userAccessToken: userToken.trim() }),
      });
      const body = (await res.json()) as { pages?: FbPage[]; message?: string };
      if (!res.ok) throw new Error(body.message ?? 'পেজ আনা যায়নি।');
      setPages(body.pages ?? []);
      if ((body.pages ?? []).length === 1) setPickedPage(body.pages![0]!.id);
    } catch (e) {
      onFlash((e as Error).message, false);
    } finally {
      setFetchingPages(false);
    }
  }

  async function connectPage() {
    if (!pickedPage) return;
    setConnecting(true);
    try {
      const res = await fetch(`/api/stores/${storeId}/connect-facebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ userAccessToken: userToken.trim(), pageId: pickedPage }),
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? 'সংযোগ ব্যর্থ হয়েছে।');
      onFlash('Facebook পেজ সংযুক্ত হয়েছে।');
      setUserToken('');
      setPages(null);
      setPickedPage(null);
      reload();
    } catch (e) {
      onFlash((e as Error).message, false);
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectPage() {
    if (!confirm('Facebook পেজ সংযোগ বিচ্ছিন্ন করবেন? এতে AI রিসেপশনিস্টও বন্ধ হয়ে যাবে।')) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/stores/${storeId}/disconnect-facebook`, {
        method: 'POST',
        headers: authHeader,
      });
      if (!res.ok) throw new Error('বিচ্ছিন্ন করা যায়নি।');
      onFlash('Facebook পেজ বিচ্ছিন্ন হয়েছে।');
      reload();
    } catch (e) {
      onFlash((e as Error).message, false);
    } finally {
      setDisconnecting(false);
    }
  }

  const fb = data?.store.facebook ?? null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Facebook className="w-4 h-4 text-[#1877F2]" />
            Meta (Facebook Messenger)
          </span>
        }
        description="পেজ সংযুক্ত করুন — AI সেই পেজের ইনবক্সে গ্রাহকদের সাথে কথা বলবে।"
        action={fb && <Badge tone="success" dot>সংযুক্ত</Badge>}
      />
      <CardBody className="space-y-4">
        {fb ? (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-[#1877F2]/10 text-[#1877F2] flex items-center justify-center flex-shrink-0">
                <Facebook className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">
                  {fb.pageName ?? 'Facebook Page'}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  পেজ আইডি: <span className="font-mono">{fb.pageId}</span>
                </p>
                {fb.connectedAt && (
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {new Date(fb.connectedAt).toLocaleDateString('bn-BD')} থেকে সংযুক্ত
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={disconnectPage}
              loading={disconnecting}
              className="text-red-600 hover:bg-red-50"
            >
              সংযোগ বিচ্ছিন্ন
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-primary-50/50 border border-primary-100 px-3.5 py-3 text-xs text-primary-900">
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
              >
                Graph API Explorer <ExternalLink className="w-3 h-3" />
              </a>{' '}
              থেকে একটি User Access Token নিন (অনুমতি:{' '}
              <code className="font-mono text-[11px]">pages_show_list</code>,{' '}
              <code className="font-mono text-[11px]">pages_messaging</code>,{' '}
              <code className="font-mono text-[11px]">pages_manage_metadata</code>), নিচে পেস্ট
              করুন, তারপর পেজ বেছে নিন।
            </div>

            <div>
              <Label>Facebook User Access Token</Label>
              <Input
                type="password"
                value={userToken}
                onChange={(e) => setUserToken(e.target.value)}
                placeholder="EAAB..."
              />
            </div>

            <Button variant="secondary" onClick={fetchPages} loading={fetchingPages}>
              <RefreshCw className="w-3.5 h-3.5" /> আমার পেজগুলো দেখাও
            </Button>

            {pages && pages.length === 0 && (
              <p className="text-sm text-red-600">এই টোকেনে কোনো পেজ পাওয়া যায়নি।</p>
            )}
            {pages && pages.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-neutral-100">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  আপনার পেজ
                </p>
                <div className="space-y-1">
                  {pages.map((p) => {
                    const active = pickedPage === p.id;
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                          active
                            ? 'border-primary-300 bg-primary-50/50'
                            : 'border-neutral-200 hover:bg-neutral-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="fbpage"
                          checked={active}
                          onChange={() => setPickedPage(p.id)}
                          className="text-primary-600 focus:ring-primary-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{p.name}</p>
                          {p.category && (
                            <p className="text-xs text-neutral-500 truncate">{p.category}</p>
                          )}
                        </div>
                        {active && <CheckCircle2 className="w-4 h-4 text-primary-600" />}
                      </label>
                    );
                  })}
                </div>
                <Button
                  className="w-full mt-2"
                  onClick={connectPage}
                  disabled={!pickedPage}
                  loading={connecting}
                >
                  এই পেজ সংযুক্ত করুন
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------- AI receptionist */

function AiReceptionistCard({
  storeId,
  authHeader,
  onFlash,
}: {
  storeId: string;
  authHeader: Record<string, string>;
  onFlash: FlashFn;
}) {
  const { data, reload } = useAiSettings(storeId, authHeader);

  const [form, setForm] = useState({
    toneProfile: 'formal_apu',
    disclosureFooterEnabled: true,
    insideDhaka: '',
    outsideDhaka: '',
    workingHoursStart: '',
    workingHoursEnd: '',
    returnPolicyText: '',
  });
  const [saving, setSaving] = useState(false);
  const [togglingAi, setTogglingAi] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      toneProfile: data.store.ai.toneProfile,
      disclosureFooterEnabled: data.store.ai.disclosureFooterEnabled,
      insideDhaka: (data.store.deliveryChargeInsideDhakaCents / 100).toString(),
      outsideDhaka: (data.store.deliveryChargeOutsideDhakaCents / 100).toString(),
      workingHoursStart: data.store.workingHoursStart ?? '',
      workingHoursEnd: data.store.workingHoursEnd ?? '',
      returnPolicyText: data.store.returnPolicyText ?? '',
    });
  }, [data]);

  async function patchAi(payload: Record<string, unknown>) {
    const res = await fetch(`/api/stores/${storeId}/ai-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { message?: string };
    if (!res.ok) {
      onFlash(body.message ?? 'সংরক্ষণ ব্যর্থ হয়েছে।', false);
      return false;
    }
    return true;
  }

  async function toggleAi(enable: boolean) {
    setTogglingAi(true);
    const ok = await patchAi({ aiEnabled: enable });
    if (ok) onFlash(enable ? 'AI রিসেপশনিস্ট চালু হয়েছে।' : 'AI রিসেপশনিস্ট বন্ধ হয়েছে।');
    reload();
    setTogglingAi(false);
  }

  async function save() {
    setSaving(true);
    const toCents = (v: string) => Math.max(0, Math.round(parseFloat(v || '0') * 100)) || 0;
    const ok = await patchAi({
      aiToneProfile: form.toneProfile,
      aiDisclosureFooterEnabled: form.disclosureFooterEnabled,
      deliveryChargeInsideDhakaCents: toCents(form.insideDhaka),
      deliveryChargeOutsideDhakaCents: toCents(form.outsideDhaka),
      workingHoursStart: form.workingHoursStart || null,
      workingHoursEnd: form.workingHoursEnd || null,
      returnPolicyText: form.returnPolicyText.trim() || null,
    });
    if (ok) onFlash('AI সেটিংস সংরক্ষিত হয়েছে।');
    reload();
    setSaving(false);
  }

  const fb = data?.store.facebook ?? null;
  const aiEnabled = data?.store.ai.enabled ?? false;
  const productCount = data?.productCount ?? 0;
  const minProducts = data?.minProductsForAi ?? 5;
  const enoughProducts = productCount >= minProducts;
  const canEnableAi = !!fb && enoughProducts;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            AI রিসেপশনিস্ট
          </span>
        }
        description="টোন, ডেলিভারি, কর্মঘণ্টা ও রিটার্ন পলিসি — যা যা AI জানবে।"
        action={
          <Badge tone={aiEnabled ? 'success' : 'neutral'} dot>
            {aiEnabled ? 'চালু' : 'বন্ধ'}
          </Badge>
        }
      />
      <CardBody className="space-y-5">
        {/* Status row */}
        <div className="flex items-center justify-between gap-4 rounded-lg bg-neutral-50 border border-neutral-200/70 px-4 py-3">
          <div className="text-xs text-neutral-600 space-y-1">
            <div className="flex items-center gap-2">
              {fb ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-neutral-300 inline-block" />
              )}
              <span>Facebook পেজ {fb ? 'সংযুক্ত' : 'সংযুক্ত নয়'}</span>
            </div>
            <div className="flex items-center gap-2">
              {enoughProducts ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-neutral-300 inline-block" />
              )}
              <span>
                সক্রিয় পণ্য {productCount}/{minProducts}
              </span>
            </div>
          </div>
          {aiEnabled ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => toggleAi(false)}
              loading={togglingAi}
              leftIcon={<Power className="w-3.5 h-3.5" />}
            >
              বন্ধ করুন
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => toggleAi(true)}
              loading={togglingAi}
              disabled={!canEnableAi}
              leftIcon={<Power className="w-3.5 h-3.5" />}
              title={!canEnableAi ? 'পেজ সংযুক্ত করুন এবং অন্তত ৫টি পণ্য যোগ করুন' : undefined}
            >
              চালু করুন
            </Button>
          )}
        </div>

        {/* Tone */}
        <div>
          <Label>টোন</Label>
          <Select
            value={form.toneProfile}
            onChange={(e) => setForm((f) => ({ ...f, toneProfile: e.target.value }))}
          >
            {TONE_PROFILES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <FieldHint>AI কীভাবে গ্রাহকের সাথে কথা বলবে তা ঠিক করে।</FieldHint>
        </div>

        {/* Disclosure */}
        <label className="flex items-start gap-2.5 text-sm text-neutral-800 cursor-pointer">
          <input
            type="checkbox"
            checked={form.disclosureFooterEnabled}
            onChange={(e) =>
              setForm((f) => ({ ...f, disclosureFooterEnabled: e.target.checked }))
            }
            className="mt-0.5 rounded text-primary-600 focus:ring-primary-500"
          />
          <span>
            প্রতিটি AI বার্তার নিচে <em>"AI দ্বারা উত্তর"</em> ফুটার দেখান।
          </span>
        </label>

        {/* Delivery */}
        <div>
          <Label>ডেলিভারি চার্জ (৳)</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                type="number"
                min={0}
                value={form.insideDhaka}
                onChange={(e) => setForm((f) => ({ ...f, insideDhaka: e.target.value }))}
                placeholder="০"
              />
              <FieldHint>ঢাকার ভেতরে</FieldHint>
            </div>
            <div>
              <Input
                type="number"
                min={0}
                value={form.outsideDhaka}
                onChange={(e) => setForm((f) => ({ ...f, outsideDhaka: e.target.value }))}
                placeholder="০"
              />
              <FieldHint>ঢাকার বাইরে</FieldHint>
            </div>
          </div>
        </div>

        {/* Working hours */}
        <div>
          <Label>কর্মঘণ্টা</Label>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="time"
              value={form.workingHoursStart}
              onChange={(e) => setForm((f) => ({ ...f, workingHoursStart: e.target.value }))}
            />
            <Input
              type="time"
              value={form.workingHoursEnd}
              onChange={(e) => setForm((f) => ({ ...f, workingHoursEnd: e.target.value }))}
            />
          </div>
          <FieldHint>এই সময়ের বাইরে AI জানিয়ে দেবে কখন উত্তর আসবে।</FieldHint>
        </div>

        {/* Return policy */}
        <div>
          <Label>রিটার্ন পলিসি</Label>
          <Textarea
            rows={3}
            value={form.returnPolicyText}
            onChange={(e) => setForm((f) => ({ ...f, returnPolicyText: e.target.value }))}
            placeholder="যেমন: পণ্য হাতে পাওয়ার ৩ দিনের মধ্যে অক্ষত অবস্থায় রিটার্ন করা যাবে।"
          />
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={save} loading={saving}>
            AI সেটিংস সংরক্ষণ করুন
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------- courier cards */

const COURIER_STATUS: Record<CourierAccount['status'], { tone: 'success' | 'danger' | 'warning'; label: string }> = {
  active: { tone: 'success', label: 'সংযুক্ত' },
  invalid: { tone: 'danger', label: 'অবৈধ কী' },
  rate_limited: { tone: 'warning', label: 'সীমা অতিক্রান্ত' },
};

function CourierSection({
  storeId,
  authHeader,
  onFlash,
}: {
  storeId: string;
  authHeader: Record<string, string>;
  onFlash: FlashFn;
}) {
  const [accounts, setAccounts] = useState<CourierAccount[]>([]);
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<
    Record<string, { ok: boolean; balance?: number; error?: string }>
  >({});

  const refresh = useCallback(() => {
    fetch(`/api/stores/${storeId}/couriers`, { headers: authHeader })
      .then((r) => r.json())
      .then((d: { accounts: CourierAccount[] }) => setAccounts(d.accounts))
      .catch(console.error);
  }, [storeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
  }, [refresh]);

  function getAccount(c: CourierValue) {
    return accounts.find((a) => a.courier === c);
  }

  function handleCredChange(courier: string, key: string, value: string) {
    setCredentials((prev) => ({ ...prev, [courier]: { ...(prev[courier] ?? {}), [key]: value } }));
  }

  async function saveCourier(courier: CourierValue) {
    const creds = credentials[courier];
    if (!creds || Object.keys(creds).length === 0) return;
    setSaving((p) => ({ ...p, [courier]: true }));
    try {
      const res = await fetch(`/api/stores/${storeId}/couriers/${courier}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(creds),
      });
      if (!res.ok) throw new Error();
      onFlash('কুরিয়ার সংরক্ষিত হয়েছে।');
      refresh();
      setCredentials((p) => ({ ...p, [courier]: {} }));
    } catch {
      onFlash('সংরক্ষণ ব্যর্থ হয়েছে।', false);
    } finally {
      setSaving((p) => ({ ...p, [courier]: false }));
    }
  }

  async function testCourier(courier: CourierValue) {
    setTesting((p) => ({ ...p, [courier]: true }));
    setTestResult((p) => ({ ...p, [courier]: { ok: false } }));
    try {
      const res = await fetch(`/api/stores/${storeId}/couriers/${courier}/test`, {
        method: 'POST',
        headers: authHeader,
      });
      const body = (await res.json()) as { ok?: boolean; balance?: number; message?: string };
      setTestResult((p) => ({
        ...p,
        [courier]: res.ok ? { ok: true, balance: body.balance } : { ok: false, error: body.message },
      }));
      if (res.ok) refresh();
    } catch {
      setTestResult((p) => ({ ...p, [courier]: { ok: false, error: 'সংযোগ ব্যর্থ' } }));
    } finally {
      setTesting((p) => ({ ...p, [courier]: false }));
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-neutral-500" />
            কুরিয়ার API
          </span>
        }
        description="একাধিক কুরিয়ার যোগ করতে পারেন — অর্ডারে যেকোনোটি বেছে নিন।"
      />
      <CardBody className="space-y-3">
        {COURIERS.map((courier) => {
          const account = getAccount(courier.value);
          const creds = credentials[courier.value] ?? {};
          const result = testResult[courier.value];
          const hasChanges = Object.values(creds).some((v) => v.length > 0);
          const statusMeta = account ? COURIER_STATUS[account.status] : null;

          return (
            <div
              key={courier.value}
              className="rounded-xl border border-neutral-200/80 bg-white p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center flex-shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-neutral-900 truncate">
                      {courier.label}
                    </h3>
                    {statusMeta ? (
                      <Badge tone={statusMeta.tone} dot>
                        {statusMeta.label}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">সংযুক্ত নেই</Badge>
                    )}
                  </div>
                </div>
                {account && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => testCourier(courier.value)}
                    loading={testing[courier.value]}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    পরীক্ষা
                  </Button>
                )}
              </div>

              {account?.lastBalanceAmount != null && (
                <p className="text-xs text-neutral-500">
                  সর্বশেষ ব্যালেন্স:{' '}
                  <span className="font-medium text-neutral-900">
                    ৳{(account.lastBalanceAmount / 100).toFixed(2)}
                  </span>
                </p>
              )}
              {result && (
                <p className={`text-xs ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                  {result.ok
                    ? `✓ সংযুক্ত — ব্যালেন্স: ৳${(result.balance ?? 0).toFixed(2)}`
                    : `✗ ${result.error ?? 'সংযোগ ব্যর্থ'}`}
                </p>
              )}

              <div className="space-y-2.5 pt-2 border-t border-neutral-100">
                <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
                  {account ? 'নতুন কী দিয়ে আপডেট করুন' : 'API কী যোগ করুন'}
                </p>
                {courier.fields.map((field) => (
                  <div key={field.key}>
                    <Label>{field.label}</Label>
                    <Input
                      type="password"
                      placeholder={account ? '••••••••••• (অপরিবর্তিত রাখতে খালি রাখুন)' : field.placeholder}
                      value={creds[field.key] ?? ''}
                      onChange={(e) => handleCredChange(courier.value, field.key, e.target.value)}
                    />
                  </div>
                ))}
                {hasChanges && (
                  <Button
                    className="w-full mt-1"
                    onClick={() => saveCourier(courier.value)}
                    loading={saving[courier.value]}
                  >
                    সংরক্ষণ করুন
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
