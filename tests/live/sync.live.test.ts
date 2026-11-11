/**
 * Sync against a real Supabase project, with two simulated browsers.
 *
 * Needs a project with supabase/migrations applied and a confirmed account
 * whose password was set to SmartSubmit's sign-in secret for SS_SYNC_PASSWORD
 * (see scripts/live-test-account.mjs). The test deletes the account at the end.
 *
 *   SS_SYNC_URL=https://<project>.supabase.co SS_SYNC_KEY=<publishable key> \
 *   SS_SYNC_EMAIL=... SS_SYNC_PASSWORD=... NODE_USE_ENV_PROXY=1 npm run test:live
 */
import { describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { emptyProfile } from '@/core/defaults';
import * as db from '@/core/storage/db';
import { createAccount, type AccountRecord } from '@/core/sync/account';
import { supabaseBackend, type SyncBackend } from '@/core/sync/backend';
import { localStore } from '@/core/sync/engine';
import { memorySecrets } from '@/core/sync/keystore';
import type { Resume, SavedAnswer } from '@/core/types';

const URL = process.env.SS_SYNC_URL ?? '';
const KEY = process.env.SS_SYNC_KEY ?? '';
const EMAIL = process.env.SS_SYNC_EMAIL ?? '';
const PASSWORD = process.env.SS_SYNC_PASSWORD ?? '';
const NEW_PASSWORD = `${PASSWORD} renewed`;

const answer = (id: string, text: string): SavedAnswer => ({
  id,
  question: `Expected graduation date ${id}`,
  norm: `expected graduation date ${id}`,
  kind: 'text',
  answer: text,
  options: [],
  host: 'boards.greenhouse.io',
  uses: 0,
  createdAt: 1,
});

const PDF = btoa('%PDF-1.4 Avery Testerson resume');
const resume: Resume = {
  id: 'r1',
  name: 'General',
  isDefault: true,
  source: 'upload',
  text: 'Avery Testerson',
  doc: null,
  file: { id: 'f1', name: 'resume.pdf', mime: 'application/pdf', size: 30 },
  createdAt: 1,
};

/** Browsers with their own storage, secrets and server session. */
class Browsers {
  private saved = new Map<string, Record<string, unknown>>();
  private made = new Map<string, { account: ReturnType<typeof createAccount>; backend: SyncBackend }>();
  current = '';

  async on(name: string) {
    if (this.current !== name) {
      if (this.current) this.saved.set(this.current, await browser.storage.local.get(null));
      await browser.storage.local.clear();
      const snapshot = this.saved.get(name);
      if (snapshot && Object.keys(snapshot).length > 0) await browser.storage.local.set(snapshot);
      this.current = name;
    }
    let made = this.made.get(name);
    if (!made) {
      const secrets = memorySecrets();
      const backend = supabaseBackend(URL, KEY, secrets);
      const account = createAccount({
        server: URL,
        backend,
        secrets,
        store: localStore,
        load: async () => ((await browser.storage.local.get('a/sync'))['a/sync'] as AccountRecord | undefined) ?? null,
        save: async (record) => (record ? browser.storage.local.set({ 'a/sync': record }) : browser.storage.local.remove('a/sync')),
      });
      made = { account, backend };
      this.made.set(name, made);
    }
    return made;
  }
}

describe.skipIf(!URL || !KEY || !EMAIL || !PASSWORD)('sync against a real server', () => {
  const browsers = new Browsers();

  it('signs in to a new account, creates its key and uploads this browser’s data', async () => {
    const { account } = await browsers.on('A');
    await db.saveProfile({ ...emptyProfile(), firstName: 'Avery', lastName: 'Testerson', email: EMAIL });
    await db.put('answers', 'a1', answer('a1', 'May 2027'));
    await db.mutate([
      { op: 'put', collection: 'resumes', id: 'r1', data: resume },
      { op: 'putFile', id: 'f1', base64: PDF },
    ]);
    expect(await account.signIn(EMAIL, PASSWORD)).toEqual({ ok: true });
    expect((await account.status()).state).toBe('ready');
    expect(await account.syncNow()).toMatchObject({ sent: 3, files: 1 });
    expect(await db.getDirty()).toEqual({});
  });

  it('leaves only ciphertext on the server', async () => {
    const { backend } = await browsers.on('A');
    const rows = await backend.pull(0, 1000);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.rid).toMatch(/^[\w-]{43}$/);
      for (const plain of ['Avery', 'Testerson', 'May 2027', 'graduation', 'answers', 'profile', 'resumes', 'greenhouse']) {
        expect(atob(row.ciphertext ?? '')).not.toContain(plain);
      }
    }
    const files = await backend.listFiles();
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain('f1');
    const bytes = new TextDecoder('latin1').decode((await backend.getFile(files[0]!))!);
    expect(bytes).not.toContain('PDF');
    expect(bytes).not.toContain('Avery');
    const vault = await backend.getVault();
    expect(vault?.wrapped_key).toBeTruthy();
    expect(JSON.stringify(vault)).not.toContain(PASSWORD);
  });

  it('brings everything to a second browser, where the account’s profile wins', async () => {
    const { account } = await browsers.on('B');
    await db.saveProfile(emptyProfile());
    await db.put('answers', 'b1', answer('b1', 'Hybrid'));
    expect(await account.signIn(EMAIL, PASSWORD)).toEqual({ ok: true });
    await account.syncNow();
    expect((await db.getProfile()).firstName).toBe('Avery');
    expect((await db.list('answers')).map((r) => r.id).sort()).toEqual(['a1', 'b1']);
    expect(await db.getFile('f1')).toBe(PDF);
  });

  it('carries edits and deletions both ways', async () => {
    const b = await browsers.on('B');
    await db.put('answers', 'a1', answer('a1', 'December 2026'));
    await db.mutate([
      { op: 'remove', collection: 'resumes', id: 'r1' },
      { op: 'removeFile', id: 'f1' },
    ]);
    await b.account.syncNow();
    expect(await b.backend.listFiles()).toEqual([]);

    const a = await browsers.on('A');
    await a.account.syncNow();
    expect((await db.get('answers', 'a1'))?.answer).toBe('December 2026');
    expect((await db.list('answers')).map((r) => r.id).sort()).toEqual(['a1', 'b1']);
    expect(await db.get('resumes', 'r1')).toBeNull();
    expect(await db.getFile('f1')).toBeNull();

    await db.put('answers', 'a2', answer('a2', 'Yes'));
    await a.account.syncNow();
    await (await browsers.on('B')).account.syncNow();
    expect((await db.get('answers', 'a2'))?.answer).toBe('Yes');
  });

  it('changes the password; the old one stops working and the data stays readable', async () => {
    const a = await browsers.on('A');
    expect(await a.account.changePassword('not the password at all', NEW_PASSWORD)).toMatchObject({ ok: false });
    expect(await a.account.changePassword(PASSWORD, NEW_PASSWORD)).toEqual({ ok: true });
    await db.put('answers', 'a3', answer('a3', 'After the change'));
    expect(await a.account.syncNow()).toMatchObject({ sent: 1 });

    const c = await browsers.on('C');
    expect(await c.account.signIn(EMAIL, PASSWORD)).toMatchObject({ ok: false });
    expect(await c.account.signIn(EMAIL, NEW_PASSWORD)).toEqual({ ok: true });
    await c.account.syncNow();
    expect((await db.list('answers')).map((r) => r.id).sort()).toEqual(['a1', 'a2', 'a3', 'b1']);
  });

  it('deletes the account and everything on the server', async () => {
    const a = await browsers.on('A');
    await db.mutate([
      { op: 'put', collection: 'resumes', id: 'r2', data: { ...resume, id: 'r2', file: { ...resume.file!, id: 'f2' } } },
      { op: 'putFile', id: 'f2', base64: PDF },
    ]);
    await a.account.syncNow();
    expect(await a.backend.listFiles()).toHaveLength(1);
    expect(await a.account.deleteAccount('not the password at all')).toMatchObject({ ok: false });
    expect(await a.account.deleteAccount(NEW_PASSWORD)).toEqual({ ok: true });
    expect((await a.account.status()).state).toBe('signedOut');
    expect((await db.list('answers')).length).toBe(4);

    // Another browser finds the account gone.
    const c = await browsers.on('C');
    expect(await c.account.syncNow()).toBeNull();
    expect((await c.account.status()).state).toBe('signedOut');
    expect(await c.account.signIn(EMAIL, NEW_PASSWORD)).toMatchObject({ ok: false });
  });
});
