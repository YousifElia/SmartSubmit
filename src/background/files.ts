import { resumeAsText } from '@/core/ai/prompts';
import type { FilePayload, Handlers } from '@/core/messages';
import { renderPlainTextPdf, renderResumePdf, resumeFileName } from '@/core/pdf/resumeTemplate';
import { fullName } from '@/core/profile';
import { looksStructured, parseResumeText } from '@/core/resume/heuristics';
import * as db from '@/core/storage/db';
import type { ResumeDoc } from '@/core/types';
import { bytesToBase64 } from '@/core/util/base64';
import { loadFonts } from './fonts';

const PDF = 'application/pdf';

async function pdfOptions() {
  const [fonts, settings] = await Promise.all([loadFonts(), db.getSettings()]);
  return { fonts, pageSize: settings.pdf.pageSize };
}

/** Build a resume PDF from its structured form. */
export async function resumePdf(doc: ResumeDoc, fileName?: string): Promise<FilePayload> {
  const bytes = await renderResumePdf(doc, await pdfOptions());
  return { name: fileName ?? resumeFileName(doc.basics.name), mime: PDF, base64: bytesToBase64(bytes) };
}

/**
 * The file to attach for a stored resume: the original upload when there is
 * one, otherwise a PDF built from its sections (or, failing that, its text).
 */
export async function resumeFile(id: string): Promise<FilePayload | null> {
  const resume = await db.get('resumes', id);
  if (!resume) return null;

  if (resume.file) {
    const base64 = await db.getFile(resume.file.id);
    if (base64) return { name: resume.file.name, mime: resume.file.mime, base64 };
  }

  const profile = await db.getProfile();
  const doc = resume.doc ?? parseResumeText(resume.text);
  if (looksStructured(doc)) {
    // A pasted resume may not start with the name; the profile knows it.
    if (!doc.basics.name.trim()) doc.basics.name = fullName(profile);
    return resumePdf(doc, resumeFileName(doc.basics.name));
  }
  if (!resume.text.trim()) return null;
  const name = fullName(profile);
  const bytes = await renderPlainTextPdf(resume.text, { ...(await pdfOptions()), title: name ? `${name} - Resume` : 'Resume' });
  return { name: resumeFileName(name), mime: PDF, base64: bytesToBase64(bytes) };
}

/** The file to attach for a resume tailored to one job. */
export async function tailoredFile(id: string, company?: string): Promise<FilePayload | null> {
  const tailored = await db.get('tailored', id);
  if (!tailored) return null;
  const job = company ? null : await db.get('jobs', tailored.jobId);
  return resumePdf(tailored.doc, resumeFileName(tailored.doc.basics.name, company ?? job?.company));
}

/** A resume as text: as pasted or read from its file, or a tailored version's sections. */
export async function resumeText(kind: 'resume' | 'tailored', id: string): Promise<string | null> {
  if (kind === 'tailored') {
    const tailored = await db.get('tailored', id);
    return tailored ? plainResume(tailored.doc) : null;
  }
  const resume = await db.get('resumes', id);
  if (!resume) return null;
  return resume.text.trim() || (resume.doc ? plainResume(resume.doc) : null);
}

/** A structured resume written out as a person would type it. */
function plainResume(doc: ResumeDoc): string {
  const contact = [doc.basics.email, doc.basics.phone, doc.basics.location, ...doc.basics.links].filter(Boolean).join(' | ');
  return [doc.basics.name, contact, '', resumeAsText({ ...doc, basics: { ...doc.basics, name: '' } }, '')].join('\n').trim();
}

export const fileHandlers = {
  'resume.file': ({ kind, id, company }) => (kind === 'resume' ? resumeFile(id) : tailoredFile(id, company)),
  'resume.text': ({ kind, id }) => resumeText(kind, id),
  'pdf.resume': ({ doc, fileName }) => resumePdf(doc, fileName),
} satisfies Partial<Handlers>;
