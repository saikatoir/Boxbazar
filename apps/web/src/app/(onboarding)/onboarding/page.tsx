'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const CATEGORIES = [
  { value: 'clothing', label: 'পোশাক ও ফ্যাশন' },
  { value: 'cosmetics', label: 'বিউটি ও কসমেটিক্স' },
  { value: 'home_food', label: 'ঘরে তৈরি খাবার' },
  { value: 'kids', label: 'শিশু পণ্য' },
  { value: 'jewellery', label: 'গহনা ও অ্যাকসেসরিজ' },
  { value: 'other', label: 'অন্যান্য' },
];

const COURIERS = [
  { value: 'steadfast', label: 'Steadfast (Packzy)', desc: 'দ্রুত অনুমোদন, সহজ API' },
  { value: 'pathao', label: 'Pathao Courier', desc: 'বড় নেটওয়ার্ক, সারাদেশে' },
  { value: 'redx', label: 'RedX', desc: 'ঢাকার বাইরে ভালো কভারেজ' },
];

const schema = z.object({
  storeName: z.string().min(2, 'দোকানের নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(100),
  category: z.string().min(1, 'একটি ক্যাটাগরি বেছে নিন'),
  primaryCourier: z.string().min(1, 'একটি কুরিয়ার বেছে নিন'),
  fbPageUrl: z.string().url('সঠিক Facebook পেজ লিংক দিন').optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

const inputCls =
  'w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400';

export default function OnboardingPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: '', primaryCourier: '' },
  });

  const selectedCategory = watch('category');
  const selectedCourier = watch('primaryCourier');

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: data.storeName,
          category: data.category,
          primaryCourier: data.primaryCourier,
          fbPageUrl: data.fbPageUrl || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? 'দোকান তৈরি করতে ব্যর্থ হয়েছে');
      }
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ত্রুটি হয়েছে');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-lg">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className="flex-1 h-1.5 bg-blue-600 rounded-full" />
        <div className="flex-1 h-1.5 bg-blue-600 rounded-full" />
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full" />
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">আপনার দোকান সেটআপ করুন</h1>
        <p className="text-gray-500 mt-1 text-sm">মাত্র ২ মিনিট লাগবে — পরে পরিবর্তন করা যাবে</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Store name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            দোকানের নাম <span className="text-red-500">*</span>
          </label>
          <input type="text" placeholder="যেমন: রাহেলার বুটিক"
            {...register('storeName')} className={inputCls} />
          {errors.storeName && (
            <p className="mt-1 text-sm text-red-600">{errors.storeName.message}</p>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ক্যাটাগরি <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <button key={cat.value} type="button"
                onClick={() => setValue('category', cat.value, { shouldValidate: true })}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors ${
                  selectedCategory === cat.value
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}>
                {cat.label}
              </button>
            ))}
          </div>
          {errors.category && (
            <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>
          )}
        </div>

        {/* Primary courier */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            প্রধান কুরিয়ার <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            {COURIERS.map((c) => (
              <button key={c.value} type="button"
                onClick={() => setValue('primaryCourier', c.value, { shouldValidate: true })}
                className={`w-full px-4 py-3 rounded-lg border text-left transition-colors ${
                  selectedCourier === c.value
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}>
                <span className={`font-medium text-sm ${selectedCourier === c.value ? 'text-blue-700' : 'text-gray-700'}`}>
                  {c.label}
                </span>
                <span className="block text-xs text-gray-400 mt-0.5">{c.desc}</span>
              </button>
            ))}
          </div>
          {errors.primaryCourier && (
            <p className="mt-1 text-sm text-red-600">{errors.primaryCourier.message}</p>
          )}
        </div>

        {/* FB page URL (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Facebook পেজ লিংক <span className="text-gray-400 font-normal">(ঐচ্ছিক)</span>
          </label>
          <input type="url" placeholder="https://facebook.com/yourpage"
            {...register('fbPageUrl')} className={inputCls} />
          {errors.fbPageUrl && (
            <p className="mt-1 text-sm text-red-600">{errors.fbPageUrl.message}</p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>
        )}

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? 'সংরক্ষণ হচ্ছে...' : 'শুরু করুন →'}
        </button>
      </form>

      <p className="text-xs text-gray-400 text-center mt-4">
        পরে Settings থেকে কুরিয়ার API কী যোগ করতে পারবেন
      </p>
    </div>
  );
}
