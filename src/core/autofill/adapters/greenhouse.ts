/**
 * Greenhouse: both the current boards (job-boards.greenhouse.io, a React app
 * whose dropdowns are react-select widgets) and the classic boards and
 * embedded forms (boards.greenhouse.io, plain HTML).
 */
import type { FieldKey } from '../model';
import type { SiteAdapter } from './types';

const BY_ID: Record<string, FieldKey> = {
  first_name: 'firstName',
  last_name: 'lastName',
  preferred_name: 'preferredName',
  email: 'email',
  phone: 'phone',
  'candidate-location': 'location',
  resume: 'resume',
  cover_letter: 'coverLetter',
};

const REPEATED: Record<string, FieldKey> = {
  school: 'eduSchool',
  degree: 'eduDegree',
  discipline: 'eduField',
  'start-month': 'eduStartMonth',
  'start-year': 'eduStartYear',
  'end-month': 'eduEndMonth',
  'end-year': 'eduEndYear',
};

export const greenhouse: SiteAdapter = {
  id: 'greenhouse',

  formRoot(doc) {
    return (
      doc.querySelector('#application-form, form#application_form, form[action*="/applications"]') ??
      (doc.querySelector('#first_name, input[name="job_application[first_name]"]') ? doc.body : null)
    );
  },

  ignore(el) {
    // The phone widget's country picker and react-select's hidden validation inputs.
    if (el.closest('.iti__dropdown-content, .iti__country-container')) return true;
    return typeof el.className === 'string' && /requiredInput/.test(el.className);
  },

  refine(field) {
    const id = field.id;
    const direct = BY_ID[id];
    if (direct) {
      field.adapterKey = direct;
      return;
    }
    // The "Country" dropdown beside the phone number lists countries with dial codes.
    if (id === 'country' && field.kind === 'combobox') {
      field.adapterKey = 'phoneCountryCode';
      return;
    }
    const repeated = /^([a-z-]+?)--(\d+)$/.exec(id);
    const key = repeated ? REPEATED[repeated[1]!] : undefined;
    if (repeated && key) {
      field.adapterKey = key;
      field.group = Number(repeated[2]);
      return;
    }
    // Classic boards: job_application[first_name] and friends.
    const classic = /^job_application\[(\w+)\]$/.exec(field.name);
    if (classic && BY_ID[classic[1]!]) field.adapterKey = BY_ID[classic[1]!]!;
  },
};
