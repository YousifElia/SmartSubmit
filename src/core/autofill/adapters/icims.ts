/**
 * iCIMS (careers-<company>.icims.com): server-rendered pages shown inside an
 * iframe (`#icims_content_iframe`, the same address with `in_iframe=1`) on a
 * wrapper page from the same host.
 *
 * Everything happens in that frame: the posting, the sign-in step (an email
 * address, a consent box and a CAPTCHA) and the application itself, behind a
 * per-employer account. Its forms use ordinary labels; dropdowns are native
 * selects behind an enhanced widget, which discovery handles generically.
 */
import type { SiteAdapter } from './types';

const CONTENT_FRAME = 'icims_content_iframe';

/** Questions a person can see and answer under a node (inputs, dropdowns, text areas). */
function visibleControls(root: ParentNode): number {
  let count = 0;
  for (const el of root.querySelectorAll<HTMLElement>('input, select, textarea')) {
    if (el instanceof HTMLInputElement && /^(hidden|submit|button|reset|image)$/.test(el.type)) continue;
    if (el.getClientRects().length > 0) count++;
  }
  return count;
}

export const icims: SiteAdapter = {
  id: 'icims',
  // Applying means signing in to an account with the employer's iCIMS.
  passwords: true,

  formRoot(doc) {
    // The wrapper page holds no form of its own.
    if (doc.querySelector(`iframe#${CONTENT_FRAME}`)) return null;
    // Pages can also hold a job search form, and the questions aren't always
    // inside a <form> at all. Take the form holding most of the page's
    // questions, or the whole page when no form holds even half of them.
    const total = visibleControls(doc.body);
    if (total === 0) return null;
    const best = [...doc.querySelectorAll('form')]
      .map((form) => ({ form, count: visibleControls(form) }))
      .sort((a, b) => b.count - a.count)[0];
    return best && best.count * 2 >= total ? best.form : doc.body;
  },

  contentFrame(win, doc) {
    if (win.name === CONTENT_FRAME) return true;
    return win.top === win && !doc.querySelector(`iframe#${CONTENT_FRAME}`);
  },
};
