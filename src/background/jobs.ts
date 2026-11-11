import type { FilePayload, Handlers, JobPatch, ResumeRef } from '@/core/messages';
import type { JobCapture } from '@/core/jobs/extract';
import { jobKeywords, matchResume, resumeText, type MatchReport } from '@/core/jobs/keywords';
import { jobFileName, renderJobPdf } from '@/core/pdf/jobTemplate';
import * as db from '@/core/storage/db';
import type { Job, JobStatus, RichBlock } from '@/core/types';
import { bytesToBase64 } from '@/core/util/base64';
import { newId } from '@/core/util/id';
import { loadFonts } from './fonts';

/** How far along an application is. Rejected and withdrawn are final. */
const RANK: Record<JobStatus, number> = { saved: 0, started: 1, applied: 2, interviewing: 3, offer: 4, rejected: 5, withdrawn: 5 };

export async function findJobByKey(key: string): Promise<Job | null> {
  return (await db.list('jobs')).find((r) => r.data.key === key)?.data ?? null;
}

export async function upsertJob(capture: JobCapture, status?: JobStatus, resume?: ResumeRef | null): Promise<Job> {
  const existing = await findJobByKey(capture.key);
  const now = Date.now();
  const job: Job = existing
    ? {
        ...existing,
        url: existing.url || capture.url,
        // What the user corrected in the tracker wins over what a page says.
        title: existing.title || capture.title,
        company: existing.company || capture.company,
        location: existing.location || capture.location,
        // Keep the fullest description seen: a page can load without it.
        ...(capture.description.length > existing.description.length ? { description: capture.description, blocks: capture.blocks } : {}),
      }
    : {
        id: newId(),
        key: capture.key,
        site: capture.site,
        url: capture.url,
        title: capture.title,
        company: capture.company,
        location: capture.location,
        description: capture.description,
        blocks: capture.blocks,
        capturedAt: now,
        status: 'saved',
        appliedAt: null,
        resumeRef: null,
        notes: '',
        score: null,
      };
  if (status && RANK[status] > RANK[job.status] && RANK[job.status] < RANK.rejected) {
    job.status = status;
    if (RANK[status] >= RANK.applied && !job.appliedAt) job.appliedAt = now;
  }
  if (resume) job.resumeRef = resume;
  if (!existing || JSON.stringify(existing) !== JSON.stringify(job)) await db.put('jobs', job.id, job);
  return job;
}

export async function updateJob(id: string, patch: JobPatch): Promise<Job | null> {
  const job = await db.get('jobs', id);
  if (!job) return null;
  const next: Job = { ...job, ...patch };
  // Moving to "applied" or beyond stamps the date, unless the user set one.
  if (patch.status && RANK[patch.status] >= RANK.applied && !next.appliedAt && patch.appliedAt === undefined) next.appliedAt = Date.now();
  if (patch.status && RANK[patch.status] < RANK.applied && patch.appliedAt === undefined) next.appliedAt = null;
  await db.put('jobs', id, next);
  return next;
}

/** Text of whichever resume a reference points at. */
async function resumeTextOf(ref: ResumeRef): Promise<string | null> {
  if (ref.kind === 'tailored') {
    const tailored = await db.get('tailored', ref.id);
    return tailored ? resumeText(tailored.doc, '') : null;
  }
  const resume = await db.get('resumes', ref.id);
  return resume ? resumeText(resume.doc, resume.text) : null;
}

export async function matchJob(input: { jobId?: string; blocks?: RichBlock[]; resume: ResumeRef }): Promise<MatchReport> {
  const job = input.jobId ? await db.get('jobs', input.jobId) : null;
  if (input.jobId && !job) throw new Error('That job is no longer tracked.');
  const blocks = job?.blocks ?? input.blocks ?? [];
  const text = await resumeTextOf(input.resume);
  if (text === null) throw new Error('That resume no longer exists.');
  const report = matchResume(jobKeywords(blocks), text);
  if (job && job.score !== report.score) await db.put('jobs', job.id, { ...job, score: report.score });
  return report;
}

export async function jobPdf(jobId: string): Promise<FilePayload | null> {
  const job = await db.get('jobs', jobId);
  if (!job) return null;
  const [fonts, settings] = await Promise.all([loadFonts(), db.getSettings()]);
  const bytes = await renderJobPdf(job, { fonts, pageSize: settings.pdf.pageSize });
  return { name: jobFileName(job.company, job.title), mime: 'application/pdf', base64: bytesToBase64(bytes) };
}

export const jobHandlers = {
  'job.upsert': ({ job, status, resume }) => upsertJob(job, status, resume),
  'job.update': ({ id, patch }) => updateJob(id, patch),
  'job.find': ({ key }) => findJobByKey(key),
  'job.match': (input) => matchJob(input),
  'pdf.job': ({ jobId }) => jobPdf(jobId),
  'tailored.forJob': async ({ jobId }) => (await db.list('tailored')).map((r) => r.data).filter((t) => t.jobId === jobId),
} satisfies Partial<Handlers>;
