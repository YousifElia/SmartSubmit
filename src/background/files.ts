import type { FilePayload, Handlers } from '@/core/messages';
import * as db from '@/core/storage/db';

/** The file to attach for a stored resume: the original upload when there is one. */
export async function resumeFile(id: string): Promise<FilePayload | null> {
  const resume = await db.get('resumes', id);
  if (!resume?.file) return null;
  const base64 = await db.getFile(resume.file.id);
  return base64 ? { name: resume.file.name, mime: resume.file.mime, base64 } : null;
}

export const fileHandlers = {
  'resume.file': ({ kind, id }) => (kind === 'resume' ? resumeFile(id) : null),
} satisfies Partial<Handlers>;
