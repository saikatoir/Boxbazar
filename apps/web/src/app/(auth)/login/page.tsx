'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';

// ── Schemas ──────────────────────────────────────────────────────────────────

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

// ── Shared input class ────────────────────────────────────────────────────────
const inputCls =
  'w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400';
const btnCls =
  'w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

// ── Component ─────────────────────────────────────────────────────────────────
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

  // Phone OTP: step 1
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

  // Phone OTP: step 2
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

  // Email login
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
    <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">fCommerce Ops</h1>
        <p className="text-gray-500 mt-1 text-sm">আপনার অ্যাকাউন্টে প্রবেশ করুন</p>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
        <button
          type="button"
          onClick={() => switchTab('phone')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'phone' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          মোবাইল নম্বর
        </button>
        <button
          type="button"
          onClick={() => switchTab('email')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'email' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ইমেইল
        </button>
      </div>

      {/* Phone tab */}
      {tab === 'phone' && !otpStep && (
        <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              মোবাইল নম্বর
            </label>
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

      {/* OTP step */}
      {tab === 'phone' && otpStep && (
        <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
          <p className="text-sm text-gray-600">
            <span className="font-medium">{phone}</span> নম্বরে OTP পাঠানো হয়েছে
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
            {loading ? 'যাচাই হচ্ছে...' : 'প্রবেশ করুন'}
          </button>
          <button type="button" onClick={() => { setOtpStep(false); setError(null); otpForm.reset(); }}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors">
            নম্বর পরিবর্তন করুন
          </button>
        </form>
      )}

      {/* Email tab */}
      {tab === 'email' && (
        <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
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
            <input type="password" placeholder="••••••••"
              {...emailForm.register('password')} className={inputCls} />
            {emailForm.formState.errors.password && (
              <p className="mt-1 text-sm text-red-600">{emailForm.formState.errors.password.message}</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? 'প্রবেশ হচ্ছে...' : 'প্রবেশ করুন'}
          </button>
        </form>
      )}

      {/* Divider + register CTA */}
      <div className="mt-6 pt-6 border-t border-gray-100 text-center">
        <p className="text-sm text-gray-500">
          অ্যাকাউন্ট নেই?{' '}
          <Link href="/register" className="text-blue-600 font-medium hover:underline">
            নিবন্ধন করুন
          </Link>
        </p>
        <p className="text-xs text-gray-400 mt-2">১৫ দিন বিনামূল্যে — কোনো কার্ড লাগবে না</p>
      </div>
    </div>
  );
}
