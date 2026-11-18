/**
 * What the sync account keeps: every part of the profile, the resumes,
 * applications and the rest, with what the server counts after each sync.
 */
import { Check, Circle } from 'lucide-react';
import type { SyncStatus } from '@/core/messages';
import * as db from '@/core/storage/db';
import { accountContents, nothingToKeep } from '@/core/sync/contents';
import { cx, Notice, Spinner } from '../kit';
import { useCollection, useLive } from '../hooks';

function ago(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AccountContents({ status }: { status: SyncStatus }) {
  const profile = useLive(
    () => db.getProfile(),
    (c) => c.kind === 'record' && c.collection === 'profile',
  );
  const jobSiteAccount = useLive(
    () => db.getJobSiteAccount(),
    (c) => c.kind === 'record' && c.collection === 'credentials',
  );
  const resumes = useCollection('resumes');
  const jobs = useCollection('jobs');
  const answers = useCollection('answers');
  const tailored = useCollection('tailored');
  const referrals = useCollection('referrals');
  if (!profile || jobSiteAccount === undefined || !resumes || !jobs || !answers || !tailored || !referrals) {
    return <Spinner className="h-5 w-5 text-slate-400" />;
  }

  const rows = accountContents({
    profile,
    jobSiteAccount,
    resumes: resumes.map((r) => r.data),
    jobs: jobs.map((r) => r.data),
    answers: answers.map((r) => r.data),
    tailored: tailored.map((r) => r.data),
    referrals: referrals.map((r) => r.data),
  });
  const ready = status.state === 'ready';
  const empty = nothingToKeep(rows);
  const remote = status.remote;

  let heading: string;
  let notice: { tone: 'amber' | 'green' | 'neutral'; text: string } | null = null;
  if (!ready) {
    heading = 'Sign in, or create an account, and all of this is kept in it, encrypted';
  } else if (!remote) {
    heading = 'Checking what your account holds…';
  } else if (remote.items === 0 && empty) {
    heading = 'What your account keeps';
    notice = {
      tone: 'amber',
      text: 'Your account is empty, and so is SmartSubmit on this browser: nothing has been saved to the account yet. Open SmartSubmit where you set it up (another browser, or another copy in this one), and sign in there: everything it holds goes up to your account, then comes down here.',
    };
  } else if (status.pending > 0) {
    heading = 'What your account keeps';
    notice = { tone: 'neutral', text: `${status.pending} change${status.pending === 1 ? '' : 's'} still to upload. Everything else below is in your account.` };
  } else {
    heading = 'In your account';
    notice = {
      tone: 'green',
      text: `Your account holds ${remote.items} encrypted item${remote.items === 1 ? '' : 's'}${remote.files ? ` and ${remote.files} file${remote.files === 1 ? '' : 's'}` : ''}, checked ${ago(remote.at)}. Sign in on any browser and it all comes back.`,
    };
  }

  return (
    <section className="space-y-3" aria-label="What your account keeps" data-testid="account-contents">
      <h3 className="text-[13px] font-semibold text-slate-700">{heading}</h3>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200/70">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-3 px-3 py-2 text-[13px]" data-testid={`contents-${row.key}`}>
            {row.filled ? <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <Circle size={15} className="mt-0.5 shrink-0 text-slate-300" />}
            <span className="w-48 shrink-0 font-medium text-ink">{row.label}</span>
            <span className={cx('min-w-0 flex-1', row.filled ? 'text-slate-600' : 'text-slate-400')}>{row.detail}</span>
            {row.count !== null && <span className="shrink-0 tabular-nums text-slate-500">{row.count}</span>}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-slate-500">
        Kept on this browser only: your LinkedIn connections (other people’s details), the AI, autofill and panel settings, and the sync server
        itself.
      </p>
    </section>
  );
}
