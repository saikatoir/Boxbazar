'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

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
    fields: [
      { key: 'api_token', label: 'API Token', placeholder: 'RedX Bearer Token' },
    ],
  },
] as const;

type CourierValue = typeof COURIERS[number]['value'];

interface CourierAccount {
  id: string;
  courier: CourierValue;
  status: 'active' | 'invalid' | 'rate_limited';
  lastBalanceCheckedAt: string | null;
  lastBalanceAmount: number | null;
}

interface Store {
  id: string;
  name: string;
  category: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  invalid: 'bg-red-100 text-red-700',
  rate_limited: 'bg-yellow-100 text-yellow-700',
};

const statusLabels: Record<string, string> = {
  active: 'সংযুক্ত',
  invalid: 'অবৈধ কী',
  rate_limited: 'সীমা অতিক্রান্ত',
};

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400';

export default function SettingsPage() {
  const { token } = useAuthStore();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<CourierAccount[]>([]);
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; balance?: number; error?: string }>>({});
  const [flash, setFlash] = useState<string | null>(null);

  const authHeader = { Authorization: `Bearer ${token}` };

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

  useEffect(() => {
    if (!selectedStore) return;
    fetch(`/api/stores/${selectedStore}/couriers`, { headers: authHeader })
      .then((r) => r.json())
      .then((d: { accounts: CourierAccount[] }) => setAccounts(d.accounts))
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore]);

  function getAccount(c: CourierValue) {
    return accounts.find((a) => a.courier === c);
  }

  function handleCredChange(courier: string, key: string, value: string) {
    setCredentials((prev) => ({
      ...prev,
      [courier]: { ...(prev[courier] ?? {}), [key]: value },
    }));
  }

  async function saveCourier(courier: CourierValue) {
    if (!selectedStore) return;
    const creds = credentials[courier];
    if (!creds || Object.keys(creds).length === 0) return;

    setSaving((p) => ({ ...p, [courier]: true }));
    try {
      const res = await fetch(`/api/stores/${selectedStore}/couriers/${courier}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(creds),
      });
      if (!res.ok) throw new Error();
      setFlash('সংরক্ষিত হয়েছে');
      setTimeout(() => setFlash(null), 3000);
      // Refresh accounts
      const updated = await fetch(`/api/stores/${selectedStore}/couriers`, { headers: authHeader })
        .then((r) => r.json()) as { accounts: CourierAccount[] };
      setAccounts(updated.accounts);
      setCredentials((p) => ({ ...p, [courier]: {} }));
    } catch {
      setFlash('সংরক্ষণ ব্যর্থ হয়েছে');
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setSaving((p) => ({ ...p, [courier]: false }));
    }
  }

  async function testCourier(courier: CourierValue) {
    if (!selectedStore) return;
    setTesting((p) => ({ ...p, [courier]: true }));
    setTestResult((p) => ({ ...p, [courier]: { ok: false } }));
    try {
      const res = await fetch(`/api/stores/${selectedStore}/couriers/${courier}/test`, {
        method: 'POST',
        headers: authHeader,
      });
      const body = (await res.json()) as { ok?: boolean; balance?: number; message?: string };
      setTestResult((p) => ({
        ...p,
        [courier]: res.ok ? { ok: true, balance: body.balance } : { ok: false, error: body.message },
      }));
    } catch {
      setTestResult((p) => ({ ...p, [courier]: { ok: false, error: 'সংযোগ ব্যর্থ' } }));
    } finally {
      setTesting((p) => ({ ...p, [courier]: false }));
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Flash */}
      {flash && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {flash}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">সেটিংস</h1>
        <p className="text-gray-500 text-sm mt-1">কুরিয়ার API সংযোগ পরিচালনা করুন</p>
      </div>

      {/* Store selector */}
      {stores.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">দোকান</label>
          <select
            value={selectedStore ?? ''}
            onChange={(e) => setSelectedStore(e.target.value)}
            className={inputCls}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Courier cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">কুরিয়ার সংযোগ</h2>

        {COURIERS.map((courier) => {
          const account = getAccount(courier.value);
          const creds = credentials[courier.value] ?? {};
          const result = testResult[courier.value];
          const hasChanges = Object.values(creds).some((v) => v.length > 0);

          return (
            <div key={courier.value} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">{courier.label}</h3>
                  {account ? (
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-1 ${statusColors[account.status]}`}>
                      {account.status === 'active' && '●'} {statusLabels[account.status]}
                    </span>
                  ) : (
                    <span className="inline-flex text-xs px-2 py-0.5 rounded-full mt-1 bg-gray-100 text-gray-500">
                      সংযুক্ত নেই
                    </span>
                  )}
                </div>
                {account && (
                  <button
                    type="button"
                    disabled={testing[courier.value]}
                    onClick={() => testCourier(courier.value)}
                    className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {testing[courier.value] ? 'পরীক্ষা হচ্ছে...' : 'সংযোগ পরীক্ষা করুন'}
                  </button>
                )}
              </div>

              {/* Balance / test result */}
              {account?.lastBalanceAmount != null && (
                <p className="text-sm text-gray-500">
                  সর্বশেষ ব্যালেন্স: <span className="font-medium text-gray-800">৳{(account.lastBalanceAmount / 100).toFixed(2)}</span>
                </p>
              )}
              {result && (
                <p className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
                  {result.ok ? `✓ সংযুক্ত — ব্যালেন্স: ৳${(result.balance ?? 0).toFixed(2)}` : `✗ ${result.error ?? 'সংযোগ ব্যর্থ'}`}
                </p>
              )}

              {/* Credential fields */}
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  {account ? 'নতুন কী দিয়ে আপডেট করুন' : 'API কী যোগ করুন'}
                </p>
                {courier.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                    <input
                      type="password"
                      placeholder={account ? '••••••••••• (অপরিবর্তিত রাখতে খালি রাখুন)' : field.placeholder}
                      value={creds[field.key] ?? ''}
                      onChange={(e) => handleCredChange(courier.value, field.key, e.target.value)}
                      className={inputCls}
                    />
                  </div>
                ))}
                {hasChanges && (
                  <button
                    type="button"
                    disabled={saving[courier.value]}
                    onClick={() => saveCourier(courier.value)}
                    className="mt-1 w-full py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving[courier.value] ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
