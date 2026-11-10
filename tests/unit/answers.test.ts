import { describe, expect, it } from 'vitest';
import {
  answerFits,
  findAnswer,
  isGenericQuestion,
  makeAnswer,
  normalizeQuestion,
  questionSimilarity,
} from '@/core/autofill/answers';
import type { SavedAnswer } from '@/core/types';

let seq = 0;
function saved(question: string, answer: string | string[], options: string[] = []): SavedAnswer {
  seq++;
  return makeAnswer({
    id: `a${seq}`,
    question,
    kind: options.length ? (Array.isArray(answer) ? 'multi' : 'choice') : 'text',
    answer,
    options,
    host: 'example.com',
    now: seq,
  });
}
const q = (question: string, options: string[] = [], multiple = false) => ({ question, options, multiple });
const T = 0.72;

describe('normalizeQuestion', () => {
  it('ignores required markers, case and punctuation', () => {
    expect(normalizeQuestion('Expected Graduation Date *')).toBe(normalizeQuestion('expected graduation date:'));
    expect(normalizeQuestion('Why do you want to work here?✱')).toBe('why do you want to work here');
    expect(normalizeQuestion('LinkedIn Profile (optional)')).toBe('linkedin profile');
  });
});

describe('questionSimilarity', () => {
  const similar = (a: string, b: string) => questionSimilarity(a, b);

  it('scores paraphrases of the same question highly', () => {
    expect(similar('When do you graduate?', 'Expected graduation date')).toBeGreaterThan(T);
    expect(similar('What is your expected graduation date?', 'Graduation Date')).toBeGreaterThan(T);
    expect(similar('What are your salary expectations?', 'Desired compensation')).toBeGreaterThan(T);
    expect(similar('Why are you interested in this role?', 'Why are you interested in this position?')).toBeGreaterThan(T);
    expect(similar('Are you willing to relocate?', 'Are you open to relocation?')).toBeGreaterThan(T);
    expect(similar('Do you have any relatives working at the company?', 'Do you have relatives employed at this company?')).toBeGreaterThan(T);
  });

  it('keeps apart questions that differ in a place', () => {
    expect(similar('Are you authorized to work in Canada?', 'Are you authorized to work in the United States?')).toBeLessThan(T);
    expect(similar('Are you willing to relocate to Toronto?', 'Are you willing to relocate to Vancouver?')).toBeLessThan(T);
    expect(similar('Are you located in the US?', 'Are you located in Canada?')).toBeLessThan(T);
  });

  it('keeps apart questions that differ in a skill, a number or a negation', () => {
    expect(similar('Do you have experience with Python?', 'Do you have experience with Java?')).toBeLessThan(T);
    expect(similar('Do you have 3 years of experience in sales?', 'Do you have 7 years of experience in sales?')).toBeLessThan(T);
    expect(similar('Do you require sponsorship?', 'Are you able to work without sponsorship?')).toBeLessThan(T);
    expect(similar('Have you worked here before?', 'Have you not worked here before?')).toBeLessThan(T);
  });

  it('keeps unrelated questions apart', () => {
    expect(similar('Why do you want to work here?', 'What is your expected salary?')).toBeLessThan(0.3);
    expect(similar('LinkedIn Profile', 'GitHub Profile')).toBeLessThan(T);
  });

  it('treats Title Case and sentence case alike', () => {
    expect(similar('Expected Graduation Date', 'what is your expected graduation date')).toBeGreaterThan(T);
  });

  it('never reports a fuzzy match as exact', () => {
    expect(similar('Expected graduation date', 'Graduation date (expected)')).toBeLessThan(1);
  });
});

describe('findAnswer', () => {
  it('prefers an exact match and marks it exact', () => {
    const answers = [saved('Expected graduation date', 'May 2027'), saved('When do you graduate?', 'Spring 2027')];
    const match = findAnswer(q('Expected Graduation Date*'), answers, T);
    expect(match?.exact).toBe(true);
    expect(match?.answer.answer).toBe('May 2027');
  });

  it('falls back to a similar question and marks it inexact', () => {
    const answers = [saved('Expected graduation date', 'May 2027')];
    const match = findAnswer(q('When do you graduate?'), answers, T);
    expect(match?.exact).toBe(false);
    expect(match?.answer.answer).toBe('May 2027');
  });

  it('returns nothing below the threshold', () => {
    const answers = [saved('Are you authorized to work in Canada?', 'Yes', ['Yes', 'No'])];
    expect(findAnswer(q('Are you authorized to work in the United States?', ['Yes', 'No']), answers, T)).toBeNull();
  });

  it('only reuses a choice answer when the option exists on the new form', () => {
    const answers = [saved('How did you hear about us?', 'University job board', ['LinkedIn', 'University job board', 'Other'])];
    expect(findAnswer(q('How did you hear about us?', ['LinkedIn', 'Indeed', 'Other']), answers, T)).toBeNull();
    expect(findAnswer(q('How did you hear about us?', ['Referral', 'University Job Board']), answers, T)?.exact).toBe(true);
  });

  it('enters a saved text answer into a matching dropdown', () => {
    const answers = [saved('Are you over 18?', 'Yes')];
    expect(findAnswer(q('Are you over 18?', ['Select', 'Yes', 'No']), answers, T)?.answer.answer).toBe('Yes');
  });

  it('does not put several saved choices into a single-choice field', () => {
    const answers = [saved('Which languages do you speak?', ['English', 'French'], ['English', 'French', 'Spanish'])];
    expect(findAnswer(q('Which languages do you speak?', ['English', 'French', 'Spanish'], false), answers, T)).toBeNull();
    expect(findAnswer(q('Which languages do you speak?', ['English', 'French', 'Spanish'], true), answers, T)).not.toBeNull();
  });

  it('never fuzzy-matches generic labels', () => {
    expect(isGenericQuestion('If yes, please explain')).toBe(true);
    expect(isGenericQuestion('Other')).toBe(true);
    expect(isGenericQuestion('Why do you want to work here?')).toBe(false);
    const answers = [saved('Please explain', 'Because of my co-op schedule')];
    expect(findAnswer(q('Please explain your interest'), answers, 0.3)).toBeNull();
    // An identical generic label on another form is still an exact match.
    expect(findAnswer(q('Please explain'), answers, T)?.exact).toBe(true);
  });

  it('prefers the most recently saved of identical questions', () => {
    const answers = [saved('Desired salary', '70000'), saved('Desired salary', '80000')];
    expect(findAnswer(q('Desired salary'), answers, T)?.answer.answer).toBe('80000');
  });
});

describe('answerFits', () => {
  it('accepts any non-empty text for a free-text field', () => {
    expect(answerFits(saved('Q', 'hello'), q('Q'))).toBe(true);
    expect(answerFits(saved('Q', '  '), q('Q'))).toBe(false);
  });
});
