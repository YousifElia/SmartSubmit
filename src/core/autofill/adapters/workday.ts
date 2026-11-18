/**
 * Workday (*.myworkdayjobs.com, *.myworkdaysite.com): a single-page app whose
 * application runs over several steps behind a per-employer account.
 *
 * Every question sits in a `formField-<name>` wrapper with a real label.
 * Dropdowns are buttons that open a list, some questions are search prompts
 * ("How did you hear about us?", school, field of study), and dates are split
 * into month and year boxes. The sign-in page also carries a field for robots
 * only, which must never be filled.
 */
import type { EntryKind, EntryNeed } from '../expand';
import type { FormField } from '../fields';
import type { FieldKey } from '../model';
import { textOf, type SiteAdapter } from './types';

/** By the field's own automation id, or its wrapper's (`formField-<name>`). */
const KEYS: Record<string, FieldKey> = {
  legalNameSection_firstName: 'firstName',
  legalNameSection_middleName: 'middleName',
  legalNameSection_lastName: 'lastName',
  addressSection_addressLine1: 'addressLine1',
  addressSection_addressLine2: 'addressLine2',
  addressSection_city: 'city',
  addressSection_postalCode: 'postalCode',
  addressSection_countryRegion: 'region',
  countryDropdown: 'country',
  email: 'email',
  'phone-number': 'phone',
  'phone-device-type': 'phoneType',
  'country-phone-code': 'phoneCountryCode',
  linkedinQuestion: 'linkedin',
  'file-upload-input-ref': 'resume',
  // The sign-in and create-account pages.
  password: 'accountPassword',
  verifyPassword: 'accountPasswordConfirm',
  // Work experience and education entries.
  jobTitle: 'expTitle',
  companyName: 'expCompany',
  location: 'expLocation',
  roleDescription: 'expDescription',
  currentlyWorkHere: 'expCurrent',
  schoolName: 'eduSchool',
  school: 'eduSchool',
  // Languages and skills.
  language: 'language',
  nativeLanguage: 'languageFluent',
  skills: 'skills',
  degree: 'eduDegree',
  fieldOfStudy: 'eduField',
  gradeAverage: 'eduGpa',
};

/** Date boxes: which date the wrapper holds, and whether it belongs to education or work. */
const DATES: Record<string, 'start' | 'end'> = {
  startDate: 'start',
  firstYearAttended: 'start',
  endDate: 'end',
  lastYearAttended: 'end',
};

const WRAPPER = '[data-automation-id^="formField-"]';

function wrapperOf(el: Element): Element | null {
  return el.closest(WRAPPER);
}

function wrapperName(el: Element): string {
  return (wrapperOf(el)?.getAttribute('data-automation-id') ?? '').slice('formField-'.length);
}

/** A wrapper's question: its label or legend, without the required marker. */
function questionOf(wrapper: Element | null): string {
  const label = wrapper?.querySelector('legend, label');
  if (!label) return '';
  const copy = label.cloneNode(true) as Element;
  copy.querySelectorAll('abbr, [aria-hidden="true"]').forEach((n) => n.remove());
  return textOf(copy);
}

function isShown(el: Element): boolean {
  return el.getClientRects().length > 0;
}

/** The block a repeated section's field sits in, and its first field's prefix. */
const ENTRY_BLOCKS: Record<EntryKind, [section: string, prefix: string]> = {
  experience: ['workExperienceSection', 'workExperience-'],
  education: ['educationSection', 'education-'],
  languages: ['languageSection', 'language-'],
};
const ENTRY = '[data-automation-id^="workExperience-"], [data-automation-id^="education-"], [data-automation-id^="language-"]';

/** Which repeated entry a field belongs to: "workExperience-2" → 1. */
function entryIndex(el: Element): number {
  const entry = el.closest(ENTRY);
  const n = /-(\d+)$/.exec(entry?.getAttribute('data-automation-id') ?? '');
  return n ? Number(n[1]) - 1 : 0;
}

function inEducation(el: Element): boolean {
  if (el.closest('[data-automation-id^="education-"], [data-automation-id="educationSection"]')) return true;
  if (el.closest('[data-automation-id^="workExperience-"], [data-automation-id="workExperienceSection"]')) return false;
  return /^(school|degree|fieldOfStudy|firstYearAttended|lastYearAttended)/.test(wrapperName(el));
}

export const workday: SiteAdapter = {
  id: 'workday',
  // Each employer's Workday has its own account to sign in to or create.
  passwords: true,

  countEntries(root) {
    const counts: EntryNeed = { experience: 0, education: 0, languages: 0 };
    for (const kind of Object.keys(ENTRY_BLOCKS) as EntryKind[]) {
      const [section, prefix] = ENTRY_BLOCKS[kind];
      const box = root.querySelector(`[data-automation-id="${section}"]`);
      counts[kind] = box ? box.querySelectorAll(`[data-automation-id^="${prefix}"]`).length : 0;
    }
    return counts;
  },

  formRoot(doc) {
    // Any step of the application, including its last, which has no questions.
    if (!doc.querySelector(`${WRAPPER}, [data-automation-id^="progressBar"]`)) return null;
    return doc.querySelector('[data-automation-id="applyFlowPage"]') ?? doc.querySelector('main') ?? doc.body;
  },

  labelFor(el) {
    const wrapper = wrapperOf(el);
    if (!wrapper) return '';
    const question = questionOf(wrapper);
    // A date's month and year boxes share one label: say which part this is.
    const part = el.closest('[data-automation-id="dateInputWrapper"]') ? el.getAttribute('aria-label') : '';
    return part && question ? `${question} (${part})` : question;
  },

  ignore(el) {
    // The sign-in page's trap for robots.
    if (el.getAttribute('data-automation-id') === 'beecatcher') return true;
    return false;
  },

  extra(root) {
    const fields: Partial<FormField>[] = [];
    const claimed: Element[] = [];
    // Dropdowns: a button that opens a list of options.
    for (const button of root.querySelectorAll<HTMLElement>(`${WRAPPER} button[aria-haspopup="listbox"]`)) {
      if (!isShown(button) || (button as HTMLButtonElement).disabled) continue;
      const wrapper = wrapperOf(button);
      claimed.push(button);
      fields.push({
        el: button,
        anchor: button,
        kind: 'combobox',
        widget: 'listbox-button',
        label: questionOf(wrapper),
        options: [],
        inputType: 'combobox',
        name: wrapperName(button),
        required: button.getAttribute('aria-required') === 'true' || !!wrapper?.querySelector('label abbr, legend abbr'),
      });
    }
    return { fields, claimed };
  },

  refine(field) {
    const own = field.el.getAttribute('data-automation-id') ?? '';
    const wrapper = wrapperName(field.el);
    const key = KEYS[own] ?? KEYS[wrapper];
    if (key) field.adapterKey = key;
    if (!field.required && wrapperOf(field.el)?.querySelector('label abbr, legend abbr')) field.required = true;

    // Search prompts: type to search, then pick from the results.
    if (field.el.closest('[data-automation-id="multiselectInputContainer"]')) {
      field.kind = 'combobox';
      field.widget = 'workday-prompt';
      field.inputType = 'combobox';
      field.options = [];
    }

    // Month and year boxes.
    const which = DATES[wrapper];
    const part = (field.el.getAttribute('data-automation-id') ?? '').match(/dateSection(Month|Year)/)?.[1];
    if (which && part) {
      const education = inEducation(field.el);
      const prefix = education ? 'edu' : 'exp';
      field.adapterKey = `${prefix}${which === 'start' ? 'Start' : 'End'}${part}` as FieldKey;
    }

    // A language's level, asked for reading, writing and speaking in turn.
    if (/^languageProficiency/.test(wrapper)) field.adapterKey = 'languageLevel';
    // Skills: one search box that takes them one at a time.
    if (field.adapterKey === 'skills') field.multiple = true;

    if (/^(edu|exp|language)/.test(field.adapterKey ?? '') && field.adapterKey !== 'languagesSpoken') {
      field.group = entryIndex(field.el);
      field.groupFixed = true;
    }
  },
};
