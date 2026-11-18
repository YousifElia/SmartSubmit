/**
 * Workable (apply.workable.com/<account>/j/<shortcode>/apply/): a React form
 * whose fields carry `data-ui` and `name` attributes such as "firstname",
 * "resume" and, for the employer's own questions, "QA_<id>". The questions
 * have ordinary labels and are left to the generic engine.
 */
import type { FieldKey } from '../model';
import type { SiteAdapter } from './types';

const KEYS: Record<string, FieldKey> = {
  firstname: 'firstName',
  lastname: 'lastName',
  email: 'email',
  phone: 'phone',
  address: 'addressLine1',
  resume: 'resume',
  cover_letter: 'coverLetter',
};

export const workable: SiteAdapter = {
  id: 'workable',
  // "Add" opens an editor with its own Save: left for the person.
  addsEntries: false,

  formRoot(doc) {
    const first = doc.querySelector('[data-ui="firstname"], form input[name="firstname"]');
    return first?.closest('form') ?? null;
  },

  refine(field) {
    const key = KEYS[field.el.getAttribute('data-ui') ?? ''] ?? KEYS[field.name];
    if (key) field.adapterKey = key;
  },
};
