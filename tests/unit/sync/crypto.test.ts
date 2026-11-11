// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  deriveKeys,
  fileAddress,
  newDataKey,
  open,
  openRecord,
  recordAddress,
  seal,
  sealRecord,
  unwrapDataKey,
  vaultKeys,
  wrapDataKey,
  WrongPasswordError,
} from '@/core/sync/crypto';
import { utf8 } from '@/core/util/base64';

// Fewer iterations keep the tests quick; the real default is 600,000.
const FAST = 1000;

describe('password keys', () => {
  it('derive the same secrets for the same email and password, however the email is typed', async () => {
    const a = await deriveKeys('Avery@Example.com ', 'correct horse battery', FAST);
    const b = await deriveKeys('avery@example.com', 'correct horse battery', FAST);
    expect(a.authSecret).toBe(b.authSecret);
    expect(a.authSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differ for a different password or a different email', async () => {
    const base = await deriveKeys('avery@example.com', 'correct horse battery', FAST);
    expect((await deriveKeys('avery@example.com', 'correct horse batterz', FAST)).authSecret).not.toBe(base.authSecret);
    expect((await deriveKeys('sam@example.com', 'correct horse battery', FAST)).authSecret).not.toBe(base.authSecret);
  });

  it('never reveal the password in the sign-in secret', async () => {
    const { authSecret } = await deriveKeys('avery@example.com', 'correct horse battery', FAST);
    expect(authSecret).not.toContain('correct');
  });
});

describe('data key', () => {
  it('wraps and unwraps with the right password only', async () => {
    const dataKey = newDataKey();
    const right = await deriveKeys('avery@example.com', 'right password', FAST);
    const wrong = await deriveKeys('avery@example.com', 'wrong password', FAST);
    const wrapped = await wrapDataKey(dataKey, right.wrapKey);
    expect(await unwrapDataKey(wrapped, right.wrapKey)).toEqual(dataKey);
    await expect(unwrapDataKey(wrapped, wrong.wrapKey)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('wraps differently every time', async () => {
    const dataKey = newDataKey();
    const { wrapKey } = await deriveKeys('avery@example.com', 'pw', FAST);
    expect(await wrapDataKey(dataKey, wrapKey)).not.toBe(await wrapDataKey(dataKey, wrapKey));
  });
});

describe('records and files', () => {
  it('seal and open a record, hiding everything about it', async () => {
    const keys = await vaultKeys(newDataKey());
    const rid = await recordAddress(keys, 'answers', 'a1');
    const payload = { collection: 'answers', id: 'a1', updatedAt: 5, data: { question: 'Expected graduation date', answer: 'May 2027' } };
    const ciphertext = await sealRecord(keys, rid, payload);
    expect(ciphertext).not.toMatch(/answers|May 2027|graduation/);
    expect(rid).not.toMatch(/answers|a1/);
    expect(await openRecord(keys, rid, ciphertext)).toEqual(payload);
  });

  it('gives each record a stable, distinct address', async () => {
    const keys = await vaultKeys(newDataKey());
    expect(await recordAddress(keys, 'answers', 'a1')).toBe(await recordAddress(keys, 'answers', 'a1'));
    expect(await recordAddress(keys, 'answers', 'a1')).not.toBe(await recordAddress(keys, 'jobs', 'a1'));
    expect(await recordAddress(keys, 'answers', 'a1')).not.toBe(await fileAddress(keys, 'a1'));
  });

  it('refuses ciphertext moved to another address or read with another key', async () => {
    const keys = await vaultKeys(newDataKey());
    const other = await vaultKeys(newDataKey());
    const a = await recordAddress(keys, 'answers', 'a1');
    const b = await recordAddress(keys, 'answers', 'a2');
    const ciphertext = await sealRecord(keys, a, { collection: 'answers', id: 'a1', updatedAt: 1, data: 1 });
    await expect(openRecord(keys, b, ciphertext)).rejects.toThrow();
    await expect(openRecord(other, a, ciphertext)).rejects.toThrow();
  });

  it('seals files byte for byte', async () => {
    const keys = await vaultKeys(newDataKey());
    const name = await fileAddress(keys, 'f1');
    const bytes = utf8('%PDF-1.4 resume');
    expect(await open(keys, await seal(keys, bytes, name), name)).toEqual(bytes);
  });
});
