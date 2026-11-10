/** Any other site: no special knowledge, just the largest form on the page. */
import type { SiteAdapter } from './types';

const CONTROLS = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';

export const generic: SiteAdapter = {
  id: 'generic',

  formRoot(doc) {
    let best: HTMLFormElement | null = null;
    let most = 0;
    for (const form of doc.querySelectorAll('form')) {
      // Search boxes and login forms are not applications.
      if (form.querySelector('input[type="password"]')) continue;
      const count = form.querySelectorAll(CONTROLS).length;
      if (count > most) {
        best = form;
        most = count;
      }
    }
    if (best && most >= 3) return best;
    // Some applications are not wrapped in a <form> at all.
    return doc.querySelectorAll(CONTROLS).length >= 4 ? doc.body : null;
  },
};
