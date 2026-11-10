import { browser } from 'wxt/browser';

/** Open the dashboard at a route, reusing an existing dashboard tab if there is one. */
export async function openDashboard(route = '/'): Promise<void> {
  const base = browser.runtime.getURL('/dashboard.html');
  const url = `${base}#${route}`;
  const tabs = await browser.tabs.query({});
  const existing = tabs.find((t) => t.url?.startsWith(base));
  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, { active: true, url });
    if (existing.windowId !== undefined) await browser.windows.update(existing.windowId, { focused: true });
    return;
  }
  await browser.tabs.create({ url });
}
