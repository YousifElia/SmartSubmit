import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { serve, type Handlers } from '@/core/messages';
import { aiHandlers } from '@/background/ai';
import { dataHandlers } from '@/background/data';
import { fileHandlers } from '@/background/files';
import { jobHandlers } from '@/background/jobs';
import { pageHandlers } from '@/background/page';
import { startSyncSchedule, syncHandlers } from '@/background/sync';
import { openDashboard } from '@/background/tabs';
import * as db from '@/core/storage/db';

export default defineBackground({
  type: 'module',
  main() {
    // Listeners are registered synchronously so the service worker wakes for them.
    browser.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') void openDashboard('/welcome');
    });

    // Chrome can keep content scripts out of extension storage altogether;
    // they talk to this script instead. Firefox has no equivalent for `local`.
    const local = browser.storage.local as typeof browser.storage.local & {
      setAccessLevel?: (options: { accessLevel: string }) => Promise<void>;
    };
    void local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })?.catch(() => undefined);

    const handlers: Partial<Handlers> = {
      ...dataHandlers,
      ...pageHandlers,
      ...fileHandlers,
      ...jobHandlers,
      ...aiHandlers,
      ...syncHandlers,
    };
    serve(handlers);
    startSyncSchedule();
    // Job site sign-in details saved by 0.2.0 move into the synced account record.
    void db.moveJobSiteAccount().catch(() => undefined);
  },
});
