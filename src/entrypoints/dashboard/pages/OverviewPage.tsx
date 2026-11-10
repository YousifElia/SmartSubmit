import type { ReactNode } from 'react';
import { ArrowRight, BriefcaseBusiness, FileText, MessageSquareText, UserRound } from 'lucide-react';
import { profileCompleteness } from '@/core/profile';
import * as db from '@/core/storage/db';
import { SITE_NAMES } from '@/core/sites';
import { Card, PageHeader } from '@/ui/kit';
import { useCollection, useLive } from '@/ui/hooks';

function Stat({
  icon,
  label,
  value,
  detail,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between text-slate-400">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="text-[13px] font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
    </a>
  );
}

export function OverviewPage({ navigate }: { navigate: (route: string) => void }) {
  const profile = useLive(
    () => db.getProfile(),
    (c) => c.kind === 'record' && c.collection === 'profile',
  );
  const resumes = useCollection('resumes');
  const answers = useCollection('answers');
  const jobs = useCollection('jobs');
  const completeness = profile ? profileCompleteness(profile) : null;
  const applied = jobs?.filter((j) => j.data.status !== 'saved' && j.data.status !== 'started').length ?? 0;
  const sites = Object.entries(SITE_NAMES)
    .filter(([id]) => id !== 'generic')
    .map(([, name]) => name);

  return (
    <>
      <PageHeader
        title={profile?.firstName ? `Hi, ${profile.preferredName || profile.firstName}` : 'Overview'}
        description="Everything SmartSubmit knows about you lives here. Open a job application to put it to work."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<UserRound size={18} />}
          label="Profile complete"
          value={completeness ? `${completeness.percent}%` : '–'}
          detail={
            completeness && completeness.missing.length > 0
              ? `Still missing: ${completeness.missing.slice(0, 3).join(', ')}${completeness.missing.length > 3 ? '…' : ''}`
              : 'All the common fields are filled in.'
          }
          href="#/profile"
        />
        <Stat
          icon={<FileText size={18} />}
          label={resumes?.length === 1 ? 'Resume' : 'Resumes'}
          value={String(resumes?.length ?? '–')}
          detail={resumes?.length ? 'The default one is attached unless you pick another.' : 'Add one so it can be attached for you.'}
          href="#/resumes"
        />
        <Stat
          icon={<MessageSquareText size={18} />}
          label="Saved answers"
          value={String(answers?.length ?? '–')}
          detail="Questions you answered once and chose to keep."
          href="#/answers"
        />
        <Stat
          icon={<BriefcaseBusiness size={18} />}
          label="Applications"
          value={String(applied)}
          detail={`${jobs?.length ?? 0} job${jobs?.length === 1 ? '' : 's'} tracked in total.`}
          href="#/jobs"
        />
      </div>

      <Card className="mt-6" title="How to use it">
        <ol className="space-y-3 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-medium text-ink">1. Open an application.</span> On {sites.slice(0, -1).join(', ')} and{' '}
            {sites[sites.length - 1]}, the SmartSubmit panel appears on its own. Anywhere else, click the toolbar icon.
          </li>
          <li>
            <span className="font-medium text-ink">2. Press Autofill.</span> Green fields are filled, amber ones are
            filled from a similar saved answer and worth a glance, blue ones still need you.
          </li>
          <li>
            <span className="font-medium text-ink">3. Save what’s new.</span> Answer the blue questions and the panel
            offers to remember them for next time.
          </li>
          <li>
            <span className="font-medium text-ink">4. Review and submit yourself.</span> SmartSubmit never presses the
            submit button.
          </li>
        </ol>
        <button
          type="button"
          onClick={() => navigate('/welcome')}
          className="mt-5 text-[13px] font-medium text-brand-700 hover:underline"
        >
          Run setup again
        </button>
      </Card>
    </>
  );
}
