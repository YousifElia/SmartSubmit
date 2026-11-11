import { browser } from 'wxt/browser';

/**
 * Keep the background script awake during long work: the browser stops an
 * idle background script after about 30 seconds, and a slow local model or a
 * large sync can take longer than that.
 */
export async function keepAwake<T>(work: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => void browser.runtime.getPlatformInfo(), 20_000);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}
