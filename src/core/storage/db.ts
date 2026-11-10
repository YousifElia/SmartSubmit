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
  | { op: 'put'; collection: CollectionName; id: string; data: unknown; updatedAt?: number }
  | { op: 'remove'; collection: CollectionName; id: string; updatedAt?: number }
  | { op: 'putFile'; id: string; base64: string }
  | { op: 'removeFile'; id: string }
  | { op: 'settings'; value: Settings };

export interface MutateOptions {
  /**
   * The change came from the server. It is applied without being marked
   * dirty, otherwise every pull would immediately be pushed back.
   */
  fromSync?: boolean;
}

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
  const del: string[] = [];

  // Load the indexes and dirty maps this batch touches.
  const touched = new Set<CollectionName>();
  let touchesFiles = false;
  for (const m of mutations) {
    if (m.op === 'put' || m.op === 'remove') touched.add(m.collection);
    if (m.op === 'putFile' || m.op === 'removeFile') touchesFiles = true;
  }
  const loadKeys = [...touched].map(idxKey);
  if (!options.fromSync) {
    if (touched.size > 0) loadKeys.push(DIRTY_KEY);
    if (touchesFiles) loadKeys.push(DIRTY_FILES_KEY);
  }
  const loaded = loadKeys.length > 0 ? await browser.storage.local.get(loadKeys) : {};
  const indexes = new Map<CollectionName, Set<string>>();
  for (const c of touched) indexes.set(c, new Set((loaded[idxKey(c)] as string[] | undefined) ?? []));
  const dirty: DirtyMap = { ...((loaded[DIRTY_KEY] as DirtyMap | undefined) ?? {}) };
  const dirtyFiles: DirtyFiles = { ...((loaded[DIRTY_FILES_KEY] as DirtyFiles | undefined) ?? {}) };

  for (const m of mutations) {
    switch (m.op) {
      case 'put': {
        const updatedAt = m.updatedAt ?? now;
        set[recKey(m.collection, m.id)] = { id: m.id, updatedAt, data: m.data } satisfies Rec<unknown>;
        indexes.get(m.collection)!.add(m.id);
        if (!options.fromSync) dirty[`${m.collection}/${m.id}`] = updatedAt;
        break;
      }
      case 'remove': {
        const updatedAt = m.updatedAt ?? now;
        indexes.get(m.collection)!.delete(m.id);
        if (options.fromSync) {
          // The server already knows; nothing to remember locally.
          del.push(recKey(m.collection, m.id));
          delete set[recKey(m.collection, m.id)];
        } else {
          // Keep a marker until sync has told the server.
          set[recKey(m.collection, m.id)] = { id: m.id, updatedAt, deleted: true, data: null };
          dirty[`${m.collection}/${m.id}`] = updatedAt;
        }
        break;
      }
      case 'putFile':
        set[fileKey(m.id)] = m.base64;
        if (!options.fromSync) dirtyFiles[m.id] = 'put';
        break;
      case 'removeFile':
        del.push(fileKey(m.id));
        delete set[fileKey(m.id)];
        if (!options.fromSync) dirtyFiles[m.id] = 'del';
        break;
      case 'settings':
        set[SETTINGS_KEY] = m.value;
        break;
    }
  }

  for (const [c, ids] of indexes) set[idxKey(c)] = [...ids];
  if (!options.fromSync) {
    if (touched.size > 0) set[DIRTY_KEY] = dirty;
    if (touchesFiles) set[DIRTY_FILES_KEY] = dirtyFiles;
  }

  if (Object.keys(set).length > 0) await browser.storage.local.set(set);
  if (del.length > 0) await browser.storage.local.remove(del);
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
