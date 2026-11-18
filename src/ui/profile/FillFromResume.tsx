/**
 * "Fill from resume": read a resume into the profile, every job, school,
 * skill and language in it, adding what's missing or replacing.
 */
import { useMemo, useState } from 'react';
import { FileInput } from 'lucide-react';
import { looksStructured, parseResumeText } from '@/core/resume/heuristics';
import { languagesFromResume, profileFromResume, skillsFromResume } from '@/core/resume/toProfile';
import type { Profile, Resume } from '@/core/types';
import { Button, Modal, Notice, Segmented, SelectField } from '../kit';
import { useCollection } from '../hooks';

type Mode = 'add' | 'replace';

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: 'add', label: 'Add what’s missing', hint: 'Keeps everything you’ve entered, and adds the jobs, schools, skills and languages your profile doesn’t have yet.' },
  {
    value: 'replace',
    label: 'Replace',
    hint: 'Your jobs, schools and skills become exactly the resume’s. Contact details you’ve entered, and your languages, are kept.',
  },
];

function docOf(resume: Resume) {
  return resume.doc ?? parseResumeText(resume.text);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function FillFromResume({ profile, onFill }: { profile: Profile; onFill: (next: Profile, filled: string[]) => void }) {
  const records = useCollection('resumes');
  const [open, setOpen] = useState(false);
  const [resumeId, setResumeId] = useState('');
  const [mode, setMode] = useState<Mode>('add');

  const resumes = useMemo(
    () => (records ?? []).map((r) => r.data).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt - b.createdAt),
    [records],
  );
  const resume = resumes.find((r) => r.id === resumeId) ?? resumes[0] ?? null;
  const doc = resume ? docOf(resume) : null;
  const outcome = doc ? profileFromResume(doc, profile, { replace: mode === 'replace' }) : null;

  const contents = doc
    ? [
        plural(doc.experience.length, 'job', 'jobs'),
        plural(doc.education.length, 'school', 'schools'),
        plural(skillsFromResume(doc).length, 'skill', 'skills'),
        plural(languagesFromResume(doc).length, 'language', 'languages'),
      ].join(', ')
    : '';

  return (
    <>
      <Button icon={<FileInput size={15} />} onClick={() => setOpen(true)}>
        Fill from resume
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Fill your profile from a resume"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!outcome || outcome.filled.length === 0}
              onClick={() => {
                if (!outcome) return;
                onFill(outcome.profile, outcome.filled);
                setOpen(false);
              }}
            >
              Fill my profile
            </Button>
          </>
        }
      >
        {resumes.length === 0 ? (
          <Notice>
            Add a resume first, on the{' '}
            <a className="font-medium text-brand-700 underline" href="#/resumes" onClick={() => setOpen(false)}>
              Resumes page
            </a>
            : paste it or upload it.
          </Notice>
        ) : (
          <div className="space-y-4">
            <SelectField label="Resume" placeholder={null} value={resume?.id ?? ''} onChange={setResumeId} options={resumes.map((r) => ({ value: r.id, label: r.name }))} />
            {doc && !looksStructured(doc) ? (
              <Notice tone="amber">
                SmartSubmit couldn’t find this resume’s sections. Check them on the{' '}
                <a className="font-medium underline" href={`#/resumes/${resume!.id}`} onClick={() => setOpen(false)}>
                  Resumes page
                </a>{' '}
                (or have AI read it there), then come back.
              </Notice>
            ) : (
              <p className="text-[13px] text-slate-600" data-testid="resume-contents">
                It lists {contents}.
              </p>
            )}
            <Segmented<Mode> label="Your profile" value={mode} onChange={(v) => setMode(v || 'add')} options={MODES} hint={MODES.find((m) => m.value === mode)?.hint} />
            {outcome &&
              (outcome.filled.length > 0 ? (
                <p className="text-[13px] text-slate-600" data-testid="fill-preview">
                  Will fill in: <b className="font-medium text-ink">{outcome.filled.join(', ')}</b>.
                </p>
              ) : (
                <p className="text-[13px] text-slate-500" data-testid="fill-preview">
                  Your profile already has everything in this resume.
                </p>
              ))}
          </div>
        )}
      </Modal>
    </>
  );
}
