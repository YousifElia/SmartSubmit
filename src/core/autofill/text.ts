/** Text normalisation shared by the classifier, option matcher and answer bank. */

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function norm(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
}

/**
 * Tidy a label as shown on a form: drop required markers, "(optional)",
 * trailing colons and stray whitespace, but keep the wording.
 */
export function cleanLabel(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[*✱]+/g, ' ')
    .replace(/\((required|optional)\)/gi, ' ')
    .replace(/\s+(required|optional)\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[:：]\s*$/, '')
    .trim();
}

/** Split an identifier like `firstName`, `first_name` or `first-name` into words. */
export function splitIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Sørensen–Dice coefficient over character bigrams of two normalised strings. */
export function dice(a: string, b: string): number {
  if (a === b) return a.length > 0 ? 1 : 0;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const count = grams.get(g) ?? 0;
    if (count > 0) {
      grams.set(g, count - 1);
      overlap++;
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}
