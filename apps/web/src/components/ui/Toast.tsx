'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Toast = { id: number; text: string; ok: boolean };
type ToastCtx = (text: string, ok?: boolean) => void;

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push: ToastCtx = useCallback((text, ok = true) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 min-w-[280px] max-w-sm rounded-lg border px-3.5 py-3 text-sm shadow-pop animate-in fade-in slide-in-from-top-2',
              t.ok
                ? 'bg-white border-neutral-200 text-neutral-900'
                : 'bg-white border-red-200 text-neutral-900',
            )}
          >
            {t.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <span className="flex-1">{t.text}</span>
            <button
              type="button"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="text-neutral-400 hover:text-neutral-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback so callers outside the provider don't crash during dev / SSR.
    return (text: string, ok = true) => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console[ok ? 'log' : 'error'](`[toast] ${text}`);
      }
    };
  }
  return ctx;
}

