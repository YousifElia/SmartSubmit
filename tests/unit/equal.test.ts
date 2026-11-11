import { describe, expect, it } from 'vitest';
import { deepEqual } from '@/core/util/equal';

describe('deepEqual', () => {
  it('ignores key order and undefined keys', () => {
    expect(deepEqual({ a: 1, b: { c: [1, { d: 2 }] } }, { b: { c: [1, { d: 2 }] }, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, x: undefined }, { a: 1 })).toBe(true);
  });
  it('notices real differences', () => {
    expect(deepEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: '1' })).toBe(false);
    expect(deepEqual({ a: null }, { a: {} })).toBe(false);
    expect(deepEqual([1], { 0: 1 })).toBe(false);
  });
});
