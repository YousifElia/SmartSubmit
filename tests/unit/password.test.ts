import { describe, expect, it } from 'vitest';
import { generatePassword, passwordProblems } from '@/core/util/password';

describe('generatePassword', () => {
  it('always has every kind of character these systems ask for', () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(16);
      expect(passwordProblems(password)).toEqual([]);
    }
  });

  it('is never shorter than 12 characters, and differs each time', () => {
    expect(generatePassword(4)).toHaveLength(12);
    expect(new Set(Array.from({ length: 50 }, () => generatePassword())).size).toBe(50);
  });

  it('says what a password lacks', () => {
    expect(passwordProblems('short')).toEqual(['at least 8 characters', 'a capital letter', 'a number', 'a symbol']);
    expect(passwordProblems('Longer-Pass1')).toEqual([]);
  });
});
