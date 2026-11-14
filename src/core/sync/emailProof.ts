/**
 * What a person can bring back from a sign-up or password-reset email.
 *
 * Supabase's built-in emails carry only a link, and their wording can't be
 * changed without connecting a mail service of your own. A browser extension
 * can't be the page such a link opens, so instead of following the link the
 * person hands it over. Three things are understood:
 *
 *   - the link itself, copied from the email: it holds a one-time token that
 *     can be redeemed directly;
 *   - the address of the page the link opened, if they followed it: it holds
 *     the sign-in the server started;
 *   - a code, when the server's emails have been customised to show one.
 */
export type EmailProof =
  | { kind: 'code'; code: string }
  /** `type` is what the link is for, as the server names it: signup, email, recovery… */
  | { kind: 'link'; tokenHash: string; type: string }
  | { kind: 'session'; accessToken: string; refreshToken: string; type: string }
  /** The page the link opened says the link had already been used or had expired. */
  | { kind: 'spent'; reason: string }
  | { kind: 'unknown' };

const MAX_DEPTH = 3;

function fromParams(params: URLSearchParams): EmailProof | null {
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken, type: params.get('type') ?? '' };
  if (params.get('error_code') || params.get('error_description') || params.get('error')) {
    return { kind: 'spent', reason: (params.get('error_description') ?? params.get('error_code') ?? params.get('error') ?? '').trim() };
  }
  return null;
}

function fromUrl(text: string, depth: number): EmailProof | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  // The page a link opened: the sign-in (or the failure) is after the "#".
  const opened = fromParams(new URLSearchParams(url.hash.replace(/^#/, ''))) ?? fromParams(url.searchParams);
  if (opened) return opened;

  // The link from the email: …/auth/v1/verify?token=<hash>&type=recovery&redirect_to=…
  const type = url.searchParams.get('type') ?? '';
  const hash = url.searchParams.get('token_hash') ?? (/\/verify\/?$/.test(url.pathname) ? url.searchParams.get('token') : null);
  if (hash && type) return { kind: 'link', tokenHash: hash, type };

  // A link rewritten by a mail scanner keeps the real one inside it.
  if (depth < MAX_DEPTH) {
    for (const value of url.searchParams.values()) {
      if (!/^https?:\/\//i.test(value)) continue;
      const inner = fromUrl(value, depth + 1);
      if (inner) return inner;
    }
    const wrapped = /__(https?:\/\/.+?)__;/.exec(text);
    if (wrapped) return fromUrl(wrapped[1]!, depth + 1);
  }
  return null;
}

/** Work out what was pasted or typed. */
export function readEmailProof(input: string): EmailProof {
  const text = input.trim().replace(/^[<"'“]+|[>"'”]+$/g, '').replace(/&amp;/g, '&');
  if (!text) return { kind: 'unknown' };

  const digits = text.replace(/[\s-]/g, '');
  if (/^\d{6,10}$/.test(digits)) return { kind: 'code', code: digits };

  // Pasted with words around it ("Reset Password https://…"): take the address.
  for (const candidate of text.match(/https?:\/\/\S+/gi) ?? []) {
    const found = fromUrl(candidate.replace(/[>)\].,]+$/, ''), 0);
    if (found) return found;
  }
  return { kind: 'unknown' };
}
