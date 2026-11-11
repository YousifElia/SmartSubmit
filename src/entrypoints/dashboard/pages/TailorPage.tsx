/**
 * Tailoring a resume to one job: choose a resume and how far to go, run it on
 * a local model or through claude.ai, review what changed, then save it as a
 * version for that application.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Cpu, Eye, MessageSquareQuote, ShieldCheck, Sparkles, Square, Trash2 } from 'lucide-react';
import { guardTailored, type GuardResult } from '@/core/ai/guard';
import { handoffText, tailorPrompt } from '@/core/ai/prompts';
import { AiError, clientFor } from '@/core/ai/providers';
import { runTailor } from '@/core/ai/run';
import { readTailorReply, type TailorReply } from '@/core/ai/schema';
import { jobKeywords, matchResume, resumeText, type MatchReport } from '@/core/jobs/keywords';
import { send, type TailorStrength } from '@/core/messages';
import { looksStructured, parseResumeText } from '@/core/resume/heuristics';
import * as db from '@/core/storage/db';
import type { Job, Resume, ResumeDoc, TailorChange, TailoredResume } from '@/core/types';
import { newId } from '@/core/util/id';
import { Handoff } from '@/ui/ai/Handoff';
import { OllamaOriginsHelp } from '@/ui/ai/AiSetup';
import { Badge, Button, Card, cx, EmptyState, Notice, PageHeader, Segmented, SelectField, Spinner } from '@/ui/kit';
import { useCollection, useSettings } from '@/ui/hooks';
import { PdfPreview } from '@/ui/resumes/PdfPreview';
import { ResumeEditor } from '@/ui/resumes/ResumeEditor';

const STRENGTHS: { value: TailorStrength; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Reorders for relevance and adjusts a few words. Your wording stays.' },
  { value: 'balanced', label: 'Balanced', hint: 'Rephrases bullets toward the posting’s language and trims what matters least.' },
  { value: 'strong', label: 'Strong', hint: 'Rewrites bullets and the summary around what this role needs most.' },
];

type Engine = 'local' | 'claude';

interface Result {
  reply: TailorReply;
  guard: GuardResult;
  via: TailoredResume['via'];
}

function docOf(resume: Resume): ResumeDoc {
  return resume.doc ?? parseResumeText(resume.text);
}

function ScoreChange({ before, after }: { before: MatchReport; after: MatchReport }) {
  const delta = after.score - before.score;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="tabular-nums text-slate-500">{before.score}%</span>
      <ArrowRight size={15} className="text-slate-400" />
      <span className="text-2xl font-semibold tabular-nums text-ink" data-testid="tailored-score">
        {after.score}%
      </span>
      <Badge tone={delta > 0 ? 'green' : delta < 0 ? 'red' : 'neutral'}>
        {delta > 0 ? `+${delta}` : delta} points
      </Badge>
      <span className="text-xs text-slate-500">keyword match with the posting</span>
    </div>
  );
}

function Changes({ changes }: { changes: TailorChange[] }) {
  if (changes.length === 0) return <p className="text-[13px] text-slate-500">The model didn’t list its changes. Compare the sections below with your original.</p>;
  return (
    <ul className="space-y-3">
      {changes.map((change, i) => (
        <li key={i} className="rounded-lg bg-slate-50 p-3 text-[13px] ring-1 ring-slate-200/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{change.section || 'Change'}</p>
          {change.before && <p className="mt-1 text-slate-500 line-through decoration-slate-300">{change.before}</p>}
          {change.after && <p className="mt-1 text-ink">{change.after}</p>}
          {change.reason && <p className="mt-1 text-xs italic text-slate-500">{change.reason}</p>}
        </li>
      ))}
    </ul>
  );
}

function Versions({ job, versions, resumes, onPreview }: { job: Job; versions: TailoredResume[]; resumes: Resume[]; onPreview: (t: TailoredResume) => void }) {
  if (versions.length === 0) return null;
  return (
    <Card title="Saved versions for this job">
      <ul className="space-y-2">
        {versions.map((t) => {
          const inUse = job.resumeRef?.kind === 'tailored' && job.resumeRef.id === t.id;
          return (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70" data-testid="tailored-version">
              <div className="text-[13px]">
                <span className="font-medium text-ink">From “{resumes.find((r) => r.id === t.resumeId)?.name ?? 'a deleted resume'}”</span>
                <span className="text-slate-500">
                  {' '}
                  · {new Date(t.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ·{' '}
                  {t.via === 'claude-handoff' ? 'Claude' : t.via === 'manual' ? 'edited by hand' : 'local model'}
                </span>
                {inUse && (
                  <span className="ml-2">
                    <Badge tone="green">Attached to this application</Badge>
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => onPreview(t)}>
                  Preview
                </Button>
                {!inUse && (
                  <Button variant="ghost" size="sm" onClick={() => void send('job.update', { id: job.id, patch: { resumeRef: { kind: 'tailored', id: t.id } } })}>
                    Use for this application
                  </Button>
                )}
                <Button variant="ghost" size="sm" aria-label="Delete this version" icon={<Trash2 size={14} />} onClick={() => void db.remove('tailored', t.id)} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function TailorPage({ jobId, navigate }: { jobId?: string; navigate: (route: string) => void }) {
  const jobs = useCollection('jobs');
  const resumeRecords = useCollection('resumes');
  const tailoredRecords = useCollection('tailored');
  const [settings] = useSettings();

  const job = jobs?.find((r) => r.id === jobId)?.data ?? null;
  const resumes = useMemo(() => (resumeRecords ?? []).map((r) => r.data).sort((a, b) => Number(b.isDefault) - Number(a.isDefault)), [resumeRecords]);
  const versions = useMemo(
    () => (tailoredRecords ?? []).map((r) => r.data).filter((t) => t.jobId === jobId).sort((a, b) => b.createdAt - a.createdAt),
    [tailoredRecords, jobId],
  );

  const [resumeId, setResumeId] = useState('');
  const [strength, setStrength] = useState<TailorStrength>('balanced');
  const [engine, setEngine] = useState<Engine | ''>('');
  const [phase, setPhase] = useState<'setup' | 'running' | 'handoff' | 'review'>('setup');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [edited, setEdited] = useState<ResumeDoc | null>(null);
  const [savedId, setSavedId] = useState('');
  const [preview, setPreview] = useState<{ title: string; doc?: ResumeDoc; tailoredId?: string } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const localReady = !!settings && !!clientFor(settings.ai) && (settings.ai.provider === 'ollama' ? !!settings.ai.ollamaModel : !!settings.ai.compatModel);
  const chosenEngine: Engine = engine || (localReady ? 'local' : 'claude');
  const resume = resumes.find((r) => r.id === resumeId) ?? resumes[0] ?? null;

  useEffect(() => () => abort.current?.abort(), []);

  const keywords = useMemo(() => (job ? jobKeywords(job.blocks) : []), [job]);
  const original = resume ? docOf(resume) : null;
  const originalText = resume && original ? resumeText(original, resume.text) : '';
  const before = useMemo(() => (original ? matchResume(keywords, originalText) : null), [keywords, original, originalText]);
  const current = edited ?? result?.guard.doc ?? null;
  const after = useMemo(() => (current ? matchResume(keywords, resumeText(current, '')) : null), [keywords, current]);

  if (!jobs || !resumeRecords || !tailoredRecords || !settings) return <Spinner className="h-6 w-6 text-slate-400" />;

  if (!job) {
    const candidates = jobs.map((r) => r.data).filter((j) => j.blocks.length > 0);
    return (
      <>
        <PageHeader title="Tailor a resume" description="Pick the job to tailor for. Jobs appear here once you autofill or save them from the SmartSubmit panel." />
        {candidates.length === 0 ? (
          <EmptyState icon={<Sparkles size={18} />} title="No saved jobs yet">
            Open a job application, then use “Tailor resume” in the SmartSubmit panel.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {candidates.map((j) => (
              <li key={j.id}>
                <button type="button" onClick={() => navigate(`/tailor/${j.id}`)} className="w-full rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/70 hover:ring-brand-300">
                  <p className="text-sm font-semibold text-ink">{j.title}</p>
                  <p className="text-[13px] text-slate-500">{[j.company, j.location].filter(Boolean).join(' · ')}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  const input = resume && original
    ? {
        resume: original,
        job: { title: job.title, company: job.company, location: job.location, description: job.description },
        strength,
        keywords: { matched: before?.matched.map((k) => k.name) ?? [], missing: before?.missing.map((k) => k.name) ?? [] },
      }
    : null;

  const accept = (reply: TailorReply, via: Result['via']) => {
    if (!original) return;
    const guard = guardTailored(original, originalText, reply.doc);
    setResult({ reply, guard, via });
    setEdited(null);
    setSavedId('');
    setPhase('review');
  };

  const runLocal = async () => {
    const client = clientFor(settings.ai);
    if (!client || !input) return;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setProgress(0);
    setPhase('running');
    try {
      const reply = await runTailor(client, input, { signal: controller.signal, onProgress: setProgress });
      accept(reply, settings.ai.provider === 'ollama' ? 'ollama' : 'openai-compat');
    } catch (e) {
      setPhase('setup');
      if (!(e instanceof AiError && e.kind === 'cancelled')) setError(e as Error);
    } finally {
      abort.current = null;
    }
  };

  const save = async () => {
    if (!result || !resume || !current) return;
    const record: TailoredResume = {
      id: newId(),
      resumeId: resume.id,
      jobId: job.id,
      doc: current,
      changes: result.reply.changes,
      gaps: result.reply.gaps,
      via: result.via,
      createdAt: Date.now(),
    };
    await db.put('tailored', record.id, record);
    await send('job.update', { id: job.id, patch: { resumeRef: { kind: 'tailored', id: record.id } } });
    setSavedId(record.id);
  };

  const gaps = (() => {
    const fromModel = result?.reply.gaps ?? [];
    const fromKeywords = after?.missing.filter((k) => k.kind === 'hard').map((k) => k.name) ?? [];
    const seen = new Set<string>();
    return [...fromKeywords, ...fromModel].filter((g) => {
      const key = g.toLowerCase();
      if (seen.has(key) || [...seen].some((s) => key.includes(s))) return false;
      seen.add(key);
      return true;
    });
  })();

  return (
    <>
      <button type="button" onClick={() => navigate('/jobs')} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-ink">
        <ArrowLeft size={14} /> Applications
      </button>
      <PageHeader title="Tailor your resume" description={`For ${job.title || 'this job'}${job.company ? ` at ${job.company}` : ''}. Nothing is invented: wording and order change, the facts stay yours.`} />

      <div className="space-y-6">
        {resumes.length === 0 ? (
          <Notice>
            Add a resume first.{' '}
            <button type="button" className="font-medium text-brand-700 underline" onClick={() => navigate('/resumes')}>
              Go to Resumes
            </button>
          </Notice>
        ) : phase !== 'review' ? (
          <Card>
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField label="Resume to start from" placeholder={null} value={resume?.id ?? ''} onChange={setResumeId} options={resumes.map((r) => ({ value: r.id, label: r.name }))} />
              {before && (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-slate-700">Keyword match now</p>
                  <p className="text-2xl font-semibold tabular-nums text-ink" data-testid="score-before">
                    {before.score}%
                  </p>
                </div>
              )}
            </div>
            {resume && !looksStructured(docOf(resume)) && (
              <div className="mt-4">
                <Notice tone="amber">
                  SmartSubmit couldn’t find this resume’s sections.{' '}
                  <button type="button" className="font-medium underline" onClick={() => navigate(`/resumes/${resume.id}`)}>
                    Check them on the Resumes page
                  </button>{' '}
                  first, so the result keeps your structure.
                </Notice>
              </div>
            )}
            <div className="mt-5">
              <Segmented<TailorStrength> label="How much to change" value={strength} onChange={(v) => setStrength(v || 'balanced')} options={STRENGTHS} hint={STRENGTHS.find((s) => s.value === strength)?.hint} />
            </div>
            <div className="mt-5">
              <p className="mb-1.5 text-[13px] font-medium text-slate-700">Use</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { value: 'local', icon: <Cpu size={17} />, title: 'Model on this computer', body: localReady ? `Automatic, with ${settings.ai.provider === 'ollama' ? settings.ai.ollamaModel : settings.ai.compatModel}.` : 'Not set up yet.' },
                    { value: 'claude', icon: <MessageSquareQuote size={17} />, title: 'Claude', body: 'Copy and paste through claude.ai, using your plan.' },
                  ] as const
                ).map((option) => {
                  const disabled = option.value === 'local' && !localReady;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabled}
                      aria-pressed={chosenEngine === option.value}
                      onClick={() => setEngine(option.value)}
                      className={cx(
                        'flex gap-3 rounded-xl p-3 text-left ring-1 transition-colors',
                        chosenEngine === option.value ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-slate-300',
                        disabled && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <span className="mt-0.5 text-brand-600">{option.icon}</span>
                      <span>
                        <span className="block text-sm font-medium text-ink">{option.title}</span>
                        <span className="block text-xs text-slate-500">
                          {option.body}{' '}
                          {disabled && (
                            <span role="link" tabIndex={0} className="font-medium text-brand-700 underline" onClick={() => navigate('/ai')}>
                              Set one up
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {phase === 'running' ? (
              <div className="mt-6 flex items-center gap-3">
                <Spinner className="h-5 w-5 text-brand-600" />
                <span className="text-sm text-slate-600" aria-live="polite">
                  {progress > 0 ? `Writing… ${progress.toLocaleString()} characters so far` : 'Waiting for the model to start… a local model can take a minute.'}
                </span>
                <Button size="sm" icon={<Square size={13} />} onClick={() => abort.current?.abort()}>
                  Stop
                </Button>
              </div>
            ) : phase === 'handoff' && input ? (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <Handoff request={handoffText(tailorPrompt(input))} onReply={(reply) => accept(readTailorReply(reply), 'claude-handoff')} replyLabel="Review the changes" />
              </div>
            ) : (
              <div className="mt-6">
                <Button variant="primary" icon={<Sparkles size={15} />} disabled={!input} onClick={() => (chosenEngine === 'local' ? void runLocal() : setPhase('handoff'))}>
                  Tailor resume
                </Button>
              </div>
            )}
            {error &&
              (error instanceof AiError && error.kind === 'origin' ? (
                <div className="mt-4">
                  <OllamaOriginsHelp />
                </div>
              ) : (
                <div className="mt-4">
                  <Notice tone="red">{error.message}</Notice>
                </div>
              ))}
          </Card>
        ) : null}

        {phase === 'review' && result && current && before && after && (
          <>
            <Card
              title="Review the tailored resume"
              description="Edit anything below before saving. The PDF is built from exactly what you see."
              actions={
                <>
                  <Button icon={<Eye size={15} />} onClick={() => setPreview({ title: 'Tailored resume (preview)', doc: current })}>
                    Preview PDF
                  </Button>
                  <Button variant="ghost" onClick={() => setPhase('setup')}>
                    Start over
                  </Button>
                </>
              }
            >
              <ScoreChange before={before} after={after} />
              {(result.guard.removed.length > 0 || result.guard.restored.length > 0) && (
                <div className="mt-4">
                  <Notice tone="amber">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheck size={15} /> SmartSubmit kept the facts to what your resume says
                    </p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5" data-testid="guard-notes">
                      {result.guard.removed.map((r) => (
                        <li key={`r-${r}`}>Took out: {r}</li>
                      ))}
                      {result.guard.restored.map((r) => (
                        <li key={`p-${r}`}>Put back as in your original: {r}</li>
                      ))}
                    </ul>
                  </Notice>
                </div>
              )}
              {gaps.length > 0 && (
                <div className="mt-4">
                  <Notice tone="sky">
                    <p className="font-semibold">The posting asks for things your resume doesn’t show</p>
                    <p className="mt-0.5">They were left out on purpose. If you have one of them, add it to your resume yourself; the next tailoring will use it.</p>
                    <p className="mt-1.5" data-testid="gaps">
                      {gaps.join(', ')}
                    </p>
                  </Notice>
                </div>
              )}
            </Card>

            <Card title="What changed">
              <Changes changes={result.reply.changes} />
            </Card>

            <ResumeEditor doc={current} onChange={(doc) => setEdited(doc)} />

            <Card>
              {savedId ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="green">Saved and attached to this application</Badge>
                  <span className="text-[13px] text-slate-600">The SmartSubmit panel will attach this version when you autofill this job.</span>
                  <Button icon={<Eye size={15} />} onClick={() => setPreview({ title: 'Tailored resume', tailoredId: savedId })}>
                    Download PDF
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" onClick={() => void save()}>
                    Save and use for this application
                  </Button>
                  <span className="text-xs text-slate-500">Your original resume is not changed.</span>
                </div>
              )}
            </Card>
          </>
        )}

        <Versions job={job} versions={versions} resumes={resumes} onPreview={(t) => setPreview({ title: 'Tailored resume', tailoredId: t.id })} />
      </div>

      {preview && (
        <PdfPreview
          title={preview.title}
          load={() =>
            preview.tailoredId
              ? send('resume.file', { kind: 'tailored', id: preview.tailoredId, company: job.company })
              : send('pdf.resume', { doc: preview.doc! })
          }
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
