/** Shared types for the autofill engine. */

/** How a question is answered on the page. */
export type ControlKind =
  | 'text' // text-like input or textarea
  | 'select' // native <select>
  | 'radio' // radio group: choose one
  | 'checkboxes' // checkbox group: choose several
  | 'checkbox' // a single checkbox: yes/no
  | 'combobox' // custom dropdown or autocomplete
  | 'buttons' // toggle buttons: choose one
  | 'file';

/**
 * Everything the engine knows about one question, as plain data. Classification
 * and value resolution work on this alone, which keeps them testable without a DOM.
 */
export interface FieldInfo {
  kind: ControlKind;
  /** The question as shown, tidied. */
  label: string;
  /** Helper text shown with the question. */
  description: string;
  name: string;
  id: string;
  autocomplete: string;
  placeholder: string;
  /** `type` of the input: text, email, tel, url, number, date, month, textarea… */
  inputType: string;
  required: boolean;
  /** Option texts, in page order. Empty for free text and for dropdowns that load on demand. */
  options: string[];
  /** Heading of the form section the question sits in. */
  section: string;
  /** Several options may be chosen. */
  multiple: boolean;
  maxLength: number | null;
  /** `accept` of a file input. */
  accept: string;
}

/** Everything in the profile a form can ask for. */
export type FieldKey =
  | 'fullName'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'preferredName'
  | 'pronouns'
  | 'email'
  | 'phone'
  | 'phoneCountryCode'
  | 'phoneType'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'region'
  | 'postalCode'
  | 'country'
  | 'location'
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'website'
  | 'twitter'
  | 'currentCompany'
  | 'currentTitle'
  | 'yearsExperience'
  | 'eduSchool'
  | 'eduDegree'
  | 'eduField'
  | 'eduMinor'
  | 'eduGpa'
  | 'eduStart'
  | 'eduStartMonth'
  | 'eduStartYear'
  | 'eduEnd'
  | 'eduEndMonth'
  | 'eduEndYear'
  | 'eduCurrent'
  | 'expCompany'
  | 'expTitle'
  | 'expLocation'
  | 'expDescription'
  | 'expStart'
  | 'expStartMonth'
  | 'expStartYear'
  | 'expEnd'
  | 'expEndMonth'
  | 'expEndYear'
  | 'expCurrent'
  | 'authorized'
  | 'sponsorship'
  | 'authStatus'
  | 'salary'
  | 'startDate'
  | 'noticePeriod'
  | 'relocate'
  | 'workMode'
  | 'over18'
  | 'howHeard'
  | 'gender'
  | 'race'
  | 'hispanic'
  | 'veteran'
  | 'disability'
  | 'indigenous'
  | 'visibleMinority'
  | 'resume'
  | 'coverLetter';

export const DEMOGRAPHIC_KEYS: ReadonlySet<FieldKey> = new Set<FieldKey>([
  'gender',
  'race',
  'hispanic',
  'veteran',
  'disability',
  'indigenous',
  'visibleMinority',
]);

export interface Classification {
  key: FieldKey;
  /** 0–1. At or above 0.8 the field is filled outright; below that it is flagged. */
  confidence: number;
}

/** What to enter for a field. */
export interface FillValue {
  /** Text for free-text fields. */
  text: string;
  /** Wordings for picking an option, most canonical first. */
  forms: string[];
  /** Several selections, each with its own wordings, for checkbox groups. */
  multi?: string[][];
  /** State for a single checkbox. */
  checked?: boolean;
}

export type FillStatus =
  | 'filled' // entered with confidence
  | 'review' // entered, but worth a look
  | 'unknown' // no answer available
  | 'skipped' // deliberately left alone
  | 'failed'; // an answer existed but could not be entered

export type FillSource = 'saved' | 'similar' | 'profile' | 'resume';
