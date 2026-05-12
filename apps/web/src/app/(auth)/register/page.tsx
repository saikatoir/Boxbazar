'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';

// ── Schemas ───────────────────────────────────────────────────────────────────

const phoneRegSchema = z.object({
  name: z.string().min(2, 'নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(80),
  phone: z.string().regex(/^01[3-9][0-9]{8}$/, 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন'),
});
const otpSchema = z.object({
  otp: z.string().length(6, 'OTP অবশ্যই ৬ সংখ্যার হতে হবে').regex(/^\d{6}$/),
});
const emailRegSchema = z.object({
  name: z.string().min(2, 'নাম কমপক্ষে ২ অক্ষরের হতে হবে').max(80),
  email: z.string().email('সঠিক ইমেইল ঠিকানা দিন'),
  password: z.string().min(8, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'পাসওয়ার্ড মিলছে না',
  path: ['confirmPassword'],
});

type PhoneRegData = z.infer<typeof phoneRegSchema>;
type OtpData = z.infer<typeof otpSchema>;
type EmailRegData = z.infer<typeof emailRegSchema>;
type Tab = 'phone' | 'email';

const inputCls =
  'w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400';
const btnCls =
  'w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

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

  // Phone reg: step 1 — send OTP
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

  // Phone reg: step 2 — verify OTP (creates account if new)
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

  // Email reg
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
    <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">নতুন অ্যাকাউন্ট</h1>
        <p className="text-gray-500 mt-1 text-sm">১৫ দিন বিনামূল্যে — কোনো কার্ড লাগবে না</p>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
        <button type="button" onClick={() => switchTab('phone')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'phone' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}>
          মোবাইল নম্বর দিয়ে
        </button>
        <button type="button" onClick={() => switchTab('email')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'email' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}>
          ইমেইল দিয়ে
        </button>
      </div>

      {/* Phone tab: name + phone → OTP */}
      {tab === 'phone' && !otpStep && (
        <form onSubmit={phoneForm.handleSubmit(onPhoneRegSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">আপনার নাম</label>
            <input type="text" placeholder="যেমন: রাহেলা বেগম"
              {...phoneForm.register('name')} className={inputCls} />
            {phoneForm.formState.errors.name && (
              <p className="mt-1 text-sm text-red-600">{phoneForm.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">মোবাইল নম্বর</label>
            <input type="tel" inputMode="numeric" placeholder="01XXXXXXXXX"
              {...phoneForm.register('phone')} className={inputCls} />
            {phoneForm.formState.errors.phone && (
              <p className="mt-1 text-sm text-red-600">{phoneForm.formState.errors.phone.message}</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? 'পাঠানো হচ্ছে...' : 'OTP পাঠান'}
          </button>
        </form>
      )}

      {/* OTP verification step */}
      {tab === 'phone' && otpStep && (
        <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
          <p className="text-sm text-gray-600">
            <span className="font-medium">{pendingPhone}</span> নম্বরে OTP পাঠানো হয়েছে
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">OTP কোড</label>
            <input type="text" inputMode="numeric" maxLength={6} placeholder="------"
              {...otpForm.register('otp')}
              className={`${inputCls} text-center text-xl tracking-widest`} />
            {otpForm.formState.errors.otp && (
              <p className="mt-1 text-sm text-red-600">{otpForm.formState.errors.otp.message}</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? 'অ্যাকাউন্ট তৈরি হচ্ছে...' : 'নিবন্ধন সম্পন্ন করুন'}
          </button>
          <button type="button" onClick={() => { setOtpStep(false); setError(null); otpForm.reset(); }}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors">
            পেছনে যান
          </button>
        </form>
      )}

      {/* Email tab */}
      {tab === 'email' && (
        <form onSubmit={emailForm.handleSubmit(onEmailRegSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">আপনার নাম</label>
            <input type="text" placeholder="যেমন: রাহেলা বেগম"
              {...emailForm.register('name')} className={inputCls} />
            {emailForm.formState.errors.name && (
              <p className="mt-1 text-sm text-red-600">{emailForm.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ইমেইল</label>
            <input type="email" placeholder="example@email.com"
              {...emailForm.register('email')} className={inputCls} />
            {emailForm.formState.errors.email && (
              <p className="mt-1 text-sm text-red-600">{emailForm.formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">পাসওয়ার্ড</label>
            <input type="password" placeholder="কমপক্ষে ৮ অক্ষর"
              {...emailForm.register('password')} className={inputCls} />
            {emailForm.formState.errors.password && (
              <p className="mt-1 text-sm text-red-600">{emailForm.formState.errors.password.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">পাসওয়ার্ড নিশ্চিত করুন</label>
            <input type="password" placeholder="আবার পাসওয়ার্ড লিখুন"
              {...emailForm.register('confirmPassword')} className={inputCls} />
            {emailForm.formState.errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">{emailForm.formState.errors.confirmPassword.message}</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? 'অ্যাকাউন্ট তৈরি হচ্ছে...' : 'নিবন্ধন করুন'}
          </button>
        </form>
      )}

      {/* Login CTA */}
      <div className="mt-6 pt-6 border-t border-gray-100 text-center">
        <p className="text-sm text-gray-500">
          আগে থেকে অ্যাকাউন্ট আছে?{' '}
          <Link href="/login" className="text-blue-600 font-medium hover:underline">
            লগইন করুন
          </Link>
        </p>
      </div>
    </div>
  );
}
