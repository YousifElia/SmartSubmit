import { browser } from 'wxt/browser';
import type { FontBytes } from '@/core/pdf/layout';

let cache: Promise<FontBytes> | null = null;

/** The bundled fonts, read once from the extension package. */
export function loadFonts(): Promise<FontBytes> {
  cache ??= (async () => {
    const get = async (path: '/fonts/Lato-Regular.ttf' | '/fonts/Lato-Bold.ttf' | '/fonts/Lato-Italic.ttf' | '/fonts/Lato-BoldItalic.ttf') => {
      const response = await fetch(browser.runtime.getURL(path));
      if (!response.ok) throw new Error(`Could not load ${path}`);
      return new Uint8Array(await response.arrayBuffer());
    };
    const [regular, bold, italic, boldItalic] = await Promise.all([
      get('/fonts/Lato-Regular.ttf'),
      get('/fonts/Lato-Bold.ttf'),
      get('/fonts/Lato-Italic.ttf'),
      get('/fonts/Lato-BoldItalic.ttf'),
    ]);
    return { regular, bold, italic, boldItalic };
  })();
  // A failed load should be retried next time, not remembered.
  cache.catch(() => (cache = null));
  return cache;
}
