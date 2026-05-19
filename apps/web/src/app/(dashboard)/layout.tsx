'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  Settings,
  LogOut,
  MessageSquare,
  Sparkles,
  Package,
  Menu,
  X,
  KeyRound,
  Crown,
  Eye,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useMe } from '@/lib/use-me';
import { cn } from '@/lib/cn';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  /** If true, hide this entry unless the current user is a platform admin. */
  adminOnly?: boolean;
  /** If true, hide unless the user is the platform owner. */
  ownerOnly?: boolean;
  /**
   * If true, this item is visible during admin-impersonation sessions. Only
   * configuration pages are whitelisted — admin opens a user's account to
   * configure settings on their behalf, not to view their private data
   * (inbox, orders, dashboard analytics).
   */
  showInImpersonation?: boolean;
};

const navItems: readonly NavItem[] = [
  { href: '/dashboard', label: 'ড্যাশবোর্ড', icon: LayoutDashboard },
  { href: '/inbox', label: 'ইনবক্স', icon: MessageSquare },
  { href: '/orders/pending', label: 'Approval', icon: Sparkles, exact: true },
  { href: '/products', label: 'পণ্য', icon: Package },
  { href: '/orders', label: 'অর্ডার', icon: ShoppingCart },
  { href: '/reconciliation', label: 'কুরিয়ার পেমেন্ট', icon: Wallet },
  { href: '/settings', label: 'সেটিংস', icon: Settings, showInImpersonation: true },
  { href: '/platform-setup', label: 'API Keys', icon: KeyRound, adminOnly: true },
  { href: '/owner', label: 'Admin panel', icon: Crown, ownerOnly: true },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

function userInitial(input: string | undefined): string {
  if (!input) return 'B';
  const first = input.trim()[0] ?? 'B';
  return first.toUpperCase();
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const impersonation = useAuthStore((s) => s.impersonation);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Sync the latest isAdmin / isOwner / mfaEnabled flags from the server on dashboard load.
  // We skip this while impersonating because /api/auth/me would return the
  // target user's perspective and overwrite the owner-side flags we stashed.
  useMe(!!impersonation);

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  function handleStopImpersonation() {
    stopImpersonation();
    router.push('/owner');
  }

  const visibleNav = navItems.filter((i) => {
    if (i.adminOnly && !user?.isAdmin) return false;
    if (i.ownerOnly && !user?.isOwner) return false;
    // Impersonation: hide everything except the explicit configuration
    // whitelist (only /settings today). Admin is here to configure the
    // user's account — not to read their inbox or browse their orders.
    if (impersonation && !i.showInImpersonation) return false;
    return true;
  });

  // Compute active item label for the mobile topbar.
  // We pick the most-specific match so /orders/pending wins over /orders.
  const activeItem = [...visibleNav]
    .reverse()
    .find((i) => isActive(pathname, i));

  const sidebar = (
    <div className="h-full flex flex-col bg-white border-r border-neutral-200">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-neutral-100">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-sm">
            <Package className="w-[18px] h-[18px]" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-neutral-900">
              BoxBazar
            </div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
              AI Ops
            </div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleNav.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
              )}
            >
              <Icon
                className={cn(
                  'w-[18px] h-[18px] flex-shrink-0',
                  active ? 'text-primary-600' : 'text-neutral-400 group-hover:text-neutral-600',
                )}
                strokeWidth={2}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / user card */}
      <div className="p-3 border-t border-neutral-100">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-200 to-primary-400 text-primary-900 text-xs font-semibold flex items-center justify-center">
            {userInitial(user?.name ?? user?.email ?? user?.phone ?? undefined)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-900 truncate">
              {user?.name ?? 'Seller'}
            </p>
            <p className="text-[11px] text-neutral-500 truncate">
              {user?.phone ?? user?.email ?? ''}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="বের হন"
            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0">
        <div className="fixed top-0 bottom-0 w-60">{sidebar}</div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed top-0 bottom-0 left-0 w-64 z-50 md:hidden">
            {sidebar}
          </aside>
        </>
      )}

      {/* Main column */}
      <main className="flex-1 min-w-0 md:ml-60">
        {/* Impersonation banner — top of every dashboard page when active. */}
        {impersonation && (
          <div className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-2 bg-amber-500 text-amber-950 border-b border-amber-600/40 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="w-4 h-4 flex-shrink-0" />
              <p className="text-xs font-medium truncate">
                Viewing as <span className="font-mono bg-amber-900/10 px-1.5 py-0.5 rounded">{impersonation.target.publicId ?? '----'}</span>{' '}
                {impersonation.target.name}
                <span className="ml-2 text-amber-900/60">— configuration access only, all actions logged to your admin account</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleStopImpersonation}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-900 text-amber-50 hover:bg-amber-950 text-xs font-medium transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Stop impersonating
            </button>
          </div>
        )}

        {/* Mobile topbar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-3 bg-white/90 backdrop-blur border-b border-neutral-200">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 -ml-2 text-neutral-700 hover:bg-neutral-100 rounded-md"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1 text-sm font-semibold text-neutral-900 truncate">
            {activeItem?.label ?? 'BoxBazar'}
          </div>
        </div>

        <div className="min-h-[calc(100vh-3.5rem)] md:min-h-screen">{children}</div>
      </main>
    </div>
  );
}
