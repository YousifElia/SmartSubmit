/**
 * Where sync keeps its secrets: the data key and the sign-in session.
 *
 * They live in the extension's own IndexedDB, which only extension pages and
 * the background script can open. Web pages and content scripts cannot: a
 * content script's IndexedDB is the web page's, not the extension's.
 */

export interface SecretStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

const DB = 'smartsubmit-secrets';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export const idbSecrets: SecretStore = {
  get: (key) => run('readonly', (s) => s.get(key)),
  set: (key, value) => run('readwrite', (s) => s.put(value, key)),
  delete: (key) => run('readwrite', (s) => s.delete(key)),
};

export function memorySecrets(): SecretStore {
  const map = new Map<string, unknown>();
  return {
    get: async <T,>(key: string) => map.get(key) as T | undefined,
    set: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
  };
}

/** The shape Supabase's client wants for keeping its session. */
export function authStorage(secrets: SecretStore) {
  return {
    getItem: async (key: string) => (await secrets.get<string>(`auth:${key}`)) ?? null,
    setItem: (key: string, value: string) => secrets.set(`auth:${key}`, value),
    removeItem: (key: string) => secrets.delete(`auth:${key}`),
  };
}
