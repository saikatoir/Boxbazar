import type { ReactNode } from 'react';
import { Sparkles, MessageSquare, Package, Truck } from 'lucide-react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 grid lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <div className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-primary-900 text-white">
        {/* Decorative blobs */}
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div className="leading-tight">
              <div className="text-lg font-semibold tracking-tight">BoxBazar</div>
              <div className="text-[11px] uppercase tracking-wider text-white/70">AI Ops</div>
            </div>
          </div>

          <div className="space-y-7">
            <h2 className="text-3xl font-semibold tracking-tight leading-tight max-w-md">
              Messenger-এ গ্রাহকের সাথে কথা বলবে AI — আপনি শুধু অর্ডার approve করুন।
            </h2>
            <div className="space-y-4">
              {[
                {
                  icon: MessageSquare,
                  title: 'AI রিসেপশনিস্ট',
                  desc: 'আপনার পেজের ইনবক্সে ২৪/৭ উত্তর দেয়।',
                },
                {
                  icon: Sparkles,
                  title: 'অর্ডার automatic',
                  desc: 'চ্যাট থেকে নাম, ফোন, ঠিকানা, COD বের করে।',
                },
                {
                  icon: Truck,
                  title: 'কুরিয়ার-রেডি',
                  desc: 'Steadfast, Pathao, RedX — এক ক্লিকে বুকিং।',
                },
              ].map((f) => (
                <div key={f.title} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0">
                    <f.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{f.title}</div>
                    <div className="text-xs text-white/70">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/60">© BoxBazar — Bangladeshi F-commerce ops.</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 md:p-10">{children}</div>
    </div>
  );
}
