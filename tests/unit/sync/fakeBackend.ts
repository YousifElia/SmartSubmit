import { SyncError, type RemoteRecord, type SyncBackend, type VaultRow } from '@/core/sync/backend';

interface User {
  id: string;
  email: string;
  secret: string;
  confirmed: boolean;
}

/**
 * An in-memory sync server with the same rules as the real one (see the
 * migration): accounts, per-account keys, records where only a newer change
 * replaces an older one, and files.
 */
export function fakeServer(options: { confirmEmail?: boolean } = {}) {
  let seq = 0;
  let ids = 0;
  const users = new Map<string, User>();
  const vaults = new Map<string, VaultRow>();
  const records = new Map<string, Map<string, RemoteRecord>>();
  const files = new Map<string, Map<string, Uint8Array>>();
  /** The one-time token each address is waiting to use: as a code, or as the hash in the email's link. */
  const codes = new Map<string, { code: string; hash: string; type: 'signup' | 'recovery' }>();
  /** Emails "sent", newest last. Real emails carry the link; a code only if the templates were customised. */
  const outbox: { email: string; type: 'signup' | 'recovery'; code: string; link: string }[] = [];
  /** Sign-ins started by opening an email's link in a tab. */
  const opened = new Map<string, User>();
  const SITE = 'http://localhost:3000';
  const EXPIRED = () => new SyncError('expired', 'That code is wrong or has expired. Check it, or send a new one.');
  /** Make the next password change fail, as a server might. */
  const failures: { updatePassword: Error | null } = { updatePassword: null };

  const of = <T,>(map: Map<string, Map<string, T>>, userId: string) => {
    let inner = map.get(userId);
    if (!inner) map.set(userId, (inner = new Map()));
    return inner;
  };
  const send = (email: string, type: 'signup' | 'recovery') => {
    const code = String(100000 + outbox.length);
    const hash = `hash${outbox.length}x${type}`;
    codes.set(email, { code, hash, type });
    outbox.push({ email, type, code, link: `https://sync.example/auth/v1/verify?token=${hash}&type=${type}&redirect_to=${SITE}` });
  };
  /** Use up the token an address is waiting on, as the server does on any successful verification. */
  const redeem = (email: string): User | null => {
    const user = users.get(email);
    if (!user || !codes.delete(email)) return null;
    user.confirmed = true;
    return user;
  };

  function addUser(email: string, secret = 'secret', confirmed = true): User {
    const user = { id: `user-${++ids}`, email, secret, confirmed };
    users.set(email, user);
    return user;
  }

  /** One browser's connection, with its own session. */
  function client(signedInAs: string | null = null): SyncBackend {
    let session: { id: string; email: string } | null = signedInAs ? { id: signedInAs, email: [...users.values()].find((u) => u.id === signedInAs)?.email ?? '' } : null;
    const need = () => {
      if (!session) throw new SyncError('auth', 'You are signed out of sync. Sign in again.');
      return session.id;
    };
    const signInAs = (user: User) => {
      session = { id: user.id, email: user.email };
      return { ...session };
    };

    return {
      async signUp(email, secret) {
        const existing = users.get(email);
        if (existing?.confirmed) throw new SyncError('auth', 'An account with that email already exists. Sign in instead.');
        const user = existing ?? addUser(email, secret, !options.confirmEmail);
        user.secret = secret;
        if (!user.confirmed) {
          send(email, 'signup');
          return { confirmed: false };
        }
        signInAs(user);
        return { confirmed: true };
      },
      async signIn(email, secret) {
        const user = users.get(email);
        if (!user || user.secret !== secret) throw new SyncError('auth', 'That email and password don’t match an account.');
        if (!user.confirmed) throw new SyncError('unconfirmed', 'Confirm your email address first.');
        return signInAs(user);
      },
      async verifyCode(email, code, type) {
        const sent = codes.get(email);
        if (!sent || sent.code !== code.trim() || sent.type !== type) throw EXPIRED();
        const user = redeem(email);
        if (!user) throw EXPIRED();
        return signInAs(user);
      },
      async verifyLink(tokenHash, type) {
        const waiting = [...codes.entries()].find(([, sent]) => sent.hash === tokenHash);
        // A sign-up link may call itself "signup" or "email".
        const fits = waiting && (waiting[1].type === 'recovery' ? type === 'recovery' : type === 'signup' || type === 'email');
        const user = waiting && fits ? redeem(waiting[0]) : null;
        if (!user) throw EXPIRED();
        return signInAs(user);
      },
      async adoptSession(accessToken, refreshToken) {
        const user = opened.get(`${accessToken}/${refreshToken}`);
        if (!user || !users.has(user.email)) throw new SyncError('expired', 'That page’s sign-in has expired. Send a new email and try again.');
        return signInAs(user);
      },
      async requestReset(email) {
        if (users.has(email)) send(email, 'recovery');
      },
      async account() {
        return session ? { ...session } : null;
      },
      async updatePassword(secret) {
        const id = need();
        if (failures.updatePassword) {
          const error = failures.updatePassword;
          failures.updatePassword = null;
          throw error;
        }
        const user = [...users.values()].find((u) => u.id === id);
        if (user) user.secret = secret;
      },
      async signOut() {
        session = null;
      },
      async deleteAccount() {
        const id = need();
        for (const [email, user] of users) if (user.id === id) users.delete(email);
        vaults.delete(id);
        records.delete(id);
        files.delete(id);
        session = null;
      },

      async getVault() {
        const row = vaults.get(need());
        return row ? structuredClone(row) : null;
      },
      async createVault(row) {
        const id = need();
        if (vaults.has(id)) return 'exists';
        vaults.set(id, structuredClone(row));
        return 'created';
      },
      async updateVault(row) {
        // Like the real table: updating a key that isn't there changes nothing.
        const id = need();
        if (vaults.has(id)) vaults.set(id, structuredClone(row));
      },

      async push(items) {
        const mine = of(records, need());
        return items.map((item) => {
          const existing = mine.get(item.rid);
          if (existing && existing.updated_at >= item.updated_at) return { rid: item.rid, accepted: false };
          mine.set(item.rid, { ...item, ciphertext: item.deleted ? null : item.ciphertext, seq: ++seq });
          return { rid: item.rid, accepted: true };
        });
      },
      async pull(after, limit) {
        return [...of(records, need()).values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit);
      },
      async fetch(rids) {
        const mine = of(records, need());
        return rids.map((rid) => mine.get(rid)).filter((r): r is RemoteRecord => !!r);
      },
      async wipeRecords() {
        records.delete(need());
      },
      async countRecords() {
        return [...of(records, need()).values()].filter((r) => !r.deleted).length;
      },
      async putFile(name, bytes) {
        of(files, need()).set(name, bytes);
      },
      async getFile(name) {
        return of(files, need()).get(name) ?? null;
      },
      async removeFiles(names) {
        const mine = of(files, need());
        for (const name of names) mine.delete(name);
      },
      async listFiles() {
        return [...of(files, need()).keys()];
      },
    };
  }

  return {
    client,
    addUser,
    users,
    vaults,
    outbox,
    failures,
    recordsOf: (userId: string) => of(records, userId),
    filesOf: (userId: string) => of(files, userId),
    /**
     * Open the link in an address's newest email, as a person would in a
     * browser tab. Returns the address of the page that opens: it carries
     * the sign-in the server started, or says the link was no longer good.
     */
    openLink(email: string): string {
      const type = codes.get(email)?.type;
      const user = redeem(email);
      if (!user) return `${SITE}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`;
      const access = `at${opened.size}`;
      const refresh = `rt${opened.size}`;
      opened.set(`${access}/${refresh}`, user);
      return `${SITE}/#access_token=${access}&expires_in=3600&refresh_token=${refresh}&token_type=bearer&type=${type}`;
    },
  };
}

/** One signed-in account on a fresh server, for engine tests. */
export function fakeBackend() {
  const server = fakeServer();
  const user = server.addUser('avery@example.com');
  return { backend: server.client(user.id), records: server.recordsOf(user.id), files: server.filesOf(user.id) };
}
