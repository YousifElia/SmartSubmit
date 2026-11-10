/**
 * Choosing an option from a dropdown, radio group or checkbox list.
 *
 * The caller supplies `forms`: wordings that mean the answer, most canonical
 * first ("Canada", "CA", "CAN"). The matcher scores every option against every
 * wording and returns the best one, or null when nothing is close enough.
 */
import { dice, norm } from './text';

export interface OptionMatch {
  index: number;
  score: number;
}

/** Options that are placeholders rather than real choices. */
const PLACEHOLDER = /^(select|choose|please select|please choose|pick|--+|—+|\.\.\.|none selected|click here)\b|^-*$/i;

export function isPlaceholderOption(text: string): boolean {
  const t = text.trim();
  return t === '' || PLACEHOLDER.test(t);
}

function scorePair(form: string, option: string): number {
  if (!form || !option) return 0;
  if (form === option) return 1;

  const formTokens = form.split(' ');
  const optionTokens = option.split(' ');

  // "yes" → "yes i am authorized to work"; "bachelors degree" → "bachelors degree ba bs".
  if (optionTokens.length > formTokens.length && formTokens.every((t, i) => optionTokens[i] === t)) {
    return 0.9;
  }
  // "bachelor of science" → "bachelor".
  if (formTokens.length > optionTokens.length && optionTokens.every((t, i) => formTokens[i] === t)) {
    return optionTokens.length >= 2 || option.length >= 5 ? 0.84 : 0.7;
  }

  // Every word of the wording appears in the option, in any order.
  if (formTokens.length >= 2) {
    const set = new Set(optionTokens);
    if (formTokens.every((t) => set.has(t))) {
      return 0.72 + 0.14 * (formTokens.length / optionTokens.length);
    }
  }

  // Close spellings: "non binary" / "nonbinary", "bachelors" / "bachelor s".
  const compactForm = form.replace(/ /g, '');
  const compactOption = option.replace(/ /g, '');
  if (compactForm === compactOption) return 0.97;
  // Very short strings are too easy to confuse ("no" / "non", "ca" / "can").
  if (compactForm.length < 4 || compactOption.length < 4) return 0;
  const similarity = dice(compactForm, compactOption);
  return similarity >= 0.8 ? similarity * 0.9 : 0;
}

/**
 * Pick the option that best expresses one of `forms`.
 * Returns null if no option scores at least `minScore`.
 */
export function matchOption(forms: readonly string[], options: readonly string[], minScore = 0.7): OptionMatch | null {
  const normForms = forms.map(norm).filter(Boolean);
  let best: OptionMatch | null = null;
  options.forEach((raw, index) => {
    if (isPlaceholderOption(raw)) return;
    const option = norm(raw);
    normForms.forEach((form, rank) => {
      // Earlier wordings are more canonical, so they win ties.
      const score = scorePair(form, option) * (1 - Math.min(rank, 20) * 0.004);
      if (score > 0 && (!best || score > best.score)) best = { index, score };
    });
  });
  const found = best as OptionMatch | null;
  return found && found.score >= minScore ? found : null;
}

/** Match several answers at once, for checkbox groups. Unmatched answers are dropped. */
export function matchOptions(formSets: readonly (readonly string[])[], options: readonly string[]): number[] {
  const picked = new Set<number>();
  for (const forms of formSets) {
    const match = matchOption(forms, options);
    if (match) picked.add(match.index);
  }
  return [...picked].sort((a, b) => a - b);
}

/** True when the options look like a plain yes/no question. */
export function isYesNo(options: readonly string[]): boolean {
  const real = options.map(norm).filter((o) => o && !isPlaceholderOption(o));
  if (real.length < 2 || real.length > 3) return false;
  const hasYes = real.some((o) => o === 'yes' || o.startsWith('yes '));
  const hasNo = real.some((o) => o === 'no' || o.startsWith('no '));
  return hasYes && hasNo;
}

/**
 * Pick the range a number falls in: "0-1 years", "2 to 4", "5+", "Less than 1",
 * "More than 10". Returns null when the options are not numeric ranges.
 */
export function matchNumericRange(value: number, options: readonly string[]): OptionMatch | null {
  let best: OptionMatch | null = null;
  options.forEach((raw, index) => {
    if (isPlaceholderOption(raw)) return;
    const text = raw.toLowerCase().replace(/,(?=\d{3})/g, '');
    const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (nums.length === 0) return;
    let low = -Infinity;
    let high = Infinity;
    if (nums.length >= 2) {
      [low, high] = [nums[0]!, nums[1]!];
    } else if (/\+|or more|more than|over|above|at least|greater/.test(text)) {
      low = /more than|over|above|greater/.test(text) && !/\+|or more|at least/.test(text) ? nums[0]! + Number.EPSILON : nums[0]!;
    } else if (/less than|under|below|fewer|up to/.test(text)) {
      high = /up to/.test(text) ? nums[0]! : nums[0]! - Number.EPSILON;
    } else {
      [low, high] = [nums[0]!, nums[0]!];
    }
    if (value >= low && value <= high) {
      // Prefer the narrowest range that contains the value.
      const width = high - low;
      const score = Number.isFinite(width) ? 1 - Math.min(width, 1000) / 100000 : 0.9;
      if (!best || score > best.score) best = { index, score };
    }
  });
  return best;
}
