'use client';

import { Plus, ClipboardPaste, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          স্বাগতম{user?.name ? `, ${user.name}` : ''}!
        </h1>
        <p className="text-gray-500 mt-1">
          আজকের অর্ডার এবং কার্যক্রম পরিচালনা করুন
        </p>
      </div>

      {/* Hero Paste-Chat CTA */}
      <Link
        href="/orders/new"
        className="block mb-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 hover:border-blue-300 transition-colors"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white border border-blue-200 flex items-center justify-center flex-shrink-0">
            <ClipboardPaste className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                চ্যাট paste করে অর্ডার তৈরি করুন
              </h2>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Messenger বা WhatsApp চ্যাটের অংশটুকু paste করুন — automatically
              নাম, ফোন, ঠিকানা এবং COD বের হয়ে আসবে।
            </p>
          </div>
        </div>
      </Link>

      {/* Empty state */}
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
          <Plus className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          কোনো অর্ডার নেই
        </h2>
        <p className="text-gray-500 mb-6 max-w-sm mx-auto">
          আপনার প্রথম অর্ডার যোগ করুন। চ্যাট থেকে সরাসরি অর্ডার পার্স করুন বা
          ম্যানুয়ালি তৈরি করুন।
        </p>
        <Link
          href="/orders/new"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          নতুন অর্ডার যোগ করুন
        </Link>
      </div>

      {/* Quick stats placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {[
          { label: 'আজকের অর্ডার', value: '০', unit: 'টি' },
          { label: 'মোট বকেয়া', value: '০', unit: '৳' },
          { label: 'ডেলিভারি সফল', value: '০%', unit: '' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {stat.value}
              <span className="text-lg font-normal text-gray-400 ml-1">
                {stat.unit}
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
