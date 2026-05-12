/**
 * Capacitor-aware share. On Android via Capacitor we use the native share
 * sheet; in the browser PWA we fall back to navigator.share, then to
 * opening a WhatsApp deep link with the URL.
 */
export async function shareLink(opts: {
  title: string;
  text?: string;
  url: string;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (cap?.isNativePlatform?.()) {
    try {
      const spec = ['@capacitor', 'share'].join('/');
      const dynamicImport = new Function('s', 'return import(s)') as (
        s: string
      ) => Promise<unknown>;
      const mod = (await dynamicImport(spec)) as {
        Share: { share: (opts: unknown) => Promise<unknown> };
      };
      await mod.Share.share({
        title: opts.title,
        text: opts.text ?? '',
        url: opts.url,
      });
      return;
    } catch {
      // fall through
    }
  }

  const nav = navigator as Navigator & {
    share?: (data: { title: string; text?: string; url: string }) => Promise<void>;
  };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: opts.title, text: opts.text, url: opts.url });
      return;
    } catch {
      // user cancelled or unsupported — fall through to WhatsApp deep link
    }
  }

  const text = [opts.text, opts.url].filter(Boolean).join('\n');
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer'
  );
}
