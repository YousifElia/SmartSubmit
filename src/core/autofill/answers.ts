/**
 * The saved-answer bank: recognising a question the user has answered before.
 *
 * Two questions match when they share the same meaningful words. Function
 * words are ignored and common synonyms are folded together, so "When do you
 * graduate?" lines up with "Expected graduation date". Anything that changes
 * the meaning of an otherwise similar question (a different country, a
 * different number, a negation) counts heavily against a match.
 */
import { COUNTRIES, REGIONS } from '../data/geo';
import type { AnswerKind, SavedAnswer } from '../types';
import { isPlaceholderOption, matchOption } from './options';
import { cleanLabel, norm } from './text';

/** Words that carry no meaning of their own in a question. */
const STOP = new Set(
  (
    'a an the of to for in on at by with and or is are am was were be been being do does did done you your yours ' +
    'we us our this that these those it its as if so please kindly what which who whom whose would could should ' +
    'can will shall may might have has had i me my mine any some from about into here there select choose enter ' +
    'provide indicate specify tell let know answer following question below above also then than such via per ' +
    'how out up s t re ve ll d e g etc eg ie'
  ).split(' '),
);

/**
 * Words that barely change what is being asked, folded to one representative
 * each. "Expected salary", "desired salary" and "salary expectations" are the
 * same question.
 */
const WEAK_GROUPS: string[][] = [
  ['desired', 'expected', 'expectation', 'expectations', 'anticipated', 'preferred', 'target'],
  ['requirement', 'requirements'],
  ['current', 'currently', 'present'],
  ['approximate', 'approximately', 'estimated', 'roughly'],
  ['applicable', 'relevant'],
  ['best', 'option', 'one'],
];
const WEAK = new Map<string, string>();
for (const group of WEAK_GROUPS) for (const word of group) WEAK.set(word, group[0]!);
const WEAK_WEIGHT = 0.35;

/** Synonym groups, folded to the first word. */
const SYNONYMS: string[][] = [
  ['graduation', 'graduate', 'graduated', 'graduating', 'graduates', 'grad'],
  ['date', 'when'],
  ['salary', 'compensation', 'pay', 'wage', 'wages', 'remuneration', 'earnings'],
  ['start', 'begin', 'commence', 'starting', 'join', 'joining'],
  ['available', 'availability'],
  ['hear', 'heard', 'find', 'found', 'learn', 'learned', 'discover', 'discovered'],
  ['job', 'position', 'role', 'opportunity', 'opening', 'posting', 'vacancy'],
  ['company', 'employer', 'organization', 'organisation', 'firm'],
  ['authorized', 'authorised', 'eligible', 'entitled', 'permitted', 'allowed', 'authorization', 'authorisation'],
  ['sponsorship', 'sponsor', 'sponsored', 'sponsoring'],
  ['relocate', 'relocation', 'relocating', 'move', 'moving'],
  ['experience', 'experiences', 'experienced', 'background'],
  ['years', 'year', 'yrs', 'yr'],
  ['university', 'college', 'school', 'institution'],
  ['degree', 'qualification', 'diploma'],
  ['major', 'discipline', 'concentration', 'specialization', 'specialisation'],
  ['why', 'reason', 'reasons', 'motivation', 'motivates', 'motivated'],
  ['interested', 'interest', 'interests', 'excited', 'excites', 'attracted', 'attracts', 'appeal', 'appeals'],
  ['work', 'working', 'employment', 'employed'],
  ['willing', 'open', 'able', 'comfortable'],
  ['location', 'located', 'based', 'residing', 'reside', 'live', 'living'],
  ['phone', 'telephone', 'mobile', 'cell'],
  ['previously', 'previous', 'formerly', 'former', 'past', 'before', 'ever'],
  ['referred', 'referral', 'refer', 'reference'],
  ['notice', 'notification'],
  ['remote', 'remotely'],
  ['onsite', 'office', 'in-person', 'inperson'],
  ['travel', 'travelling', 'traveling'],
  ['agree', 'consent', 'acknowledge', 'accept', 'confirm', 'certify'],
  ['pronouns', 'pronoun'],
  ['languages', 'language'],
  ['skills', 'skill', 'proficiency', 'proficient'],
  ['strength', 'strengths'],
  ['weakness', 'weaknesses'],
  ['project', 'projects'],
  ['describe', 'explain', 'elaborate', 'share', 'outline'],
];

const CANON = new Map<string, string>();
for (const group of SYNONYMS) for (const word of group) CANON.set(word, group[0]!);

/** Words that flip or pin the meaning: a mismatch here rules out a match. */
const NEGATIONS = new Set(['not', 'no', 'without', 'never', 'non', 'dont', 'cannot', 'cant', 'wont', 'unable', 'except']);

const PLACE_WORDS = new Set<string>();
for (const c of COUNTRIES) {
  for (const name of [c.name, ...c.aliases]) {
    for (const word of norm(name).split(' ')) if (word.length > 2 && !STOP.has(word)) PLACE_WORDS.add(word);
  }
}
for (const r of REGIONS) {
  for (const word of norm(r.name).split(' ')) if (word.length > 2 && !STOP.has(word)) PLACE_WORDS.add(word);
}
for (const word of ['us', 'usa', 'uk', 'eu', 'europe', 'european', 'canadian', 'american', 'british']) PLACE_WORDS.add(word);

/** Labels too generic to recognise on a different form. */
const GENERIC = new Set(
  [
    'other',
    'others',
    'please specify',
    'if other please specify',
    'if yes please explain',
    'if so please explain',
    'if no please explain',
    'please explain',
    'explain',
    'comments',
    'comment',
    'additional comments',
    'additional information',
    'additional info',
    'anything else',
    'notes',
    'details',
    'description',
    'answer',
    'response',
    'your answer',
    'type your response',
    'yes',
    'no',
    'n a',
  ].map(norm),
);

/** The form of a question used for exact matching. */
export function normalizeQuestion(question: string): string {
  return norm(cleanLabel(question));
}

export function isGenericQuestion(question: string): boolean {
  const n = normalizeQuestion(question);
  return n.length < 3 || GENERIC.has(n);
}

interface Signature {
  /** Meaningful words after synonym folding, with their weights. */
  words: Map<string, number>;
  /** Words that pin the meaning: places, numbers, negations, names. */
  critical: Set<string>;
}

function light(word: string): string {
  // Fold simple plurals so "skills" and "skill" compare equal.
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function signature(question: string): Signature {
  const cleaned = cleanLabel(question);
  const rawWords = cleaned.split(/\s+/).filter(Boolean);

  // Mid-sentence capitals mark names ("Python", "Toronto"), unless the whole
  // label is in Title Case, where capitals mean nothing.
  const capitalised = rawWords.filter((w) => /^[A-Z]/.test(w)).length;
  const titleCase = rawWords.length > 1 && capitalised / rawWords.length >= 0.6;
  const names = new Set<string>();
  if (!titleCase) {
    rawWords.forEach((word, i) => {
      if (i > 0 && /^[A-Z][A-Za-z0-9+#.]*$/.test(word)) {
        const n = norm(word);
        if (n && !STOP.has(n)) names.add(n);
      }
    });
  }

  const words = new Map<string, number>();
  const critical = new Set<string>();
  for (const token of norm(cleaned).split(' ')) {
    if (!token) continue;
    if (NEGATIONS.has(token)) {
      critical.add('¬');
      words.set('¬', 1);
      continue;
    }
    if (STOP.has(token)) continue;
    const weak = WEAK.get(token);
    if (weak) {
      if (!words.has(weak)) words.set(weak, WEAK_WEIGHT);
      continue;
    }
    const folded = CANON.get(token) ?? CANON.get(light(token)) ?? light(token);
    if (/\d/.test(token) || PLACE_WORDS.has(token) || names.has(token)) critical.add(folded);
    words.set(folded, 1);
  }
  return { words, critical };
}

/** Similarity of two questions, 0–1. */
export function questionSimilarity(a: string, b: string): number {
  const na = normalizeQuestion(a);
  const nb = normalizeQuestion(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const sa = signature(a);
  const sb = signature(b);
  if (sa.words.size === 0 || sb.words.size === 0) return 0;

  let shared = 0;
  let total = 0;
  for (const [word, weight] of sa.words) {
    const other = sb.words.get(word);
    if (other !== undefined) {
      shared += Math.max(weight, other);
      total += Math.max(weight, other);
    } else {
      total += weight;
    }
  }
  for (const [word, weight] of sb.words) if (!sa.words.has(word)) total += weight;
  let score = total > 0 ? shared / total : 0;

  // A different place, number, name or negation means a different question.
  for (const word of sa.critical) if (!sb.critical.has(word)) score *= 0.55;
  for (const word of sb.critical) if (!sa.critical.has(word)) score *= 0.55;

  // Never report a fuzzy match as identical.
  return Math.min(score, 0.99);
}

export interface AnswerMatch {
  answer: SavedAnswer;
  score: number;
  exact: boolean;
}

export interface AnswerQuery {
  question: string;
  /** Options on offer, for choice questions. Empty for free text. */
  options: string[];
  /** Whether several options may be chosen. */
  multiple: boolean;
}

/** Can this saved answer actually be entered into this field? */
export function answerFits(answer: SavedAnswer, query: AnswerQuery): boolean {
  const real = query.options.filter((o) => !isPlaceholderOption(o));
  if (real.length === 0) {
    // Free text: any single textual answer fits.
    return typeof answer.answer === 'string' ? answer.answer.trim() !== '' : answer.answer.length > 0;
  }
  const values = Array.isArray(answer.answer) ? answer.answer : [answer.answer];
  if (values.length === 0) return false;
  if (values.length > 1 && !query.multiple) return false;
  return values.every((v) => matchOption([v], real) !== null);
}

/**
 * Find the saved answer for a question. An exact match on wording always
 * wins; otherwise the most similar answer above `threshold` is returned,
 * provided it can be entered into the field.
 */
export function findAnswer(
  query: AnswerQuery,
  answers: readonly SavedAnswer[],
  threshold: number,
): AnswerMatch | null {
  const target = normalizeQuestion(query.question);
  if (!target) return null;

  const exact = answers.filter((a) => a.norm === target && answerFits(a, query));
  if (exact.length > 0) {
    // Several identical questions: prefer the most recently saved.
    const answer = exact.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    return { answer, score: 1, exact: true };
  }
  if (isGenericQuestion(query.question)) return null;

  let best: AnswerMatch | null = null;
  for (const answer of answers) {
    if (isGenericQuestion(answer.question)) continue;
    const score = questionSimilarity(query.question, answer.question);
    if (score < threshold) continue;
    if (!answerFits(answer, query)) continue;
    if (!best || score > best.score) best = { answer, score, exact: false };
  }
  return best;
}

/** Build the record for a newly learned answer. */
export function makeAnswer(input: {
  id: string;
  question: string;
  kind: AnswerKind;
  answer: string | string[];
  options: string[];
  host: string;
  now: number;
}): SavedAnswer {
  return {
    id: input.id,
    question: cleanLabel(input.question),
    norm: normalizeQuestion(input.question),
    kind: input.kind,
    answer: input.answer,
    options: input.options.filter((o) => !isPlaceholderOption(o)),
    host: input.host,
    uses: 0,
    createdAt: input.now,
  };
}
