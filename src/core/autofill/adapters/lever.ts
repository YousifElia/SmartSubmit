/** Lever (jobs.lever.co): a server-rendered form of "application-question" rows. */
import type { FieldKey } from '../model';
import { textOf, type SiteAdapter } from './types';

const BY_NAME: Record<string, FieldKey> = {
  name: 'fullName',
  email: 'email',
  phone: 'phone',
  org: 'currentCompany',
  location: 'location',
  resume: 'resume',
  'urls[LinkedIn]': 'linkedin',
  'urls[GitHub]': 'github',
  'urls[Portfolio]': 'portfolio',
  'urls[Twitter]': 'twitter',
  'urls[Other]': 'website',
  'eeo[gender]': 'gender',
  'eeo[race]': 'race',
  'eeo[veteran]': 'veteran',
  'eeo[disability]': 'disability',
};

export const lever: SiteAdapter = {
  id: 'lever',

  formRoot(doc) {
    return doc.querySelector('form#application-form, form.application-form, .application-form form, form[action*="/apply"]');
  },

  labelFor(el) {
    const row = el.closest('.application-question');
    const label = row?.querySelector('.application-label');
    if (!label) return '';
    // The label can carry a description; the question itself is in `.text` when present.
    return textOf(label.querySelector('.text')) || textOf(label);
  },

  ignore(el) {
    return el.getAttribute('name') === 'selectedLocation';
  },

  refine(field) {
    const key = BY_NAME[field.name];
    if (key) field.adapterKey = key;
    if (field.name === 'location') {
      field.kind = 'combobox';
      field.widget = 'lever-location';
    }
  },
};
