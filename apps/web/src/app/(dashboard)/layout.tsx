'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, ShoppingCart, Wallet, Settings, LogOut, MessageSquare, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  {
    href: '/dashboard',
    label: 'ড্যাশবোর্ড',
    labelEn: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/inbox',
    label: 'ইনবক্স',
    labelEn: 'Inbox',
    icon: MessageSquare,
  },
  {
    href: '/orders/pending',
    label: 'Approval',
    labelEn: 'Approval',
    icon: Sparkles,
  },
  {
    href: '/orders',
    label: 'অর্ডার',
    labelEn: 'Orders',
    icon: ShoppingCart,
  },
  {
    href: '/reconciliation',
    label: 'কুরিয়ার পেমেন্ট',
    labelEn: 'Reconciliation',
    icon: Wallet,
  },
  {
    href: '/settings',
    label: 'সেটিংস',
    labelEn: 'Settings',
    icon: Settings,
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-600">fCommerce Ops</h1>
          {user && (
            <p className="text-xs text-gray-500 mt-1 truncate">{user.phone ?? user.email}</p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>বের হন</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
