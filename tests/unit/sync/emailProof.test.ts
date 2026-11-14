// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readEmailProof } from '@/core/sync/emailProof';

const LINK = 'https://abcd1234.supabase.co/auth/v1/verify?token=3f9a0c5d7e11aa22bb33cc44dd55ee66ff778899aabbccddeeff0011&type=recovery&redirect_to=http://localhost:3000';
const HASH = '3f9a0c5d7e11aa22bb33cc44dd55ee66ff778899aabbccddeeff0011';

describe('readEmailProof', () => {
  it('reads the link copied from a Supabase email', () => {
    expect(readEmailProof(LINK)).toEqual({ kind: 'link', tokenHash: HASH, type: 'recovery' });
    expect(readEmailProof(LINK.replace('type=recovery', 'type=signup'))).toMatchObject({ kind: 'link', type: 'signup' });
    expect(readEmailProof(LINK.replace('type=recovery', 'type=email'))).toMatchObject({ kind: 'link', type: 'email' });
  });

  it('copes with how links get copied: spaces, brackets, HTML escapes, words around them', () => {
    expect(readEmailProof(`  ${LINK}\n`)).toMatchObject({ kind: 'link', tokenHash: HASH });
    expect(readEmailProof(`<${LINK}>`)).toMatchObject({ kind: 'link', tokenHash: HASH });
    expect(readEmailProof(LINK.replace(/&/g, '&amp;'))).toEqual({ kind: 'link', tokenHash: HASH, type: 'recovery' });
    expect(readEmailProof(`Reset Password ${LINK}`)).toMatchObject({ kind: 'link', tokenHash: HASH });
    expect(readEmailProof(`Follow this link (${LINK}).`)).toMatchObject({ kind: 'link', type: 'recovery' });
  });

  it('reads a link in a custom email that names the token itself', () => {
    expect(readEmailProof(`https://example.com/auth/confirm?token_hash=${HASH}&type=recovery`)).toEqual({ kind: 'link', tokenHash: HASH, type: 'recovery' });
  });

  it('finds the real link inside one rewritten by a mail scanner', () => {
    const safelinks = `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(LINK)}&data=05%7C02%7Cabc&reserved=0`;
    expect(readEmailProof(safelinks)).toEqual({ kind: 'link', tokenHash: HASH, type: 'recovery' });
    expect(readEmailProof(`https://www.google.com/url?q=${encodeURIComponent(LINK)}&source=gmail&ust=1`)).toMatchObject({ kind: 'link', tokenHash: HASH });
    const twice = `https://scan.example/redirect?to=${encodeURIComponent(safelinks)}`;
    expect(readEmailProof(twice)).toMatchObject({ kind: 'link', tokenHash: HASH });
  });

  it('reads the address of the page an opened link landed on', () => {
    const opened = 'http://localhost:3000/#access_token=eyJhbGciOi.payload.sig&expires_at=1794500000&expires_in=3600&refresh_token=q1w2e3r4&token_type=bearer&type=recovery';
    expect(readEmailProof(opened)).toEqual({ kind: 'session', accessToken: 'eyJhbGciOi.payload.sig', refreshToken: 'q1w2e3r4', type: 'recovery' });
  });

  it('recognises a page saying the link had already been used', () => {
    const spent = 'http://localhost:3000/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    expect(readEmailProof(spent)).toEqual({ kind: 'spent', reason: 'Email link is invalid or has expired' });
    expect(readEmailProof('http://localhost:3000/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toMatchObject({ kind: 'spent' });
  });

  it('reads codes however they are typed', () => {
    expect(readEmailProof('123456')).toEqual({ kind: 'code', code: '123456' });
    expect(readEmailProof(' 123 456 ')).toEqual({ kind: 'code', code: '123456' });
    expect(readEmailProof('123-456')).toEqual({ kind: 'code', code: '123456' });
    expect(readEmailProof('12345678')).toEqual({ kind: 'code', code: '12345678' });
  });

  it('gives up on anything else', () => {
    for (const text of ['', '   ', '12345', 'hello', 'https://example.com/', 'https://example.com/?token=abc', 'javascript:alert(1)', 'https://example.com/verify?token=abc']) {
      expect(readEmailProof(text)).toEqual({ kind: 'unknown' });
    }
  });
});
