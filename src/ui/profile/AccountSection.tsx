/**
 * The email and password for accounts on application systems. Workday and
 * iCIMS make you open one with each employer; most people use the same
 * details every time.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, ClipboardCopy, Eye, EyeOff, KeyRound } from 'lucide-react';
import * as db from '@/core/storage/db';
import { JOB_SITE_ACCOUNT_ID, type JobSiteAccount } from '@/core/types';
import { copyText } from '../clipboard';
import { generatePassword, passwordProblems } from '@/core/util/password';
import { Button, Field, TextField, cx } from '../kit';
import { useLive } from '../hooks';

export function AccountSection({ profileEmail }: { profileEmail: string }) {
  const saved = useLive(
    () => db.getJobSiteAccount(),
    (c) => c.kind === 'record' && c.collection === 'credentials',
  );
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Changes not written yet: an email typed just before a new password both count.
  const pending = useRef<{ email?: string; password?: string }>({});

  // Start from what is saved, once it has loaded.
  useEffect(() => {
    if (saved === undefined) return;
    if (email === null) setEmail(saved?.email ?? '');
    if (password === null) setPassword(saved?.password ?? '');
  }, [saved, email, password]);

  const flush = () => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = {};
    if (Object.keys(next).length === 0) return;
    void db.getJobSiteAccount().then((current) => {
      const merged: JobSiteAccount = { email: current?.email ?? '', password: current?.password ?? '', ...next };
      return db.put('credentials', JOB_SITE_ACCOUNT_ID, merged);
    });
  };
  const save = (next: { email?: string; password?: string }) => {
    pending.current = { ...pending.current, ...next };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 300);
  };
  // Leaving the page writes what is still waiting.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (email === null || password === null) return null;
  const problems = password ? passwordProblems(password) : [];

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-slate-600">
        Workday and iCIMS make you sign in to, or create, an account with each employer. Save the details you use for those, and SmartSubmit fills
        their sign-in and create-account pages when you press Autofill. Use a password of its own here, not your email’s.
      </p>
      <TextField
        label="Email for these accounts"
        type="email"
        autoComplete="off"
        placeholder={profileEmail || 'you@example.com'}
        hint={profileEmail ? `Leave empty to use ${profileEmail}.` : undefined}
        value={email}
        onChange={(v) => {
          setEmail(v);
          save({ email: v.trim() });
        }}
      />
      <Field
        label="Password"
        htmlFor="account-password"
        hint={
          problems.length > 0
            ? `Most of these systems also want ${problems.join(', ')}.`
            : 'Saved to your sync account too, encrypted, when sync is on. Never put in a backup file, and only given to Workday and iCIMS pages.'
        }
      >
        <div className="flex flex-wrap gap-2">
          <input
            id="account-password"
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            spellCheck={false}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setCopied(false);
              save({ password: e.target.value });
            }}
            className={cx(
              'block min-w-0 flex-1 rounded-lg border-0 bg-white px-3 py-2 font-mono text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600',
            )}
          />
          <Button variant="ghost" aria-label={shown ? 'Hide password' : 'Show password'} icon={shown ? <EyeOff size={15} /> : <Eye size={15} />} onClick={() => setShown(!shown)} />
          <Button
            icon={<KeyRound size={15} />}
            onClick={() => {
              const next = generatePassword();
              setPassword(next);
              setShown(true);
              setCopied(false);
              save({ password: next });
            }}
          >
            Generate
          </Button>
          <Button
            icon={copied ? <Check size={15} /> : <ClipboardCopy size={15} />}
            disabled={!password}
            onClick={async () => setCopied(await copyText(password))}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </Field>
    </div>
  );
}
