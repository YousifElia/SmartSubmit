import type { Account, PushItem, RemoteRecord, SyncBackend, VaultRow } from '@/core/sync/backend';

/** An in-memory sync server with the same rules as the real one (see the migration). */
export function fakeBackend() {
  let seq = 0;
  const records = new Map<string, RemoteRecord>();
  const files = new Map<string, Uint8Array>();
  let vault: VaultRow | null = null;
  const account: Account = { id: 'user-1', email: 'avery@example.com' };

  const backend: SyncBackend = {
    signUp: async () => ({ confirmed: true }),
    signIn: async () => account,
    verifyCode: async () => account,
    requestReset: async () => undefined,
    account: async () => account,
    updatePassword: async () => undefined,
    signOut: async () => undefined,
    deleteAccount: async () => undefined,
    getVault: async () => vault,
    createVault: async (row) => {
      if (vault) return 'exists';
      vault = row;
      return 'created';
    },
    updateVault: async (row) => void (vault = row),
    push: async (items: PushItem[]) =>
      items.map((item) => {
        const existing = records.get(item.rid);
        if (existing && existing.updated_at >= item.updated_at) return { rid: item.rid, accepted: false };
        records.set(item.rid, { ...item, ciphertext: item.deleted ? null : item.ciphertext, seq: ++seq });
        return { rid: item.rid, accepted: true };
      }),
    fetch: async (rids) => rids.map((rid) => records.get(rid)).filter((r): r is RemoteRecord => !!r),
    pull: async (after, limit) => [...records.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq).slice(0, limit),
    wipeRecords: async () => records.clear(),
    putFile: async (name, bytes) => void files.set(name, bytes),
    getFile: async (name) => files.get(name) ?? null,
    removeFiles: async (names) => names.forEach((n) => files.delete(n)),
    listFiles: async () => [...files.keys()],
  };
  return { backend, records, files, get vault() { return vault; } };
}
