/**
 * Turning a profile field into what a form wants: text for a text box, and
 * the wordings to look for in a dropdown or radio group.
 */
import {
  AUTH_STATUSES,
  DECLINE_FORMS,
  DEGREES,
  DISABILITY,
  GENDERS,
  MONTHS,
  NO_FORMS,
  RACES,
  VETERAN,
  WORK_MODES,
  YES_FORMS,
  choiceForms,
  choiceLabel,
} from '../data/choices';
import { COUNTRIES, countryByCode, countryForms, regionForms } from '../data/geo';
import {
  cityRegion,
  educationByRecency,
  experienceByRecency,
  formatPhone,
  fullName,
  shortName,
} from '../profile';
import type { Profile, Tri, TriDecline } from '../types';
import type { FieldInfo, FieldKey, FillValue } from './model';
import { norm } from './text';

export interface ValueContext {
  field: FieldInfo;
  /** Which repeated entry the field belongs to (second education block → 1). */
  group: number;
  /** ISO code of the country the job is in, or '' if unknown. */
  jobCountry: string;
  /** Whether the user allows demographic questions to be filled. */
  demographics: boolean;
  /** The phone input is an international widget that wants a +country number. */
  intlPhone?: boolean;
}

/** A value plus how sure we are that it is the right one for this question. */
export type ResolvedValue = FillValue & {
  /** 0–1 multiplier on the classifier's confidence. Below 1 when we had to assume something. */
  certainty: number;
  /** What to type into a search-as-you-type dropdown. */
  query?: string;
  /** Numeric value, for picking from ranges such as "3-5 years". */
  number?: number;
};

function plain(text: string, forms?: string[]): ResolvedValue | null {
  const t = text.trim();
  if (!t) return null;
  return { text: t, forms: forms && forms.length > 0 ? forms : [t], certainty: 1 };
}

function tri(value: Tri, certainty = 1): ResolvedValue | null {
  if (value === '') return null;
  return value === 'yes'
    ? { text: 'Yes', forms: YES_FORMS, checked: true, certainty }
    : { text: 'No', forms: NO_FORMS, checked: false, certainty };
}

function triDecline(value: TriDecline, yesExtra: string[] = [], noExtra: string[] = []): ResolvedValue | null {
  if (value === '') return null;
  if (value === 'decline') return { text: 'Decline to answer', forms: DECLINE_FORMS, certainty: 1 };
  return value === 'yes'
    ? { text: 'Yes', forms: [...YES_FORMS, ...yesExtra], certainty: 1 }
    : { text: 'No', forms: [...NO_FORMS, ...noExtra], certainty: 1 };
}

/** Which country, if any, a question names. Returns an ISO code or ''. */
export function countryInQuestion(label: string): string {
  const text = ` ${norm(label)} `;
  if (/ (united states|usa|u s a|u s|america) /.test(text) || / (in|within|inside) (the )?us /.test(text) || / us (citizen|work|based|person|employment|resident) /.test(text)) {
    return 'US';
  }
  if (/ (canada|canadian) /.test(text)) return 'CA';
  if (/ (united kingdom|uk|u k|great britain|britain) /.test(text)) return 'GB';
  for (const c of COUNTRIES) {
    if (c.code === 'US' || c.code === 'CA' || c.code === 'GB') continue;
    const name = norm(c.name);
    if (name.length >= 4 && text.includes(` ${name} `)) return c.code;
  }
  return '';
}

/** Format a 'YYYY-MM' value the way a text field appears to want it. */
export function formatYearMonth(value: string, field: FieldInfo): string {
  if (!value) return '';
  const [year = '', month = ''] = value.split('-');
  if (field.inputType === 'month') return month ? `${year}-${month}` : '';
  if (field.inputType === 'date') return `${year}-${month || '01'}-01`;
  if (!month) return year;
  const hint = field.placeholder.toLowerCase().replace(/\s/g, '');
  if (hint.includes('mm/dd/yyyy')) return `${month}/01/${year}`;
  if (hint.includes('dd/mm/yyyy')) return `01/${month}/${year}`;
  if (hint.includes('yyyy-mm-dd')) return `${year}-${month}-01`;
  if (hint.includes('mm/yyyy')) return `${month}/${year}`;
  if (hint.includes('yyyy-mm')) return `${year}-${month}`;
  if (hint.includes('mm-yyyy')) return `${month}-${year}`;
  if (hint === 'yyyy') return year;
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

function monthValue(value: string, field?: FieldInfo): ResolvedValue | null {
  const month = value.split('-')[1];
  if (!month) return null;
  const name = MONTHS[Number(month) - 1];
  if (!name) return null;
  // A box that asks for the month as digits ("MM", as Workday's do).
  const digits = !!field && (/^m{1,2}$/i.test(field.placeholder.trim()) || field.inputType === 'number');
  return {
    text: digits ? month : name,
    forms: [name, name.slice(0, 3), month, String(Number(month)), `${month} - ${name}`, `${name} (${month})`],
    certainty: 1,
  };
}

function yearValue(value: string): ResolvedValue | null {
  const year = value.split('-')[0];
  return year ? plain(year) : null;
}

function dateValue(value: string, field: FieldInfo): ResolvedValue | null {
  const text = formatYearMonth(value, field);
  if (!text) return null;
  const [year = '', month = ''] = value.split('-');
  const name = MONTHS[Number(month) - 1];
  const forms = [text];
  if (name) forms.push(`${name} ${year}`, `${name.slice(0, 3)} ${year}`, `${month}/${year}`, `${year}-${month}`);
  forms.push(year);
  return { text, forms, certainty: 1 };
}

function numberOf(text: string): number | undefined {
  const match = /\d+(?:[.,]\d+)?/.exec(text.replace(/,(?=\d{3})/g, ''));
  return match ? Number(match[0].replace(',', '.')) : undefined;
}

/**
 * The value for a profile field, shaped for one specific question. Returns
 * null when the profile has nothing to offer, in which case the field is left
 * for the user.
 */
export function profileValue(key: FieldKey, profile: Profile, ctx: ValueContext): ResolvedValue | null {
  const { field } = ctx;
  const label = norm(field.label);
  const education = educationByRecency(profile)[ctx.group];
  const experience = experienceByRecency(profile)[ctx.group];
  const demo = profile.demographics;

  switch (key) {
    // ── Identity ──
    case 'fullName':
      return plain(/\blegal\b/.test(label) ? fullName(profile) : shortName(profile));
    case 'firstName':
      return plain(profile.firstName);
    case 'middleName':
      return plain(/\binitial\b/.test(label) ? profile.middleName.trim().slice(0, 1) : profile.middleName);
    case 'lastName':
      return plain(profile.lastName);
    case 'preferredName':
      return plain(profile.preferredName || profile.firstName);
    case 'pronouns':
      return plain(profile.pronouns);
    case 'email':
      return plain(profile.email);
    case 'phone': {
      if (!profile.phone.trim()) return null;
      if (ctx.intlPhone) return plain(formatPhone(profile, 'e164'));
      // Otherwise keep the number as the user wrote it; they know what their forms accept.
      return plain(profile.phone.trim().startsWith('+') ? profile.phone : formatPhone(profile, 'national'));
    }
    case 'phoneCountryCode': {
      const c = countryByCode(profile.phoneCountry);
      if (!c) return null;
      return plain(`+${c.dial}`, [`${c.name} (+${c.dial})`, `${c.name} +${c.dial}`, c.name, ...c.aliases, `+${c.dial}`, c.dial, c.code]);
    }
    case 'phoneType':
      return plain('Mobile', ['Mobile', 'Cell', 'Cell Phone', 'Mobile Phone', 'Cellular', 'Personal Cell', 'Personal']);

    // ── Address ──
    case 'addressLine1':
      return plain(profile.address.line1);
    case 'addressLine2':
      return plain(profile.address.line2);
    case 'city':
      return plain(profile.address.city);
    case 'region':
      return plain(profile.address.region, regionForms(profile.address.region, profile.address.country));
    case 'postalCode':
      return plain(profile.address.postalCode);
    case 'country': {
      const c = countryByCode(profile.address.country);
      return c ? plain(c.name, countryForms(c.code)) : null;
    }
    case 'location': {
      const { city, region, country } = profile.address;
      if (!city.trim()) return null;
      const c = countryByCode(country);
      const regionCode = regionForms(region, country).at(-1) ?? region;
      const forms = [
        [city, region, c?.name].filter(Boolean).join(', '),
        [city, regionCode, c?.name].filter(Boolean).join(', '),
        [city, region].filter(Boolean).join(', '),
        [city, regionCode].filter(Boolean).join(', '),
        [city, c?.name].filter(Boolean).join(', '),
        city,
      ];
      return { text: cityRegion(profile), forms, query: city.trim(), certainty: 1 };
    }

    // ── Links ──
    case 'linkedin':
      return plain(profile.links.linkedin);
    case 'github':
      return plain(profile.links.github);
    case 'portfolio':
      return plain(profile.links.portfolio || profile.links.website);
    case 'website':
      return plain(profile.links.website || profile.links.portfolio);
    case 'twitter':
      return plain(profile.links.twitter);

    // ── Current role ──
    case 'currentCompany':
      return plain(experienceByRecency(profile)[0]?.company ?? '');
    case 'currentTitle':
      return plain(experienceByRecency(profile)[0]?.title ?? '');
    case 'yearsExperience': {
      const value = plain(profile.preferences.yearsExperience);
      return value ? { ...value, number: numberOf(value.text) } : null;
    }

    // ── Education ──
    case 'eduSchool':
      return education ? withQuery(plain(education.school)) : null;
    case 'eduDegree': {
      if (!education) return null;
      const level = choiceLabel(DEGREES, education.degree);
      const forms = [education.degreeName, ...choiceForms(DEGREES, education.degree)].filter(Boolean);
      return plain(education.degreeName || level, forms);
    }
    case 'eduField':
      return education ? withQuery(plain(education.field)) : null;
    case 'eduMinor':
      return education ? plain(education.minor) : null;
    case 'eduGpa':
      return education ? plain(education.gpa) : null;
    case 'eduStart':
      return education ? dateValue(education.start, field) : null;
    case 'eduStartMonth':
      return education ? monthValue(education.start, ctx.field) : null;
    case 'eduStartYear':
      return education ? yearValue(education.start) : null;
    case 'eduEnd':
      return education ? dateValue(education.end, field) : null;
    case 'eduEndMonth':
      return education ? monthValue(education.end, ctx.field) : null;
    case 'eduEndYear':
      return education ? yearValue(education.end) : null;
    case 'eduCurrent':
      return education ? { text: education.current ? 'Yes' : 'No', forms: [], checked: education.current, certainty: 1 } : null;

    // ── Work history ──
    case 'expCompany':
      return experience ? plain(experience.company) : null;
    case 'expTitle':
      return experience ? plain(experience.title) : null;
    case 'expLocation':
      return experience ? plain(experience.location) : null;
    case 'expDescription':
      return experience ? plain(experience.description) : null;
    case 'expStart':
      return experience ? dateValue(experience.start, field) : null;
    case 'expStartMonth':
      return experience ? monthValue(experience.start, ctx.field) : null;
    case 'expStartYear':
      return experience ? yearValue(experience.start) : null;
    case 'expEnd':
      return experience && !experience.current ? dateValue(experience.end, field) : null;
    case 'expEndMonth':
      return experience && !experience.current ? monthValue(experience.end, ctx.field) : null;
    case 'expEndYear':
      return experience && !experience.current ? yearValue(experience.end) : null;
    case 'expCurrent':
      return experience ? { text: experience.current ? 'Yes' : 'No', forms: [], checked: experience.current, certainty: 1 } : null;

    // ── Work authorization ──
    case 'authorized':
    case 'sponsorship': {
      const pick = (code: string) => profile.workAuth[code]?.[key] ?? '';
      const named = countryInQuestion(field.label);
      if (named) return tri(pick(named));
      if (ctx.jobCountry) return tri(pick(ctx.jobCountry), 0.95);
      // No country is named. If the answer is the same everywhere we know about, it is safe.
      const answers = new Set(Object.values(profile.workAuth).map((a) => a[key]).filter(Boolean));
      if (answers.size === 1) return tri([...answers][0] as Tri, 0.9);
      // Otherwise assume the question is about where the user lives, and flag it.
      return tri(pick(profile.address.country), 0.7);
    }
    case 'authStatus': {
      const code = countryInQuestion(field.label) || ctx.jobCountry || profile.address.country;
      const auth = profile.workAuth[code];
      if (!auth?.status) return null;
      const value = plain(auth.detail || choiceLabel(AUTH_STATUSES, auth.status), [
        ...(auth.detail ? [auth.detail] : []),
        ...choiceForms(AUTH_STATUSES, auth.status),
      ]);
      return value && !countryInQuestion(field.label) && !ctx.jobCountry ? { ...value, certainty: 0.8 } : value;
    }

    // ── Common questions ──
    case 'salary': {
      const value = plain(profile.preferences.salary);
      return value ? { ...value, number: numberOf(value.text) } : null;
    }
    case 'startDate': {
      const start = profile.preferences.startDate.trim();
      if (!start) return null;
      // A date picker only accepts a real date.
      if (field.inputType === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
      return plain(start);
    }
    case 'noticePeriod':
      return plain(profile.preferences.noticePeriod);
    case 'relocate':
      return tri(profile.preferences.relocate);
    case 'workMode': {
      const mode = WORK_MODES.find((m) => m.value === profile.preferences.workMode);
      return mode ? plain(mode.label, [...mode.forms]) : null;
    }
    case 'over18':
      return tri(profile.preferences.over18);
    case 'howHeard':
      return plain(profile.preferences.howHeard);

    // ── Voluntary self-identification ──
    case 'gender':
      if (!ctx.demographics || !demo.gender) return null;
      return plain(choiceLabel(GENDERS, demo.gender), choiceForms(GENDERS, demo.gender));
    case 'hispanic':
      if (!ctx.demographics) return null;
      return triDecline(
        demo.hispanic,
        ['Hispanic or Latino', 'Hispanic/Latino', 'Yes, I am Hispanic or Latino'],
        ['Not Hispanic or Latino', 'Non-Hispanic', 'No, I am not Hispanic or Latino'],
      );
    case 'race': {
      if (!ctx.demographics || demo.race.length === 0) return null;
      if (demo.race.includes('decline')) return { text: 'Decline to answer', forms: DECLINE_FORMS, certainty: 1 };
      // On US forms Hispanic or Latino is one of the race choices and takes precedence.
      const races = demo.hispanic === 'yes' && !demo.race.includes('hispanic') ? (['hispanic', ...demo.race] as const) : demo.race;
      if (field.multiple) {
        return { text: races.map((r) => choiceLabel(RACES, r)).join(', '), forms: [], multi: races.map((r) => choiceForms(RACES, r)), certainty: 1 };
      }
      const ordered = races.length > 1 && races[0] !== 'hispanic' ? (['two-or-more', ...races] as const) : races;
      return {
        text: choiceLabel(RACES, ordered[0]!),
        forms: ordered.flatMap((r) => choiceForms(RACES, r)),
        certainty: 1,
      };
    }
    case 'veteran':
      if (!ctx.demographics || !demo.veteran) return null;
      return plain(choiceLabel(VETERAN, demo.veteran), choiceForms(VETERAN, demo.veteran));
    case 'disability':
      if (!ctx.demographics || !demo.disability) return null;
      return plain(choiceLabel(DISABILITY, demo.disability), choiceForms(DISABILITY, demo.disability));
    case 'indigenous':
      return ctx.demographics ? triDecline(demo.indigenous) : null;
    case 'visibleMinority':
      return ctx.demographics ? triDecline(demo.visibleMinority) : null;

    // Files are attached by the engine, not typed.
    case 'resume':
    case 'coverLetter':
      return null;
  }
}

function withQuery(value: ResolvedValue | null): ResolvedValue | null {
  return value ? { ...value, query: value.text } : null;
}
