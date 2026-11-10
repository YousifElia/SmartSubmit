import { createRoot, type Root } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { PageStatus, TabCommand } from '@/core/messages';
import { ATS_HOST_PATTERNS, siteFromHost } from '@/core/sites';
import { Controller } from './controller';
import { Panel } from './Panel';
import panelCss from './panel.css?inline';

/** Handle left on the isolated world's global, so a second injection reuses the first. */
interface Instance {
  activate: (run: boolean) => Promise<void>;
  status: () => PageStatus;
}
declare global {
  // eslint-disable-next-line no-var
  var __smartsubmit: Instance | undefined;
}

export default defineContentScript({
  matches: ATS_HOST_PATTERNS,
  allFrames: true,
  runAt: 'document_idle',
  cssInjectionMode: 'manual',

  async main(ctx) {
    // Injected again from the toolbar on a page that already has it: just open the panel.
    if (globalThis.__smartsubmit) {
      await globalThis.__smartsubmit.activate(false);
      return;
    }
    const instance = start(ctx);
    globalThis.__smartsubmit = instance;
  },
});

function start(ctx: ContentScriptContext): Instance {
  const site = siteFromHost(location.hostname);
  // On a site SmartSubmit doesn't know, it is only here because the user asked for it.
  const invited = site === 'generic';
  const controller = new Controller(site, document);

  let ui: Awaited<ReturnType<typeof createShadowRootUi<Root>>> | null = null;
  let mounting = false;
  let hidden = false;
  let autoRan = false;

  /** A frame too small to hold the panel (an embedded widget) is left alone. */
  const frameTooSmall = () => window.top !== window && (window.innerWidth < 340 || window.innerHeight < 260);

  async function mount(): Promise<void> {
    if (ui || mounting) return;
    mounting = true;
    try {
      ui = await createShadowRootUi<Root>(ctx, {
        name: 'smartsubmit-panel',
        position: 'inline',
        anchor: 'body',
        append: 'last',
        css: panelCss,
        isolateEvents: true,
        onMount(container) {
          const root = createRoot(container);
          root.render(<Panel controller={controller} onHide={() => hide()} />);
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      ui.mount();
    } finally {
      mounting = false;
    }
  }

  function unmount(): void {
    ui?.remove();
    ui = null;
  }

  function hide(): void {
    hidden = true;
    controller.dispose();
    unmount();
  }

  /** Mount or unmount the panel as the application form appears and disappears. */
  async function sync(force = false): Promise<void> {
    if (hidden && !force) return;
    const hasForm = controller.formRoot() !== null;
    if (!hasForm && !force) {
      if (ui && controller.getState().phase === 'idle') unmount();
      return;
    }
    if (frameTooSmall() && !force) return;
    if (!ui) {
      try {
        const snapshot = await controller.loadSnapshot();
        if (!force && snapshot.settings.panel.hiddenHosts.includes(location.hostname)) {
          hidden = true;
          return;
        }
        controller.scan();
        await mount();
        if (snapshot.settings.autofill.autoRun && snapshot.onboarded && !autoRan && hasForm) {
          autoRan = true;
          controller.setOpen(true);
          void controller.autofill();
        }
      } catch {
        // The extension was reloaded or the background is unavailable; try again on the next tick.
      }
    }
  }

  const instance: Instance = {
    async activate(run) {
      hidden = false;
      await sync(true);
      controller.setOpen(true);
      if (run) await controller.autofill();
    },
    status() {
      const hasForm = controller.formRoot() !== null;
      return { site, hasForm, fieldCount: hasForm ? controller.scan().length : 0, top: window.top === window };
    },
  };

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const command = message as Partial<TabCommand> | null;
    if (!command || command.__smartsubmit !== true || typeof command.command !== 'string') return undefined;
    // In a page with several frames, only the frame holding the form answers,
    // falling back to the top frame so there is always exactly one reply.
    const hasForm = controller.formRoot() !== null;
    if (!hasForm && window.top !== window) return undefined;
    if (command.command === 'ping') {
      sendResponse(instance.status());
      return undefined;
    }
    void instance.activate(command.command === 'autofill').then(() => sendResponse(instance.status()));
    return true;
  });

  // Application forms are often rendered after load, and single-page sites
  // swap them in and out, so keep an eye on the page.
  if (!invited) {
    void sync();
    ctx.setInterval(() => void sync(), 1200);
  } else {
    void instance.activate(false);
  }

  ctx.onInvalidated(() => {
    controller.dispose();
    unmount();
    globalThis.__smartsubmit = undefined;
  });

  return instance;
}
