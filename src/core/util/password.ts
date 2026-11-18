/**
 * Strong passwords for application-system accounts. Workday and iCIMS ask for
 * upper and lower case letters, a number and a symbol; this always has each.
 */
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
// Symbols these systems accept, without ones that are easy to mistype or that some reject.
const SYMBOLS = '!@#$%&*?-_+=';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** A uniformly random index below `n`, without modulo bias. */
function randomBelow(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}

const pick = (set: string) => set[randomBelow(set.length)]!;

export function generatePassword(length = 16): string {
  const size = Math.max(12, length);
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(ALL));
  // Shuffle, so the required kinds are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

/** What a password lacks for the usual application-system rules, in plain words. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 8) problems.push('at least 8 characters');
  if (!/[a-z]/.test(password)) problems.push('a lower-case letter');
  if (!/[A-Z]/.test(password)) problems.push('a capital letter');
  if (!/\d/.test(password)) problems.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('a symbol');
  return problems;
}
