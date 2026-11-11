/** CSV export of the application tracker. */
import type { Job, Resume, TailoredResume } from '../types';

/**
 * One CSV cell. Text from job sites is untrusted: a cell starting with "=",
 * "+", "-" or "@" would run as a formula in a spreadsheet, so it is prefixed
 * with an apostrophe to keep it plain text.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const STATUS: Record<Job['status'], string> = {
  saved: 'Saved',
  started: 'Started',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

function day(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function jobsToCsv(jobs: Job[], resumes: Resume[], tailored: TailoredResume[]): string {
  const resumeName = (job: Job): string => {
    const ref = job.resumeRef;
    if (!ref) return '';
    if (ref.kind === 'resume') return resumes.find((r) => r.id === ref.id)?.name ?? '';
    const t = tailored.find((x) => x.id === ref.id);
    const base = t ? resumes.find((r) => r.id === t.resumeId)?.name : '';
    return base ? `${base} (tailored)` : 'Tailored resume';
  };
  const header = ['Company', 'Job title', 'Location', 'Status', 'Applied', 'Saved', 'Keyword match', 'Resume', 'Link', 'Notes'];
  const rows = jobs.map((job) => [
    job.company,
    job.title,
    job.location,
    STATUS[job.status],
    day(job.appliedAt),
    day(job.capturedAt),
    job.score === null ? '' : `${job.score}%`,
    resumeName(job),
    job.url,
    job.notes,
  ]);
  // A byte-order mark so Excel reads accented names correctly.
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
