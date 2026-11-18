import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Download, ExternalLink, FileDown, Search, Sparkles, Trash2, UsersRound } from 'lucide-react';
import { jobsToCsv } from '@/core/jobs/csv';
import type { MatchReport } from '@/core/jobs/keywords';
import { send } from '@/core/messages';
import { SITE_NAMES, type SiteId } from '@/core/sites';
import * as db from '@/core/storage/db';
import type { Job, JobStatus, Resume, RichBlock, TailoredResume } from '@/core/types';
import { downloadBase64, downloadText } from '@/ui/download';
import { Badge, Button, cx, EmptyState, Modal, Notice, PageHeader, SelectField, Spinner, TextArea, TextField } from '@/ui/kit';
import { useCollection } from '@/ui/hooks';

export const STATUSES: { value: JobStatus; label: string; tone: 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'sky' }[] = [
  { value: 'saved', label: 'Saved', tone: 'neutral' },
  { value: 'started', label: 'Started', tone: 'sky' },
  { value: 'applied', label: 'Applied', tone: 'brand' },
  { value: 'interviewing', label: 'Interviewing', tone: 'amber' },
  { value: 'offer', label: 'Offer', tone: 'green' },
  { value: 'rejected', label: 'Rejected', tone: 'red' },
  { value: 'withdrawn', label: 'Withdrawn', tone: 'neutral' },
];

type Filter = 'all' | 'active' | JobStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'In progress' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offers' },
  { value: 'rejected', label: 'Closed' },
];

function matches(filter: Filter, job: Job): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return ['saved', 'started', 'applied', 'interviewing'].includes(job.status);
  if (filter === 'rejected') return job.status === 'rejected' || job.status === 'withdrawn';
  return job.status === filter;
}

function day(ms: number | null): string {
  return ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function scoreTone(score: number): 'green' | 'amber' | 'red' {
  return score >= 70 ? 'green' : score >= 45 ? 'amber' : 'red';
}

function resumeLabel(job: Job, resumes: Resume[], tailored: TailoredResume[]): string {
  const ref = job.resumeRef;
  if (!ref) return '';
  if (ref.kind === 'resume') return resumes.find((r) => r.id === ref.id)?.name ?? 'Deleted resume';
  const t = tailored.find((x) => x.id === ref.id);
  return t ? `${resumes.find((r) => r.id === t.resumeId)?.name ?? 'Resume'} (tailored)` : 'Tailored resume';
}

/** The job description, rendered as plain elements (never as HTML). */
export function Description({ blocks }: { blocks: RichBlock[] }) {
  if (blocks.length === 0) return <p className="text-sm italic text-slate-500">The description could not be read from the posting.</p>;
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed text-slate-700">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h4 key={i} className="pt-2 text-sm font-semibold text-ink">
              {block.text}
            </h4>
          );
        }
        const runs = block.runs.map((run, j) => (
          <span key={j} className={cx(run.bold && 'font-semibold text-ink', run.italic && 'italic')}>
            {run.text}
          </span>
        ));
        if (block.type === 'bullet') {
          return (
            <p key={i} className="relative pl-5" style={{ marginLeft: block.level * 18 }}>
              <span className="absolute left-1 text-slate-400">{block.level === 0 ? '•' : '–'}</span>
              {runs}
            </p>
          );
        }
        return <p key={i}>{runs}</p>;
      })}
    </div>
  );
}

function MatchPanel({ job, resumes }: { job: Job; resumes: Resume[] }) {
  const [resumeId, setResumeId] = useState(
    (job.resumeRef?.kind === 'resume' ? job.resumeRef.id : '') || resumes.find((r) => r.isDefault)?.id || resumes[0]?.id || '',
  );
  const [report, setReport] = useState<MatchReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!resumeId || job.blocks.length === 0) return;
    let alive = true;
    setError('');
    send('job.match', { jobId: job.id, resume: { kind: 'resume', id: resumeId } }).then(
      (r) => alive && setReport(r),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : 'Could not compare.'),
    );
    return () => {
      alive = false;
    };
  }, [job.id, job.blocks.length, resumeId]);

  if (job.blocks.length === 0) return null;
  if (resumes.length === 0) return <Notice>Add a resume to see how well it matches this job’s keywords.</Notice>;

  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink">Keyword match</p>
          <p className="text-xs text-slate-500">How many of the skills and terms this posting asks for appear in a resume.</p>
        </div>
        <SelectField
          wrapClassName="w-56"
          aria-label="Resume to compare"
          placeholder={null}
          value={resumeId}
          onChange={setResumeId}
          options={resumes.map((r) => ({ value: r.id, label: r.name }))}
        />
      </div>
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {report && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3">
            <span data-testid="match-score" className={cx('text-2xl font-semibold tabular-nums', { green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600' }[scoreTone(report.score)])}>
              {report.score}%
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${report.score}%` }} />
            </div>
          </div>
          {report.missing.length > 0 && (
            <p className="text-[13px] text-slate-700">
              <span className="font-medium">Not in this resume: </span>
              {report.missing.map((k) => k.name).join(', ')}
            </p>
          )}
          {report.matched.length > 0 && (
            <p className="text-[13px] text-slate-700">
              <span className="font-medium">Found: </span>
              {report.matched.map((k) => k.name).join(', ')}
            </p>
          )}
          <p className="text-xs text-slate-500">Only add a missing skill to your resume if you genuinely have it.</p>
        </div>
      )}
    </div>
  );
}

function JobDetails({ job, resumes, tailored, onClose, navigate }: { job: Job; resumes: Resume[]; tailored: TailoredResume[]; onClose: () => void; navigate: (route: string) => void }) {
  const [notes, setNotes] = useState(job.notes);
  const [title, setTitle] = useState(job.title);
  const [company, setCompany] = useState(job.company);
  const [location, setLocation] = useState(job.location);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (notes !== job.notes || title !== job.title || company !== job.company || location !== job.location) {
      await send('job.update', { id: job.id, patch: { notes, title, company, location } });
    }
  };

  return (
    <Modal
      open
      wide
      onClose={() => {
        void save();
        onClose();
      }}
      title={[job.title, job.company].filter(Boolean).join(' at ') || 'Job'}
      footer={
        <>
          <Button
            icon={<FileDown size={15} />}
            busy={busy}
            disabled={job.blocks.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                const file = await send('pdf.job', { jobId: job.id });
                if (file) downloadBase64(file.base64, file.mime, file.name);
              } finally {
                setBusy(false);
              }
            }}
          >
            Posting PDF
          </Button>
          <Button icon={<ExternalLink size={15} />} onClick={() => void send('tab.open', { url: job.url })}>
            Open posting
          </Button>
          <Button
            icon={<UsersRound size={15} />}
            onClick={() => {
              void save();
              navigate(`/referrals/${job.id}`);
            }}
          >
            Find a referral
          </Button>
          <Button
            variant="primary"
            icon={<Sparkles size={15} />}
            disabled={job.blocks.length === 0}
            onClick={() => {
              void save();
              navigate(`/tailor/${job.id}`);
            }}
          >
            Tailor a resume
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label="Job title" value={title} onChange={setTitle} onBlur={() => void save()} />
          <TextField label="Company" value={company} onChange={setCompany} onBlur={() => void save()} />
          <TextField label="Location" value={location} onChange={setLocation} onBlur={() => void save()} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
          <span>From {SITE_NAMES[job.site as SiteId] ?? 'the web'}</span>
          <span>Saved {day(job.capturedAt)}</span>
          {job.appliedAt && <span>Applied {day(job.appliedAt)}</span>}
          {job.resumeRef && <span>Resume: {resumeLabel(job, resumes, tailored)}</span>}
        </div>
        <TextArea label="Notes" rows={3} placeholder="Contacts, interview dates, follow-ups…" value={notes} onChange={setNotes} onBlur={() => void save()} />
        <MatchPanel job={job} resumes={resumes} />
        <div>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">Job description</h3>
          <Description blocks={job.blocks} />
        </div>
      </div>
    </Modal>
  );
}

export function JobsPage({ navigate }: { navigate: (route: string) => void }) {
  const jobRecords = useCollection('jobs');
  const resumeRecords = useCollection('resumes');
  const tailoredRecords = useCollection('tailored');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Job | null>(null);

  const jobs = useMemo(() => (jobRecords ?? []).map((r) => r.data).sort((a, b) => (b.appliedAt ?? b.capturedAt) - (a.appliedAt ?? a.capturedAt)), [jobRecords]);
  const resumes = useMemo(() => (resumeRecords ?? []).map((r) => r.data), [resumeRecords]);
  const tailored = useMemo(() => (tailoredRecords ?? []).map((r) => r.data), [tailoredRecords]);
  const visible = jobs.filter((j) => matches(filter, j)).filter((j) => {
    const q = query.trim().toLowerCase();
    return !q || `${j.title} ${j.company} ${j.location} ${j.notes}`.toLowerCase().includes(q);
  });
  const open = jobs.find((j) => j.id === openId) ?? null;

  if (!jobRecords) return <Spinner className="h-6 w-6 text-slate-400" />;

  return (
    <>
      <PageHeader
        title="Applications"
        description="Every job you autofill is logged here, and marked as applied when you press the form’s submit button. Change the status as things move along."
        actions={
          <Button
            icon={<Download size={15} />}
            disabled={jobs.length === 0}
            onClick={() => downloadText(jobsToCsv(jobs, resumes, tailored), 'text/csv;charset=utf-8', `smartsubmit-applications-${new Date().toISOString().slice(0, 10)}.csv`)}
          >
            Export CSV
          </Button>
        }
      />

      {jobs.length === 0 ? (
        <EmptyState icon={<BriefcaseBusiness size={18} />} title="No applications yet">
          Open a job application and press Autofill in the SmartSubmit panel. The job shows up here, with a copy of its description.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Filter by status">
              {FILTERS.map((f) => {
                const count = jobs.filter((j) => matches(f.value, j)).length;
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.value}
                    onClick={() => setFilter(f.value)}
                    className={cx(
                      'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                      filter === f.value ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-ink',
                    )}
                  >
                    {f.label} <span className="ml-0.5 text-slate-400">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Search applications"
                placeholder="Search company, title or notes"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="block w-full rounded-lg border-0 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-slate-500">No applications match.</p>
          ) : (
            <ul className="space-y-2">
              {visible.map((job) => {
                const status = STATUSES.find((s) => s.value === job.status)!;
                return (
                  <li key={job.id} data-testid="job-row" className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(job.id)}>
                      <p className="truncate text-sm font-semibold text-ink">{job.title || 'Untitled job'}</p>
                      <p className="truncate text-[13px] text-slate-500">{[job.company, job.location].filter(Boolean).join(' · ')}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {job.appliedAt ? `Applied ${day(job.appliedAt)}` : `Saved ${day(job.capturedAt)}`}
                        {job.resumeRef ? ` · ${resumeLabel(job, resumes, tailored)}` : ''}
                      </p>
                    </button>
                    {job.score !== null && <Badge tone={scoreTone(job.score)}>{job.score}% match</Badge>}
                    <select
                      aria-label={`Status of ${job.title}`}
                      value={job.status}
                      onChange={(e) => void send('job.update', { id: job.id, patch: { status: e.target.value as JobStatus } })}
                      className="rounded-lg border-0 bg-white py-1.5 pl-3 pr-8 text-[13px] font-medium shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
                    >
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <span className="sr-only">{status.label}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" aria-label={`Open the posting for ${job.title}`} icon={<ExternalLink size={15} />} onClick={() => void send('tab.open', { url: job.url })} />
                      <Button variant="ghost" size="sm" aria-label={`Delete ${job.title}`} icon={<Trash2 size={15} />} onClick={() => setConfirmDelete(job)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {open && <JobDetails job={open} resumes={resumes} tailored={tailored} onClose={() => setOpenId(null)} navigate={navigate} />}

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Remove this application?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) {
                  const mutations: db.Mutation[] = [{ op: 'remove', collection: 'jobs', id: confirmDelete.id }];
                  for (const t of tailored) if (t.jobId === confirmDelete.id) mutations.push({ op: 'remove', collection: 'tailored', id: t.id });
                  await db.mutate(mutations);
                }
                setConfirmDelete(null);
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          “{confirmDelete?.title}” at {confirmDelete?.company || 'this company'} will be removed from your tracker, along with its saved
          description and any resume tailored for it.
        </p>
      </Modal>
    </>
  );
}
