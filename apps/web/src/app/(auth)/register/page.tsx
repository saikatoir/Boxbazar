'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { Input, Label } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const phoneRegSchema = z.object({
  name: z.string().min(2, 'নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(80),
  phone: z.string().regex(/^01[3-9][0-9]{8}$/, 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন'),
});
const otpSchema = z.object({
  otp: z.string().length(6, 'OTP অবশ্যই ৬ সংখ্যার হতে হবে').regex(/^\d{6}$/),
});
const emailRegSchema = z
  .object({
    name: z.string().min(2, 'নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(80),
    email: z.string().email('সঠিক ইমেইল ঠিকানা দিন'),
    password: z.string().min(8, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'পাসওয়ার্ড মিলছে না',
    path: ['confirmPassword'],
  });

type PhoneRegData = z.infer<typeof phoneRegSchema>;
type OtpData = z.infer<typeof otpSchema>;
type EmailRegData = z.infer<typeof emailRegSchema>;
type Tab = 'phone' | 'email';

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [tab, setTab] = useState<Tab>('phone');
  const [otpStep, setOtpStep] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneForm = useForm<PhoneRegData>({ resolver: zodResolver(phoneRegSchema) });
  const otpForm = useForm<OtpData>({ resolver: zodResolver(otpSchema) });
  const emailForm = useForm<EmailRegData>({ resolver: zodResolver(emailRegSchema) });

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.message as string) ?? 'একটি ত্রুটি হয়েছে');
    return data;
  }

  function finish(data: { accessToken: string; refreshToken: string; user: Record<string, unknown> }) {
    setAuth(data.user as unknown as Parameters<typeof setAuth>[0], data.accessToken, data.refreshToken);
    router.push('/onboarding');
  }

  async function onPhoneRegSubmit({ name, phone }: PhoneRegData) {
    setLoading(true);
    setError(null);
    try {
      await post('/api/auth/phone/request-otp', { phone });
      setPendingName(name);
      setPendingPhone(phone);
      setOtpStep(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ত্রুটি হয়েছে');
    } finally {
      setLoading(false);
    }
  }

  async function onOtpSubmit({ otp }: OtpData) {
    setLoading(true);
    setError(null);
    try {
      const data = await post('/api/auth/phone/verify-otp', {
        phone: pendingPhone,
        otp,
        name: pendingName,
      });
      finish(data as Parameters<typeof finish>[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ত্রুটি হয়েছে');
    } finally {
      setLoading(false);
    }
  }

  async function onEmailRegSubmit({ name, email, password }: EmailRegData) {
    setLoading(true);
    setError(null);
    try {
      const data = await post('/api/auth/email/register', { name, email, password });
      finish(data as Parameters<typeof finish>[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ত্রুটি হয়েছে');
    } finally {
      setLoading(false);
    }
  }

  function switchTab(t: Tab) {
    setTab(t);
    setError(null);
    setOtpStep(false);
    phoneForm.reset();
    otpForm.reset();
    emailForm.reset();
  }

  return (
    <div className="w-full max-w-md">
      <div className="lg:hidden text-center mb-6">
        <div className="inline-flex items-center gap-2 text-primary-700">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-sm font-bold">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight text-neutral-900">BoxBazar</span>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">নতুন অ্যাকাউন্ট</h1>
      <p className="text-sm text-neutral-500 mt-1.5">১৫ দিন বিনামূল্যে — কোনো কার্ড লাগবে না।</p>

      <div className="flex bg-neutral-100 rounded-lg p-1 mt-6 mb-5">
        {(['phone', 'email'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={cn(
              'flex-1 py-2 text-sm font-medium rounded-md transition-colors',
              tab === t
                ? 'bg-white shadow-sm text-primary-700'
                : 'text-neutral-500 hover:text-neutral-700',
            )}
          >
            {t === 'phone' ? 'মোবাইল নম্বর দিয়ে' : 'ইমেইল দিয়ে'}
          </button>
        ))}
      </div>

      {tab === 'phone' && !otpStep && (
        <form onSubmit={phoneForm.handleSubmit(onPhoneRegSubmit)} className="space-y-4">
          <div>
            <Label>আপনার নাম</Label>
            <Input
              className="h-11"
              placeholder="যেমন: রাহেলা বেগম"
              {...phoneForm.register('name')}
            />
            {phoneForm.formState.errors.name && (
              <p className="mt-1.5 text-xs text-red-600">
                {phoneForm.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <Label>মোবাইল নম্বর</Label>
            <Input
              type="tel"
              inputMode="numeric"
              className="h-11"
              placeholder="01XXXXXXXXX"
              {...phoneForm.register('phone')}
            />
            {phoneForm.formState.errors.phone && (
              <p className="mt-1.5 text-xs text-red-600">
                {phoneForm.formState.errors.phone.message}
              </p>
            )}
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            OTP পাঠান
          </Button>
        </form>
      )}

      {tab === 'phone' && otpStep && (
        <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
          <p className="text-sm text-neutral-600">
            <span className="font-medium text-neutral-900">{pendingPhone}</span> নম্বরে OTP পাঠানো
            হয়েছে।
          </p>
          <div>
            <Label>OTP কোড</Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="------"
              className="h-12 text-center text-xl tracking-widest font-mono"
              {...otpForm.register('otp')}
            />
            {otpForm.formState.errors.otp && (
              <p className="mt-1.5 text-xs text-red-600">{otpForm.formState.errors.otp.message}</p>
            )}
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            নিবন্ধন সম্পন্ন করুন
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setOtpStep(false);
              setError(null);
              otpForm.reset();
            }}
          >
            পেছনে যান
          </Button>
        </form>
      )}

      {tab === 'email' && (
        <form onSubmit={emailForm.handleSubmit(onEmailRegSubmit)} className="space-y-4">
          <div>
            <Label>আপনার নাম</Label>
            <Input
              className="h-11"
              placeholder="যেমন: রাহেলা বেগম"
              {...emailForm.register('name')}
            />
            {emailForm.formState.errors.name && (
              <p className="mt-1.5 text-xs text-red-600">
                {emailForm.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <Label>ইমেইল</Label>
            <Input
              type="email"
              className="h-11"
              placeholder="example@email.com"
              {...emailForm.register('email')}
            />
            {emailForm.formState.errors.email && (
              <p className="mt-1.5 text-xs text-red-600">
                {emailForm.formState.errors.email.message}
              </p>
            )}
          </div>
          <div>
            <Label>পাসওয়ার্ড</Label>
            <Input
              type="password"
              className="h-11"
              placeholder="কমপক্ষে ৮ অক্ষর"
              {...emailForm.register('password')}
            />
            {emailForm.formState.errors.password && (
              <p className="mt-1.5 text-xs text-red-600">
                {emailForm.formState.errors.password.message}
              </p>
            )}
          </div>
          <div>
            <Label>পাসওয়ার্ড নিশ্চিত করুন</Label>
            <Input
              type="password"
              className="h-11"
              placeholder="আবার পাসওয়ার্ড লিখুন"
              {...emailForm.register('confirmPassword')}
            />
            {emailForm.formState.errors.confirmPassword && (
              <p className="mt-1.5 text-xs text-red-600">
                {emailForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            নিবন্ধন করুন
          </Button>
        </form>
      )}

      <div className="mt-6 pt-5 border-t border-neutral-100 text-center">
        <p className="text-sm text-neutral-600">
          আগে থেকে অ্যাকাউন্ট আছে?{' '}
          <Link href="/login" className="text-primary-700 font-medium hover:underline">
            লগইন করুন
          </Link>
        </p>
      </div>
    </div>
  );
}
