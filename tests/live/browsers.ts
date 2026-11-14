import { browser } from 'wxt/browser';
import { createAccount, type AccountRecord } from '@/core/sync/account';
import { supabaseBackend, type SyncBackend } from '@/core/sync/backend';
import { localStore } from '@/core/sync/engine';
import { memorySecrets } from '@/core/sync/keystore';

/**
 * Several browsers talking to one real sync server, run one at a time: each
 * has its own storage (swapped in and out), secrets and server session.
 */
export class Browsers {
  private saved = new Map<string, Record<string, unknown>>();
  private made = new Map<string, { account: ReturnType<typeof createAccount>; backend: SyncBackend }>();
  current = '';

  constructor(
    private url: string,
    private key: string,
  ) {}

  /** Switch to a browser, and get its account and its connection to the server. */
  async on(name: string) {
    if (this.current !== name) {
      if (this.current) this.saved.set(this.current, await browser.storage.local.get(null));
      await browser.storage.local.clear();
      const snapshot = this.saved.get(name);
      if (snapshot && Object.keys(snapshot).length > 0) await browser.storage.local.set(snapshot);
      this.current = name;
    }
    let made = this.made.get(name);
    if (!made) {
      const secrets = memorySecrets();
      const backend = supabaseBackend(this.url, this.key, secrets);
      const account = createAccount({
        server: this.url,
        backend,
        secrets,
        store: localStore,
        load: async () => ((await browser.storage.local.get('a/sync'))['a/sync'] as AccountRecord | undefined) ?? null,
        save: async (record) => (record ? browser.storage.local.set({ 'a/sync': record }) : browser.storage.local.remove('a/sync')),
      });
      made = { account, backend };
      this.made.set(name, made);
    }
    return made;
  }
}
