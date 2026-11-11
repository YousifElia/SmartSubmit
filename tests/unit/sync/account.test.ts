import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { emptyProfile } from '@/core/defaults';
import * as db from '@/core/storage/db';
import { createAccount, type AccountRecord } from '@/core/sync/account';
import { deriveKeys } from '@/core/sync/crypto';
import { localStore } from '@/core/sync/engine';
import { memorySecrets } from '@/core/sync/keystore';
import type { SavedAnswer } from '@/core/types';
import { fakeServer } from './fakeBackend';

const ITERATIONS = 1000;
const SERVER = 'https://sync.example';
const EMAIL = 'avery@example.com';
const PASSWORD = 'lantern orbit cactus';

const answer = (id: string, text: string): SavedAnswer => ({
  id,
  question: `Question ${id}`,
  norm: `question ${id}`,
  kind: 'text',
  answer: text,
  options: [],
  host: 'example.com',
  uses: 0,
  createdAt: 1,
});

/** Separate browsers sharing one server, run one at a time by swapping storage. */
class Browsers {
  private saved = new Map<string, Record<string, unknown>>();
  private accounts = new Map<string, ReturnType<typeof createAccount>>();
  current = '';
  constructor(readonly server = fakeServer()) {}

  /** Switch to a browser and get its account. */
  async on(name: string) {
    if (this.current !== name) {
      if (this.current) this.saved.set(this.current, await browser.storage.local.get(null));
      await browser.storage.local.clear();
      const snapshot = this.saved.get(name);
      if (snapshot && Object.keys(snapshot).length > 0) await browser.storage.local.set(snapshot);
      this.current = name;
    }
    let account = this.accounts.get(name);
    if (!account) {
      account = createAccount({
        server: SERVER,
        backend: this.server.client(),
        secrets: memorySecrets(),
        store: localStore,
        load: async () => ((await browser.storage.local.get('a/sync'))['a/sync'] as AccountRecord | undefined) ?? null,
        save: async (record) => (record ? browser.storage.local.set({ 'a/sync': record }) : browser.storage.local.remove('a/sync')),
        iterations: ITERATIONS,
      });
      this.accounts.set(name, account);
    }
    return account;
  }
}

const ok = { ok: true };

describe('sync account', () => {
  let browsers: Browsers;
  beforeEach(() => {
    fakeBrowser.reset();
    browsers = new Browsers();
  });

  it('creates an account, then sends what this browser has, encrypted', async () => {
    const a = await browsers.on('A');
    await db.saveProfile({ ...emptyProfile(), firstName: 'Avery', email: EMAIL });
    await db.put('answers', 'a1', answer('a1', 'May 2027'));
    expect(await a.signUp(` ${EMAIL.toUpperCase()} `, PASSWORD)).toEqual(ok);
    expect((await a.status()).state).toBe('ready');
    expect((await a.syncNow())?.sent).toBe(2);

    const user = browsers.server.users.get(EMAIL)!;
    // The server knows the account by a secret derived from the password, never the password.
    expect(user.secret).not.toContain(PASSWORD);
    const stored = JSON.stringify([...browsers.server.recordsOf(user.id).values()]) + JSON.stringify(browsers.server.vaults.get(user.id));
    for (const plain of ['Avery', 'May 2027', PASSWORD, 'answers']) expect(stored).not.toContain(plain);
  });

  it('refuses weak passwords and malformed emails', async () => {
    const a = await browsers.on('A');
    expect(await a.signUp(EMAIL, 'short')).toMatchObject({ ok: false, error: expect.stringMatching(/at least 10/) });
    expect(await a.signUp('not-an-email', PASSWORD)).toMatchObject({ ok: false, error: expect.stringMatching(/valid email/) });
    expect(await a.signUp(EMAIL, EMAIL)).toMatchObject({ ok: false });
  });

  it('waits for the email to be confirmed, by code or by link', async () => {
    browsers = new Browsers(fakeServer({ confirmEmail: true }));
    const a = await browsers.on('A');
    expect(await a.signUp(EMAIL, PASSWORD)).toEqual({ ok: true, needsConfirmation: true });
    expect(await a.status()).toMatchObject({ state: 'confirming', email: EMAIL });
    // Pressing Continue before following the link.
    expect(await a.confirm('')).toMatchObject({ ok: false, error: expect.stringMatching(/confirm/i) });
    expect(await a.confirm('999999')).toMatchObject({ ok: false });
    const { code } = browsers.server.outbox.at(-1)!;
    expect(await a.confirm(code)).toEqual(ok);
    expect((await a.status()).state).toBe('ready');

    const b = await browsers.on('B');
    expect(await b.signUp('sam@example.com', PASSWORD)).toMatchObject({ needsConfirmation: true });
    browsers.server.confirmByLink('sam@example.com');
    expect(await b.confirm('')).toEqual(ok);
    expect((await b.status()).state).toBe('ready');
  });

  it('can abandon a sign-up that is waiting for confirmation', async () => {
    browsers = new Browsers(fakeServer({ confirmEmail: true }));
    const a = await browsers.on('A');
    await a.signUp(EMAIL, PASSWORD);
    await a.cancelSignUp();
    expect((await a.status()).state).toBe('signedOut');
  });

  it('brings an account’s data to another browser, where the account’s copy wins', async () => {
    const a = await browsers.on('A');
    await db.saveProfile({ ...emptyProfile(), firstName: 'Avery' });
    await db.put('answers', 'a1', answer('a1', 'May 2027'));
    await a.signUp(EMAIL, PASSWORD);
    await a.syncNow();

    // A new install with a blank profile and one answer of its own.
    const b = await browsers.on('B');
    await db.saveProfile(emptyProfile());
    await db.put('answers', 'b1', answer('b1', 'Hybrid'));
    expect(await b.signIn(EMAIL, 'wrong password!!')).toMatchObject({ ok: false, error: expect.stringMatching(/don’t match/) });
    expect(await b.signIn(EMAIL, PASSWORD)).toEqual(ok);
    await b.syncNow();
    expect((await db.getProfile()).firstName).toBe('Avery');
    expect((await db.list('answers')).map((r) => r.id).sort()).toEqual(['a1', 'b1']);

    await (await browsers.on('A')).syncNow();
    expect((await db.list('answers')).map((r) => r.id).sort()).toEqual(['a1', 'b1']);
  });

  it('keeps changes made while signed out when signing back in to the same account', async () => {
    const a = await browsers.on('A');
    await db.put('answers', 'a1', answer('a1', 'v1'));
    await a.signUp(EMAIL, PASSWORD);
    await a.syncNow();
    expect(await a.signOut()).toEqual(ok);
    expect(await a.status()).toMatchObject({ state: 'signedOut', email: EMAIL, holdsKey: false });
    expect(await a.syncNow()).toBeNull();

    await db.put('answers', 'a1', answer('a1', 'edited while signed out'));
    expect(await a.signIn(EMAIL, PASSWORD)).toEqual(ok);
    await a.syncNow();
    expect((await db.get('answers', 'a1'))?.answer).toBe('edited while signed out');
    const b = await browsers.on('B');
    await b.signIn(EMAIL, PASSWORD);
    await b.syncNow();
    expect((await db.get('answers', 'a1'))?.answer).toBe('edited while signed out');
  });

  it('changes the password without losing data, and only with the current one', async () => {
    const a = await browsers.on('A');
    await db.put('answers', 'a1', answer('a1', 'x'));
    await a.signUp(EMAIL, PASSWORD);
    await a.syncNow();
    expect(await a.changePassword('not the password', 'river maple signal')).toMatchObject({ ok: false, error: expect.stringMatching(/current password/) });
    expect(await a.changePassword(PASSWORD, 'river maple signal')).toEqual(ok);
    expect(browsers.server.vaults.get(browsers.server.users.get(EMAIL)!.id)?.previous_wrapped_key).toBeNull();

    const b = await browsers.on('B');
    expect(await b.signIn(EMAIL, PASSWORD)).toMatchObject({ ok: false });
    expect(await b.signIn(EMAIL, 'river maple signal')).toEqual(ok);
    await b.syncNow();
    expect((await db.get('answers', 'a1'))?.answer).toBe('x');
  });

  it('stays usable with the old password when the server refuses the new one', async () => {
    const a = await browsers.on('A');
    await a.signUp(EMAIL, PASSWORD);
    browsers.server.failures.updatePassword = new Error('Password change needs a recent sign-in.');
    expect(await a.changePassword(PASSWORD, 'river maple signal')).toMatchObject({ ok: false, error: expect.stringMatching(/recent sign-in/) });
    const b = await browsers.on('B');
    expect(await b.signIn(EMAIL, PASSWORD)).toEqual(ok);
  });

  it('still unlocks with the old password when a password change stopped halfway', async () => {
    const a = await browsers.on('A');
    await db.put('answers', 'a1', answer('a1', 'x'));
    await a.signUp(EMAIL, PASSWORD);
    await a.syncNow();
    // The key was rewrapped for a new password, and then the browser closed.
    const user = browsers.server.users.get(EMAIL)!;
    const vault = browsers.server.vaults.get(user.id)!;
    const other = await deriveKeys(EMAIL, 'never applied password', ITERATIONS);
    const { wrapDataKey } = await import('@/core/sync/crypto');
    browsers.server.vaults.set(user.id, { ...vault, wrapped_key: await wrapDataKey(crypto.getRandomValues(new Uint8Array(32)), other.wrapKey), previous_wrapped_key: vault.wrapped_key });

    const b = await browsers.on('B');
    expect(await b.signIn(EMAIL, PASSWORD)).toEqual(ok);
    await b.syncNow();
    expect((await db.get('answers', 'a1'))?.answer).toBe('x');
  });

  it('resets a forgotten password on a browser that still holds the key, keeping the cloud copy', async () => {
    const a = await browsers.on('A');
    await db.put('answers', 'a1', answer('a1', 'kept'));
    await a.signUp(EMAIL, PASSWORD);
    await a.syncNow();
    expect((await a.status()).holdsKey).toBe(true);

    expect(await a.requestReset(EMAIL)).toEqual(ok);
    const { code } = browsers.server.outbox.at(-1)!;
    expect(await a.completeReset(EMAIL, code, 'harbor violet engine')).toEqual(ok);
    expect((await a.status()).state).toBe('ready');

    const b = await browsers.on('B');
    expect(await b.signIn(EMAIL, 'harbor violet engine')).toEqual(ok);
    await b.syncNow();
    expect((await db.get('answers', 'a1'))?.answer).toBe('kept');
  });

  it('starts the cloud copy again when the reset happens on a browser without the key', async () => {
    const a = await browsers.on('A');
    await db.put('answers', 'a1', answer('a1', 'from A'));
    await a.signUp(EMAIL, PASSWORD);
    await a.syncNow();

    const b = await browsers.on('B');
    await db.put('answers', 'b1', answer('b1', 'from B'));
    await b.requestReset(EMAIL);
    const { code } = browsers.server.outbox.at(-1)!;
    expect(await b.completeReset(EMAIL, code, 'harbor violet engine')).toEqual(ok);
    await b.syncNow();
    expect((await db.list('answers')).map((r) => r.id)).toEqual(['b1']);

    // A notices the key changed, and picks up the new one with the new password.
    const again = await browsers.on('A');
    expect(await again.syncNow()).toBeNull();
    expect(await again.status()).toMatchObject({ state: 'signedOut', error: expect.stringMatching(/reset on another browser/) });
    expect(await again.signIn(EMAIL, 'harbor violet engine')).toEqual(ok);
    await again.syncNow();
    expect((await db.list('answers')).map((r) => r.id).sort()).toEqual(['a1', 'b1']);
  });

  it('deletes the account and its cloud data, but not what is on this browser', async () => {
    const a = await browsers.on('A');
    await db.put('answers', 'a1', answer('a1', 'x'));
    await db.mutate([
      { op: 'put', collection: 'resumes', id: 'r1', data: { id: 'r1', name: 'General', isDefault: true, source: 'upload', text: '', doc: null, file: { id: 'f1', name: 'r.pdf', mime: 'application/pdf', size: 4 }, createdAt: 1 } },
      { op: 'putFile', id: 'f1', base64: btoa('%PDF') },
    ]);
    await a.signUp(EMAIL, PASSWORD);
    await a.syncNow();
    const id = browsers.server.users.get(EMAIL)!.id;
    expect(browsers.server.filesOf(id).size).toBe(1);

    expect(await a.deleteAccount('wrong password!!')).toMatchObject({ ok: false, error: expect.stringMatching(/isn’t right/) });
    expect(await a.deleteAccount(PASSWORD)).toEqual(ok);
    expect(browsers.server.users.has(EMAIL)).toBe(false);
    expect(browsers.server.vaults.has(id)).toBe(false);
    expect(browsers.server.recordsOf(id).size).toBe(0);
    expect(browsers.server.filesOf(id).size).toBe(0);
    expect((await a.status()).state).toBe('signedOut');
    expect((await db.get('answers', 'a1'))?.answer).toBe('x');
  });

  it('stops syncing on another browser once the account is deleted', async () => {
    const a = await browsers.on('A');
    await a.signUp(EMAIL, PASSWORD);
    const b = await browsers.on('B');
    await b.signIn(EMAIL, PASSWORD);
    await b.syncNow();
    await (await browsers.on('A')).deleteAccount(PASSWORD);
    const again = await browsers.on('B');
    expect(await again.syncNow()).toBeNull();
    expect(await again.status()).toMatchObject({ state: 'signedOut', error: expect.stringMatching(/no longer exists|signed out/) });
  });
});
