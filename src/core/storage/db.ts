/**
 * Local record store.
 *
 * Layout inside `browser.storage.local`:
 *
 *   r/<collection>/<id>   one record envelope (see `Rec`)
 *   i/<collection>        array of live record ids, so a collection can be
 *                         listed without loading every key (files are large)
 *   f/<fileId>            a file's bytes as base64
 *   s/settings            device-local settings
 *   m/dirty               records changed locally and not yet synced
 *   m/dirtyFiles          files changed locally and not yet synced
 *
 * There is exactly one writer: the background script. Other contexts call the
 * same functions, which forward the mutation over a message (see
 * `setWriteForwarder`). That keeps the id index and the dirty map consistent
 * without cross-context locking.
 */
import { browser } from 'wxt/browser';
import { defaultSettings, emptyProfile, withDefaults } from '../defaults';
import {
  COLLECTIONS,
  PROFILE_ID,
  type CollectionMap,
  type CollectionName,
  type Profile,
  type Rec,
  type Settings,
} from '../types';

const recKey = (c: CollectionName, id: string) => `r/${c}/${id}`;
const idxKey = (c: CollectionName) => `i/${c}`;
const fileKey = (id: string) => `f/${id}`;
const SETTINGS_KEY = 's/settings';
export const DIRTY_KEY = 'm/dirty';
export const DIRTY_FILES_KEY = 'm/dirtyFiles';

export type DirtyMap = Record<string, number>;
export type DirtyFiles = Record<string, 'put' | 'del'>;

export type Mutation =
  | { op: 'put'; collection: CollectionName; id: string; data: unknown; updatedAt?: number; expect?: number | null }
  | { op: 'remove'; collection: CollectionName; id: string; updatedAt?: number; expect?: number | null }
  | { op: 'putFile'; id: string; base64: string }
  | { op: 'removeFile'; id: string }
  | { op: 'settings'; value: Settings };

export interface MutateOptions {
  /**
   * The change came from the server. It is applied without being marked
   * dirty, otherwise every pull would immediately be pushed back, and it
   * settles any local change it replaces.
   */
  fromSync?: boolean;
}

// A record mutation may carry `expect`: apply it only while the record's
// current `updatedAt` is that value (null: only while there is no record).
// Sync sets it, so an edit made while sync was deciding is never overwritten.

// ───────────────────────────── Reads ─────────────────────────────

async function read<T>(key: string): Promise<T | undefined> {
  const out = await browser.storage.local.get(key);
  return out[key] as T | undefined;
}

/** The raw envelope, including deletion markers. */
export async function getRec<C extends CollectionName>(
  collection: C,
  id: string,
): Promise<Rec<CollectionMap[C]> | null> {
  return (await read<Rec<CollectionMap[C]>>(recKey(collection, id))) ?? null;
}

/** A record's data, or null when it is missing or deleted. */
export async function get<C extends CollectionName>(
  collection: C,
  id: string,
): Promise<CollectionMap[C] | null> {
  const rec = await getRec(collection, id);
  return rec && !rec.deleted ? rec.data : null;
}

/** All live records in a collection. */
export async function list<C extends CollectionName>(collection: C): Promise<Rec<CollectionMap[C]>[]> {
  const ids = (await read<string[]>(idxKey(collection))) ?? [];
  if (ids.length === 0) return [];
  const keys = ids.map((id) => recKey(collection, id));
  const out = await browser.storage.local.get(keys);
  const recs: Rec<CollectionMap[C]>[] = [];
  for (const key of keys) {
    const rec = out[key] as Rec<CollectionMap[C]> | undefined;
    if (rec && !rec.deleted) recs.push(rec);
  }
  return recs;
}

export async function getProfile(): Promise<Profile> {
  return withDefaults(emptyProfile(), await get('profile', PROFILE_ID));
}

export async function getSettings(): Promise<Settings> {
  return withDefaults(defaultSettings(), await read<Settings>(SETTINGS_KEY));
}

export async function getFile(id: string): Promise<string | null> {
  return (await read<string>(fileKey(id))) ?? null;
}

export async function getDirty(): Promise<DirtyMap> {
  return (await read<DirtyMap>(DIRTY_KEY)) ?? {};
}

export async function getDirtyFiles(): Promise<DirtyFiles> {
  return (await read<DirtyFiles>(DIRTY_FILES_KEY)) ?? {};
}

// ───────────────────────────── Writes ─────────────────────────────

type Forwarder = (mutations: Mutation[]) => Promise<void>;
let forward: Forwarder | null = null;

/**
 * Route this context's writes through the background script. Called once at
 * startup by every context except the background itself.
 */
export function setWriteForwarder(forwarder: Forwarder): void {
  forward = forwarder;
}

let chain: Promise<unknown> = Promise.resolve();

/** Run write operations one at a time. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

/** Apply mutations. In a proxying context this forwards to the background. */
export function mutate(mutations: Mutation[], options: MutateOptions = {}): Promise<void> {
  if (mutations.length === 0) return Promise.resolve();
  if (forward && !options.fromSync) return forward(mutations);
  return serial(() => applyNow(mutations, options));
}

async function applyNow(mutations: Mutation[], options: MutateOptions): Promise<void> {
  const now = Date.now();
  const set: Record<string, unknown> = {};
  const del = new Set<string>();

  // Load the indexes, dirty maps and current records this batch depends on.
  const touched = new Set<CollectionName>();
  const current = new Set<string>();
  let touchesFiles = false;
  for (const m of mutations) {
    if (m.op === 'put' || m.op === 'remove') {
      touched.add(m.collection);
      // A local edit moves on from the version it replaces (see below).
      if (m.expect !== undefined || (!options.fromSync && m.updatedAt === undefined)) current.add(recKey(m.collection, m.id));
    }
    if (m.op === 'putFile' || m.op === 'removeFile') touchesFiles = true;
  }
  const loadKeys = [...touched].map(idxKey).concat([...current]);
  if (touched.size > 0) loadKeys.push(DIRTY_KEY);
  if (touchesFiles && !options.fromSync) loadKeys.push(DIRTY_FILES_KEY);
  const loaded = loadKeys.length > 0 ? await browser.storage.local.get(loadKeys) : {};
  const indexes = new Map<CollectionName, Set<string>>();
  for (const c of touched) indexes.set(c, new Set((loaded[idxKey(c)] as string[] | undefined) ?? []));
  const versions = new Map<string, Rec<unknown> | undefined>();
  for (const key of current) versions.set(key, loaded[key] as Rec<unknown> | undefined);
  const dirty: DirtyMap = { ...((loaded[DIRTY_KEY] as DirtyMap | undefined) ?? {}) };
  const dirtyFiles: DirtyFiles = { ...((loaded[DIRTY_FILES_KEY] as DirtyFiles | undefined) ?? {}) };
  let dirtyChanged = false;

  for (const m of mutations) {
    switch (m.op) {
      case 'put':
      case 'remove': {
        const key = recKey(m.collection, m.id);
        const existing = versions.get(key);
        if (m.expect !== undefined && (existing?.updatedAt ?? null) !== m.expect) break;
        // Never go back in time: a device whose clock runs behind another's
        // would otherwise lose its edits to the version it just replaced.
        const updatedAt = m.updatedAt ?? Math.max(now, (existing?.updatedAt ?? 0) + 1);
        const dirtyKey = `${m.collection}/${m.id}`;
        let rec: Rec<unknown> | undefined;
        if (m.op === 'put') {
          rec = { id: m.id, updatedAt, data: m.data };
          indexes.get(m.collection)!.add(m.id);
        } else {
          indexes.get(m.collection)!.delete(m.id);
          // Locally, keep a marker until sync has told the server. A deletion
          // from the server needs none.
          rec = options.fromSync ? undefined : { id: m.id, updatedAt, deleted: true, data: null };
        }
        if (rec) {
          set[key] = rec;
          del.delete(key);
        } else {
          delete set[key];
          del.add(key);
        }
        versions.set(key, rec);
        if (options.fromSync) {
          // The server's version replaces whatever was waiting to be sent.
          if (dirtyKey in dirty) {
            delete dirty[dirtyKey];
            dirtyChanged = true;
          }
        } else {
          dirty[dirtyKey] = updatedAt;
          dirtyChanged = true;
        }
        break;
      }
      case 'putFile':
        set[fileKey(m.id)] = m.base64;
        del.delete(fileKey(m.id));
        if (!options.fromSync) dirtyFiles[m.id] = 'put';
        break;
      case 'removeFile':
        del.add(fileKey(m.id));
        delete set[fileKey(m.id)];
        if (!options.fromSync) dirtyFiles[m.id] = 'del';
        break;
      case 'settings':
        set[SETTINGS_KEY] = m.value;
        break;
    }
  }

  for (const [c, ids] of indexes) set[idxKey(c)] = [...ids];
  if (dirtyChanged) set[DIRTY_KEY] = dirty;
  if (touchesFiles && !options.fromSync) set[DIRTY_FILES_KEY] = dirtyFiles;

  if (Object.keys(set).length > 0) await browser.storage.local.set(set);
  if (del.size > 0) await browser.storage.local.remove([...del]);
}

/** Forget that records were dirty, once they have been pushed. */
export function clearDirty(pushed: DirtyMap): Promise<void> {
  return serial(async () => {
    const dirty = await getDirty();
    const drop: string[] = [];
    for (const [key, at] of Object.entries(pushed)) {
      // Only if it hasn't changed again since the push started.
      if (dirty[key] !== at) continue;
      delete dirty[key];
      const [collection, id] = splitDirtyKey(key);
      const rec = await getRec(collection, id);
      if (rec?.deleted) drop.push(recKey(collection, id));
    }
    await browser.storage.local.set({ [DIRTY_KEY]: dirty });
    if (drop.length > 0) await browser.storage.local.remove(drop);
  });
}

export function clearDirtyFiles(pushed: DirtyFiles): Promise<void> {
  return serial(async () => {
    const dirty = await getDirtyFiles();
    for (const [id, op] of Object.entries(pushed)) if (dirty[id] === op) delete dirty[id];
    await browser.storage.local.set({ [DIRTY_FILES_KEY]: dirty });
  });
}

/** Mark every local record and file dirty: used when linking to a new account. */
export function markAllDirty(): Promise<void> {
  return serial(async () => {
    const dirty: DirtyMap = await getDirty();
    for (const c of COLLECTIONS) {
      for (const rec of await list(c)) dirty[`${c}/${rec.id}`] = rec.updatedAt;
    }
    const all = await browser.storage.local.get(null);
    const dirtyFiles: DirtyFiles = await getDirtyFiles();
    for (const key of Object.keys(all)) {
      if (key.startsWith('f/')) dirtyFiles[key.slice(2)] = 'put';
    }
    await browser.storage.local.set({ [DIRTY_KEY]: dirty, [DIRTY_FILES_KEY]: dirtyFiles });
  });
}

/** Mark particular records and files dirty: used when joining an account that lacks them. */
export function markDirty(records: string[], files: string[]): Promise<void> {
  if (records.length === 0 && files.length === 0) return Promise.resolve();
  return serial(async () => {
    const dirty = await getDirty();
    for (const key of records) {
      const [collection, id] = splitDirtyKey(key);
      const rec = await getRec(collection, id);
      if (rec && !rec.deleted) dirty[key] = rec.updatedAt;
    }
    const dirtyFiles = await getDirtyFiles();
    for (const id of files) if ((await getFile(id)) !== null) dirtyFiles[id] = 'put';
    await browser.storage.local.set({ [DIRTY_KEY]: dirty, [DIRTY_FILES_KEY]: dirtyFiles });
  });
}

/** Ids of every file stored on this device. */
export async function fileIds(): Promise<string[]> {
  const all = await browser.storage.local.get(null);
  return Object.keys(all)
    .filter((key) => key.startsWith('f/'))
    .map((key) => key.slice(2));
}

export function splitDirtyKey(key: string): [CollectionName, string] {
  const slash = key.indexOf('/');
  return [key.slice(0, slash) as CollectionName, key.slice(slash + 1)];
}

// ─────────────────────────── Convenience ───────────────────────────

export function put<C extends CollectionName>(collection: C, id: string, data: CollectionMap[C]): Promise<void> {
  return mutate([{ op: 'put', collection, id, data }]);
}

export function remove(collection: CollectionName, id: string): Promise<void> {
  return mutate([{ op: 'remove', collection, id }]);
}

export function saveProfile(profile: Profile): Promise<void> {
  return put('profile', PROFILE_ID, profile);
}

export function saveSettings(settings: Settings): Promise<void> {
  return mutate([{ op: 'settings', value: settings }]);
}

export function putFile(id: string, base64: string): Promise<void> {
  return mutate([{ op: 'putFile', id, base64 }]);
}

export function removeFile(id: string): Promise<void> {
  return mutate([{ op: 'removeFile', id }]);
}

// ───────────────────────── Change listening ─────────────────────────

export type StoreChange =
  | { kind: 'record'; collection: CollectionName; id: string }
  | { kind: 'settings' }
  | { kind: 'meta'; key: string };

/**
 * Subscribe to changes made by any context. Returns an unsubscribe function.
 * File contents are ignored; a file change always comes with a record change.
 */
export function onStoreChange(listener: (changes: StoreChange[]) => void): () => void {
  const handler = (raw: Record<string, unknown>, area: string) => {
    if (area !== 'local') return;
    const changes: StoreChange[] = [];
    for (const key of Object.keys(raw)) {
      if (key.startsWith('r/')) {
        const rest = key.slice(2);
        const slash = rest.indexOf('/');
        changes.push({
          kind: 'record',
          collection: rest.slice(0, slash) as CollectionName,
          id: rest.slice(slash + 1),
        });
      } else if (key === SETTINGS_KEY) {
        changes.push({ kind: 'settings' });
      } else if (key.startsWith('m/') || key.startsWith('a/')) {
        changes.push({ kind: 'meta', key });
      }
    }
    if (changes.length > 0) listener(changes);
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

// ───────────────────────── Backup and reset ─────────────────────────

export interface Backup {
  app: 'smartsubmit';
  version: 1;
  exportedAt: number;
  records: Partial<Record<CollectionName, Rec<unknown>[]>>;
  files: Record<string, string>;
}

/** Everything the user entered, as one portable object. Settings are left out. */
export async function exportBackup(): Promise<Backup> {
  const records: Backup['records'] = {};
  for (const c of COLLECTIONS) records[c] = await list(c);
  const all = await browser.storage.local.get(null);
  const files: Record<string, string> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith('f/') && typeof value === 'string') files[key.slice(2)] = value;
  }
  return { app: 'smartsubmit', version: 1, exportedAt: Date.now(), records, files };
}

/** Merge a backup into this device. Newer records win; nothing is deleted. */
export async function importBackup(backup: Backup): Promise<{ records: number; files: number }> {
  if (backup?.app !== 'smartsubmit' || backup.version !== 1) {
    throw new Error('This file is not a SmartSubmit backup.');
  }
  const mutations: Mutation[] = [];
  for (const c of COLLECTIONS) {
    for (const rec of backup.records[c] ?? []) {
      if (!rec || typeof rec.id !== 'string' || rec.deleted) continue;
      const existing = await getRec(c, rec.id);
      if (existing && existing.updatedAt >= rec.updatedAt) continue;
      mutations.push({ op: 'put', collection: c, id: rec.id, data: rec.data });
    }
  }
  let files = 0;
  for (const [id, base64] of Object.entries(backup.files ?? {})) {
    if (typeof base64 !== 'string') continue;
    mutations.push({ op: 'putFile', id, base64 });
    files++;
  }
  await mutate(mutations);
  return { records: mutations.length - files, files };
}

/** Delete all user data on this device. Settings survive. */
export async function wipeLocalData(): Promise<void> {
  const all = await browser.storage.local.get(null);
  const mutations: Mutation[] = [];
  for (const key of Object.keys(all)) {
    if (key.startsWith('r/')) {
      const rest = key.slice(2);
      const slash = rest.indexOf('/');
      mutations.push({
        op: 'remove',
        collection: rest.slice(0, slash) as CollectionName,
        id: rest.slice(slash + 1),
      });
    } else if (key.startsWith('f/')) {
      mutations.push({ op: 'removeFile', id: key.slice(2) });
    }
  }
  await mutate(mutations);
}
