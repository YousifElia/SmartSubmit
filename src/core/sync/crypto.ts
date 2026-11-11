/**
 * End-to-end encryption for sync.
 *
 * The password never leaves the browser. It is stretched with PBKDF2 into two
 * independent secrets:
 *   - the sign-in secret, which is what the sync server receives as the
 *     account password, and
 *   - the wrapping key, which encrypts ("wraps") a random data key.
 * The server stores the wrapped data key but can't unwrap it. Every record
 * and file is encrypted with keys derived from the data key before upload,
 * and records are addressed by an opaque id, so the server sees neither the
 * content nor what kind of thing each row is.
 */
import { base64ToBytes, bytesToBase64, fromUtf8, utf8 } from '../util/base64';

export const KDF = { alg: 'PBKDF2-SHA256', iterations: 600_000, salt: 'sha256("smartsubmit/v1/" + email)' } as const;

const VERSION = 1;
const subtle = () => globalThis.crypto.subtle;

type Bytes = Uint8Array<ArrayBuffer>;

function random(length: number): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(length)) as Bytes;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)) as Bytes;
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function base64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface PasswordKeys {
  /** Sent to the server as the account password. */
  authSecret: string;
  /** Wraps the data key. Never leaves the browser. */
  wrapKey: CryptoKey;
}

/** Stretch a password into the sign-in secret and the wrapping key. Takes about a second, by design. */
export async function deriveKeys(email: string, password: string, iterations: number = KDF.iterations): Promise<PasswordKeys> {
  const salt = new Uint8Array(await subtle().digest('SHA-256', utf8(`smartsubmit/v1/${normalizeEmail(email)}`)));
  const material = await subtle().importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, 512));
  const wrapKey = await subtle().importKey('raw', bits.slice(32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { authSecret: hex(bits.slice(0, 32)), wrapKey };
}

/** A new random data key. */
export function newDataKey(): Bytes {
  return random(32);
}

const DEK_AAD = utf8('smartsubmit/data-key/v1');

/**
 * A short public fingerprint of a data key, kept with the account so a browser
 * can tell when the key was replaced elsewhere (a password reset).
 */
export async function keyIdOf(dataKey: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', concat(utf8('smartsubmit/key-id/v1/'), dataKey)));
  return base64url(digest.slice(0, 12));
}

/** Encrypt the data key with the wrapping key. */
export async function wrapDataKey(dataKey: Uint8Array, wrapKey: CryptoKey): Promise<string> {
  const iv = random(12);
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: DEK_AAD }, wrapKey, dataKey as Bytes));
  return bytesToBase64(concat(new Uint8Array([VERSION]), iv, sealed));
}

export class WrongPasswordError extends Error {
  constructor() {
    super('That password doesn’t unlock this account’s data.');
  }
}

/** Decrypt the data key. Throws WrongPasswordError when the wrapping key doesn't fit. */
export async function unwrapDataKey(wrapped: string, wrapKey: CryptoKey): Promise<Bytes> {
  const bytes = base64ToBytes(wrapped);
  if (bytes[0] !== VERSION) throw new Error('This account’s key was made by a newer version of SmartSubmit. Update the extension.');
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(1, 13), additionalData: DEK_AAD }, wrapKey, bytes.slice(13))) as Bytes;
  } catch {
    throw new WrongPasswordError();
  }
}

/** The working keys derived from the data key. */
export interface VaultKeys {
  encrypt: CryptoKey;
  address: CryptoKey;
}

export async function vaultKeys(dataKey: Uint8Array): Promise<VaultKeys> {
  const base = await subtle().importKey('raw', dataKey as Bytes, 'HKDF', false, ['deriveKey']);
  const derive = (info: string, algorithm: AesKeyGenParams | HmacKeyGenParams, usages: KeyUsage[]) =>
    subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: utf8(info) }, base, algorithm, false, usages);
  const [encrypt, address] = await Promise.all([
    derive('smartsubmit/encrypt/v1', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
    derive('smartsubmit/address/v1', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']),
  ]);
  return { encrypt, address };
}

/** The opaque id a record is stored under. */
export async function recordAddress(keys: VaultKeys, collection: string, id: string): Promise<string> {
  return base64url(new Uint8Array(await subtle().sign('HMAC', keys.address, utf8(`record/${collection}/${id}`))));
}

/** The opaque name a file is stored under. */
export async function fileAddress(keys: VaultKeys, fileId: string): Promise<string> {
  return base64url(new Uint8Array(await subtle().sign('HMAC', keys.address, utf8(`file/${fileId}`))));
}

/** Encrypt bytes, bound to where they are stored so they can't be moved to another address. */
export async function seal(keys: VaultKeys, plain: Uint8Array, address: string): Promise<Bytes> {
  const iv = random(12);
  const sealed = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8(address) }, keys.encrypt, plain as Bytes));
  return concat(new Uint8Array([VERSION]), iv, sealed);
}

export async function open(keys: VaultKeys, sealed: Uint8Array, address: string): Promise<Bytes> {
  if (sealed[0] !== VERSION) throw new Error('This data was saved by a newer version of SmartSubmit. Update the extension.');
  return new Uint8Array(
    await subtle().decrypt({ name: 'AES-GCM', iv: sealed.slice(1, 13), additionalData: utf8(address) }, keys.encrypt, sealed.slice(13)),
  ) as Bytes;
}

export interface RecordPayload {
  collection: string;
  id: string;
  /** Also on the row in the clear; sealed here so it can't be altered. */
  updatedAt: number;
  data: unknown;
}

export async function sealRecord(keys: VaultKeys, address: string, payload: RecordPayload): Promise<string> {
  return bytesToBase64(await seal(keys, utf8(JSON.stringify(payload)), address));
}

export async function openRecord(keys: VaultKeys, address: string, ciphertext: string): Promise<RecordPayload> {
  return JSON.parse(fromUtf8(await open(keys, base64ToBytes(ciphertext), address))) as RecordPayload;
}
