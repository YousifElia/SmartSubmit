/**
 * The sync account screen: connect a server, create an account or sign in,
 * confirm the email, and once signed in see status, sync, change the
 * password, sign out or delete the account.
 *
 * Passwords go straight to the background script, which stretches them into
 * keys and forgets them. This page never stores one.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Cloud, CloudOff, KeyRound, LogOut, MailCheck, RefreshCw, ServerCog, ShieldCheck, Trash2 } from 'lucide-react';
import { send, type AuthResult, type SyncStatus } from '@/core/messages';
import { MIN_PASSWORD } from '@/core/sync/policy';
import type { Settings } from '@/core/types';
import { useLive, useSettings } from '../hooks';
import { Badge, Button, Checkbox, cx, Modal, Notice, Spinner, TextField } from '../kit';

const SELF_HOSTING = 'https://github.com/YousifElia/smartsubmit#sync-server';

function ago(time: number | null, now = Date.now()): string {
  if (!time) return 'not yet';
  const seconds = Math.round((time - now) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(seconds) < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
}

/** Run an account request, keeping track of busy state and the error to show. */
function useRequest() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (request: () => Promise<AuthResult>): Promise<AuthResult> => {
    setBusy(true);
    setError('');
    try {
      const result = await request();
      if (!result.ok) setError(result.error);
      return result;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(message);
      return { ok: false, error: message };
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

function Form({ onSubmit, children, className }: { onSubmit: () => void; children: ReactNode; className?: string }) {
  return (
    <form
      className={cx('space-y-4', className)}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

function strength(password: string): { label: string; tone: 'red' | 'amber' | 'green'; width: string } {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/, /\s/].filter((re) => re.test(password)).length;
  if (password.length < MIN_PASSWORD) return { label: `At least ${MIN_PASSWORD} characters`, tone: 'red', width: `${Math.max(8, (password.length / MIN_PASSWORD) * 33)}%` };
  if (password.length >= 16 || (password.length >= 12 && classes >= 3)) return { label: 'Strong', tone: 'green', width: '100%' };
  return { label: 'Fair. Longer is stronger.', tone: 'amber', width: '66%' };
}

function PasswordFields({
  password,
  setPassword,
  confirm,
  setConfirm,
  label = 'Password',
}: {
  password: string;
  setPassword: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  label?: string;
}) {
  const meter = strength(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <>
      <div>
        <TextField label={label} type="password" autoComplete="new-password" value={password} onChange={setPassword} />
        {password && (
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cx('h-full rounded-full transition-all', { red: 'bg-red-400', amber: 'bg-amber-400', green: 'bg-emerald-500' }[meter.tone])}
                style={{ width: meter.width }}
              />
            </div>
            <span className="text-xs text-slate-500">{meter.label}</span>
          </div>
        )}
      </div>
      <TextField
        label={`Repeat ${label.toLowerCase()}`}
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        error={mismatch ? 'The passwords don’t match.' : undefined}
      />
    </>
  );
}

const validNew = (password: string, confirm: string) => password.length >= MIN_PASSWORD && password === confirm;

// ───────────────────────────── Server ─────────────────────────────

function ServerSetup({ settings, update, onDone }: { settings: Settings; update: (fn: (s: Settings) => Settings) => Promise<void>; onDone?: () => void }) {
  const [url, setUrl] = useState(settings.sync.url);
  const [key, setKey] = useState(settings.sync.key);
  const [error, setError] = useState('');
  const save = async () => {
    const address = url.trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(address);
      const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
      if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) throw new Error();
    } catch {
      setError('Enter the project URL, like https://your-project.supabase.co.');
      return;
    }
    if (key.trim().length < 20) {
      setError('Paste the project’s publishable (anon) key.');
      return;
    }
    setError('');
    await update((s) => ({ ...s, sync: { url: address, key: key.trim() } }));
    onDone?.();
  };
  return (
    <Form onSubmit={() => void save()}>
      <p className="text-[13px] leading-relaxed text-slate-600">
        SmartSubmit syncs through a free{' '}
        <a className="font-medium text-brand-700 hover:underline" href="https://supabase.com" target="_blank" rel="noreferrer">
          Supabase
        </a>{' '}
        project that you control. Set one up with the{' '}
        <a className="font-medium text-brand-700 hover:underline" href={SELF_HOSTING} target="_blank" rel="noreferrer">
          self-hosting guide
        </a>
        , then paste its details here. The server only ever receives encrypted data.
      </p>
      <TextField label="Project URL" placeholder="https://your-project.supabase.co" value={url} onChange={setUrl} autoComplete="off" spellCheck={false} />
      <TextField
        label="Publishable key"
        hint="Also called the anon key. It’s meant to be public: your data is protected by your account and its encryption."
        value={key}
        onChange={setKey}
        autoComplete="off"
        spellCheck={false}
      />
      {error && <Notice tone="red">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="primary" type="submit" icon={<ServerCog size={15} />}>
          Save server
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </Form>
  );
}

// ───────────────────────────── Signed out ─────────────────────────────

function SignIn({ status, onForgot }: { status: SyncStatus; onForgot: (email: string) => void }) {
  const [email, setEmail] = useState(status.email);
  const [password, setPassword] = useState('');
  const { busy, error, run } = useRequest();
  return (
    <Form onSubmit={() => void run(() => send('auth.signIn', { email, password }))}>
      <TextField label="Email" type="email" autoComplete="username" value={email} onChange={setEmail} />
      <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
      {error && <Notice tone="red">{error}</Notice>}
      <p className="text-xs leading-relaxed text-slate-500">
        What’s on this browser is merged into the account. Where both have the same thing, the account’s copy is kept the first time.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" type="submit" busy={busy} disabled={!email || !password} icon={<Cloud size={15} />}>
          Sign in
        </Button>
        <button type="button" className="text-[13px] font-medium text-brand-700 hover:underline" onClick={() => onForgot(email)}>
          Forgot password?
        </button>
      </div>
    </Form>
  );
}

function CreateAccount() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const { busy, error, run } = useRequest();
  return (
    <Form onSubmit={() => void run(() => send('auth.signUp', { email, password }))}>
      <TextField label="Email" type="email" autoComplete="username" value={email} onChange={setEmail} />
      <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
      <Notice tone="amber">
        Your password is also the key to your encrypted data, and nobody, including whoever runs the server, can reset that key.
        If you forget the password, your synced data can be recovered only from a browser that is still signed in.
      </Notice>
      <Checkbox checked={understood} onChange={setUnderstood} label="I understand, and I’ll keep this password somewhere safe." />
      {error && <Notice tone="red">{error}</Notice>}
      <Button variant="primary" type="submit" busy={busy} disabled={!email || !validNew(password, confirm) || !understood} icon={<ShieldCheck size={15} />}>
        Create account
      </Button>
    </Form>
  );
}

function ResetPassword({ status, initialEmail, onBack }: { status: SyncStatus; initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, run } = useRequest();
  const keeps = status.holdsKey && email.trim().toLowerCase() === status.email;

  if (!sent) {
    return (
      <Form
        onSubmit={async () => {
          if ((await run(() => send('auth.requestReset', { email }))).ok) setSent(true);
        }}
      >
        <p className="text-[13px] leading-relaxed text-slate-600">We’ll email you a code to set a new password.</p>
        <TextField label="Email" type="email" autoComplete="username" value={email} onChange={setEmail} />
        {error && <Notice tone="red">{error}</Notice>}
        <div className="flex gap-2">
          <Button variant="primary" type="submit" busy={busy} disabled={!email}>
            Send code
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Back to sign in
          </Button>
        </div>
      </Form>
    );
  }
  return (
    <Form onSubmit={() => void run(() => send('auth.completeReset', { email, code, password }))}>
      <p className="text-[13px] leading-relaxed text-slate-600">
        If an account exists for <b className="font-medium text-ink">{email}</b>, a code is on its way. Enter it with your new password.
      </p>
      {keeps ? (
        <Notice tone="green">This browser still holds your account’s key, so your synced data is kept.</Notice>
      ) : (
        <Notice tone="amber">
          Without the old password, this browser can’t decrypt your synced data, so resetting here replaces the cloud copy with what’s on this
          browser. If you’re still signed in on another browser, reset from there instead to keep everything.
        </Notice>
      )}
      <TextField label="Code from the email" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={setCode} />
      <PasswordFields label="New password" password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
      {error && <Notice tone="red">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="primary" type="submit" busy={busy} disabled={!code.trim() || !validNew(password, confirm)}>
          Set new password
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Cancel
        </Button>
      </div>
    </Form>
  );
}

function SignedOut({
  status,
  settings,
  update,
  compact,
}: {
  status: SyncStatus;
  settings: Settings;
  update: (fn: (s: Settings) => Settings) => Promise<void>;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<'signIn' | 'create' | 'reset' | 'server'>(status.email ? 'signIn' : 'create');
  const [resetEmail, setResetEmail] = useState('');

  if (mode === 'server') return <ServerSetup settings={settings} update={update} onDone={() => setMode('signIn')} />;
  if (mode === 'reset') return <ResetPassword status={status} initialEmail={resetEmail} onBack={() => setMode('signIn')} />;
  return (
    <div className="space-y-5">
      {!compact && (
        <ul className="grid gap-3 text-[13px] leading-relaxed text-slate-600 sm:grid-cols-2">
          <li className="flex gap-2.5">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
            Encrypted on this browser before upload. The server stores only data it can’t read.
          </li>
          <li className="flex gap-2.5">
            <Cloud size={16} className="mt-0.5 shrink-0 text-brand-600" />
            Profile, resumes, saved answers, tailored resumes and tracked jobs. Settings stay on each browser.
          </li>
        </ul>
      )}
      {status.error && <Notice tone="amber">{status.error}</Notice>}
      <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {(
          [
            ['signIn', 'Sign in'],
            ['create', 'Create account'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cx(
              'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
              mode === value ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-w-md">
        {mode === 'signIn' ? (
          <SignIn
            status={status}
            onForgot={(email) => {
              setResetEmail(email);
              setMode('reset');
            }}
          />
        ) : (
          <CreateAccount />
        )}
      </div>
      {!compact && (
        <p className="text-xs text-slate-400">
          Server: {settings.sync.url.replace(/^https?:\/\//, '')}{' '}
          <button type="button" className="font-medium text-slate-500 hover:text-ink hover:underline" onClick={() => setMode('server')}>
            Change
          </button>
        </p>
      )}
    </div>
  );
}

// ───────────────────────────── Confirming ─────────────────────────────

function Confirming({ status }: { status: SyncStatus }) {
  const [code, setCode] = useState('');
  const { busy, error, run } = useRequest();
  return (
    <div className="max-w-md space-y-4">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <MailCheck size={18} />
        </span>
        <div className="text-[13px] leading-relaxed text-slate-600">
          <p className="font-semibold text-ink">Confirm your email</p>
          <p>
            We sent a message to <b className="font-medium text-ink">{status.email}</b>. Open the link in it, then come back and press Continue. If the
            message shows a code instead, enter it here.
          </p>
          <p className="mt-1 text-xs text-slate-500">The link may open a page that doesn’t load. That’s fine: your email is confirmed.</p>
        </div>
      </div>
      <Form onSubmit={() => void run(() => send('auth.confirm', { code }))}>
        <TextField label="Code (if the email has one)" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={setCode} />
        {error && <Notice tone="red">{error}</Notice>}
        <div className="flex gap-2">
          <Button variant="primary" type="submit" busy={busy}>
            Continue
          </Button>
          <Button variant="ghost" onClick={() => void run(() => send('auth.cancelSignUp'))}>
            Use a different email
          </Button>
        </div>
      </Form>
    </div>
  );
}

// ───────────────────────────── Signed in ─────────────────────────────

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run } = useRequest();
  useEffect(() => {
    if (!open) {
      setCurrent('');
      setPassword('');
      setConfirm('');
      setDone(false);
    }
  }, [open]);
  const submit = async () => {
    if ((await run(() => send('auth.changePassword', { current, next: password }))).ok) setDone(true);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" busy={busy} disabled={!current || !validNew(password, confirm)} onClick={() => void submit()}>
              Change password
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Notice tone="green">Password changed. Use the new one to sign in on your other browsers.</Notice>
      ) : (
        <Form onSubmit={() => void submit()}>
          <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={setCurrent} />
          <PasswordFields label="New password" password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
          {error && <Notice tone="red">{error}</Notice>}
          <button type="submit" hidden />
        </Form>
      )}
    </Modal>
  );
}

function DeleteAccount({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useRequest();
  useEffect(() => {
    if (!open) setPassword('');
  }, [open]);
  const submit = async () => {
    if ((await run(() => send('auth.deleteAccount', { password }))).ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete sync account"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} disabled={!password} icon={<Trash2 size={15} />} onClick={() => void submit()}>
            Delete account
          </Button>
        </>
      }
    >
      <Form onSubmit={() => void submit()}>
        <p className="text-[13px] leading-relaxed text-slate-600">
          This deletes your account and everything stored on the sync server, for good. What’s on this browser stays, and other browsers keep
          their copies but stop syncing.
        </p>
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
        {error && <Notice tone="red">{error}</Notice>}
        <button type="submit" hidden />
      </Form>
    </Modal>
  );
}

function SignedIn({ status, compact }: { status: SyncStatus; compact?: boolean }) {
  const [dialog, setDialog] = useState<'password' | 'delete' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [, tick] = useState(0);
  const { busy, run } = useRequest();
  // Keep "synced 3 minutes ago" current.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const active = syncing || status.syncing;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          {status.error ? <CloudOff size={18} className="text-amber-600" /> : <Cloud size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{status.email}</p>
          <p className="text-[13px] text-slate-500" aria-live="polite">
            {active ? 'Syncing…' : `Synced ${ago(status.lastSyncAt)}`}
            {status.pending > 0 && !active && (
              <>
                {' · '}
                <Badge tone="amber">
                  {status.pending} change{status.pending === 1 ? '' : 's'} waiting
                </Badge>
              </>
            )}
          </p>
        </div>
        <Button
          icon={active ? <Spinner /> : <RefreshCw size={15} />}
          disabled={active}
          onClick={async () => {
            setSyncing(true);
            try {
              await send('sync.now');
            } finally {
              setSyncing(false);
            }
          }}
        >
          Sync now
        </Button>
      </div>
      {status.error && <Notice tone="amber">Last sync didn’t finish: {status.error}</Notice>}
      {!compact && (
        <p className="flex gap-2 text-[13px] leading-relaxed text-slate-500">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
          Your profile, resumes, saved answers, tailored resumes and tracked jobs are encrypted on this browser before upload. SmartSubmit syncs
          every 15 minutes and shortly after you change something.
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Button size="sm" icon={<KeyRound size={14} />} onClick={() => setDialog('password')}>
          Change password
        </Button>
        <Button size="sm" busy={busy} icon={<LogOut size={14} />} onClick={() => void run(() => send('auth.signOut'))}>
          Sign out
        </Button>
        {!compact && (
          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setDialog('delete')}>
            Delete account
          </Button>
        )}
      </div>
      <ChangePassword open={dialog === 'password'} onClose={() => setDialog(null)} />
      <DeleteAccount open={dialog === 'delete'} onClose={() => setDialog(null)} />
    </div>
  );
}

// ───────────────────────────── Entry ─────────────────────────────

export function SyncAccount({ compact }: { compact?: boolean }) {
  const status = useLive(
    () => send('sync.status'),
    (c) => c.kind === 'settings' || c.kind === 'meta',
  );
  const [settings, update] = useSettings();
  if (!status || !settings) {
    return (
      <div className="flex justify-center py-6 text-slate-400">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }
  if (!status.configured) return <ServerSetup settings={settings} update={update} />;
  if (status.state === 'confirming') return <Confirming status={status} />;
  if (status.state === 'ready') return <SignedIn status={status} compact={compact} />;
  return <SignedOut status={status} settings={settings} update={update} compact={compact} />;
}
