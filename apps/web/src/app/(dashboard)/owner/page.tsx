'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, Users, Search, ArrowRight, ShieldCheck, AlertCircle, Trash2, UserPlus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { PageContainer, PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { MfaCodeModal } from '@/components/MfaCodeModal';
import { AddUserModal } from '@/components/AddUserModal';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

interface DailyCount {
  date: string;
  conversations: number;
}

interface OwnerUserRow {
  id: string;
  publicId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  storeCount: number;
  totalConversations: number;
  conversationsByDay: DailyCount[];
}

interface UsersResponse {
  users: OwnerUserRow[];
  windowDays: number;
}

interface ImpersonateResponse {
  accessToken: string;
  targetUser: {
    id: string;
    publicId: string | null;
    name: string;
    email: string | null;
    phone: string | null;
  };
  expiresInSeconds: number;
}

/** Mini sparkline — fixed-height SVG, no charting lib. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 96;
  const h = 28;
  const step = w / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden="true">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={h - (v / max) * (h - 4) - 2}
          r={v > 0 ? 1.5 : 1}
          fill={v > 0 ? 'currentColor' : '#d4d4d8'}
        />
      ))}
    </svg>
  );
}

export default function OwnerPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasRecentMfa = useAuthStore((s) => s.hasRecentMfa);
  const startImpersonation = useAuthStore((s) => s.startImpersonation);
  const toast = useToast();

  const isOwner = user?.isOwner === true;
  const mfaEnabled = user?.mfaEnabled === true;

  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !isOwner) return;
    if (!hasRecentMfa()) {
      setMfaModalOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/owner/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setMfaModalOpen(true);
        return;
      }
      const body = (await res.json()) as UsersResponse & { message?: string };
      if (!res.ok) {
        setError(body.message ?? 'Could not load users.');
        return;
      }
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOwner]);

  useEffect(() => {
    if (token && isOwner && mfaEnabled) load();
  }, [token, isOwner, mfaEnabled, load]);

  async function impersonate(target: OwnerUserRow) {
    if (!token || !target.publicId) return;
    if (target.isOwner) {
      toast('Cannot impersonate another admin.', false);
      return;
    }
    if (!confirm(`Open ${target.name}'s settings to configure their account? You will only see their settings page; their inbox, orders and conversations stay private. Every action is logged.`)) return;
    try {
      const res = await fetch(`/api/owner/users/${target.publicId}/impersonate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setMfaModalOpen(true);
        return;
      }
      const body = (await res.json()) as ImpersonateResponse & { message?: string };
      if (!res.ok) {
        toast(body.message ?? 'Impersonation failed.', false);
        return;
      }
      startImpersonation(body.targetUser, body.accessToken);
      // Admin only configures the user's settings — send them straight there.
      router.push('/settings');
    } catch (e) {
      toast((e as Error).message, false);
    }
  }

  async function deleteUser(target: OwnerUserRow) {
    if (!token || !target.publicId) return;
    if (target.isOwner) {
      toast('Cannot delete another admin.', false);
      return;
    }
    const confirmed = confirm(
      `Delete ${target.name} (${target.publicId})? This is permanent — their stores, products, conversations, and orders will all be removed. There is no undo.`,
    );
    if (!confirmed) return;
    setDeleting(target.publicId);
    try {
      const res = await fetch(`/api/owner/users/${target.publicId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setMfaModalOpen(true);
        return;
      }
      const body = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) {
        toast(body.message ?? 'Delete failed.', false);
        return;
      }
      toast(`${target.name} deleted.`);
      void load();
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setDeleting(null);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.includes(q)) ||
        (u.publicId && u.publicId.toLowerCase().includes(q)),
    );
  }, [data, query]);

  if (!isOwner) {
    return (
      <PageContainer>
        <PageHeader title="Admin panel" description="This area is for the platform admin." />
        <Card>
          <CardBody className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900">Admin access required</p>
              <p className="text-xs text-neutral-600 mt-1">
                Only the configured platform admin can view this page. Sign in at{' '}
                <code className="font-mono text-[11px] bg-neutral-100 px-1 py-0.5 rounded">/login/admin-p</code>.
              </p>
            </div>
          </CardBody>
        </Card>
      </PageContainer>
    );
  }

  if (!mfaEnabled) {
    return (
      <PageContainer>
        <PageHeader title="Admin panel" description="Enable 2FA before continuing." />
        <Card>
          <CardBody className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900">2FA required</p>
              <p className="text-xs text-neutral-600 mt-1">
                Enable two-factor authentication in <a href="/settings" className="text-primary-600 hover:underline">Settings</a> first. Owner actions require a recent verification.
              </p>
            </div>
          </CardBody>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" /> Admin panel
          </span>
        }
        description="All users on this BoxBazar deployment, with their recent conversation activity. Click a row to open the user's settings for configuration (their private data stays hidden)."
        action={
          <div className="flex items-center gap-2">
            <Badge tone="warning" dot>
              {data ? `${data.users.length} users` : '—'}
            </Badge>
            <Button
              size="sm"
              onClick={() => setAddModalOpen(true)}
              leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            >
              Add user
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardBody className="py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, phone, or public ID…"
              className="pl-9"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-neutral-500" />
              Users + last-7-day activity
            </span>
          }
          description={`Window: ${data?.windowDays ?? 7} days. Click a row to enter that user's dashboard as them.`}
        />
        <CardBody className="p-0">
          {error && (
            <div className="mx-5 my-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {loading && !data && (
            <div className="px-5 py-10 text-center text-sm text-neutral-500">Loading…</div>
          )}
          {data && filtered.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-neutral-500">
              {data.users.length === 0 ? 'No users yet.' : 'No users match this search.'}
            </div>
          )}
          {filtered.length > 0 && (
            <div className="divide-y divide-neutral-100">
              {filtered.map((u) => {
                const sparkValues = u.conversationsByDay.map((d) => d.conversations);
                const todayCount = sparkValues[sparkValues.length - 1] ?? 0;
                const rowDisabled = u.isOwner;
                return (
                  <div
                    key={u.id}
                    className={cn(
                      'flex items-center gap-4 px-5 py-3 hover:bg-neutral-50 transition-colors group',
                      rowDisabled && 'opacity-60',
                    )}
                  >
                    {/* The main click target opens impersonation; trash sits outside it so the nested-button warning doesn't fire. */}
                    <button
                      type="button"
                      onClick={() => impersonate(u)}
                      disabled={rowDisabled}
                      className={cn(
                        'flex-1 min-w-0 text-left flex items-center gap-4',
                        rowDisabled && 'cursor-not-allowed',
                      )}
                    >
                      {/* Public ID chip */}
                      <div className="w-14 flex-shrink-0">
                        <div className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-primary-50 text-primary-700 font-mono text-xs tracking-wide">
                          {u.publicId ?? '----'}
                        </div>
                      </div>
                      {/* Identity */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-neutral-900 truncate">{u.name}</p>
                          {u.isOwner && <Badge tone="warning">admin</Badge>}
                          {u.isAdmin && !u.isOwner && <Badge tone="primary">staff admin</Badge>}
                        </div>
                        <p className="text-[11px] text-neutral-500 truncate">
                          {u.email ?? u.phone ?? 'no contact on file'}
                        </p>
                      </div>
                      {/* Stores */}
                      <div className="w-20 text-center flex-shrink-0">
                        <div className="text-sm font-medium text-neutral-900 tabular-nums">{u.storeCount}</div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500">stores</div>
                      </div>
                      {/* Today */}
                      <div className="w-20 text-center flex-shrink-0">
                        <div className={cn('text-sm font-medium tabular-nums', todayCount > 0 ? 'text-emerald-600' : 'text-neutral-400')}>
                          {todayCount}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500">today</div>
                      </div>
                      {/* 7-day total */}
                      <div className="w-20 text-center flex-shrink-0">
                        <div className="text-sm font-medium text-neutral-900 tabular-nums">{u.totalConversations}</div>
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500">7-day</div>
                      </div>
                      {/* Sparkline */}
                      <div className="flex-shrink-0 text-primary-500">
                        <Sparkline values={sparkValues} />
                      </div>
                      {/* Arrow */}
                      <ArrowRight className="w-4 h-4 text-neutral-300 group-hover:text-primary-500 flex-shrink-0" />
                    </button>
                    {/* Delete — only for non-admin users */}
                    {!u.isOwner && (
                      <button
                        type="button"
                        onClick={() => deleteUser(u)}
                        disabled={deleting === u.publicId}
                        title={`Delete ${u.name}`}
                        aria-label={`Delete ${u.name}`}
                        className="p-1.5 text-neutral-300 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <MfaCodeModal
        open={mfaModalOpen}
        purpose="challenge"
        onSuccess={() => {
          setMfaModalOpen(false);
          void load();
        }}
        onClose={() => setMfaModalOpen(false)}
      />
      <AddUserModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onCreated={(u) => {
          setAddModalOpen(false);
          toast(`${u.name} created (public ID ${u.publicId ?? '----'}).`);
          void load();
        }}
      />
    </PageContainer>
  );
}
