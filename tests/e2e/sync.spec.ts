/**
 * Two browsers syncing through a real sync server, driven through the
 * dashboard like a person would. Opt-in, because it needs a server and a
 * confirmed test account (see scripts/live-test-account.mjs):
 *
 *   SS_SYNC_URL=https://<project>.supabase.co SS_SYNC_KEY=<publishable key> \
 *   SS_SYNC_EMAIL=... SS_SYNC_PASSWORD=... NODE_USE_ENV_PROXY=1 npx playwright test sync
 *
 * The test deletes the account at the end.
 */
import { createClient } from '@supabase/supabase-js';
import { emptyProfile } from '../../src/core/defaults';
import { deriveKeys } from '../../src/core/sync/crypto';
import type { Profile, SavedAnswer } from '../../src/core/types';
import { expect, launchApp, test, TINY_PDF_BASE64, type App } from './harness';

const SERVER = process.env.SS_SYNC_URL ?? '';
const KEY = process.env.SS_SYNC_KEY ?? '';
const EMAIL = process.env.SS_SYNC_EMAIL ?? '';
const PASSWORD = process.env.SS_SYNC_PASSWORD ?? '';

const graduation: SavedAnswer = {
  id: 'a1',
  question: 'What is your expected graduation date?',
  norm: 'what is your expected graduation date',
  kind: 'text',
  answer: 'May 2027',
  options: [],
  host: 'job-boards.greenhouse.io',
  uses: 0,
  createdAt: 1,
};

const stored = <T,>(app: App, prefix: string) =>
  app.dashboard.evaluate(async (p) => {
    const chromeApi = (globalThis as unknown as { chrome: { storage: { local: { get(k: null): Promise<Record<string, unknown>> } } } }).chrome;
    const all = await chromeApi.storage.local.get(null);
    return Object.entries(all)
      .filter(([key, value]) => key.startsWith(p) && !(value as { deleted?: boolean } | null)?.deleted)
      .map(([, value]) => (typeof value === 'string' ? value : (value as { data: unknown }).data));
  }, prefix) as Promise<T[]>;

/** Point the extension at the server and sign in, through the Sync page. */
async function signIn(app: App): Promise<void> {
  const page = app.dashboard;
  await page.evaluate(() => (window.location.hash = '#/sync'));
  await page.getByLabel('Project URL').fill(SERVER);
  await page.getByLabel('Publishable key').fill(KEY);
  await page.getByRole('button', { name: 'Save server' }).click();
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(EMAIL, { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Synced just now')).toBeVisible({ timeout: 60_000 });
}

async function syncNow(app: App): Promise<void> {
  await app.dashboard.getByRole('button', { name: 'Sync now' }).click();
  await expect(app.dashboard.getByRole('button', { name: 'Sync now' })).toBeEnabled({ timeout: 60_000 });
}

test.describe('sync', () => {
  test.skip(!SERVER || !KEY || !EMAIL || !PASSWORD, 'Set SS_SYNC_URL, SS_SYNC_KEY, SS_SYNC_EMAIL and SS_SYNC_PASSWORD to run against a sync server.');
  test.setTimeout(300_000);

  test('two browsers stay in step through a server that only sees ciphertext', async () => {
    const host = new URL(SERVER).hostname;
    const a = await launchApp({ network: [host] });
    const b = await launchApp({ network: [host] });
    try {
      // A has a full setup: profile, a saved answer, an uploaded resume.
      await a.app.seed({ answers: [graduation], resume: true });
      await signIn(a.app);

      // B is a fresh install with a blank profile.
      await b.app.seed({ profile: emptyProfile() });
      await signIn(b.app);
      expect(await stored<SavedAnswer>(b.app, 'r/answers/')).toEqual([expect.objectContaining({ answer: 'May 2027' })]);
      expect((await stored<Profile>(b.app, 'r/profile/'))[0]?.firstName).toBe('Avery');
      expect(await stored<string>(b.app, 'f/')).toEqual([TINY_PDF_BASE64]);

      // An edit on B goes up by itself a few seconds later…
      await b.app.request('db.mutate', { mutations: [{ op: 'put', collection: 'answers', id: 'a1', data: { ...graduation, answer: 'December 2026' } }] });
      await expect(b.app.dashboard.getByText(/change waiting/)).toBeVisible();
      await expect(b.app.dashboard.getByText(/change waiting/)).toBeHidden({ timeout: 60_000 });
      // …and reaches A at its next sync.
      await syncNow(a.app);
      await expect.poll(async () => (await stored<SavedAnswer>(a.app, 'r/answers/'))[0]?.answer).toBe('December 2026');

      // What the server holds, read with the account's own server credentials.
      const { authSecret } = await deriveKeys(EMAIL, PASSWORD);
      const client = createClient(SERVER, KEY, { auth: { persistSession: false } });
      const signedIn = await client.auth.signInWithPassword({ email: EMAIL, password: authSecret });
      expect(signedIn.error).toBeNull();
      const { data: rows } = await client.from('records').select('rid, ciphertext, deleted');
      expect(rows).toHaveLength(3);
      const everything = JSON.stringify(rows) + JSON.stringify((await client.from('vault_keys').select('*')).data);
      for (const plain of ['Avery', 'Testerson', 'graduation', 'May 2027', 'December 2026', 'Windsor', 'answers', 'profile', 'resumes', 'greenhouse', PASSWORD]) {
        expect(everything).not.toContain(plain);
      }
      for (const row of rows ?? []) expect(Buffer.from(row.ciphertext as string, 'base64').toString('latin1')).not.toMatch(/Avery|May 2027|December 2026/);
      await client.auth.signOut();

      // Deleting the account from A clears the server; B notices at its next sync.
      await a.app.dashboard.getByRole('button', { name: 'Delete account' }).click();
      const dialog = a.app.dashboard.getByRole('dialog', { name: 'Delete sync account' });
      await dialog.getByLabel('Password').fill(PASSWORD);
      await dialog.getByRole('button', { name: 'Delete account' }).click();
      await expect(a.app.dashboard.getByRole('tab', { name: 'Sign in' })).toBeVisible({ timeout: 60_000 });
      expect(await stored<SavedAnswer>(a.app, 'r/answers/')).toHaveLength(1);

      await b.app.dashboard.getByRole('button', { name: 'Sync now' }).click();
      await expect(b.app.dashboard.getByText(/no longer exists|signed out of sync/)).toBeVisible({ timeout: 60_000 });
      expect(await stored<SavedAnswer>(b.app, 'r/answers/')).toHaveLength(1);
    } finally {
      await a.close();
      await b.close();
    }
  });
});
