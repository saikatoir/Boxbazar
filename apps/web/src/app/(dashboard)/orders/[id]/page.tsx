'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Truck,
  Download,
  Share2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth';
import { shareLink } from '@/lib/share';

type Courier = 'steadfast' | 'pathao' | 'redx';

type OrderDetail = {
  id: string;
  status: 'draft' | 'placed' | 'shipped' | 'delivered' | 'returned' | 'canceled';
  storeId: string;
  codCents: number;
  subtotalCents: number;
  deliveryCents: number;
  items: Array<{ name: string; quantity: number; unitPriceCents: number }>;
  notes: string | null;
  customer: {
    name: string;
    phone: string;
    addressHistory: Array<{
      addressLine?: string;
      city?: string;
      zone?: string;
      area?: string;
    }>;
  };
  consignment: {
    id: string;
    courier: Courier;
    trackingCode: string;
    invoiceId: string;
    currentStatus: string;
    courierEvents: Array<{
      id: string;
      status: string;
      occurredAt: string;
      source: 'webhook' | 'poll';
    }>;
  } | null;
};

type CourierAccount = {
  id: string;
  courier: Courier;
  status: 'active' | 'invalid' | 'rate_limited';
  lastBalanceAmount: number | null;
  lastBalanceCheckedAt: string | null;
};

const COURIER_META: Record<Courier, { label: string; tag: string }> = {
  steadfast: { label: 'Steadfast', tag: 'সহজ ও স্থিতিশীল' },
  pathao: { label: 'Pathao', tag: 'দ্রুত ডেলিভারি' },
  redx: { label: 'RedX', tag: 'কম খরচ' },
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [chosenCourier, setChosenCourier] = useState<Courier | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => apiClient.get<{ order: OrderDetail }>(`/api/orders/${orderId}`),
    enabled: !!orderId,
  });

  const order = orderQuery.data?.order;

  const accountsQuery = useQuery({
    queryKey: ['courier-accounts', order?.storeId],
    queryFn: () =>
      apiClient.get<{ accounts: CourierAccount[] }>(
        `/api/stores/${order!.storeId}/couriers`
      ),
    enabled: !!order?.storeId,
  });

  const dispatch = useMutation({
    mutationFn: async (courier: Courier) =>
      apiClient.post<{
        consignment: {
          id: string;
          trackingCode: string;
          labelUrl: string;
          trackingUrl: string;
        };
      }>(`/api/orders/${orderId}/dispatch`, { courier }),
    onSuccess: () => {
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  if (orderQuery.isLoading) {
    return <div className="p-8 text-gray-400">লোড হচ্ছে…</div>;
  }
  if (!order) {
    return <div className="p-8 text-gray-500">অর্ডার পাওয়া যায়নি।</div>;
  }

  const latest = order.customer.addressHistory[0] ?? {};
  const accounts = accountsQuery.data?.accounts ?? [];
  const accountByCourier: Record<Courier, CourierAccount | undefined> = {
    steadfast: accounts.find((a) => a.courier === 'steadfast'),
    pathao: accounts.find((a) => a.courier === 'pathao'),
    redx: accounts.find((a) => a.courier === 'redx'),
  };

  const isDispatched = !!order.consignment;
  const codTaka = Math.round(order.codCents / 100);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        সব অর্ডার
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">
              {order.customer.name}
            </h1>
            <p className="text-sm text-gray-500">{order.customer.phone}</p>
            <p className="text-sm text-gray-700 mt-2">
              {[latest.addressLine, latest.area, latest.zone, latest.city]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-500">COD</p>
            <p className="text-2xl font-bold text-gray-900">
              ৳ {codTaka.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Items</p>
          <ul className="space-y-1 text-sm">
            {order.items.map((it, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <span className="text-gray-800">
                  {it.quantity} × {it.name}
                </span>
                <span className="text-gray-500">
                  ৳ {Math.round((it.unitPriceCents * it.quantity) / 100)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {!isDispatched && (
        <section className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">
            কুরিয়ার নির্বাচন করুন
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            যে কুরিয়ার সবচেয়ে ভালো সেটি বেছে নিয়ে এক ক্লিকে dispatch করুন।
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(Object.keys(COURIER_META) as Courier[]).map((c) => {
              const meta = COURIER_META[c];
              const acct = accountByCourier[c];
              const ready = !!acct && acct.status === 'active';
              const selected = chosenCourier === c;
              return (
                <button
                  key={c}
                  disabled={!ready}
                  onClick={() => setChosenCourier(c)}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    !ready
                      ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : selected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-gray-900">{meta.label}</p>
                    {ready ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{meta.tag}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {ready
                      ? acct?.lastBalanceAmount != null
                        ? `Balance: ৳ ${Math.round(
                            acct.lastBalanceAmount / 100
                          ).toLocaleString('en-IN')}`
                        : 'Connected'
                      : 'Settings → add credentials'}
                  </p>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => chosenCourier && dispatch.mutate(chosenCourier)}
            disabled={!chosenCourier || dispatch.isPending}
            className="mt-5 inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {dispatch.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Truck className="w-4 h-4" />
            )}
            Book {chosenCourier ? COURIER_META[chosenCourier].label : ''}
          </button>
        </section>
      )}

      {isDispatched && order.consignment && (
        <DispatchedView
          orderId={order.id}
          consignment={order.consignment}
          customerName={order.customer.name}
          token={token}
        />
      )}
    </div>
  );
}

function DispatchedView({
  orderId: _orderId,
  consignment,
  customerName,
  token,
}: {
  orderId: string;
  consignment: NonNullable<OrderDetail['consignment']>;
  customerName: string;
  token: string | null;
}) {
  const courierLabel = COURIER_META[consignment.courier].label;
  const trackingUrl = buildTrackingUrl(consignment.courier, consignment.trackingCode);
  const labelHref = labelDownloadUrl(consignment.id);

  async function handleDownload() {
    try {
      const res = await fetch(labelHref, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${consignment.invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`লেবেল ডাউনলোড করতে সমস্যা হয়েছে: ${(err as Error).message}`);
    }
  }

  async function handleShare() {
    await shareLink({
      title: 'আপনার অর্ডার পাঠিয়ে দেওয়া হয়েছে',
      text: `${customerName} আপনার অর্ডারটি ${courierLabel}-এ বুক করা হয়েছে। Tracking: ${consignment.trackingCode}`,
      url: trackingUrl,
    });
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle2 className="w-5 h-5 text-green-600" />
        <h2 className="text-sm font-semibold text-gray-900">
          {courierLabel}-এ dispatch হয়েছে
        </h2>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm mb-5">
        <div>
          <dt className="text-xs text-gray-500">Tracking</dt>
          <dd className="font-mono text-gray-900">{consignment.trackingCode}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Invoice</dt>
          <dd className="font-mono text-gray-900">{consignment.invoiceId}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-gray-500">বর্তমান স্ট্যাটাস</dt>
          <dd className="text-gray-900">{consignment.currentStatus}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Download className="w-4 h-4" />
          লেবেল ডাউনলোড
        </button>
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          <Share2 className="w-4 h-4" />
          গ্রাহকের সাথে share করুন
        </button>
        <a
          href={trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          <ExternalLink className="w-4 h-4" />
          কুরিয়ার সাইটে
        </a>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          History
        </h3>
        {consignment.courierEvents.length === 0 ? (
          <p className="text-sm text-gray-400">এখনও কোনো ইভেন্ট আসেনি</p>
        ) : (
          <ul className="space-y-2">
            {consignment.courierEvents.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-800">{ev.status}</span>
                <span className="text-xs text-gray-400">
                  {new Date(ev.occurredAt).toLocaleString('bn-BD')} ·{' '}
                  {ev.source === 'webhook' ? 'live' : 'poll'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function labelDownloadUrl(consignmentId: string): string {
  const base = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  return `${base}/api/consignments/${consignmentId}/label.pdf`;
}

function buildTrackingUrl(courier: Courier, code: string): string {
  switch (courier) {
    case 'steadfast':
      return `https://steadfast.com.bd/t/${code}`;
    case 'pathao':
      return `https://merchant.pathao.com/tracking?consignment_id=${code}`;
    case 'redx':
      return `https://redx.com.bd/track-parcel/?trackingId=${code}`;
  }
}
