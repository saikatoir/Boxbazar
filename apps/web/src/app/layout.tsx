import type { Metadata } from 'next';
import { Noto_Sans_Bengali, Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/providers/query-provider';
import { ToastProvider } from '@/components/ui/Toast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-bangla',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BoxBazar — AI Receptionist & F-commerce Ops',
  description:
    'Connect your Facebook page, let AI handle DMs, and ship orders end-to-end. Built for Bangladeshi sellers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="bn"
      dir="auto"
      className={`${inter.variable} ${notoSansBengali.variable}`}
    >
      <body>
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
