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

export const icims: SiteAdapter = {
  id: 'icims',

  formRoot(doc) {
    // The wrapper page holds no form of its own.
    if (doc.querySelector(`iframe#${CONTENT_FRAME}`)) return null;
    const wrapper = doc.querySelector('.iCIMS_MainWrapper') ?? doc.body;
    const forms = [...wrapper.querySelectorAll('form')].filter((form) => form.querySelector('input:not([type="hidden"]), select, textarea'));
    // The application form, or the sign-in step's email form.
    return forms.find((form) => form.matches('.iCIMS_Forms, #icims_application_form, [id*="application" i]')) ?? forms[0] ?? null;
  },

  contentFrame(win, doc) {
    if (win.name === CONTENT_FRAME) return true;
    return win.top === win && !doc.querySelector(`iframe#${CONTENT_FRAME}`);
  },
};
