/**
 * Sync in the background: the account, the message handlers the dashboard
 * uses, and when to sync (every 15 minutes, a few seconds after a local
 * change, and when the browser starts).
 */
import { browser } from 'wxt/browser';
import { maySend } from '@/core/consent';
import type { AuthResult, Handlers, SyncStatus } from '@/core/messages';
import * as db from '@/core/storage/db';
import { createAccount, type AccountRecord, type SyncAccountApi } from '@/core/sync/account';
import { supabaseBackend } from '@/core/sync/backend';
import { localStore } from '@/core/sync/engine';
import { idbSecrets } from '@/core/sync/keystore';
import { keepAwake } from './keepAwake';

const RECORD_KEY = 'a/sync';
const SYNCING_KEY = 'a/syncing';
const ALARM = 'smartsubmit-sync';
const PERIOD_MINUTES = 15;
const AFTER_CHANGE_MS = 4_000;

export function serverAddress(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

const load = async (): Promise<AccountRecord | null> =>
  ((await browser.storage.local.get(RECORD_KEY))[RECORD_KEY] as AccountRecord | undefined) ?? null;
const save = (record: AccountRecord | null): Promise<void> =>
  record ? browser.storage.local.set({ [RECORD_KEY]: record }) : browser.storage.local.remove(RECORD_KEY);

let current: { server: string; key: string; account: SyncAccountApi } | null = null;

/** The account on the configured server, or null when no server is set. */
async function account(): Promise<SyncAccountApi | null> {
  const settings = (await db.getSettings()).sync;
  const server = serverAddress(settings.url ?? '');
  const key = (settings.key ?? '').trim();
  if (!server || !key) return null;
  if (current?.server !== server || current.key !== key) {
    current = { server, key, account: createAccount({ server, backend: supabaseBackend(server, key, idbSecrets), secrets: idbSecrets, store: localStore, load, save }) };
  }
  return current.account;
}

async function need(): Promise<SyncAccountApi> {
  const found = await account();
  if (!found) throw new Error('Set the sync server first.');
  return found;
}

let running: Promise<void> | null = null;
let again = false;

/** Sync now, or once more after the sync already running. */
function runSync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      const found = await account().catch(() => null);
      if (!found || (await found.status()).state !== 'ready') return;
      // Firefox lets people withdraw permission to send data; then sync waits.
      if (!(await maySend())) return;
      await browser.storage.local.set({ [SYNCING_KEY]: Date.now() });
      do {
        again = false;
        // The reason is kept for the status; nothing else to do with it here.
        await keepAwake(() => found.syncNow()).catch((error: unknown) => console.warn('SmartSubmit sync:', error));
      } while (again);
    } finally {
      running = null;
      await browser.storage.local.remove(SYNCING_KEY).catch(() => undefined);
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;
function syncSoon(delay = AFTER_CHANGE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runSync();
  }, delay);
}

async function status(): Promise<SyncStatus> {
  const found = await account().catch(() => null);
  const empty: SyncStatus = { configured: false, state: 'signedOut', email: '', lastSyncAt: null, syncing: false, pending: 0, error: '', holdsKey: false };
  if (!found) return empty;
  const [state, dirty, dirtyFiles] = await Promise.all([found.status(), db.getDirty(), db.getDirtyFiles()]);
  const paused = state.state === 'ready' && !(await maySend());
  return {
    ...empty,
    ...state,
    error: paused ? 'Sync is paused: Firefox’s permission for SmartSubmit to send data is off. Turn it back on in the add-on’s Permissions settings.' : state.error,
    configured: true,
    syncing: running !== null,
    pending: state.state === 'ready' ? Object.keys(dirty).length + Object.keys(dirtyFiles).length : 0,
  };
}

/** Start syncing straight after a successful sign-in. */
function thenSync(result: AuthResult): AuthResult {
  if (result.ok && !result.needsConfirmation) void runSync();
  return result;
}

/** Register the schedule. Call once, synchronously, when the background starts. */
export function startSyncSchedule(): void {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void runSync();
  });
  void browser.alarms.get(ALARM).then((existing) => {
    if (!existing) void browser.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: PERIOD_MINUTES });
  });
  browser.runtime.onStartup.addListener(() => syncSoon(10_000));
  db.onStoreChange((changes) => {
    if (!changes.some((c) => c.kind === 'meta' && (c.key === db.DIRTY_KEY || c.key === db.DIRTY_FILES_KEY))) return;
    void Promise.all([db.getDirty(), db.getDirtyFiles()]).then(([dirty, files]) => {
      if (Object.keys(dirty).length + Object.keys(files).length > 0) syncSoon();
    });
  });
}

export const syncHandlers = {
  'sync.status': () => status(),
  'sync.now': async () => {
    await runSync();
    return status();
  },
  'auth.signUp': async ({ email, password }) => thenSync(await (await need()).signUp(email, password)),
  'auth.confirm': async ({ proof }) => thenSync(await (await need()).confirm(proof)),
  'auth.cancelSignUp': async () => (await need()).cancelSignUp(),
  'auth.signIn': async ({ email, password }) => thenSync(await (await need()).signIn(email, password)),
  'auth.signOut': async () => (await need()).signOut(),
  'auth.changePassword': async ({ current: now, next }) => (await need()).changePassword(now, next),
  'auth.requestReset': async ({ email }) => (await need()).requestReset(email),
  'auth.completeReset': async ({ email, proof, password }) => thenSync(await (await need()).completeReset(email, proof, password)),
  'auth.deleteAccount': async ({ password }) => (await need()).deleteAccount(password),
} satisfies Partial<Handlers>;
