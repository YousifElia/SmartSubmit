import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, MousePointerClick, PanelRightOpen, ShieldCheck } from 'lucide-react';
import { LogoMark } from '@/ui/Logo';
import { Button, cx, Spinner } from '@/ui/kit';
import { useProfileEditor } from '@/ui/hooks';
import {
  BasicsSection,
  DemographicsSection,
  EducationSection,
  ExperienceSection,
  LinksSection,
  PreferencesSection,
  WorkAuthSection,
  type SectionProps,
} from '@/ui/profile/sections';
import { ResumeManager } from '@/ui/resumes/ResumeManager';
import { AiSetup } from '@/ui/ai/AiSetup';
import { SyncAccount } from '@/ui/sync/SyncAccount';

interface Step {
  id: string;
  /** Short name for the progress rail. */
  short: string;
  title: string;
  description: string;
  render: (props: SectionProps) => ReactNode;
}

const STEPS: Step[] = [
  {
    id: 'basics',
    short: 'About you',
    title: 'Let’s start with the basics',
    description: 'The details almost every application asks for. You can change any of this later.',
    render: (p) => <BasicsSection {...p} />,
  },
  {
    id: 'links',
    short: 'Links',
    title: 'Where can employers find you?',
    description: 'Add the profiles you want filled in when a form asks for them.',
    render: (p) => <LinksSection {...p} />,
  },
  {
    id: 'education',
    short: 'Education',
    title: 'Your education',
    description: 'Degree, school and graduation date come up constantly. Enter them once here.',
    render: (p) => <EducationSection {...p} />,
  },
  {
    id: 'experience',
    short: 'Experience',
    title: 'Your work experience',
    description: 'Some applications ask you to re-enter your work history field by field. This fills those.',
    render: (p) => <ExperienceSection {...p} />,
  },
  {
    id: 'workauth',
    short: 'Work status',
    title: 'Work authorization',
    description: 'Used for the “are you authorized to work” and “will you need sponsorship” questions.',
    render: (p) => <WorkAuthSection {...p} />,
  },
  {
    id: 'preferences',
    short: 'Preferences',
    title: 'Common questions',
    description: 'Your usual answers to salary, start date and similar questions.',
    render: (p) => <PreferencesSection {...p} />,
  },
  {
    id: 'demographics',
    short: 'Voluntary',
    title: 'Voluntary self-identification',
    description: 'Optional demographic questions. Skip this step and SmartSubmit leaves them alone.',
    render: (p) => <DemographicsSection {...p} />,
  },
  {
    id: 'resumes',
    short: 'Resumes',
    title: 'Add your resume',
    description: 'Paste the text or upload a file. Add as many versions as you like; one is attached by default.',
    render: () => <ResumeManager compact />,
  },
  {
    id: 'ai',
    short: 'AI',
    title: 'Connect AI for tailoring',
    description: 'Optional. Tailoring rewrites your resume for a specific job; SmartSubmit autofills without it.',
    render: () => <AiSetup compact />,
  },
  {
    id: 'sync',
    short: 'Sync',
    title: 'Sync across browsers',
    description: 'Optional. Create an account to keep Chrome and Firefox in step. Everything is encrypted before it leaves this device.',
    render: () => <SyncAccount compact />,
  },
];

function Welcome({ onStart }: { onStart: () => void }) {
  const points: { icon: ReactNode; title: string; body: string }[] = [
    {
      icon: <MousePointerClick size={18} />,
      title: 'Fill applications in one click',
      body: 'Enter your details once. On a job application, press Autofill and review what was filled.',
    },
    {
      icon: <PanelRightOpen size={18} />,
      title: 'It learns as you go',
      body: 'Answer a new question once and choose to save it. Next time it is filled in for you.',
    },
    {
      icon: <ShieldCheck size={18} />,
      title: 'You stay in control',
      body: 'Your data is stored on this device. SmartSubmit never submits an application for you.',
    },
  ];
  return (
    <div className="ss-fade-in mx-auto max-w-xl text-center">
      <div className="mb-6 flex justify-center">
        <LogoMark size={64} />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Welcome to SmartSubmit</h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-500">
        A few minutes of setup now saves you from typing the same answers into every application.
      </p>
      <ul className="mt-8 space-y-3 text-left">
        {points.map((p) => (
          <li key={p.title} className="flex gap-3.5 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              {p.icon}
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{p.title}</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-500">{p.body}</span>
            </span>
          </li>
        ))}
      </ul>
      <Button variant="primary" className="mt-8 px-6 py-2.5" onClick={onStart} icon={<ArrowRight size={16} />}>
        Get started
      </Button>
    </div>
  );
}

function Done({ onDone }: { onDone: () => void }) {
  return (
    <div className="ss-fade-in mx-auto max-w-xl text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check size={30} />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">You’re set up</h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-500">
        Open a job application on Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters or Workable and the
        SmartSubmit panel appears at the edge of the page. On any other site, click the SmartSubmit icon in your
        toolbar.
      </p>
      <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-slate-500">
        Tip: pin SmartSubmit to your toolbar so it is one click away.
      </p>
      <Button variant="primary" className="mt-8 px-6 py-2.5" onClick={onDone}>
        Go to dashboard
      </Button>
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: () => void | Promise<void> }) {
  // -1 is the welcome screen; STEPS.length is the closing screen.
  const [index, setIndex] = useState(-1);
  const { profile, setProfile, status } = useProfileEditor();

  if (!profile) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (index < 0) {
    return (
      <div className="flex min-h-screen items-center px-6 py-12">
        <Welcome onStart={() => setIndex(0)} />
      </div>
    );
  }
  if (index >= STEPS.length) {
    return (
      <div className="flex min-h-screen items-center px-6 py-12">
        <Done onDone={() => void onDone()} />
      </div>
    );
  }

  const step = STEPS[index]!;
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl gap-10 px-6 py-10">
      <aside className="hidden w-48 shrink-0 md:block">
        <div className="sticky top-10">
          <div className="mb-8 flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-[15px] font-semibold tracking-tight">SmartSubmit</span>
          </div>
          <ol className="space-y-1">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? 'step' : undefined}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium transition-colors',
                    i === index ? 'text-brand-700' : i < index ? 'text-slate-600 hover:text-ink' : 'text-slate-400 hover:text-slate-600',
                  )}
                >
                  <span
                    className={cx(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                      i === index
                        ? 'bg-brand-600 text-white'
                        : i < index
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-500',
                    )}
                  >
                    {i < index ? <Check size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  {s.short}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div key={step.id} className="ss-fade-in">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            Step {index + 1} of {STEPS.length}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{step.title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{step.description}</p>
          <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
            {step.render({ profile, onChange: setProfile })}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setIndex(index - 1)}>
            Back
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400" aria-live="polite">
              {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
            </span>
            <Button variant="ghost" onClick={() => setIndex(index + 1)}>
              Skip
            </Button>
            <Button variant="primary" onClick={() => setIndex(index + 1)}>
              {index === STEPS.length - 1 ? 'Finish' : 'Continue'}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
