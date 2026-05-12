/**
 * Reads clipboard text in a Capacitor-aware way.
 *
 * When running inside the Android Capacitor shell, `@capacitor/clipboard`
 * is available and gives reliable access to the OS clipboard.
 * In the browser PWA we fall back to the Web Clipboard API.
 *
 * The Capacitor module name is constructed at runtime so that webpack
 * does not try to resolve it during the web build (the plugin is only
 * present when bundling for Android).
 */

type CapacitorClipboardModule = {
  Clipboard: {
    read: () => Promise<{ value: string; type?: string }>;
    write: (opts: { string: string }) => Promise<void>;
  };
};

async function loadCapacitorClipboard(): Promise<CapacitorClipboardModule | null> {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  try {
    // Hide the module specifier from the bundler.
    const spec = ['@capacitor', 'clipboard'].join('/');
    const dynamicImport = new Function('s', 'return import(s)') as (
      s: string
    ) => Promise<unknown>;
    const mod = (await dynamicImport(spec)) as CapacitorClipboardModule;
    return mod;
  } catch {
    return null;
  }
}

export async function readClipboardText(): Promise<string> {
  if (typeof window === 'undefined') return '';

  const capMod = await loadCapacitorClipboard();
  if (capMod) {
    const result = await capMod.Clipboard.read();
    return result.value ?? '';
  }

  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }
  throw new Error('Clipboard API unavailable');
}

export async function writeClipboardText(text: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const capMod = await loadCapacitorClipboard();
  if (capMod) {
    await capMod.Clipboard.write({ string: text });
    return;
  }

  await navigator.clipboard?.writeText(text);
}
