/**
 * Finishing a sign-up and resetting a password from the links in Supabase's
 * emails, against a real project and without any email being sent.
 *
 * Supabase's built-in emails carry only a link, so SmartSubmit takes the link
 * pasted in, or the address of the page it opened. These tests check that
 * against the real auth server, using accounts created directly in the
 * database, each already waiting on a one-time token whose value is known
 * (see scripts/live-link-accounts.mjs for how to create them).
 *
 *   SS_SYNC_URL=https://<project>.supabase.co SS_SYNC_KEY=<publishable key> \
 *   SS_LINK_ACCOUNTS=accounts.json NODE_USE_ENV_PROXY=1 npm run test:live
 *
 * The tests delete the accounts as they finish.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as db from '@/core/storage/db';
import { readEmailProof } from '@/core/sync/emailProof';
import type { SavedAnswer } from '@/core/types';
import { Browsers } from './browsers';

const URL = process.env.SS_SYNC_URL ?? '';
const KEY = process.env.SS_SYNC_KEY ?? '';
const FILE = process.env.SS_LINK_ACCOUNTS ?? '';

interface Seeded {
  email: string;
  password: string;
  /** The token as a code, and as the hash an emailed link carries. */
  code: string;
  hash: string;
}
const seeded = FILE ? (JSON.parse(readFileSync(FILE, 'utf8')) as Record<'confirm' | 'resetByLink' | 'resetByCode' | 'resetByOpening', Seeded>) : null;

/** The link as Supabase writes it into its emails. */
const emailed = (hash: string, type: string) => `${URL}/auth/v1/verify?token=${hash}&type=${type}&redirect_to=http://localhost:3000`;

/** Open a link the way a browser tab does, and return the address it lands on. */
async function open(link: string): Promise<string> {
  const response = await fetch(link, { redirect: 'manual' });
  return response.headers.get('location') ?? '';
}

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
const answers = async () => (await db.list('answers')).map((r) => r.id).sort();

const ok = { ok: true };
const NEW = 'harbor violet engine 7';

describe.skipIf(!URL || !KEY || !seeded)('email links against a real server', () => {
  const browsers = new Browsers(URL, KEY);

  it('confirms a new address with the link from the confirmation email, once', async () => {
    const user = seeded!.confirm;
    const a = await browsers.on('A');
    expect(await a.account.signIn(user.email, user.password)).toMatchObject({ ok: false, error: expect.stringMatching(/confirm/i) });

    const proof = readEmailProof(emailed(user.hash, 'signup'));
    if (proof.kind !== 'link') throw new Error(`Read as ${proof.kind}`);
    expect((await a.backend.verifyLink(proof.tokenHash, proof.type)).email).toBe(user.email);
    await expect(a.backend.verifyLink(proof.tokenHash, proof.type)).rejects.toMatchObject({ kind: 'expired' });

    expect(await a.account.signIn(user.email, user.password)).toEqual(ok);
    expect(await a.account.deleteAccount(user.password)).toEqual(ok);
  });

  it('resets a password with the pasted link; on a browser without the key the cloud copy starts again', async () => {
    const user = seeded!.resetByLink;
    const a = await browsers.on('A');
    await db.put('answers', 'a1', answer('a1', 'from A'));
    expect(await a.account.signIn(user.email, user.password)).toEqual(ok);
    await a.account.syncNow();

    const b = await browsers.on('B');
    await db.put('answers', 'b1', answer('b1', 'from B'));
    const link = emailed(user.hash, 'recovery');
    expect(await b.account.completeReset(user.email, link, NEW)).toEqual(ok);
    await b.account.syncNow();
    expect(await answers()).toEqual(['b1']);
    // The link works once.
    expect(await b.account.completeReset(user.email, link, `${NEW} again`)).toMatchObject({ ok: false, error: expect.stringMatching(/already been used or has expired/) });

    // A notices the key changed and picks up the new one with the new password.
    const again = await browsers.on('A');
    expect(await again.account.syncNow()).toBeNull();
    expect((await again.account.status()).error).toMatch(/reset on another browser/);
    expect(await again.account.signIn(user.email, user.password)).toMatchObject({ ok: false });
    expect(await again.account.signIn(user.email, NEW)).toEqual(ok);
    await again.account.syncNow();
    expect(await answers()).toEqual(['a1', 'b1']);
    expect(await again.account.deleteAccount(NEW)).toEqual(ok);
  });

  it('resets with a code where the emails show one; a browser that holds the key keeps the cloud copy', async () => {
    const user = seeded!.resetByCode;
    const c = await browsers.on('C');
    await db.put('answers', 'c1', answer('c1', 'kept'));
    expect(await c.account.signIn(user.email, user.password)).toEqual(ok);
    await c.account.syncNow();
    expect(await c.account.completeReset(user.email, ' 333 333 ', NEW)).toEqual(ok);

    const d = await browsers.on('D');
    expect(await d.account.signIn(user.email, user.password)).toMatchObject({ ok: false });
    expect(await d.account.signIn(user.email, NEW)).toEqual(ok);
    await d.account.syncNow();
    expect((await db.get('answers', 'c1'))?.answer).toBe('kept');
    expect(await d.account.deleteAccount(NEW)).toEqual(ok);
  });

  it('resets after the link was opened, with the address of the page it landed on', async () => {
    const user = seeded!.resetByOpening;
    const link = emailed(user.hash, 'recovery');
    const page = await open(link);
    expect(readEmailProof(page)).toMatchObject({ kind: 'session', type: 'recovery' });
    // Opened a second time, the server says the link is spent, and that is understood too.
    expect(readEmailProof(await open(link))).toMatchObject({ kind: 'spent' });

    const e = await browsers.on('E');
    expect(await e.account.completeReset(user.email, link, NEW)).toMatchObject({ ok: false, error: expect.stringMatching(/paste the address of the page it opened/) });
    expect(await e.account.completeReset(user.email, page, NEW)).toEqual(ok);

    const f = await browsers.on('F');
    expect(await f.account.signIn(user.email, user.password)).toMatchObject({ ok: false });
    expect(await f.account.signIn(user.email, NEW)).toEqual(ok);
    expect(await f.account.deleteAccount(NEW)).toEqual(ok);
  });
});
