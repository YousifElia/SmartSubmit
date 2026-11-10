import { browser } from 'wxt/browser';
import type { Handlers, PageStatus, TabCommand } from '@/core/messages';

async function command(tabId: number, name: TabCommand['command']): Promise<PageStatus | null> {
  try {
    const message: TabCommand = { __smartsubmit: true, command: name };
    return ((await browser.tabs.sendMessage(tabId, message)) as PageStatus | undefined) ?? null;
  } catch {
    // No content script in that tab.
    return null;
  }
}

export const pageHandlers = {
  'page.status': ({ tabId }) => command(tabId, 'ping'),

  'page.activate': async ({ tabId, run }) => {
    if (!(await command(tabId, 'ping'))) {
      // Not one of the known application systems: the user clicked the toolbar
      // button, which grants access to this one tab, so load SmartSubmit into it.
      await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['/content-scripts/content.js'],
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return command(tabId, run ? 'autofill' : 'toggle-panel');
  },
} satisfies Partial<Handlers>;
