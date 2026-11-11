import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { emptyProfile } from '@/core/defaults';
import * as db from '@/core/storage/db';
import { newDataKey, vaultKeys, type VaultKeys } from '@/core/sync/crypto';
import { EMPTY_STATE, localStore, syncOnce, type LocalStore, type SyncMode, type SyncState } from '@/core/sync/engine';
import { recordAddress, sealRecord } from '@/core/sync/crypto';
import type { Resume, SavedAnswer } from '@/core/types';
import { fakeBackend } from './fakeBackend';

/** Two browsers, run one at a time by swapping what is in storage. */
class Devices {
  private saved = new Map<string, Record<string, unknown>>();
  private states = new Map<string, SyncState>();
  current = '';
  constructor(
    readonly server = fakeBackend(),
    readonly keys: Promise<VaultKeys> = vaultKeys(newDataKey()),
  ) {}

  async use(name: string): Promise<void> {
    if (this.current) this.saved.set(this.current, await browser.storage.local.get(null));
    await browser.storage.local.clear();
    const snapshot = this.saved.get(name);
    if (snapshot && Object.keys(snapshot).length > 0) await browser.storage.local.set(snapshot);
    this.current = name;
  }

  async sync(name: string, mode: SyncMode = 'normal', now = Date.now(), store: LocalStore = localStore) {
    await this.use(name);
    const result = await syncOnce({ backend: this.server.backend, keys: await this.keys, store }, this.states.get(name) ?? EMPTY_STATE, mode, now);
    this.states.set(name, result.state);
    return result.outcome;
  }
}

const answer = (id: string, text: string, createdAt = 1): SavedAnswer => ({
  id,
  question: `Question ${id}`,
  norm: `question ${id}`,
  kind: 'text',
  answer: text,
  options: [],
  host: 'example.com',
  uses: 0,
  createdAt,
});

const resume = (id: string, fileId: string): Resume => ({
  id,
  name: 'General',
  isDefault: true,
  source: 'upload',
  text: 'Avery Testerson',
  doc: null,
  file: { id: fileId, name: 'resume.pdf', mime: 'application/pdf', size: 4 },
  createdAt: 1,
});

describe('sync engine', () => {
  let devices: Devices;
  beforeEach(() => {
    fakeBrowser.reset();
    devices = new Devices();
  });

  it('sends everything from a new account, encrypted', async () => {
    await devices.use('A');
    await db.saveProfile({ ...emptyProfile(), firstName: 'Avery', email: 'avery@example.com' });
    await db.put('answers', 'a1', answer('a1', 'May 2027'));
    await db.mutate([
      { op: 'put', collection: 'resumes', id: 'r1', data: resume('r1', 'f1') },
      { op: 'putFile', id: 'f1', base64: btoa('%PDF') },
    ]);
    const outcome = await devices.sync('A', 'fresh');
    expect(outcome).toMatchObject({ sent: 3, files: 1 });
    expect(devices.server.records.size).toBe(3);
    const everything = JSON.stringify([...devices.server.records.values()]);
    for (const secret of ['Avery', 'May 2027', 'answers', 'profile', 'resumes']) expect(everything).not.toContain(secret);
    expect(await db.getDirty()).toEqual({});
  });

  it('joins a second browser: the account’s copy wins, and that browser’s extras are added', async () => {
    await devices.use('A');
    await db.saveProfile({ ...emptyProfile(), firstName: 'Avery' });
    await db.put('answers', 'a1', answer('a1', 'May 2027'));
    await db.mutate([
      { op: 'put', collection: 'resumes', id: 'r1', data: resume('r1', 'f1') },
      { op: 'putFile', id: 'f1', base64: btoa('%PDF') },
    ]);
    await devices.sync('A', 'fresh');

    // B was set up later with a blank profile and one answer of its own.
    await devices.use('B');
    await db.saveProfile(emptyProfile());
    await db.put('answers', 'b1', answer('b1', 'Hybrid'));
    await devices.sync('B', 'join');
    expect((await db.getProfile()).firstName).toBe('Avery');
    expect((await db.list('answers')).map((r) => r.id).sort()).toEqual(['a1', 'b1']);
    expect(await db.getFile('f1')).toBe(btoa('%PDF'));

    await devices.sync('A');
    expect((await db.list('answers')).map((r) => r.id).sort()).toEqual(['a1', 'b1']);
    expect((await db.getProfile()).firstName).toBe('Avery');
  });

  it('keeps the newest change when two browsers edit the same record', async () => {
    await devices.use('A');
    await db.put('answers', 'a1', answer('a1', 'v1'));
    await devices.sync('A', 'fresh');
    await devices.sync('B', 'join');

    await devices.use('A');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'from A'), updatedAt: Date.now() + 2_000 }]);
    await devices.use('B');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'from B'), updatedAt: Date.now() + 3_000 }]);

    // B syncs first; A's older edit is then refused and replaced.
    await devices.sync('B');
    await devices.sync('A');
    expect((await db.get('answers', 'a1'))?.answer).toBe('from B');
    expect(await db.getDirty()).toEqual({});
    await devices.sync('B');
    expect((await db.get('answers', 'a1'))?.answer).toBe('from B');
  });

  it('an older edit never replaces a newer one, whichever browser syncs first', async () => {
    await devices.use('A');
    await db.put('answers', 'a1', answer('a1', 'v1'));
    await devices.sync('A', 'fresh');
    await devices.sync('B', 'join');

    await devices.use('A');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'newer from A'), updatedAt: Date.now() + 5_000 }]);
    await devices.use('B');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'older from B'), updatedAt: Date.now() + 1_000 }]);
    await devices.sync('A');
    await devices.sync('B');
    expect((await db.get('answers', 'a1'))?.answer).toBe('newer from A');
  });

  it('carries deletions to the other browser, including files nothing uses any more', async () => {
    await devices.use('A');
    await db.put('answers', 'a1', answer('a1', 'x'));
    await db.mutate([
      { op: 'put', collection: 'resumes', id: 'r1', data: resume('r1', 'f1') },
      { op: 'putFile', id: 'f1', base64: btoa('%PDF') },
    ]);
    await devices.sync('A', 'fresh');
    await devices.sync('B', 'join');
    expect(await db.getFile('f1')).not.toBeNull();

    await devices.use('A');
    await db.mutate([
      { op: 'remove', collection: 'answers', id: 'a1' },
      { op: 'remove', collection: 'resumes', id: 'r1' },
      { op: 'removeFile', id: 'f1' },
    ]);
    await devices.sync('A');
    expect(await db.getRec('answers', 'a1')).toBeNull(); // marker cleared once sent
    expect(devices.server.files.size).toBe(0);

    await devices.sync('B');
    expect(await db.get('answers', 'a1')).toBeNull();
    expect(await db.get('resumes', 'r1')).toBeNull();
    expect(await db.getFile('f1')).toBeNull();
  });

  it('only fetches what changed since the last sync', async () => {
    await devices.use('A');
    for (let i = 0; i < 5; i++) await db.put('answers', `a${i}`, answer(`a${i}`, 'x'));
    await devices.sync('A', 'fresh');
    await devices.sync('B', 'join');
    await devices.use('A');
    await db.put('answers', 'a9', answer('a9', 'new'));
    await devices.sync('A');
    const outcome = await devices.sync('B');
    expect(outcome.received).toBe(1);
  });

  it('skips records written with a key this browser does not have', async () => {
    await devices.use('A');
    await db.put('answers', 'a1', answer('a1', 'x'));
    await devices.sync('A', 'fresh');
    // A browser with a different key (say, after an account reset elsewhere).
    const stranger = new Devices(devices.server, vaultKeys(newDataKey()));
    await stranger.use('C');
    const outcome = await stranger.sync('C', 'join');
    expect(outcome.unreadable).toBe(1);
    expect(await db.list('answers')).toEqual([]);
  });

  it('agrees with the server after it refuses an edit from a browser whose clock runs behind', async () => {
    // A's clock is ahead: its version carries a later time than B's edit will.
    await devices.use('A');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'from A'), updatedAt: Date.now() + 60_000 }]);
    await devices.sync('A', 'fresh');
    await devices.sync('B', 'join');
    await devices.use('B');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'from B'), updatedAt: Date.now() }]);
    // The server refuses B's edit, and B has already seen A's version, so
    // only asking for it again keeps the two from drifting apart.
    await devices.sync('B');
    expect((await db.get('answers', 'a1'))?.answer).toBe('from A');
    expect(await db.getDirty()).toEqual({});
  });

  it('lets an ordinary edit win even when the version it replaces is from a clock running ahead', async () => {
    await devices.use('A');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'from A'), updatedAt: Date.now() + 60_000 }]);
    await devices.sync('A', 'fresh');
    await devices.sync('B', 'join');
    await devices.use('B');
    await db.put('answers', 'a1', answer('a1', 'edited on B'));
    await devices.sync('B');
    await devices.sync('A');
    expect((await db.get('answers', 'a1'))?.answer).toBe('edited on B');
  });

  it('never overwrites an edit made while the sync was deciding', async () => {
    await devices.use('A');
    await db.put('answers', 'a1', answer('a1', 'v1'));
    await devices.sync('A', 'fresh');
    await devices.sync('B', 'join');
    await devices.use('A');
    await db.put('answers', 'a1', answer('a1', 'v2 from A'));
    await devices.sync('A');

    // B starts pulling v2; the person edits the same answer just before it lands.
    let typed = false;
    const racing: LocalStore = {
      ...localStore,
      apply: async (mutations) => {
        if (!typed && mutations.some((m) => m.op === 'put' && m.id === 'a1')) {
          typed = true;
          // A moment after A's edit: two edits in the same millisecond go to whichever reached the server first.
          await new Promise((r) => setTimeout(r, 5));
          await db.put('answers', 'a1', answer('a1', 'typed on B'));
        }
        await localStore.apply(mutations);
      },
    };
    await devices.sync('B', 'normal', Date.now(), racing);
    expect(typed).toBe(true);
    expect((await db.get('answers', 'a1'))?.answer).toBe('typed on B');
    expect(Object.keys(await db.getDirty())).toEqual(['answers/a1']);
    await devices.sync('B');
    await devices.sync('A');
    expect((await db.get('answers', 'a1'))?.answer).toBe('typed on B');
  });

  it('joins without sending back what the account already has', async () => {
    await devices.use('A');
    for (let i = 0; i < 3; i++) await db.put('answers', `a${i}`, answer(`a${i}`, 'x'));
    await devices.sync('A', 'fresh');
    await devices.use('B');
    await db.put('answers', 'b1', answer('b1', 'only on B'));
    const outcome = await devices.sync('B', 'join');
    expect(outcome.sent).toBe(1);
    expect(devices.server.records.size).toBe(4);
  });

  it('puts back a resume file the server lost when one browser deleted the resume and another kept editing it', async () => {
    await devices.use('A');
    await db.mutate([
      { op: 'put', collection: 'resumes', id: 'r1', data: resume('r1', 'f1') },
      { op: 'putFile', id: 'f1', base64: btoa('%PDF') },
    ]);
    await devices.sync('A', 'fresh');
    await devices.sync('B', 'join');
    // A deletes the resume; B renames it a moment later, so B's version wins.
    await devices.use('A');
    await db.mutate([
      { op: 'remove', collection: 'resumes', id: 'r1' },
      { op: 'removeFile', id: 'f1' },
    ]);
    await devices.use('B');
    await db.mutate([{ op: 'put', collection: 'resumes', id: 'r1', data: { ...resume('r1', 'f1'), name: 'Renamed' }, updatedAt: Date.now() + 5_000 }]);
    await devices.sync('A');
    expect(devices.server.files.size).toBe(0);
    await devices.sync('B', 'normal', Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect(devices.server.files.size).toBe(1);
    await devices.sync('A');
    expect((await db.get('resumes', 'r1'))?.name).toBe('Renamed');
    expect(await db.getFile('f1')).toBe(btoa('%PDF'));
  });

  it('ignores a record whose sealed time doesn’t match the row, so an old version can’t be passed off as new', async () => {
    await devices.use('A');
    await db.put('answers', 'a1', answer('a1', 'current'));
    await devices.sync('A', 'fresh');
    // The server replays a sealed old version under a later time.
    const keys = await devices.keys;
    const rid = await recordAddress(keys, 'answers', 'a1');
    const old = await sealRecord(keys, rid, { collection: 'answers', id: 'a1', updatedAt: 1, data: answer('a1', 'old') });
    devices.server.records.set(rid, { rid, ciphertext: old, deleted: false, updated_at: Date.now() + 10_000, seq: 99 });
    const outcome = await devices.sync('A');
    expect(outcome.unreadable).toBe(1);
    expect((await db.get('answers', 'a1'))?.answer).toBe('current');
  });
});
