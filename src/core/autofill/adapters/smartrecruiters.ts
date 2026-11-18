/**
 * SmartRecruiters: postings on jobs.smartrecruiters.com/<Company>/<id>, and
 * the application on its "one-click" pages (/oneclick-ui/…), an app built
 * from web components whose inputs live in their own (open) shadow roots.
 * Discovery and filling reach into those generically; this adapter says
 * where the form is.
 */
import { deepQueryAll } from '../fields';
import type { SiteAdapter } from './types';

export const smartrecruiters: SiteAdapter = {
  id: 'smartrecruiters',
  // "Add" opens an editor with its own Save: left for the person.
  addsEntries: false,

  formRoot(doc) {
    if (!doc.location.pathname.startsWith('/oneclick-ui/')) return null;
    const root = doc.querySelector('form') ?? doc.body;
    // The app renders its fields after loading; wait until there are some.
    return deepQueryAll(root, 'input:not([type="hidden"]), textarea, select').length > 0 ? root : null;
  },
};
