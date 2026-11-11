/**
 * What sync needs from a server, and the Supabase implementation of it.
 * The engine and tests only see the interface.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authStorage, type SecretStore } from './keystore';

export interface RemoteRecord {
  rid: string;
  ciphertext: string | null;
  deleted: boolean;
  updated_at: number;
  seq: number;
}

export interface PushItem {
  rid: string;
  ciphertext: string | null;
  deleted: boolean;
  updated_at: number;
}

export interface PushResult {
  rid: string;
  accepted: boolean;
}

export interface VaultRow {
  wrapped_key: string;
  previous_wrapped_key: string | null;
  kdf: unknown;
}

export interface Account {
  id: string;
  email: string;
}

export class SyncError extends Error {
  constructor(
    readonly kind: 'auth' | 'unconfirmed' | 'network' | 'server' | 'config' | 'rate',
    message: string,
  ) {
    super(message);
  }
}

export interface SyncBackend {
  signUp(email: string, secret: string): Promise<{ confirmed: boolean }>;
  signIn(email: string, secret: string): Promise<Account>;
  /** Confirm a new account (type 'signup') or a password reset (type 'recovery') with the code from the email. */
  verifyCode(email: string, code: string, type: 'signup' | 'recovery'): Promise<Account>;
  requestReset(email: string): Promise<void>;
  account(): Promise<Account | null>;
  updatePassword(secret: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;

  getVault(): Promise<VaultRow | null>;
  /** 'exists' when another browser created the account's key first. */
  createVault(row: VaultRow): Promise<'created' | 'exists'>;
  updateVault(row: VaultRow): Promise<void>;

  push(items: PushItem[]): Promise<PushResult[]>;
  pull(afterSeq: number, limit: number): Promise<RemoteRecord[]>;
  /** The server's current copy of particular records. */
  fetch(rids: string[]): Promise<RemoteRecord[]>;
  /** Delete every record (used when an account's key is replaced). */
  wipeRecords(): Promise<void>;

  putFile(name: string, bytes: Uint8Array): Promise<void>;
  getFile(name: string): Promise<Uint8Array | null>;
  removeFiles(names: string[]): Promise<void>;
  listFiles(): Promise<string[]>;
}

const BUCKET = 'vault';

function explain(error: { message?: string; status?: number; code?: string } | null, fallback: string): SyncError {
  const message = error?.message ?? fallback;
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return new SyncError('network', 'Couldn’t reach the sync server. Check your connection and try again.');
  }
  if (error?.code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return new SyncError('unconfirmed', 'Confirm your email address first: open the link (or enter the code) from the email we sent.');
  }
  if (error?.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return new SyncError('auth', 'That email and password don’t match an account.');
  }
  if (error?.status === 429 || /rate limit/i.test(message)) {
    return new SyncError('rate', 'Too many attempts for now. Wait a few minutes and try again.');
  }
  if (error?.code === 'user_already_exists' || /already registered/i.test(message)) {
    return new SyncError('auth', 'An account with that email already exists. Sign in instead.');
  }
  if (/invalid api key|no api key/i.test(message)) {
    return new SyncError('config', 'The sync server rejected the project key. Check it in Sync settings.');
  }
  return new SyncError('server', message);
}

// bigint columns can arrive as strings.
const rows = (data: unknown): RemoteRecord[] =>
  (data as RemoteRecord[]).map((r) => ({ ...r, updated_at: Number(r.updated_at), seq: Number(r.seq) }));

export function supabaseBackend(url: string, key: string, secrets: SecretStore): SyncBackend {
  let client: SupabaseClient;
  try {
    client = createClient(url, key, {
      auth: { storage: authStorage(secrets), storageKey: 'smartsubmit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  } catch {
    throw new SyncError('config', 'That sync server address doesn’t look right. It should look like https://your-project.supabase.co.');
  }

  const userId = async (): Promise<string> => {
    const { data } = await client.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new SyncError('auth', 'You are signed out of sync. Sign in again.');
    return id;
  };

  const toAccount = (user: { id: string; email?: string } | null | undefined): Account => {
    if (!user) throw new SyncError('server', 'The sync server didn’t return an account.');
    return { id: user.id, email: user.email ?? '' };
  };

  return {
    async signUp(email, secret) {
      const { data, error } = await client.auth.signUp({ email, password: secret });
      if (error) throw explain(error, 'Sign-up failed.');
      // An existing, confirmed address comes back as a user with no identities.
      if (data.user && data.user.identities?.length === 0) throw new SyncError('auth', 'An account with that email already exists. Sign in instead.');
      return { confirmed: !!data.session };
    },
    async signIn(email, secret) {
      const { data, error } = await client.auth.signInWithPassword({ email, password: secret });
      if (error) throw explain(error, 'Sign-in failed.');
      return toAccount(data.user);
    },
    async verifyCode(email, code, type) {
      const { data, error } = await client.auth.verifyOtp({ email, token: code.trim(), type });
      if (error) throw explain(error, 'That code didn’t work.');
      return toAccount(data.user);
    },
    async requestReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) throw explain(error, 'The reset email could not be sent.');
    },
    async account() {
      const { data } = await client.auth.getSession();
      return data.session ? { id: data.session.user.id, email: data.session.user.email ?? '' } : null;
    },
    async updatePassword(secret) {
      const { error } = await client.auth.updateUser({ password: secret });
      if (error) throw explain(error, 'The password could not be changed.');
    },
    async signOut() {
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    },
    async deleteAccount() {
      const { error } = await client.rpc('delete_account');
      if (error) throw explain(error, 'The account could not be deleted.');
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    },

    async getVault() {
      const id = await userId();
      const { data, error } = await client.from('vault_keys').select('wrapped_key, previous_wrapped_key, kdf').eq('user_id', id).maybeSingle();
      if (error) throw explain(error, 'Couldn’t read the account key.');
      return data as VaultRow | null;
    },
    async createVault(row) {
      const id = await userId();
      const { error } = await client.from('vault_keys').insert({ user_id: id, ...row });
      if (error?.code === '23505') return 'exists';
      if (error) throw explain(error, 'Couldn’t save the account key.');
      return 'created';
    },
    async updateVault(row) {
      const id = await userId();
      const { error } = await client.from('vault_keys').update({ ...row, updated_at: new Date().toISOString() }).eq('user_id', id);
      if (error) throw explain(error, 'Couldn’t update the account key.');
    },

    async push(items) {
      if (items.length === 0) return [];
      const { data, error } = await client.rpc('push_records', { items });
      if (error) throw explain(error, 'Couldn’t upload changes.');
      return (data as { rid: string; accepted: boolean }[]).map((r) => ({ rid: r.rid, accepted: r.accepted }));
    },
    async pull(afterSeq, limit) {
      const { data, error } = await client
        .from('records')
        .select('rid, ciphertext, deleted, updated_at, seq')
        .gt('seq', afterSeq)
        .order('seq', { ascending: true })
        .limit(limit);
      if (error) throw explain(error, 'Couldn’t download changes.');
      return rows(data);
    },
    async fetch(rids) {
      if (rids.length === 0) return [];
      const { data, error } = await client.from('records').select('rid, ciphertext, deleted, updated_at, seq').in('rid', rids);
      if (error) throw explain(error, 'Couldn’t download changes.');
      return rows(data);
    },
    async wipeRecords() {
      const id = await userId();
      const { error } = await client.from('records').delete().eq('user_id', id);
      if (error) throw explain(error, 'Couldn’t clear the cloud copy.');
    },

    async putFile(name, bytes) {
      const id = await userId();
      const { error } = await client.storage
        .from(BUCKET)
        .upload(`${id}/${name}`, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }), { upsert: true, contentType: 'application/octet-stream' });
      if (error) throw explain(error, 'Couldn’t upload a file.');
    },
    async getFile(name) {
      const id = await userId();
      const { data, error } = await client.storage.from(BUCKET).download(`${id}/${name}`);
      if (error) {
        if (/not found|404/i.test(error.message)) return null;
        throw explain(error, 'Couldn’t download a file.');
      }
      return new Uint8Array(await data.arrayBuffer());
    },
    async removeFiles(names) {
      if (names.length === 0) return;
      const id = await userId();
      const { error } = await client.storage.from(BUCKET).remove(names.map((n) => `${id}/${n}`));
      if (error) throw explain(error, 'Couldn’t remove a file.');
    },
    async listFiles() {
      const id = await userId();
      const names: string[] = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await client.storage.from(BUCKET).list(id, { limit: 100, offset });
        if (error) throw explain(error, 'Couldn’t list files.');
        names.push(...data.map((f) => f.name));
        if (data.length < 100) break;
      }
      return names;
    },
  };
}
