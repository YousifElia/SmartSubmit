// Prints a throwaway test account for the live sync tests: an email, a
// password, and the sign-in secret SmartSubmit derives from them, which is
// what the server stores (hashed) as the account password.
//
//   node scripts/live-test-account.mjs [email]
import { randomBytes, webcrypto } from 'node:crypto';

const email = (process.argv[2] ?? `smartsubmit.test.${randomBytes(4).toString('hex')}@example.com`).trim().toLowerCase();
const password = `test ${randomBytes(9).toString('base64url')} passphrase`;
const subtle = webcrypto.subtle;
const enc = new TextEncoder();
const salt = new Uint8Array(await subtle.digest('SHA-256', enc.encode(`smartsubmit/v1/${email}`)));
const material = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 }, material, 512));
const authSecret = Buffer.from(bits.slice(0, 32)).toString('hex');
console.log(JSON.stringify({ email, password, authSecret }));
