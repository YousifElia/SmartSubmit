/**
 * Deep equality that ignores the order of object keys. Values read back from
 * extension storage come with their keys reordered, so comparing serialised
 * copies would report a change where there is none.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((value, i) => deepEqual(value, other[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined);
  const otherKeys = Object.keys(right).filter((k) => right[k] !== undefined);
  return keys.length === otherKeys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(right, k) && deepEqual(left[k], right[k]));
}
