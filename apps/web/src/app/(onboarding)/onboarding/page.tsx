'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Package, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Input, Label } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

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

export default function OnboardingPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
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
    <div className="bg-white rounded-2xl shadow-card border border-neutral-200 p-7 md:p-9 w-full max-w-lg">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-sm">
          <Package className="w-4 h-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-neutral-900">BoxBazar</span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1.5 mb-7" aria-label="Step 2 of 3">
        <div className="flex-1 h-1 bg-primary-600 rounded-full" />
        <div className="flex-1 h-1 bg-primary-600 rounded-full" />
        <div className="flex-1 h-1 bg-neutral-200 rounded-full" />
      </div>

      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          আপনার দোকান সেটআপ করুন
        </h1>
        <p className="text-sm text-neutral-500 mt-1.5">
          মাত্র ২ মিনিট লাগবে — পরে পরিবর্তন করা যাবে।
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <Label required>দোকানের নাম</Label>
          <Input
            type="text"
            className="h-11"
            placeholder="যেমন: রাহেলার বুটিক"
            {...register('storeName')}
          />
          {errors.storeName && (
            <p className="mt-1.5 text-xs text-red-600">{errors.storeName.message}</p>
          )}
        </div>

        <div>
          <Label required>ক্যাটাগরি</Label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setValue('category', cat.value, { shouldValidate: true })}
                className={cn(
                  'px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors',
                  selectedCategory === cat.value
                    ? 'border-primary-500 bg-primary-50/60 text-primary-800 ring-1 ring-primary-200'
                    : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50',
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {errors.category && (
            <p className="mt-1.5 text-xs text-red-600">{errors.category.message}</p>
          )}
        </div>

        <div>
          <Label required>প্রধান কুরিয়ার</Label>
          <div className="space-y-2">
            {COURIERS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setValue('primaryCourier', c.value, { shouldValidate: true })}
                className={cn(
                  'w-full px-4 py-3 rounded-lg border text-left transition-colors',
                  selectedCourier === c.value
                    ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-200'
                    : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50',
                )}
              >
                <span
                  className={cn(
                    'font-medium text-sm',
                    selectedCourier === c.value ? 'text-primary-800' : 'text-neutral-800',
                  )}
                >
                  {c.label}
                </span>
                <span className="block text-xs text-neutral-500 mt-0.5">{c.desc}</span>
              </button>
            ))}
          </div>
          {errors.primaryCourier && (
            <p className="mt-1.5 text-xs text-red-600">{errors.primaryCourier.message}</p>
          )}
        </div>

        <div>
          <Label>
            Facebook পেজ লিংক <span className="text-neutral-400 font-normal">(ঐচ্ছিক)</span>
          </Label>
          <Input
            type="url"
            className="h-11"
            placeholder="https://facebook.com/yourpage"
            {...register('fbPageUrl')}
          />
          {errors.fbPageUrl && (
            <p className="mt-1.5 text-xs text-red-600">{errors.fbPageUrl.message}</p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={loading}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          শুরু করুন
        </Button>
      </form>

      <p className="text-xs text-neutral-400 text-center mt-4">
        পরে Settings থেকে Meta ও কুরিয়ার API কী যোগ করতে পারবেন।
      </p>
    </div>
  );
}
