// Throwaway accounts for the live email-link tests (tests/live/emailLinks.live.test.ts).
//
// Those tests check that SmartSubmit can finish a sign-up and a password reset
// from the link in Supabase's emails, without any email being sent: each
// account is created directly in the database, already waiting on a one-time
// token whose value is known. The server stores such a token as
// sha224(email + code), which is also what an emailed link carries.
//
//   node scripts/live-link-accounts.mjs accounts.json > seed.sql
//
// Run seed.sql on the project (SQL editor), then:
//
//   SS_SYNC_URL=… SS_SYNC_KEY=… SS_LINK_ACCOUNTS=accounts.json npm run test:live
//
// The tests delete the accounts when they finish.
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/live-link-accounts.mjs <accounts.json> > seed.sql');
  process.exit(1);
}

const subtle = webcrypto.subtle;
const enc = new TextEncoder();

async function signInSecret(email, password) {
  const salt = new Uint8Array(await subtle.digest('SHA-256', enc.encode(`smartsubmit/v1/${email}`)));
  const material = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 }, material, 512));
  return Buffer.from(bits.slice(0, 32)).toString('hex');
}

async function account(waitingOn, code) {
  const email = `smartsubmit.test.${randomBytes(4).toString('hex')}@example.com`;
  const password = `test ${randomBytes(9).toString('base64url')} passphrase`;
  return {
    email,
    password,
    code,
    hash: createHash('sha224').update(email + code).digest('hex'),
    waitingOn,
    secret: await signInSecret(email, password),
  };
}

const accounts = {
  confirm: await account('confirmation', '111111'),
  resetByLink: await account('recovery', '222222'),
  resetByCode: await account('recovery', '333333'),
  resetByOpening: await account('recovery', '444444'),
};

const row = (a) => {
  const confirming = a.waitingOn === 'confirmation';
  return `('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${a.email}', extensions.crypt('${a.secret}', extensions.gen_salt('bf')), ${confirming ? 'null' : 'now()'}, '{"provider":"email","providers":["email"]}', '{}', now(), now(), '${confirming ? a.hash : ''}', ${confirming ? 'now()' : 'null'}, '${confirming ? '' : a.hash}', ${confirming ? 'null' : 'now()'}, '', '')`;
};

console.log(`with new_users as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change, email_change_token_new)
  values
    ${Object.values(accounts).map(row).join(',\n    ')}
  returning id, email, confirmation_token, recovery_token
), identities as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', false), 'email', now(), now(), now() from new_users
  returning user_id
)
insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to)
select gen_random_uuid(), id, 'confirmation_token'::auth.one_time_token_type, confirmation_token, email from new_users where confirmation_token <> ''
union all
select gen_random_uuid(), id, 'recovery_token'::auth.one_time_token_type, recovery_token, email from new_users where recovery_token <> ''
returning token_type;`);

// The tests need the passwords and tokens, not the derived secrets.
writeFileSync(out, JSON.stringify(Object.fromEntries(Object.entries(accounts).map(([name, { secret: _secret, waitingOn: _waitingOn, ...rest }]) => [name, rest])), null, 2));
