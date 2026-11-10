import { useEffect, useState } from 'react';
import { LayoutDashboard, Wand2 } from 'lucide-react';
import { browser } from 'wxt/browser';
import { send, type PageStatus } from '@/core/messages';
import { SITE_NAMES } from '@/core/sites';
import { Logo } from '@/ui/Logo';
import { Button, Spinner } from '@/ui/kit';

type View = { state: 'loading' } | { state: 'ready'; tabId: number | null; webPage: boolean; status: PageStatus | null };

export function Popup() {
  const [view, setView] = useState<View>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id ?? null;
      const webPage = /^https?:/i.test(tab?.url ?? '');
      const status = tabId !== null && webPage ? await send('page.status', { tabId }).catch(() => null) : null;
      setView({ state: 'ready', tabId, webPage, status });
    })();
  }, []);

  const activate = async (run: boolean) => {
    if (view.state !== 'ready' || view.tabId === null) return;
    setBusy(true);
    setError('');
    try {
      await send('page.activate', { tabId: view.tabId, run });
      window.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'SmartSubmit could not run on this page.');
      setBusy(false);
    }
  };

  return (
    <div className="w-[320px] bg-white p-4">
      <Logo size={24} />
      <div className="mt-4 space-y-3">
        {view.state === 'loading' ? (
          <Spinner className="h-5 w-5 text-slate-400" />
        ) : !view.webPage ? (
          <p className="text-[13px] leading-relaxed text-slate-500">
            Open a job application in this tab and SmartSubmit can fill it in.
          </p>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-slate-600">
              {view.status?.hasForm
                ? `Found an application with ${view.status.fieldCount} questions${
                    view.status.site !== 'generic' ? ` on ${SITE_NAMES[view.status.site]}` : ''
                  }.`
                : view.status
                  ? 'No application form found on this page yet.'
                  : 'SmartSubmit doesn’t run here by itself. Start it for this page and it will look for a form.'}
            </p>
            <Button variant="primary" className="w-full" busy={busy} icon={<Wand2 size={15} />} onClick={() => void activate(true)}>
              Autofill this page
            </Button>
          </>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button
          className="w-full"
          icon={<LayoutDashboard size={15} />}
          onClick={async () => {
            await send('dashboard.open', {});
            window.close();
          }}
        >
          Open dashboard
        </Button>
        <p className="text-[11px] leading-relaxed text-slate-400">You always review and submit yourself.</p>
      </div>
    </div>
  );
}
