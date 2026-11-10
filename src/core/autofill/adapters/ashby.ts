/**
 * Ashby (jobs.ashbyhq.com): a React form. Class names are hashed, but every
 * part also carries a stable `ashby-application-form-*` class.
 */
import type { FormField } from '../fields';
import type { FieldKey } from '../model';
import { textOf, type SiteAdapter } from './types';

const SYSTEM: Record<string, FieldKey> = {
  _systemfield_name: 'fullName',
  _systemfield_email: 'email',
  _systemfield_resume: 'resume',
  _systemfield_location: 'location',
};

function entryOf(el: Element): Element | null {
  return el.closest('.ashby-application-form-field-entry');
}

export const ashby: SiteAdapter = {
  id: 'ashby',

  formRoot(doc) {
    const entry = doc.querySelector('.ashby-application-form-field-entry');
    return entry ? (entry.closest('form') ?? doc.body) : null;
  },

  labelFor(el) {
    return textOf(entryOf(el)?.querySelector('.ashby-application-form-question-title'));
  },

  ignore(el) {
    // The "autofill from resume" drop zone at the top would upload the file for parsing.
    return !!el.closest('.ashby-application-form-autofill-input-root, .ashby-application-form-autofill-pane');
  },

  extra(root) {
    const fields: Partial<FormField>[] = [];
    const claimed: Element[] = [];
    // Yes / No questions are two buttons backed by a hidden checkbox.
    for (const box of root.querySelectorAll<HTMLElement>('.ashby-application-form-input-yesno')) {
      const buttons = [...box.querySelectorAll<HTMLElement>('button')];
      if (buttons.length < 2) continue;
      claimed.push(box);
      fields.push({
        el: box,
        anchor: box,
        kind: 'buttons',
        label: textOf(entryOf(box)?.querySelector('.ashby-application-form-question-title')),
        options: buttons.map((b) => textOf(b)),
        optionEls: buttons,
        inputType: 'buttons',
        required: !!entryOf(box)?.querySelector('[class*="_required_"]'),
      });
    }
    return { fields, claimed };
  },

  refine(field) {
    const path = entryOf(field.el)?.getAttribute('data-field-path') ?? '';
    const key = SYSTEM[field.id] ?? SYSTEM[field.name] ?? SYSTEM[path];
    if (key) field.adapterKey = key;
  },
};
