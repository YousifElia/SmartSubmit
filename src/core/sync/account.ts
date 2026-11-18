/**
 * The sync account: create, confirm, sign in and out, change or reset the
 * password, delete, and run a sync.
 *
 * This runs only in the background script. The password is stretched here
 * and forgotten; what the browser keeps is the account's data key, in the
 * extension's own IndexedDB (see keystore.ts).
 */
import { SyncError, type Account, type SyncBackend, type VaultRow } from './backend';
import {
  deriveKeys,
  KDF,
  keyIdOf,
  newDataKey,
  normalizeEmail,
  unwrapDataKey,
  vaultKeys,
  wrapDataKey,
  WrongPasswordError,
} from './crypto';
import { readEmailProof } from './emailProof';
import { EMPTY_STATE, syncOnce, type LocalStore, type SyncOutcome, type SyncState } from './engine';
import type { SecretStore } from './keystore';
import { MIN_PASSWORD } from './policy';

export { MIN_PASSWORD };

/** What this browser remembers about its sync account. Nothing here is secret. */
export interface AccountRecord {
  /** The sync server the account lives on. */
  server: string;
  email: string;
  userId: string;
  /** Fingerprint of the data key this browser holds. */
  keyId: string;
  signedIn: boolean;
  /**
   * The first sync still to run: 'fresh' for a new account, 'join' for one
   * this browser hasn't synced with before (the account's copy wins).
   */
  firstSync: 'fresh' | 'join' | null;
  sync: SyncState;
  /** Why the last sync failed, or why sync stopped. */
  error: string;
  /** What the account held after the last sync, as the server counts it: it can't read any of it. */
  remote?: RemoteCounts | null;
}

export interface RemoteCounts {
  /** Encrypted records: the profile, each resume, application, saved answer… */
  items: number;
  /** Encrypted files: uploaded resumes. */
  files: number;
  at: number;
}

/** A new account waiting for its email to be confirmed. */
interface PendingSignUp {
  server: string;
  email: string;
  authSecret: string;
  wrapKey: CryptoKey;
  dataKey: Uint8Array;
}

export type AccountResult = { ok: true; needsConfirmation?: boolean } | { ok: false; error: string };

export interface AccountStatus {
  state: 'signedOut' | 'confirming' | 'ready';
  email: string;
  lastSyncAt: number | null;
  error: string;
  /** This browser still holds the account's key, so a password reset here keeps the cloud copy. */
  holdsKey: boolean;
  /** What the account held after the last sync. */
  remote: RemoteCounts | null;
}

export interface AccountDeps {
  /** The sync server's address, as configured. */
  server: string;
  backend: SyncBackend;
  secrets: SecretStore;
  store: LocalStore;
  load(): Promise<AccountRecord | null>;
  save(record: AccountRecord | null): Promise<void>;
  /** PBKDF2 rounds. Lowered only in tests; every browser must use the same. */
  iterations?: number;
}

const DATA_KEY = 'dataKey';
const PENDING = 'pending';

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Try again.';
}

function checkEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SyncError('auth', 'Enter a valid email address.');
}

function checkNewPassword(email: string, password: string): void {
  if (password.length < MIN_PASSWORD) throw new SyncError('auth', `Use at least ${MIN_PASSWORD} characters. A few unrelated words make a strong, memorable password.`);
  if (normalizeEmail(password) === email) throw new SyncError('auth', 'Your password can’t be your email address.');
}

const vaultKeyId = (vault: VaultRow): string | null => (vault.kdf as { keyId?: string } | null)?.keyId ?? null;

export function createAccount(deps: AccountDeps) {
  const { server, backend, secrets, store } = deps;
  const iterations = deps.iterations ?? KDF.iterations;

  let chain: Promise<unknown> = Promise.resolve();
  /** One account operation or sync at a time. */
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = chain.then(fn, fn);
    chain = next.catch(() => undefined);
    return next;
  }

  async function attempt(fn: () => Promise<{ needsConfirmation?: boolean } | void>): Promise<AccountResult> {
    try {
      const out = await exclusive(fn);
      return { ok: true, ...(out ?? {}) };
    } catch (error) {
      return { ok: false, error: message(error) };
    }
  }

  /** The record for this server, if this browser has one. */
  async function mine(): Promise<AccountRecord | null> {
    const record = await deps.load();
    return record && record.server === server ? record : null;
  }

  async function vaultRow(dataKey: Uint8Array, wrapKey: CryptoKey, previous: string | null = null): Promise<VaultRow> {
    return {
      wrapped_key: await wrapDataKey(dataKey, wrapKey),
      previous_wrapped_key: previous,
      kdf: { alg: KDF.alg, iterations, salt: KDF.salt, keyId: await keyIdOf(dataKey) },
    };
  }

  /** Unwrap the account's key. Returns which wrapping opened it, too. */
  async function openVault(vault: VaultRow, wrapKey: CryptoKey): Promise<{ dataKey: Uint8Array; opened: string }> {
    try {
      return { dataKey: await unwrapDataKey(vault.wrapped_key, wrapKey), opened: vault.wrapped_key };
    } catch (error) {
      // A password change cut short leaves the old wrapping here, and the
      // account still signs in with the old password.
      if (!(error instanceof WrongPasswordError) || !vault.previous_wrapped_key) throw error;
      return { dataKey: await unwrapDataKey(vault.previous_wrapped_key, wrapKey), opened: vault.previous_wrapped_key };
    }
  }

  /** Remember a signed-in account and its key. */
  async function begin(account: Account, email: string, dataKey: Uint8Array, firstSync?: 'fresh'): Promise<void> {
    const keyId = await keyIdOf(dataKey);
    const before = await mine();
    // Signing back in to the account this browser last synced with picks up
    // where it left off, so changes made while signed out still count.
    const same = before !== null && before.userId === account.id && before.keyId === keyId && !firstSync;
    await secrets.set(DATA_KEY, dataKey);
    await secrets.delete(PENDING);
    await deps.save({
      server,
      email,
      userId: account.id,
      keyId,
      signedIn: true,
      firstSync: firstSync ?? (same ? null : 'join'),
      sync: same && before ? before.sync : EMPTY_STATE,
      error: '',
    });
  }

  /** A confirmed new account with no key yet: create it, or use one another browser just created. */
  async function setUp(account: Account, email: string, wrapKey: CryptoKey, dataKey: Uint8Array): Promise<void> {
    if ((await backend.createVault(await vaultRow(dataKey, wrapKey))) === 'created') return begin(account, email, dataKey, 'fresh');
    const vault = await backend.getVault();
    if (!vault) throw new SyncError('server', 'The account’s key couldn’t be read. Try again.');
    return begin(account, email, (await openVault(vault, wrapKey)).dataKey);
  }

  /**
   * Sign in with what the person brought back from an email: its code, its
   * link, or the address of the page the link opened (see emailProof.ts).
   */
  async function redeem(input: string, email: string, purpose: 'signup' | 'recovery'): Promise<Account> {
    const proof = readEmailProof(input);
    const fits = (type: string) => (purpose === 'recovery' ? type === 'recovery' : type === 'signup' || type === 'email');
    const otherEmail = new SyncError(
      'auth',
      purpose === 'recovery' ? 'That isn’t from the password reset email. Use the newest reset email.' : 'That isn’t from the confirmation email. Use the newest confirmation email.',
    );
    let account: Account;
    switch (proof.kind) {
      case 'code':
        account = await backend.verifyCode(email, proof.code, purpose);
        break;
      case 'link':
        if (!fits(proof.type)) throw otherEmail;
        try {
          account = await backend.verifyLink(proof.tokenHash, proof.type);
        } catch (error) {
          if (!(error instanceof SyncError) || error.kind !== 'expired') throw error;
          throw new SyncError('expired', 'That link has already been used or has expired. If you opened it, paste the address of the page it opened instead. Otherwise send a new email.');
        }
        break;
      case 'session':
        if (proof.type && !fits(proof.type)) throw otherEmail;
        account = await backend.adoptSession(proof.accessToken, proof.refreshToken);
        break;
      case 'spent':
        throw new SyncError('expired', 'The email’s link had already been used or had expired when it was opened. Send a new email and try again.');
      default:
        throw new SyncError('auth', 'Paste the link from the email (or enter its code, if it shows one).');
    }
    if (normalizeEmail(account.email) !== email) {
      await backend.signOut();
      throw new SyncError('auth', 'That link is for a different account than the email entered here.');
    }
    return account;
  }

  async function signIn(email: string, password: string): Promise<void> {
    const { authSecret, wrapKey } = await deriveKeys(email, password, iterations);
    const account = await backend.signIn(email, authSecret);
    const vault = await backend.getVault();
    if (!vault) return setUp(account, email, wrapKey, newDataKey());
    return begin(account, email, (await openVault(vault, wrapKey)).dataKey);
  }

  return {
    async status(): Promise<AccountStatus> {
      const pending = await secrets.get<PendingSignUp>(PENDING);
      if (pending && pending.server === server) return { state: 'confirming', email: pending.email, lastSyncAt: null, error: '', holdsKey: false, remote: null };
      const record = await mine();
      const held = await secrets.get<Uint8Array>(DATA_KEY);
      const holdsKey = !!record && !!held && (await keyIdOf(held)) === record.keyId;
      return {
        state: record?.signedIn && holdsKey ? 'ready' : 'signedOut',
        email: record?.email ?? '',
        lastSyncAt: record?.sync.lastSyncAt ?? null,
        error: record?.error ?? '',
        holdsKey,
        remote: record?.signedIn ? (record.remote ?? null) : null,
      };
    },

    signUp(rawEmail: string, password: string): Promise<AccountResult> {
      return attempt(async () => {
        const email = normalizeEmail(rawEmail);
        checkEmail(email);
        checkNewPassword(email, password);
        const { authSecret, wrapKey } = await deriveKeys(email, password, iterations);
        const dataKey = newDataKey();
        const { confirmed } = await backend.signUp(email, authSecret);
        if (!confirmed) {
          await secrets.set(PENDING, { server, email, authSecret, wrapKey, dataKey } satisfies PendingSignUp);
          return { needsConfirmation: true };
        }
        const account = await backend.account();
        if (!account) throw new SyncError('server', 'The sync server didn’t sign the new account in. Try signing in.');
        await setUp(account, email, wrapKey, dataKey);
      });
    },

    /**
     * Finish a sign-up. With nothing given, the person has opened the email's
     * link; otherwise `proof` is the link, the opened page's address or a code.
     */
    confirm(proof: string): Promise<AccountResult> {
      return attempt(async () => {
        const pending = await secrets.get<PendingSignUp>(PENDING);
        if (!pending || pending.server !== server) throw new SyncError('auth', 'Start again: create the account or sign in.');
        const opened = () => backend.signIn(pending.email, pending.authSecret);
        let account: Account;
        if (!proof.trim()) {
          account = await opened();
        } else {
          try {
            account = await redeem(proof, pending.email, 'signup');
          } catch (error) {
            // A link that was opened before being pasted is spent, but opening
            // it confirmed the address all the same.
            if (!(error instanceof SyncError) || error.kind !== 'expired') throw error;
            account = await opened().catch(() => {
              throw error;
            });
          }
        }
        await setUp(account, pending.email, pending.wrapKey, pending.dataKey);
      });
    },

    cancelSignUp(): Promise<AccountResult> {
      return attempt(async () => {
        await secrets.delete(PENDING);
      });
    },

    signIn(rawEmail: string, password: string): Promise<AccountResult> {
      return attempt(async () => {
        const email = normalizeEmail(rawEmail);
        checkEmail(email);
        try {
          await signIn(email, password);
        } catch (error) {
          if (error instanceof WrongPasswordError) {
            throw new SyncError('auth', 'That password signs in, but doesn’t unlock this account’s data. If you changed it recently, try the previous one.');
          }
          throw error;
        }
      });
    },

    signOut(): Promise<AccountResult> {
      return attempt(async () => {
        await backend.signOut();
        await secrets.delete(DATA_KEY);
        await secrets.delete(PENDING);
        const record = await mine();
        if (record) await deps.save({ ...record, signedIn: false, error: '' });
      });
    },

    changePassword(current: string, next: string): Promise<AccountResult> {
      return attempt(async () => {
        const record = await mine();
        if (!record?.signedIn) throw new SyncError('auth', 'Sign in first.');
        if (current === next) throw new SyncError('auth', 'Choose a password different from the current one.');
        checkNewPassword(record.email, next);
        const now = await deriveKeys(record.email, current, iterations);
        // Signing in again checks the current password and freshens the session,
        // which some servers require before a password change.
        try {
          await backend.signIn(record.email, now.authSecret);
        } catch (error) {
          if (error instanceof SyncError && error.kind === 'auth') throw new SyncError('auth', 'Your current password isn’t right.');
          throw error;
        }
        const vault = await backend.getVault();
        if (!vault) throw new SyncError('server', 'The account’s key couldn’t be read. Try again.');
        const { dataKey, opened } = await openVault(vault, now.wrapKey);
        const after = await deriveKeys(record.email, next, iterations);
        // Wrap the key for the new password first, keeping the old wrapping
        // until the server has the new password, so no step can lock you out.
        const row = await vaultRow(dataKey, after.wrapKey, opened);
        await backend.updateVault(row);
        try {
          await backend.updatePassword(after.authSecret);
        } catch (error) {
          await backend.updateVault({ ...row, wrapped_key: opened, previous_wrapped_key: null }).catch(() => undefined);
          throw error;
        }
        await backend.updateVault({ ...row, previous_wrapped_key: null }).catch(() => undefined);
      });
    },

    requestReset(rawEmail: string): Promise<AccountResult> {
      return attempt(async () => {
        const email = normalizeEmail(rawEmail);
        checkEmail(email);
        await backend.requestReset(email);
      });
    },

    /**
     * Set a new password with what the reset email carried: its link, the
     * address of the page the link opened, or a code. If this browser still
     * holds the account's key, the cloud copy is kept. Otherwise nobody can
     * decrypt it any more, so it is started again from this browser.
     */
    completeReset(rawEmail: string, proof: string, password: string): Promise<AccountResult> {
      return attempt(async () => {
        const email = normalizeEmail(rawEmail);
        checkEmail(email);
        checkNewPassword(email, password);
        const account = await redeem(proof, email, 'recovery');
        const after = await deriveKeys(email, password, iterations);
        await backend.updatePassword(after.authSecret);
        const vault = await backend.getVault();
        const record = await mine();
        const held = await secrets.get<Uint8Array>(DATA_KEY);
        if (held && vault && record?.userId === account.id && vaultKeyId(vault) === (await keyIdOf(held))) {
          await backend.updateVault(await vaultRow(held, after.wrapKey));
          return begin(account, email, held);
        }
        const dataKey = newDataKey();
        const row = await vaultRow(dataKey, after.wrapKey);
        // Replace the account's key, or create it if the account never had one.
        if (vault || (await backend.createVault(row)) === 'exists') await backend.updateVault(row);
        await backend.wipeRecords();
        const files = await backend.listFiles();
        if (files.length > 0) await backend.removeFiles(files);
        await begin(account, email, dataKey, 'fresh');
      });
    },

    deleteAccount(password: string): Promise<AccountResult> {
      return attempt(async () => {
        const record = await mine();
        if (!record?.signedIn) throw new SyncError('auth', 'Sign in first.');
        const { authSecret } = await deriveKeys(record.email, password, iterations);
        try {
          await backend.signIn(record.email, authSecret);
        } catch (error) {
          if (error instanceof SyncError && error.kind === 'auth') throw new SyncError('auth', 'That password isn’t right.');
          throw error;
        }
        const files = await backend.listFiles();
        if (files.length > 0) await backend.removeFiles(files);
        await backend.deleteAccount();
        await secrets.delete(DATA_KEY);
        await deps.save(null);
      });
    },

    /** Run one sync if signed in. Throws when it fails; the reason is also kept for the status. */
    syncNow(): Promise<SyncOutcome | null> {
      return exclusive(async () => {
        const record = await mine();
        if (!record?.signedIn) return null;
        const stop = async (error: string) => {
          await deps.save({ ...record, signedIn: false, error });
          return null;
        };
        const dataKey = await secrets.get<Uint8Array>(DATA_KEY);
        if (!dataKey) return stop('Sign in again to keep syncing.');
        try {
          const vault = await backend.getVault();
          if (!vault) {
            await secrets.delete(DATA_KEY);
            return stop('This sync account no longer exists. Create a new one, or sign in to another.');
          }
          if (vaultKeyId(vault) !== record.keyId) {
            return stop('The password was reset on another browser. Sign in with the new password to keep syncing.');
          }
          const { state, outcome } = await syncOnce({ backend, keys: await vaultKeys(dataKey), store }, record.sync, record.firstSync ?? 'normal');
          // What the account now holds, so the person can see it is all there.
          const [items, files] = await Promise.all([backend.countRecords(), backend.listFiles()]);
          await deps.save({ ...record, sync: state, firstSync: null, error: '', remote: { items, files: files.length, at: Date.now() } });
          return outcome;
        } catch (error) {
          if (error instanceof SyncError && error.kind === 'auth') return stop('You were signed out of sync. Sign in again to keep syncing.');
          await deps.save({ ...record, error: message(error) });
          throw error;
        }
      });
    },
  };
}

export type SyncAccountApi = ReturnType<typeof createAccount>;
