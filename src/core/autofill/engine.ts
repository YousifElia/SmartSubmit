/**
 * The autofill engine: decide what goes in each field, enter it, and report.
 *
 * For each question the order of preference is:
 *   1. an answer the user saved for exactly this question,
 *   2. the matching piece of their profile,
 *   3. an answer saved for a similar question (entered, but flagged),
 *   4. nothing: the question is left for the user.
 *
 * A field the user has already answered is never overwritten.
 */
import type { SavedAnswer } from '../types';
import { findAnswer, type AnswerMatch } from './answers';
import { classify } from './classify';
import type { FormField } from './fields';
import {
  attachFile,
  fillButtons,
  fillCheckbox,
  fillCheckboxes,
  fillCombobox,
  fillRadio,
  fillSelect,
  fillText,
  readValue,
  sleep,
} from './fill';
import { DEMOGRAPHIC_KEYS, type ControlKind, type FieldKey, type FillSource, type FillStatus } from './model';
import { isPlaceholderOption, matchNumericRange, matchOption, matchOptions } from './options';
import { profileValue, type ResolvedValue } from './values';
import type { Snapshot } from '../messages';

export interface EngineContext {
  snapshot: Snapshot;
  /** ISO code of the country the job is in, or ''. */
  jobCountry: string;
  /** The resume to attach, fetched only if a resume field exists. Null when there is none. */
  resumeFile: () => Promise<File | null>;
  /** The same resume as plain text, for a box that asks for it pasted in. */
  resumeText?: () => Promise<string | null>;
  /** The email and password saved for application-system accounts. */
  account?: { email: string; password: string };
  /** The page signs in to, or creates, an account with the application system. */
  accountPage?: boolean;
  /** Leave file inputs alone (used by read-only checks on live sites). */
  skipFiles?: boolean;
}

export interface FieldResult {
  uid: string;
  label: string;
  kind: ControlKind;
  required: boolean;
  status: FillStatus;
  source: FillSource | null;
  key: FieldKey | null;
  /** What was entered, for display. */
  value: string;
  /** Why the field needs attention, in plain words. */
  note: string;
  /** Saved answer used, if any. */
  answerId: string | null;
  /** The saved question this was matched to, when it was not an exact match. */
  similarTo: string;
  confidence: number;
}

interface Plan {
  source: FillSource;
  key: FieldKey | null;
  value: ResolvedValue;
  confidence: number;
  answer: SavedAnswer | null;
  similarTo: string;
}

/** Confidence at or above which a profile match is entered without being flagged. */
const SURE = 0.8;

/** At most this many choices go into one multi-choice search box. */
const MAX_MULTI = 20;

/**
 * Agreements, consents and signatures. These are never entered or remembered:
 * they bind the person to something, so they give them themselves, each time.
 */
export const CONSENT =
  /\b(i (have read|agree|accept|acknowledge|consent|certify|confirm|attest|authori[sz]e|understand)|agree to|consent|acknowledg(e|ement)|attest(ation)?|terms (of (service|use)|and conditions|& conditions)|privacy (policy|notice|statement)|(e-?|electronic )?signature)\b/i;

const KEY_LABELS: Partial<Record<FieldKey, string>> = {
  skills: 'skills',
  languagesSpoken: 'languages',
  language: 'languages',
  languageLevel: 'languages, with how well you speak them,',
  speaksLanguage: 'languages',
  accountPassword: 'application-account password',
  accountPasswordConfirm: 'application-account password',
  linkedin: 'LinkedIn link',
  github: 'GitHub link',
  portfolio: 'portfolio link',
  website: 'website',
  phone: 'phone number',
  salary: 'desired salary',
  startDate: 'start date',
  howHeard: 'usual answer to “How did you hear about us?”',
  authorized: 'work authorization',
  sponsorship: 'sponsorship answer',
  eduSchool: 'education',
  eduDegree: 'education',
  eduField: 'education',
  eduEnd: 'graduation date',
  currentCompany: 'work experience',
  currentTitle: 'work experience',
  location: 'city',
  city: 'city',
  region: 'province or state',
  postalCode: 'postal code',
  addressLine1: 'street address',
  pronouns: 'pronouns',
  noticePeriod: 'notice period',
  relocate: 'relocation answer',
  over18: 'age confirmation',
  yearsExperience: 'years of experience',
};

function valueFromAnswer(answer: SavedAnswer): ResolvedValue {
  if (Array.isArray(answer.answer)) {
    return {
      text: answer.answer.join(', '),
      forms: answer.answer.length === 1 ? [answer.answer[0]!] : [],
      multi: answer.answer.map((a) => [a]),
      certainty: 1,
    };
  }
  const text = answer.answer;
  const yes = /^(yes|true|checked)$/i.test(text.trim());
  const no = /^(no|false|unchecked)$/i.test(text.trim());
  return { text, forms: [text], checked: yes ? true : no ? false : undefined, certainty: 1 };
}

function display(value: string | string[] | boolean | null): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'Checked' : '';
  return Array.isArray(value) ? value.join(', ') : value;
}

/** Whether a field already holds a real answer. */
function isAnswered(field: FormField): boolean {
  const current = readValue(field);
  if (current === null) return false;
  // A phone widget pre-fills the dial code; that is not an answer.
  if (field.kind === 'text' && typeof current === 'string' && /^\+?\d{1,3}$/.test(current)) return false;
  return true;
}

function result(field: FormField, over: Partial<FieldResult>): FieldResult {
  return {
    uid: field.uid,
    label: field.label || field.placeholder || field.name || 'Unlabelled field',
    kind: field.kind,
    required: field.required,
    status: 'unknown',
    source: null,
    key: null,
    value: '',
    note: '',
    answerId: null,
    similarTo: '',
    confidence: 0,
    ...over,
  };
}

/**
 * Counts how many times each repeated profile field has been seen, so the
 * second "School" on a page gets the second education entry.
 */
class GroupCounter {
  private seen = new Map<string, number>();
  private language = -1;
  next(key: FieldKey, field: FormField): number {
    const languageEntry = key === 'language' || key === 'languageLevel' || key === 'languageFluent';
    if (!/^(edu|exp)/.test(key) && !languageEntry) return 0;
    if (field.groupFixed || field.group > 0) {
      if (key === 'language') this.language = field.group;
      return field.group;
    }
    // A language entry can ask its level several times (reading, writing,
    // speaking): those follow the language named last.
    if (key === 'languageLevel' || key === 'languageFluent') return Math.max(this.language, 0);
    const count = this.seen.get(key) ?? 0;
    this.seen.set(key, count + 1);
    if (key === 'language') this.language = count;
    return count;
  }
}

function plan(field: FormField, ctx: EngineContext, groups: GroupCounter): Plan | { note: string; key: FieldKey | null } {
  const { snapshot } = ctx;
  const query = { question: field.label, options: field.options, multiple: field.multiple || field.kind === 'checkboxes' };
  const threshold = snapshot.settings.autofill.similarThreshold;
  const saved: AnswerMatch | null = field.label ? findAnswer(query, snapshot.answers, threshold) : null;
  const classified = field.adapterKey ? { key: field.adapterKey, confidence: 0.97 } : classify(field);

  // The resume's own text, fetched when it is entered: always the current one,
  // never an older copy saved as an answer.
  if (classified?.key === 'resumeText') {
    return { source: 'resume', key: 'resumeText', value: { text: '', forms: [], certainty: 1 }, confidence: classified.confidence, answer: null, similarTo: '' };
  }

  // 1. An answer saved for exactly this question.
  if (saved?.exact) {
    return { source: 'saved', key: null, value: valueFromAnswer(saved.answer), confidence: 1, answer: saved.answer, similarTo: '' };
  }

  // 2. The profile.
  let note = '';
  let key: FieldKey | null = null;
  if (classified) {
    key = classified.key;
    if (DEMOGRAPHIC_KEYS.has(key) && !snapshot.settings.autofill.demographics) {
      return { note: 'Voluntary question: left for you (autofill for these is off).', key };
    }
    const value = profileValue(key, snapshot.profile, {
      field,
      group: groups.next(key, field),
      jobCountry: ctx.jobCountry,
      demographics: snapshot.settings.autofill.demographics,
      intlPhone: field.widget === 'intl-tel',
      account: ctx.account,
      accountPage: ctx.accountPage,
    });
    if (value) {
      return {
        source: 'profile',
        key,
        value,
        confidence: classified.confidence * value.certainty,
        answer: null,
        similarTo: '',
      };
    }
    if (!DEMOGRAPHIC_KEYS.has(key) && KEY_LABELS[key]) note = `Add your ${KEY_LABELS[key]} to your profile to have this filled.`;
  }

  // 3. An answer saved for a similar question.
  if (saved) {
    return {
      source: 'similar',
      key,
      value: valueFromAnswer(saved.answer),
      confidence: saved.score,
      answer: saved.answer,
      similarTo: saved.answer.question,
    };
  }

  return { note, key };
}

/** Enter one planned value. Returns what ended up on the page, or null on failure. */
async function enter(field: FormField, value: ResolvedValue): Promise<{ shown: string } | { failed: string }> {
  const real = field.options.filter((o) => !isPlaceholderOption(o));
  const noOption = () =>
    ({ failed: value.text ? `“${value.text}” is not one of the choices here.` : 'None of the choices matched.' }) as const;

  const pickOne = () => {
    if (value.number !== undefined) {
      const range = matchNumericRange(value.number, field.options);
      const exact = matchOption(value.forms, field.options, 0.95);
      return exact ?? range ?? matchOption(value.forms, field.options);
    }
    return matchOption(value.forms, field.options);
  };

  switch (field.kind) {
    case 'text': {
      if (!value.text) return { failed: 'Nothing to enter.' };
      const ok = fillText(field.el as HTMLInputElement | HTMLTextAreaElement, value.text);
      return ok ? { shown: (field.el as HTMLInputElement).value } : { failed: 'The page did not accept the value.' };
    }
    case 'select': {
      const el = field.el as HTMLSelectElement;
      if (el.multiple && value.multi) {
        const picks = matchOptions(value.multi, field.options);
        if (picks.length === 0) return noOption();
        [...el.options].forEach((o, i) => (o.selected = picks.includes(i)));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { shown: picks.map((i) => field.options[i]).join(', ') };
      }
      const match = pickOne();
      if (!match) return real.length === 0 ? { failed: 'This list has no choices yet.' } : noOption();
      return fillSelect(el, match.index) ? { shown: field.options[match.index]! } : { failed: 'The page did not accept the choice.' };
    }
    case 'radio': {
      const match = pickOne();
      if (!match) return noOption();
      const ok = fillRadio(field.optionEls[match.index] as HTMLInputElement);
      return ok ? { shown: field.options[match.index]! } : { failed: 'The page did not accept the choice.' };
    }
    case 'buttons': {
      const match = pickOne();
      if (!match) return noOption();
      const ok = await fillButtons(field.optionEls, match.index);
      return ok ? { shown: field.options[match.index]! } : { failed: 'The page did not accept the choice.' };
    }
    case 'checkboxes': {
      const sets = value.multi ?? (value.forms.length > 0 ? [value.forms] : []);
      const picks = matchOptions(sets, field.options);
      if (picks.length === 0) return noOption();
      await fillCheckboxes(field.optionEls as HTMLInputElement[], picks);
      return { shown: picks.map((i) => field.options[i]).join(', ') };
    }
    case 'checkbox': {
      if (value.checked === undefined) return { failed: 'Not a yes/no answer.' };
      // Leaving a box unticked needs no action and is not worth reporting as filled.
      if (!value.checked) return { failed: '' };
      return fillCheckbox(field.el as HTMLInputElement, true) ? { shown: 'Checked' } : { failed: 'The page did not accept the tick.' };
    }
    case 'combobox': {
      // A search box that takes several choices, one at a time (skills).
      if (field.multiple && value.multi && value.multi.length > 0) {
        const chosen: string[] = [];
        for (const set of value.multi.slice(0, MAX_MULTI)) {
          const got = await fillCombobox(field, { forms: set, query: set[0], text: set[0] ?? '' });
          if (got) chosen.push(got);
          await sleep(60);
        }
        return chosen.length > 0 ? { shown: chosen.join(', ') } : noOption();
      }
      const chosen = await fillCombobox(field, { forms: value.forms, query: value.query, text: value.text });
      return chosen ? { shown: chosen } : noOption();
    }
    case 'file':
      return { failed: 'Files are attached separately.' };
  }
}

async function fillFile(field: FormField, ctx: EngineContext): Promise<FieldResult> {
  const key = field.adapterKey ?? classify(field)?.key ?? null;
  if (key !== 'resume') {
    return result(field, {
      status: 'skipped',
      key,
      note: key === 'coverLetter' ? 'Cover letter: attach one yourself if you want to.' : 'Attach this file yourself.',
    });
  }
  if (ctx.skipFiles) return result(field, { status: 'skipped', key, note: 'File attachment was skipped.' });
  if (isAnswered(field)) return result(field, { status: 'skipped', key, value: display(readValue(field)), note: 'A file is already attached.' });
  const file = await ctx.resumeFile();
  if (!file) return result(field, { status: 'unknown', key, note: 'Add a resume in SmartSubmit to have it attached here.' });
  const ok = attachFile(field.el as HTMLInputElement, file);
  return ok
    ? result(field, { status: 'filled', source: 'resume', key, value: file.name, confidence: 1 })
    : result(field, { status: 'failed', key, note: 'The page did not accept the file. Attach it yourself.' });
}

export interface AutofillOptions {
  onProgress?: (done: number, total: number, latest: FieldResult) => void;
  /** Only fill these fields (by uid). Used when re-running a single field. */
  only?: Set<string>;
}

/** Fill every field that can be filled, in page order. */
export async function autofill(fields: FormField[], ctx: EngineContext, options: AutofillOptions = {}): Promise<FieldResult[]> {
  const groups = new GroupCounter();
  const results: FieldResult[] = [];
  const targets = options.only ? fields.filter((f) => options.only!.has(f.uid)) : fields;

  for (const field of targets) {
    let outcome: FieldResult;
    try {
      outcome = await fillOne(field, ctx, groups);
    } catch (error) {
      outcome = result(field, { status: 'failed', note: error instanceof Error ? error.message : 'Something went wrong on this field.' });
    }
    results.push(outcome);
    options.onProgress?.(results.length, targets.length, outcome);
    // Give the page's own scripts a moment to react before touching the next field.
    if (outcome.status === 'filled' || outcome.status === 'review') await sleep(field.kind === 'combobox' ? 120 : 15);
  }
  return results;
}

/**
 * A password box on an application system's sign-in or create-account page.
 * Only the saved application-account password goes in, nothing remembered
 * from elsewhere, and the panel never shows it.
 */
async function fillPassword(field: FormField, ctx: EngineContext): Promise<FieldResult> {
  const key = field.adapterKey ?? classify(field)?.key ?? null;
  if (key !== 'accountPassword' && key !== 'accountPasswordConfirm') {
    return result(field, { status: 'skipped', key, note: 'A password box SmartSubmit doesn’t recognise: left for you.' });
  }
  if (isAnswered(field)) return result(field, { status: 'skipped', key, value: '••••••••', note: 'Already filled in, so left as it is.' });
  if (!ctx.account) return result(field, { status: 'unknown', key, note: 'Press Autofill in the SmartSubmit panel to fill your saved password.' });
  if (!ctx.account.password) {
    return result(field, { status: 'unknown', key, note: 'Save the password you use for application accounts on SmartSubmit’s Profile page to have it filled.' });
  }
  const ok = fillText(field.el as HTMLInputElement, ctx.account.password);
  return ok
    ? result(field, { status: 'filled', source: 'profile', key, value: '••••••••', confidence: 1 })
    : result(field, { status: 'failed', key, note: 'The page did not accept the password.' });
}

async function fillOne(field: FormField, ctx: EngineContext, groups: GroupCounter): Promise<FieldResult> {
  if (!field.el.isConnected) return result(field, { status: 'skipped', note: 'This field is no longer on the page.' });
  if (field.kind === 'file') return fillFile(field, ctx);
  if (field.inputType === 'password') return fillPassword(field, ctx);
  if (CONSENT.test(field.label)) {
    return isAnswered(field)
      ? result(field, { status: 'skipped', value: display(readValue(field)), note: 'Already answered, so left as it is.' })
      : result(field, { status: 'unknown', note: 'An agreement or consent: SmartSubmit leaves these for you to give.' });
  }

  const planned = plan(field, ctx, groups);

  if (isAnswered(field)) {
    return result(field, {
      status: 'skipped',
      key: planned.key,
      value: display(readValue(field)),
      note: 'Already answered, so left as it is.',
    });
  }

  if (!('value' in planned)) return result(field, { status: 'unknown', key: planned.key, note: planned.note });

  if (planned.key === 'resumeText') {
    const text = (await ctx.resumeText?.()) ?? null;
    if (!text) return result(field, { status: 'unknown', key: planned.key, note: 'Add a resume in SmartSubmit to have its text pasted here.' });
    planned.value = { ...planned.value, text };
  }

  const entered = await enter(field, planned.value);
  if ('failed' in entered) {
    return result(field, {
      status: entered.failed ? 'failed' : 'unknown',
      source: planned.source,
      key: planned.key,
      note: entered.failed,
      answerId: planned.answer?.id ?? null,
      similarTo: planned.similarTo,
      confidence: planned.confidence,
    });
  }

  const flagged = planned.source === 'similar' || planned.confidence < SURE;
  return result(field, {
    status: flagged ? 'review' : 'filled',
    source: planned.source,
    key: planned.key,
    value: entered.shown,
    note:
      planned.source === 'similar'
        ? `Reused your answer to “${planned.similarTo}”.`
        : flagged
          ? 'Best guess from your profile. Please check it.'
          : '',
    answerId: planned.answer?.id ?? null,
    similarTo: planned.similarTo,
    confidence: planned.confidence,
  });
}

// ───────────────────────────── Learning ─────────────────────────────

/** Labels for things that should never be remembered. */
const SENSITIVE =
  /\b(ssn|social security|social insurance|sin number|passport|licen[cs]e number|credit card|card number|cvv|cvc|bank|routing|iban|account number|password|passcode|date of birth|birth ?date|birthday|dob|national id|tax id|security (question|answer))\b/i;

export interface Candidate {
  uid: string;
  question: string;
  kind: SavedAnswer['kind'];
  answer: string | string[];
  options: string[];
}

function sameAnswer(a: string | string[], b: string | string[]): boolean {
  const list = (v: string | string[]) => (Array.isArray(v) ? v : [v]).map((s) => s.trim().toLowerCase()).sort();
  return JSON.stringify(list(a)) === JSON.stringify(list(b));
}

/**
 * Answers on the page worth offering to save: questions SmartSubmit had no
 * answer for, and ones where the user changed what it entered.
 */
export function collectCandidates(fields: FormField[], results: FieldResult[], answers: readonly SavedAnswer[]): Candidate[] {
  const byUid = new Map(results.map((r) => [r.uid, r]));
  const out: Candidate[] = [];
  for (const field of fields) {
    if (field.kind === 'file' || !field.label || !field.el.isConnected) continue;
    if (SENSITIVE.test(field.label) || CONSENT.test(field.label) || field.inputType === 'password') continue;
    // The resume's text is pasted from the resume each time, not remembered.
    if (field.inputType === 'textarea' && classify(field)?.key === 'resumeText') continue;

    const current = readValue(field);
    if (current === null) continue;
    const answer: string | string[] = typeof current === 'boolean' ? 'Yes' : current;
    const outcome = byUid.get(field.uid);

    // Entered by SmartSubmit and left alone: nothing new to learn, unless it was
    // a flagged near-match, which the user keeping it confirms as the right answer.
    const untouched =
      !!outcome &&
      (outcome.status === 'filled' || outcome.status === 'review') &&
      outcome.value.trim().toLowerCase() === display(current).trim().toLowerCase();
    if (untouched && !(outcome.status === 'review' && outcome.source === 'similar')) continue;
    // Present before autofill ran and already known from the profile.
    if (outcome?.status === 'skipped' && outcome.key && !outcome.answerId) continue;

    // Already saved with this very answer.
    const query = { question: field.label, options: field.options, multiple: field.multiple };
    const existing = findAnswer(query, answers, 2);
    if (existing?.exact && sameAnswer(existing.answer.answer, answer)) continue;

    out.push({
      uid: field.uid,
      question: field.label,
      kind: field.kind === 'checkbox' ? 'boolean' : Array.isArray(answer) ? 'multi' : field.options.length > 0 || field.kind === 'combobox' ? 'choice' : 'text',
      answer,
      options: field.options,
    });
  }
  return out;
}

export interface Summary {
  filled: number;
  review: number;
  needsYou: number;
  skipped: number;
}

export function summarize(results: FieldResult[]): Summary {
  const count = (s: FillStatus) => results.filter((r) => r.status === s).length;
  return {
    filled: count('filled'),
    review: count('review'),
    needsYou: count('unknown') + count('failed'),
    skipped: count('skipped'),
  };
}
