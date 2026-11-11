/**
 * The sync engine: send local changes up, bring remote changes down.
 *
 * Every record carries the time it last changed and the newest change wins,
 * both on the server (see push_records in the migration) and here. Changes
 * travel encrypted; the server can't read them or tell what they are.
 */
import * as db from '../storage/db';
import { COLLECTIONS, type CollectionName, type Rec, type Resume } from '../types';
import { base64ToBytes, bytesToBase64 } from '../util/base64';
import type { PushItem, RemoteRecord, SyncBackend } from './backend';
import { fileAddress, open, openRecord, recordAddress, seal, sealRecord, type VaultKeys } from './crypto';

export interface SyncState {
  /** The highest server sequence number seen. */
  lastSeq: number;
  lastSyncAt: number | null;
  /** When everything was last compared, not just recent changes. */
  lastFullAt: number | null;
}

export const EMPTY_STATE: SyncState = { lastSeq: 0, lastSyncAt: null, lastFullAt: null };

/**
 * How to sync:
 *  - 'normal': send pending changes, then fetch what changed since last time;
 *  - 'fresh':  a brand-new account: send everything this browser has;
 *  - 'join':   this browser joins an account that already has data: the
 *              account's copy wins for anything both have, and whatever only
 *              this browser has is added to it.
 */
export type SyncMode = 'normal' | 'fresh' | 'join';

export interface SyncOutcome {
  sent: number;
  received: number;
  files: number;
  /** Records this browser couldn't decrypt: written with a key it doesn't have. */
  unreadable: number;
}

/** What the engine needs from local storage; the real one is `db`. */
export interface LocalStore {
  dirty(): Promise<db.DirtyMap>;
  dirtyFiles(): Promise<db.DirtyFiles>;
  getRec(collection: CollectionName, id: string): Promise<Rec<unknown> | null>;
  list(collection: CollectionName): Promise<Rec<unknown>[]>;
  apply(mutations: db.Mutation[]): Promise<void>;
  clearDirty(pushed: db.DirtyMap): Promise<void>;
  clearDirtyFiles(pushed: db.DirtyFiles): Promise<void>;
  file(id: string): Promise<string | null>;
  fileIds(): Promise<string[]>;
  markAllDirty(): Promise<void>;
  markDirty(records: string[], files: string[]): Promise<void>;
}

export const localStore: LocalStore = {
  dirty: db.getDirty,
  dirtyFiles: db.getDirtyFiles,
  getRec: (c, id) => db.getRec(c, id) as Promise<Rec<unknown> | null>,
  list: (c) => db.list(c) as Promise<Rec<unknown>[]>,
  apply: (mutations) => db.mutate(mutations, { fromSync: true }),
  clearDirty: db.clearDirty,
  clearDirtyFiles: db.clearDirtyFiles,
  file: db.getFile,
  fileIds: db.fileIds,
  markAllDirty: db.markAllDirty,
  markDirty: db.markDirty,
};

const BATCH = 200;
const PAGE = 500;
const FETCH = 100;
const DAY = 24 * 60 * 60 * 1000;

export interface SyncContext {
  backend: SyncBackend;
  keys: VaultKeys;
  store: LocalStore;
}

/** Server address → local record, for every record this browser has. */
type Index = Map<string, [CollectionName, string]>;

async function buildIndex({ keys, store }: SyncContext): Promise<Index> {
  const index: Index = new Map();
  for (const collection of COLLECTIONS) {
    for (const rec of await store.list(collection)) index.set(await recordAddress(keys, collection, rec.id), [collection, rec.id]);
  }
  return index;
}

// ─────────────────────────────── Up ───────────────────────────────

async function push({ backend, keys, store }: SyncContext): Promise<{ sent: number; files: number; rejected: Set<string> }> {
  const dirty = Object.entries(await store.dirty());
  const rejected = new Set<string>();
  let sent = 0;
  for (let i = 0; i < dirty.length; i += BATCH) {
    const items: PushItem[] = [];
    const covered: db.DirtyMap = {};
    for (const [key, at] of dirty.slice(i, i + BATCH)) {
      const [collection, id] = db.splitDirtyKey(key);
      const rec = await store.getRec(collection, id);
      // What was actually sent; a later edit stays pending.
      covered[key] = rec?.updatedAt ?? at;
      if (!rec) continue;
      const rid = await recordAddress(keys, collection, id);
      items.push(
        rec.deleted
          ? { rid, ciphertext: null, deleted: true, updated_at: rec.updatedAt }
          : { rid, ciphertext: await sealRecord(keys, rid, { collection, id, updatedAt: rec.updatedAt, data: rec.data }), deleted: false, updated_at: rec.updatedAt },
      );
    }
    for (const result of await backend.push(items)) {
      if (result.accepted) sent++;
      // The server has something as new or newer; it is brought down after.
      else rejected.add(result.rid);
    }
    await store.clearDirty(covered);
  }

  const files = await store.dirtyFiles();
  let fileCount = 0;
  for (const [id, op] of Object.entries(files)) {
    const name = await fileAddress(keys, id);
    if (op === 'put') {
      const base64 = await store.file(id);
      if (!base64) continue;
      await backend.putFile(name, await seal(keys, base64ToBytes(base64), name));
    } else {
      await backend.removeFiles([name]);
    }
    fileCount++;
  }
  await store.clearDirtyFiles(files);
  return { sent, files: fileCount, rejected };
}

// ────────────────────────────── Down ──────────────────────────────

interface Rules {
  /** The account's copy wins, whatever its age ('join'). */
  preferRemote: boolean;
  /** Addresses the server just refused: its copy wins ties, so both sides agree. */
  rejected: Set<string>;
}

type Decision = db.Mutation | 'skip' | 'unreadable';

/** What to do locally with one record from the server. */
async function decide({ keys, store }: SyncContext, remote: RemoteRecord, index: Index, rules: Rules): Promise<Decision> {
  const wins = (local: Rec<unknown>) =>
    rules.preferRemote || (rules.rejected.has(remote.rid) ? local.updatedAt <= remote.updated_at : local.updatedAt < remote.updated_at);

  if (remote.deleted) {
    const target = index.get(remote.rid);
    if (!target) return 'skip';
    const rec = await store.getRec(...target);
    if (!rec || rec.deleted || !wins(rec)) return 'skip';
    index.delete(remote.rid);
    return { op: 'remove', collection: target[0], id: target[1], updatedAt: remote.updated_at, expect: rec.updatedAt };
  }

  let payload;
  try {
    payload = await openRecord(keys, remote.rid, remote.ciphertext ?? '');
  } catch {
    return 'unreadable';
  }
  // The time is sealed inside too, so the server can't pass an old version off as new.
  if (payload.updatedAt !== remote.updated_at) return 'unreadable';
  const collection = payload.collection as CollectionName;
  if (!COLLECTIONS.includes(collection)) return 'skip';
  const rec = await store.getRec(collection, payload.id);
  if (rec && !wins(rec)) return 'skip';
  index.set(remote.rid, [collection, payload.id]);
  return { op: 'put', collection, id: payload.id, data: payload.data, updatedAt: remote.updated_at, expect: rec?.updatedAt ?? null };
}

interface Pulled {
  seq: number;
  received: number;
  unreadable: number;
  seen: Set<string>;
}

async function applyAll(ctx: SyncContext, rows: RemoteRecord[], index: Index, rules: Rules, out: Pulled): Promise<void> {
  const mutations: db.Mutation[] = [];
  for (const remote of rows) {
    out.seen.add(remote.rid);
    const decision = await decide(ctx, remote, index, rules);
    if (decision === 'unreadable') out.unreadable++;
    else if (decision !== 'skip') mutations.push(decision);
  }
  await ctx.store.apply(mutations);
  out.received += mutations.length;
}

async function pull(ctx: SyncContext, from: number, index: Index, rules: Rules): Promise<Pulled> {
  const out: Pulled = { seq: from, received: 0, unreadable: 0, seen: new Set() };
  for (;;) {
    const page = await ctx.backend.pull(out.seq, PAGE);
    for (const remote of page) out.seq = Math.max(out.seq, remote.seq);
    await applyAll(ctx, page, index, rules, out);
    if (page.length < PAGE) return out;
  }
}

/** Bring down the server's copy of records it refused that the pull didn't include. */
async function settle(ctx: SyncContext, rids: string[], index: Index, rules: Rules, out: Pulled): Promise<void> {
  for (let i = 0; i < rids.length; i += FETCH) {
    await applyAll(ctx, await ctx.backend.fetch(rids.slice(i, i + FETCH)), index, rules, out);
  }
}

/**
 * Resume files: download the ones records refer to, drop the ones nothing
 * refers to, and (on a full sync) re-upload any the server is missing, which
 * happens when one browser deletes a resume while another edits it.
 */
async function syncFiles({ backend, keys, store }: SyncContext, full: boolean): Promise<number> {
  const wanted = new Set((await store.list('resumes')).map((r) => (r.data as Resume).file?.id).filter((id): id is string => !!id));
  const present = new Set(await store.fileIds());
  const pending = await store.dirtyFiles();
  let count = 0;
  for (const id of wanted) {
    if (present.has(id)) continue;
    const name = await fileAddress(keys, id);
    const sealed = await backend.getFile(name);
    if (!sealed) continue;
    await store.apply([{ op: 'putFile', id, base64: bytesToBase64(await open(keys, sealed, name)) }]);
    count++;
  }
  const orphans = [...present].filter((id) => !wanted.has(id) && !pending[id]);
  if (orphans.length > 0) await store.apply(orphans.map((id) => ({ op: 'removeFile' as const, id })));

  if (full && wanted.size > 0) {
    const remote = new Set(await backend.listFiles());
    for (const id of wanted) {
      if (!present.has(id) || pending[id]) continue;
      const name = await fileAddress(keys, id);
      if (remote.has(name)) continue;
      const base64 = await store.file(id);
      if (!base64) continue;
      await backend.putFile(name, await seal(keys, base64ToBytes(base64), name));
      count++;
    }
  }
  return count;
}

// ────────────────────────────── Both ──────────────────────────────

/** Run one sync. Returns the new state to keep for next time. */
export async function syncOnce(
  ctx: SyncContext,
  state: SyncState,
  mode: SyncMode = 'normal',
  now = Date.now(),
): Promise<{ state: SyncState; outcome: SyncOutcome }> {
  // Compare everything once a day: the server's sequence numbers can, rarely,
  // become visible out of order when two browsers write at the same moment.
  const full = mode !== 'normal' || !state.lastFullAt || now - state.lastFullAt > DAY;
  let pushed: Awaited<ReturnType<typeof push>>;
  let pulled: Pulled;

  if (mode === 'join') {
    let index = await buildIndex(ctx);
    pulled = await pull(ctx, 0, index, { preferRemote: true, rejected: new Set() });
    // Whatever the account doesn't have yet goes up.
    const records: string[] = [];
    const files: string[] = [];
    for (const [rid, [collection, id]] of index) {
      if (pulled.seen.has(rid)) continue;
      records.push(`${collection}/${id}`);
      if (collection === 'resumes') {
        const fileId = ((await ctx.store.getRec(collection, id))?.data as Resume | undefined)?.file?.id;
        if (fileId) files.push(fileId);
      }
    }
    await ctx.store.markDirty(records, files);
    pushed = await push(ctx);
    index = await buildIndex(ctx);
    await settle(ctx, [...pushed.rejected], index, { preferRemote: false, rejected: pushed.rejected }, pulled);
  } else {
    if (mode === 'fresh') await ctx.store.markAllDirty();
    pushed = await push(ctx);
    const index = await buildIndex(ctx);
    const rules = { preferRemote: false, rejected: pushed.rejected };
    pulled = await pull(ctx, full ? 0 : state.lastSeq, index, rules);
    await settle(ctx, [...pushed.rejected].filter((rid) => !pulled.seen.has(rid)), index, rules, pulled);
  }
  const files = await syncFiles(ctx, full);

  return {
    state: { lastSeq: Math.max(state.lastSeq, pulled.seq), lastSyncAt: now, lastFullAt: full ? now : state.lastFullAt },
    outcome: { sent: pushed.sent, received: pulled.received, files: pushed.files + files, unreadable: pulled.unreadable },
  };
}
