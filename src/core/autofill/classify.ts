/**
 * Classifier: which piece of the profile is this question asking for?
 *
 * Each rule names a profile field and the evidence that points to it: wording
 * in the label, the `autocomplete` token, the input type, or the control's
 * name/id. The best-scoring rule wins. Wording that would make the match
 * wrong ("company name", "recruiter's email") vetoes a rule outright.
 */
import type { Classification, ControlKind, FieldInfo, FieldKey } from './model';
import { norm, splitIdentifier } from './text';

type Section = '' | 'education' | 'experience';

interface Rule {
  key: FieldKey;
  /** Tested against the normalised label. */
  label?: RegExp;
  /** Wording that rules the match out. */
  not?: RegExp;
  /** Tested against the control's name and id, split into words. */
  hint?: RegExp;
  /** `autocomplete` tokens that identify the field. */
  ac?: string[];
  /** Input types that identify the field on their own. */
  types?: string[];
  /** Control kinds the rule applies to. Default: everything except files. */
  kinds?: ControlKind[];
  /** Only applies inside this kind of form section. */
  section?: Exclude<Section, ''>;
  /** A full-sentence question: a long label is expected, not suspicious. */
  question?: boolean;
  /** Score for a label match. Default 0.9. */
  score?: number;
}

const CHOICE: ControlKind[] = ['select', 'radio', 'combobox', 'buttons', 'checkboxes', 'checkbox'];
const TEXTUAL: ControlKind[] = ['text', 'combobox', 'select'];

const NOT_A_PERSON =
  /\b(company|employer|organi[sz]ation|school|university|college|institution|reference\w*|referr\w*|referee\w*|emergency|recruiter\w*|manager\w*|supervisor\w*|user ?name|file|pronounc\w*|pronunciation|maiden|previous|former|parent\w*|guardian\w*|spouse|partner|project|product|team|bank|account|degree|job|position|role|title|hiring|friend\w*|contact person)\b/;

const NOT_MINE = /\b(recruiter\w*|manager\w*|supervisor\w*|reference\w*|referr\w*|referee\w*|emergency|friend\w*|employee\w*|hiring)\b/;

/** A yes/no question about the applicant, rather than a request for a value. */
const YES_NO_LEAD = /^(have|are|did|do|does|will|would|is|can|were)\s(you|your)\b/;

const RULES: Rule[] = [
  // ── Identity ──
  {
    key: 'preferredName',
    label: /\b(preferred|chosen)\s?(first\s?)?name\b|\bnickname\b|\bname you go by\b|\bgoes? by\b/,
    not: NOT_A_PERSON,
    score: 0.93,
  },
  {
    key: 'firstName',
    label: /\b(legal\s)?(first|given)\s?name\b|\bforename\b/,
    not: NOT_A_PERSON,
    ac: ['given-name'],
    hint: /\b(first ?name|fname|given ?name)\b/,
  },
  {
    key: 'lastName',
    label: /\b(legal\s)?(last|family)\s?name\b|\bsurname\b/,
    not: NOT_A_PERSON,
    ac: ['family-name'],
    hint: /\b(last ?name|lname|surname|family ?name)\b/,
  },
  { key: 'middleName', label: /\bmiddle\s?(name|initial)\b/, not: NOT_A_PERSON, ac: ['additional-name'] },
  {
    key: 'fullName',
    label: /^(your\s)?(full\s|legal\s|full legal\s|candidate\s|applicant\s)?name$|\bfull\s?(legal\s)?name\b|\blegal\s?(full\s)?name\b|^name\b(?!\s?of)/,
    not: NOT_A_PERSON,
    ac: ['name'],
    hint: /(^| )name( |$)|\bfull ?name\b/,
    score: 0.88,
  },
  { key: 'pronouns', label: /\bpronouns?\b/ },
  {
    key: 'email',
    label: /\be\s?mail\b/,
    not: NOT_MINE,
    types: ['email'],
    ac: ['email'],
    hint: /\be ?mail\b/,
  },
  {
    key: 'phoneCountryCode',
    label: /\b(country|dial(l?ing)?|calling)\s?code\b|\bphone\s?(country|code)\b|\bcountry phone code\b/,
    ac: ['tel-country-code'],
    score: 0.92,
  },
  { key: 'phoneType', label: /\bphone\s?(device\s?)?type\b|\bdevice type\b/, score: 0.92 },
  {
    key: 'phone',
    label: /\b(phone|mobile|telephone|cell)\b(\s?(number|no))?|\bcontact number\b/,
    not: /\b(extension|ext|type|country code|dial\w*|device|reference|emergency|recruiter|manager|supervisor|consent|text messages?|sms|whatsapp)\b/,
    types: ['tel'],
    ac: ['tel', 'tel-national'],
    hint: /\b(phone|mobile|tel)\b/,
  },

  // ── Address ──
  {
    key: 'addressLine2',
    label: /\baddress\s?(line\s?)?2\b|\b(apartment|apt|suite|unit)\b/,
    ac: ['address-line2'],
    score: 0.92,
  },
  {
    key: 'addressLine1',
    label: /\b(street\s?address|address\s?(line\s?)?1|mailing address|home address|residential address)\b|^address$|^street$/,
    not: /\b(e ?mail|ip|web|url)\b/,
    ac: ['address-line1', 'street-address'],
  },
  {
    key: 'location',
    label: /\b(current\s)?location\b|\bwhere are you (currently\s)?(located|based)\b|\bcity\b.*\b(state|province)\b|\bcurrent city\b|\bwhere do you (currently\s)?(live|reside)\b|\bcity of residence\b/,
    not: /\b(preferred|desired|office|job|preference|relocat\w*|which|what|locations|interview|work location)\b/,
    question: true,
    score: 0.86,
  },
  {
    key: 'location',
    label: /\bwhere (do you plan|will you be|are you planning) (on\s|to\s)?work(ing)? from\b/,
    question: true,
    score: 0.72,
  },
  { key: 'city', label: /\b(city|town)\b/, not: /\b(state|province|country|location|which|what|preferred|office)\b/, ac: ['address-level2'] },
  {
    key: 'region',
    label: /\b(state|province|region|territory)\b/,
    not: /\b(united states|city|country|statement|state of|estate|relocat\w*|authori[sz]ed|eligible|bar|licen[sc]e\w*|sponsor\w*)\b/,
    ac: ['address-level1'],
    score: 0.88,
  },
  { key: 'postalCode', label: /\b(zip|postal)\s?(code)?\b|\bpostcode\b/, ac: ['postal-code'] },
  {
    key: 'country',
    label: /\bcountry\b/,
    not: /\b(code|authori[sz]ed|eligible|sponsor\w*|citizen\w*|visa|work in|applying|countries)\b/,
    ac: ['country', 'country-name'],
    question: true,
    score: 0.88,
  },

  // ── Links ──
  { key: 'linkedin', label: /\blinked\s?in\b/, hint: /linked ?in/ },
  { key: 'github', label: /\bgit\s?hub\b/, hint: /git ?hub/ },
  { key: 'portfolio', label: /\bportfolio\b/, not: /\b(linked ?in|git ?hub)\b/, hint: /portfolio/ },
  { key: 'twitter', label: /\btwitter\b|\bx com\b|\bx profile\b|\bx handle\b/, hint: /twitter/ },
  {
    key: 'website',
    label: /\b(personal\s)?(web\s?site|web page|homepage|blog)\b|^(url|link|website url|other website|other link)$/,
    not: /\b(linked ?in|git ?hub|portfolio|twitter|company|employer)\b/,
    hint: /\b(website|homepage)\b/,
    score: 0.85,
  },

  // ── Current role ──
  {
    key: 'currentCompany',
    label: /\bcurrent\s(company|employer|organi[sz]ation|workplace)\b|\b(most recent|present|latest)\s(company|employer)\b|^(company|employer|company name|employer name|organi[sz]ation)$/,
    not: /\b(this company|our company|relatives?|referr\w*|worked (at|for))\b/,
    ac: ['organization'],
    hint: /(^| )org( |$)|\bcurrent ?company\b/,
  },
  {
    key: 'currentTitle',
    label: /\bcurrent\s(job\s)?(title|position|role)\b|\b(most recent|present|latest)\s(job\s)?(title|position|role)\b|^(job\s)?title$/,
    ac: ['organization-title'],
    hint: /\bjob ?title\b/,
  },
  {
    key: 'yearsExperience',
    label: /^(total\s)?(number of\s)?years?\s(of\s)?(relevant\s|professional\s|work\s|working\s|total\s)*experience$|^how many years of (professional\s|work\s|relevant\s|total\s)*experience do you have$/,
    question: true,
  },

  // ── Education ──
  {
    key: 'eduSchool',
    label: /\b(school|university|college|institution)\b(\sname)?|\balma mater\b|\bwhere did you (study|go to school)\b/,
    not: /\b(high school diploma|did you|are you|have you|do you|will you|graduat\w*|degree|enrolled|e ?mail|year|date|counsel\w*|teacher|principal|advis[eo]r|contact|name of)\b/,
    hint: /(^| )(school|university|institution)( |$)/,
    score: 0.88,
  },
  {
    key: 'eduDegree',
    label: /\bdegree\b|\b(highest\s)?(level of\s)?education(\slevel)?\b|\bhighest (level of\s)?(education|schooling)\b/,
    not: /\b(do you|are you|have you|will you|did you|field|major|year|date|when|pursuing|relevant|in what|what was)\b/,
    hint: /(^| )degree( |$)|\beducation ?level\b/,
    question: true,
    score: 0.86,
  },
  {
    key: 'eduField',
    label: /\b(major|discipline|field of study|area of study|course of study|concentration|program of study|speciali[sz]ation)\b|^(program|field)$/,
    hint: /(^| )(discipline|major)( |$)|\bfield ?of ?study\b/,
    score: 0.88,
  },
  { key: 'eduMinor', label: /^minor$|\bminor (field|subject|degree)\b/ },
  { key: 'eduGpa', label: /\bc?gpa\b|\bgrade point\b/, not: /\bscale\b/, hint: /(^| )gpa( |$)/ },
  {
    key: 'eduEnd',
    label: /\b(expected\s|anticipated\s)?graduat(ion|e|ing)\b|\bgrad (date|year)\b|\b(degree\s)?completion date\b|\bdate (of\s)?graduat\w*/,
    not: /^(have|are|did|do|is|were)\s(you|your)\b/,
    hint: /\bgraduation\b|\bgrad ?(date|year)\b/,
    question: true,
    score: 0.88,
  },
  { key: 'eduStart', section: 'education', label: /\b(start|from|began|begin)\b/, hint: /\bstart\b/, score: 0.9 },
  { key: 'eduEnd', section: 'education', label: /\b(end|to|until|completion|finish\w*)\b/, hint: /\bend\b/, score: 0.9 },
  {
    key: 'eduCurrent',
    section: 'education',
    kinds: ['checkbox'],
    label: /\b(current(ly)?|still|present)\b/,
    score: 0.88,
  },

  // ── Work history (only inside an experience section) ──
  { key: 'expCompany', section: 'experience', label: /\b(company|employer|organi[sz]ation)\b/, hint: /\b(company|employer)\b/, score: 0.92 },
  { key: 'expTitle', section: 'experience', label: /\b(title|position|role)\b/, hint: /\btitle\b/, score: 0.92 },
  { key: 'expLocation', section: 'experience', label: /\b(location|city)\b/, score: 0.92 },
  {
    key: 'expDescription',
    section: 'experience',
    label: /\b(description|responsibilit\w*|duties|summary|accomplishments?|what did you do)\b/,
    score: 0.92,
  },
  { key: 'expStart', section: 'experience', label: /\b(start|from|began|begin)\b/, hint: /\bstart\b/, score: 0.92 },
  { key: 'expEnd', section: 'experience', label: /\b(end|to|until|left)\b/, hint: /\bend\b/, score: 0.92 },
  {
    key: 'expCurrent',
    section: 'experience',
    kinds: ['checkbox'],
    label: /\b(current(ly)?|still|present)\b/,
    score: 0.9,
  },

  // ── Work authorization ──
  {
    key: 'authorized',
    label: /\b(authori[sz]ed|eligible|entitled|permitted|allowed|able)\s(to\s)?(legally\s|lawfully\s)?work\b|\bwork authori[sz]ation\b|\b(legal\s)?right to work\b|\blegally (work|employable)\b|\beligib(le|ility) (for|to accept) employment\b/,
    not: /\bsponsor\w*|\b(type|kind|status) of\b|\bwhat is your\b|\bwithout\b/,
    question: true,
  },
  {
    key: 'sponsorship',
    label: /\bsponsor(ship|ed|ing)?\b/,
    not: /\b(authori[sz]ed|eligible|right to work|referr\w*|without)\b/,
    question: true,
  },
  {
    key: 'authStatus',
    label: /\b(citizenship|immigration|visa|work permit|residency)\s?(status|type)\b|^citizenship$|\bwhat is your (work authori[sz]ation|citizenship|immigration)\b/,
    question: true,
    score: 0.85,
  },

  // ── Common questions ──
  {
    key: 'salary',
    label: /\b(salary|compensation|base pay|hourly rate|wage|pay)\b(\s(expectations?|requirements?|range))?/,
    not: /\b(current|currently|history|previous|last|offered|range for this|is \d|between)\b/,
    question: true,
    score: 0.86,
  },
  {
    key: 'startDate',
    label: /\b(available|earliest|possible|desired|preferred|expected|ideal)\s?(start|starting)\s?date\b|\bwhen (can|could|would|are) you (be\s)?(able to\s)?(start|available|join)\b|\bavailab(le|ility) to start\b|\bearliest (you can|availability)\b|^start date$|^availability$|^date available$/,
    question: true,
    score: 0.86,
  },
  { key: 'noticePeriod', label: /\bnotice period\b|\bhow much notice\b/, question: true },
  {
    key: 'relocate',
    label: /\b(willing|open|able|prepared)\s(to\s)?relocat\w*|\bwould you (be willing to\s)?relocate\b|^relocation$/,
    not: /\b(assistance|package|reimburse\w*|bonus)\b/,
    question: true,
    score: 0.86,
  },
  {
    key: 'over18',
    label: /\b(at least|over|above|older than)\s(the age of\s)?(18|eighteen)\b|\b(18|eighteen)\s(years\s)?(of age\s)?(or\s)?(older|over|above)\b|\bof legal (working\s)?age\b/,
    question: true,
  },
  {
    key: 'howHeard',
    label: /\bhow did you (first\s)?(hear|find|learn|come to know|discover|come across)\b|\bwhere did you (first\s)?(hear|find|learn|see)\b|\b(referral|application|candidate)\s?source\b|\bhow you heard\b|^source$/,
    question: true,
  },

  // ── Voluntary self-identification ──
  { key: 'gender', label: /\bgender\b|^sex$/, not: /\b(transgender|trans|pronouns?)\b/, kinds: CHOICE, question: true },
  { key: 'hispanic', label: /\bhispanic\b|\blatin[oax]\b/, not: /\b(race|ethnicit\w*|racial)\b/, kinds: CHOICE, question: true },
  { key: 'race', label: /\b(race|ethnicity|ethnic|racial)\b/, kinds: CHOICE, question: true },
  { key: 'veteran', label: /\bveteran\b|\bmilitary (service|status)\b|\barmed forces\b/, kinds: CHOICE, question: true },
  { key: 'disability', label: /\bdisabilit(y|ies)\b/, not: /\baccommodations?\b/, kinds: CHOICE, question: true },
  {
    key: 'indigenous',
    label: /\bindigenous\b|\bfirst nations?\b|\baboriginal\b|\bmetis\b|\binuit\b/,
    not: /\b(race|ethnicit\w*)\b/,
    kinds: CHOICE,
    question: true,
  },
  { key: 'visibleMinority', label: /\bvisible minorit\w*|\bracialized\b|\bperson of colou?r\b/, kinds: CHOICE, question: true },

  // ── Files ──
  {
    key: 'coverLetter',
    kinds: ['file'],
    label: /\bcover\s?letter\b/,
    hint: /\bcover ?letter\b/,
    score: 0.95,
  },
  {
    key: 'resume',
    kinds: ['file'],
    label: /\b(resume|cv|curriculum vitae)\b/,
    not: /\bcover\b/,
    hint: /\b(resume|cv)\b/,
    score: 0.95,
  },
];

/** Keys whose value is a yes/no fact; these need a choice or a short text field. */
const YES_NO_KEYS = new Set<FieldKey>(['authorized', 'sponsorship', 'relocate', 'over18']);

/** Keys that only make sense as a short value, never in a long free-text box. */
const SHORT_VALUE_KEYS = new Set<FieldKey>([
  'firstName',
  'lastName',
  'middleName',
  'fullName',
  'preferredName',
  'email',
  'phone',
  'city',
  'region',
  'postalCode',
  'country',
]);

function sectionOf(field: FieldInfo): Section {
  const text = `${norm(field.section)} | ${splitIdentifier(field.name)} | ${splitIdentifier(field.id)}`;
  if (/\b(education|academic|school|degree|discipline)\b/.test(text)) return 'education';
  if (/\b(experience|employment|work history|job history|employer|career history)\b/.test(text)) return 'experience';
  return '';
}

function ruleAllowsKind(rule: Rule, kind: ControlKind): boolean {
  if (rule.kinds) return rule.kinds.includes(kind);
  return kind !== 'file';
}

/** Does a date question want just the month, just the year, or the whole date? */
function datePart(field: FieldInfo): '' | 'Month' | 'Year' {
  const text = norm(`${field.label} ${field.placeholder} ${splitIdentifier(field.name)} ${splitIdentifier(field.id)}`);
  const months = field.options.filter((o) => /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(o.trim())).length;
  const years = field.options.filter((o) => /^(19|20)\d\d$/.test(o.trim())).length;
  const saysMonth = /\b(month|mm)\b/.test(text);
  const saysYear = /\b(year|yyyy|yy)\b/.test(text);
  if (months >= 6 || (saysMonth && !saysYear)) return 'Month';
  if (years >= 3 || (saysYear && !saysMonth) || field.maxLength === 4) return 'Year';
  return '';
}

const DATE_KEYS = new Set<FieldKey>(['eduStart', 'eduEnd', 'expStart', 'expEnd']);

/** Identify what a field is asking for, or null if it is not a profile question. */
export function classify(field: FieldInfo): Classification | null {
  const label = norm(field.label);
  const hint = `${splitIdentifier(field.name)} | ${splitIdentifier(field.id)}`;
  const section = sectionOf(field);
  const words = label ? label.split(' ').length : 0;
  const ac = field.autocomplete.toLowerCase().split(/\s+/).filter(Boolean);
  const yesNoLead = YES_NO_LEAD.test(label);

  let best: (Classification & { span: number }) | null = null;

  for (const rule of RULES) {
    if (!ruleAllowsKind(rule, field.kind)) continue;
    if (rule.section && rule.section !== section) continue;
    if (rule.not && label && rule.not.test(label)) continue;

    let score = 0;
    let span = 0;

    if (rule.ac && ac.some((token) => rule.ac!.includes(token))) score = 0.95;

    const match = rule.label && label ? rule.label.exec(label) : null;
    if (match) {
      let s = rule.score ?? 0.9;
      span = match[0].length;
      if (!rule.question) {
        // A keyword inside a long sentence is weak evidence of a plain field.
        const extra = words - match[0].trim().split(' ').length;
        if (extra > 6) s -= 0.4;
        else if (extra > 3) s -= 0.15;
        // "Do you have a phone?" is not asking for the number.
        if (yesNoLead) s -= 0.4;
      }
      score = Math.max(score, s);
    }

    if (rule.types?.includes(field.inputType) && !yesNoLead) {
      score = Math.max(score, match || !label ? 0.92 : 0.8);
    }

    if (rule.hint && rule.hint.test(hint)) {
      // The name/id agrees with the label, or stands in for a missing one.
      if (match) score = Math.min(1, score + 0.03);
      else score = Math.max(score, label ? 0.66 : 0.82);
    }

    if (score <= 0) continue;

    // A yes/no fact cannot go in a paragraph box, nor a name in a dropdown of unrelated options.
    if (YES_NO_KEYS.has(rule.key) && field.kind === 'text' && field.inputType === 'textarea') continue;
    if (SHORT_VALUE_KEYS.has(rule.key) && field.inputType === 'textarea') score -= 0.3;

    if (!best || score > best.confidence || (score === best.confidence && span > best.span)) {
      best = { key: rule.key, confidence: score, span };
    }
  }

  if (!best || best.confidence < 0.6) return null;

  let key = best.key;
  if (DATE_KEYS.has(key)) {
    const part = datePart(field);
    if (part) key = `${key}${part}` as FieldKey;
  }
  return { key, confidence: Math.min(best.confidence, 1) };
}
