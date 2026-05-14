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

const phoneSchema = z.object({
  phone: z.string().regex(/^01[3-9][0-9]{8}$/, 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন'),
});
const otpSchema = z.object({
  otp: z.string().length(6, 'OTP অবশ্যই ৬ সংখ্যার হতে হবে').regex(/^\d{6}$/),
});
const emailSchema = z.object({
  email: z.string().email('সঠিক ইমেইল ঠিকানা দিন'),
  password: z.string().min(1, 'পাসওয়ার্ড দিন'),
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type OtpFormData = z.infer<typeof otpSchema>;
type EmailFormData = z.infer<typeof emailSchema>;
type Tab = 'phone' | 'email';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [tab, setTab] = useState<Tab>('phone');
  const [otpStep, setOtpStep] = useState(false);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneForm = useForm<PhoneFormData>({ resolver: zodResolver(phoneSchema) });
  const otpForm = useForm<OtpFormData>({ resolver: zodResolver(otpSchema) });
  const emailForm = useForm<EmailFormData>({ resolver: zodResolver(emailSchema) });

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
    router.push('/dashboard');
  }

  async function onPhoneSubmit({ phone }: PhoneFormData) {
    setLoading(true);
    setError(null);
    try {
      await post('/api/auth/phone/request-otp', { phone });
      setPhone(phone);
      setOtpStep(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ত্রুটি হয়েছে');
    } finally {
      setLoading(false);
    }
  }

  async function onOtpSubmit({ otp }: OtpFormData) {
    setLoading(true);
    setError(null);
    try {
      const data = await post('/api/auth/phone/verify-otp', { phone, otp });
      finish(data as Parameters<typeof finish>[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ত্রুটি হয়েছে');
    } finally {
      setLoading(false);
    }
  }

  async function onEmailSubmit({ email, password }: EmailFormData) {
    setLoading(true);
    setError(null);
    try {
      const data = await post('/api/auth/email/login', { email, password });
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
      {/* Mobile-only brand */}
      <div className="lg:hidden text-center mb-6">
        <div className="inline-flex items-center gap-2 text-primary-700">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center text-sm font-bold">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight text-neutral-900">BoxBazar</span>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        স্বাগতম, আবার দেখা হল
      </h1>
      <p className="text-sm text-neutral-500 mt-1.5">আপনার অ্যাকাউন্টে প্রবেশ করুন।</p>

      {/* Tab switcher */}
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
            {t === 'phone' ? 'মোবাইল নম্বর' : 'ইমেইল'}
          </button>
        ))}
      </div>

      {tab === 'phone' && !otpStep && (
        <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
          <div>
            <Label>মোবাইল নম্বর</Label>
            <Input
              type="tel"
              inputMode="numeric"
              placeholder="01XXXXXXXXX"
              className="h-11"
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
            <span className="font-medium text-neutral-900">{phone}</span> নম্বরে OTP পাঠানো হয়েছে।
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
            প্রবেশ করুন
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
            নম্বর পরিবর্তন করুন
          </Button>
        </form>
      )}

      {tab === 'email' && (
        <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
          <div>
            <Label>ইমেইল</Label>
            <Input
              type="email"
              placeholder="example@email.com"
              className="h-11"
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
              placeholder="••••••••"
              className="h-11"
              {...emailForm.register('password')}
            />
            {emailForm.formState.errors.password && (
              <p className="mt-1.5 text-xs text-red-600">
                {emailForm.formState.errors.password.message}
              </p>
            )}
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            প্রবেশ করুন
          </Button>
        </form>
      )}

      <div className="mt-6 pt-5 border-t border-neutral-100 text-center">
        <p className="text-sm text-neutral-600">
          অ্যাকাউন্ট নেই?{' '}
          <Link href="/register" className="text-primary-700 font-medium hover:underline">
            নিবন্ধন করুন
          </Link>
        </p>
        <p className="text-xs text-neutral-400 mt-1.5">১৫ দিন বিনামূল্যে — কোনো কার্ড লাগবে না</p>
      </div>
    </div>
  );
}
