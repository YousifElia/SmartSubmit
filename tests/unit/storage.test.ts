import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { emptyProfile, withDefaults } from '@/core/defaults';
import * as db from '@/core/storage/db';
import type { SavedAnswer } from '@/core/types';

function answer(id: string, question: string): SavedAnswer {
  return { id, question, norm: question.toLowerCase(), kind: 'text', answer: 'x', options: [], host: 'example.com', uses: 0, createdAt: 1 };
}

describe('record store', () => {
  beforeEach(() => fakeBrowser.reset());

  it('stores, reads and lists records', async () => {
    await db.put('answers', 'a1', answer('a1', 'Why us?'));
    await db.put('answers', 'a2', answer('a2', 'Salary?'));
    expect((await db.get('answers', 'a1'))?.question).toBe('Why us?');
    expect((await db.list('answers')).map((r) => r.id).sort()).toEqual(['a1', 'a2']);
    expect(await db.get('answers', 'missing')).toBeNull();
  });

  it('marks local changes dirty but not changes applied from sync', async () => {
    await db.put('answers', 'a1', answer('a1', 'Local'));
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a2', data: answer('a2', 'Remote'), updatedAt: 5 }], {
      fromSync: true,
    });
    const dirty = await db.getDirty();
    expect(Object.keys(dirty)).toEqual(['answers/a1']);
    expect((await db.getRec('answers', 'a2'))?.updatedAt).toBe(5);
  });

  it('keeps a deletion marker until the deletion has been pushed', async () => {
    await db.put('answers', 'a1', answer('a1', 'Gone soon'));
    await db.remove('answers', 'a1');
    expect(await db.get('answers', 'a1')).toBeNull();
    expect(await db.list('answers')).toEqual([]);
    const marker = await db.getRec('answers', 'a1');
    expect(marker?.deleted).toBe(true);

    const dirty = await db.getDirty();
    await db.clearDirty(dirty);
    expect(await db.getRec('answers', 'a1')).toBeNull();
    expect(await db.getDirty()).toEqual({});
  });

  it('does not clear a record that changed again during the push', async () => {
    await db.put('answers', 'a1', answer('a1', 'v1'));
    const snapshot = await db.getDirty();
    await new Promise((r) => setTimeout(r, 2));
    await db.put('answers', 'a1', answer('a1', 'v2'));
    await db.clearDirty(snapshot);
    expect(Object.keys(await db.getDirty())).toEqual(['answers/a1']);
  });

  it('never moves a record back in time when it is edited here', async () => {
    const future = Date.now() + 60_000;
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'From a fast clock'), updatedAt: future }], { fromSync: true });
    await db.put('answers', 'a1', answer('a1', 'Edited here'));
    expect((await db.getRec('answers', 'a1'))?.updatedAt).toBe(future + 1);
    await db.remove('answers', 'a1');
    expect((await db.getRec('answers', 'a1'))?.updatedAt).toBe(future + 2);
  });

  it('applies a guarded change from sync only while the record is as expected', async () => {
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'v1'), updatedAt: 10 }], { fromSync: true });
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'stale'), updatedAt: 30, expect: 5 }], { fromSync: true });
    expect((await db.get('answers', 'a1'))?.question).toBe('v1');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'v2'), updatedAt: 30, expect: 10 }], { fromSync: true });
    expect((await db.get('answers', 'a1'))?.question).toBe('v2');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a2', data: answer('a2', 'new'), updatedAt: 30, expect: null }], { fromSync: true });
    expect((await db.get('answers', 'a2'))?.question).toBe('new');
  });

  it('settles a pending local change when sync replaces it', async () => {
    await db.put('answers', 'a1', answer('a1', 'Local'));
    const rec = await db.getRec('answers', 'a1');
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'Newer remote'), updatedAt: rec!.updatedAt + 10, expect: rec!.updatedAt }], {
      fromSync: true,
    });
    expect(await db.getDirty()).toEqual({});
  });

  it('can put a record back in the same batch that removed it', async () => {
    await db.put('answers', 'a1', answer('a1', 'v1'));
    await db.mutate(
      [
        { op: 'remove', collection: 'answers', id: 'a1', updatedAt: 5 },
        { op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'back'), updatedAt: 6 },
      ],
      { fromSync: true },
    );
    expect((await db.get('answers', 'a1'))?.question).toBe('back');
  });

  it('deletes outright when the deletion came from sync', async () => {
    await db.mutate([{ op: 'put', collection: 'answers', id: 'a1', data: answer('a1', 'Remote') }], { fromSync: true });
    await db.mutate([{ op: 'remove', collection: 'answers', id: 'a1' }], { fromSync: true });
    expect(await db.getRec('answers', 'a1')).toBeNull();
    expect(await db.getDirty()).toEqual({});
  });

  it('tracks file changes separately', async () => {
    await db.putFile('f1', 'QUJD');
    expect(await db.getFile('f1')).toBe('QUJD');
    expect(await db.getDirtyFiles()).toEqual({ f1: 'put' });
    await db.removeFile('f1');
    expect(await db.getFile('f1')).toBeNull();
    expect(await db.getDirtyFiles()).toEqual({ f1: 'del' });
  });

  it('serialises concurrent writes so the index never loses an entry', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => db.put('answers', `a${i}`, answer(`a${i}`, `Q${i}`))));
    expect(await db.list('answers')).toHaveLength(25);
  });

  it('returns a complete profile and settings even when nothing is stored', async () => {
    const profile = await db.getProfile();
    expect(profile.workAuth.CA).toBeDefined();
    expect(profile.address.country).toBe('CA');
    const settings = await db.getSettings();
    expect(settings.autofill.learn).toBe(true);
    expect(settings.onboarded).toBe(false);
  });

  it('round-trips a backup and never overwrites newer data', async () => {
    await db.saveProfile({ ...emptyProfile(), firstName: 'Avery' });
    await db.put('answers', 'a1', answer('a1', 'Original'));
    await db.putFile('f1', 'QUJD');
    const backup = await db.exportBackup();

    fakeBrowser.reset();
    await db.put('answers', 'a1', answer('a1', 'Newer on this device'));
    const result = await db.importBackup(JSON.parse(JSON.stringify(backup)));
    expect(result.files).toBe(1);
    expect((await db.getProfile()).firstName).toBe('Avery');
    expect((await db.get('answers', 'a1'))?.question).toBe('Newer on this device');
    expect(await db.getFile('f1')).toBe('QUJD');
  });

  it('rejects a file that is not a backup', async () => {
    await expect(db.importBackup({ hello: 'world' } as never)).rejects.toThrow(/not a SmartSubmit backup/);
  });

  it('wipes user data but leaves settings', async () => {
    const settings = await db.getSettings();
    await db.saveSettings({ ...settings, onboarded: true });
    await db.put('answers', 'a1', answer('a1', 'Q'));
    await db.putFile('f1', 'QUJD');
    await db.wipeLocalData();
    expect(await db.list('answers')).toEqual([]);
    expect(await db.getFile('f1')).toBeNull();
    expect((await db.getSettings()).onboarded).toBe(true);
  });
});

describe('withDefaults', () => {
  it('adds fields missing from data written by an older version', () => {
    const stored = { firstName: 'Avery', address: { city: 'Windsor' } };
    const merged = withDefaults(emptyProfile(), stored);
    expect(merged.firstName).toBe('Avery');
    expect(merged.address.city).toBe('Windsor');
    expect(merged.address.country).toBe('CA');
    expect(merged.demographics.race).toEqual([]);
  });

  it('keeps stored arrays as they are', () => {
    const merged = withDefaults(emptyProfile(), { education: [{ id: 'e1', school: 'UWindsor' }] });
    expect(merged.education).toHaveLength(1);
  });
});
