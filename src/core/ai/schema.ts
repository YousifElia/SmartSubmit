/**
 * The shapes SmartSubmit asks AI models to reply in, and forgiving readers
 * for what comes back. Replies pasted from claude.ai arrive wrapped in prose
 * or code fences, and small local models get details wrong, so reading is
 * lenient: anything recognisable is kept, anything missing becomes empty.
 */
import { z } from 'zod';
import { emptyResumeDoc } from '../defaults';
import type { ResumeDoc, TailorChange } from '../types';

const str = z.string();
const list = z.array(z.string());

export const ResumeDocSchema = z.object({
  basics: z.object({ name: str, email: str, phone: str, location: str, links: list }),
  summary: str,
  experience: z.array(z.object({ company: str, title: str, location: str, start: str, end: str, bullets: list })),
  education: z.array(z.object({ school: str, degree: str, location: str, start: str, end: str, details: list })),
  projects: z.array(z.object({ name: str, subtitle: str, start: str, end: str, bullets: list })),
  skills: z.array(z.object({ category: str, items: list })),
  extras: z.array(z.object({ title: str, items: list })),
  order: list,
});

export const TailorSchema = z.object({
  resume: ResumeDocSchema,
  changes: z.array(z.object({ section: str, before: str, after: str, reason: str })),
  gaps: list,
});

/** JSON Schema for constraining a model's output. */
export function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

export class ReplyError extends Error {}

/** Find and parse the JSON object in a model's reply. */
export function extractJson(reply: string): unknown {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const attempts: string[] = [text];
  for (const fence of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) attempts.push(fence[1]!.trim());
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(text.slice(first, last + 1));

  for (const candidate of attempts) {
    for (const variant of [candidate, repair(candidate)]) {
      try {
        const value: unknown = JSON.parse(variant);
        if (value && typeof value === 'object') return value;
      } catch {
        // Try the next way of reading it.
      }
    }
  }
  throw new ReplyError(
    'That doesn’t look like the reply SmartSubmit asked for. Copy the whole reply (the copy button under it works best) and paste it again.',
  );
}

/** Fix what commonly breaks JSON copied out of a chat: trailing commas and curly quotes around keys. */
function repair(text: string): string {
  return text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[“”]([A-Za-z_][\w ]*)[“”]\s*:/g, '"$1":')
    .replace(/:\s*[“”]([^“”"]*)[“”]/g, ': "$1"');
}

const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(asString).filter(Boolean) : typeof v === 'string' && v.trim() ? v.split(/\n|;\s*/).map((s) => s.trim()).filter(Boolean) : [];
const asObjects = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)) : [];

/** Read a resume from anything shaped roughly like one. */
export function normalizeResumeDoc(raw: unknown): ResumeDoc {
  const doc = emptyResumeDoc();
  if (!raw || typeof raw !== 'object') return doc;
  const r = raw as Record<string, unknown>;
  const basics = (r.basics && typeof r.basics === 'object' ? r.basics : {}) as Record<string, unknown>;
  doc.basics = {
    name: asString(basics.name),
    email: asString(basics.email),
    phone: asString(basics.phone),
    location: asString(basics.location),
    links: asList(basics.links),
  };
  doc.summary = asString(r.summary);
  doc.experience = asObjects(r.experience).map((e) => ({
    company: asString(e.company),
    title: asString(e.title),
    location: asString(e.location),
    start: asString(e.start),
    end: asString(e.end),
    bullets: asList(e.bullets),
  }));
  doc.education = asObjects(r.education).map((e) => ({
    school: asString(e.school),
    degree: asString(e.degree),
    location: asString(e.location),
    start: asString(e.start),
    end: asString(e.end),
    details: asList(e.details),
  }));
  doc.projects = asObjects(r.projects).map((p) => ({
    name: asString(p.name),
    subtitle: asString(p.subtitle),
    start: asString(p.start),
    end: asString(p.end),
    bullets: asList(p.bullets),
  }));
  doc.skills = asObjects(r.skills)
    .map((g) => ({ category: asString(g.category), items: asList(g.items) }))
    .filter((g) => g.items.length > 0);
  doc.extras = asObjects(r.extras)
    .map((x) => ({ title: asString(x.title), items: asList(x.items) }))
    .filter((x) => x.title && x.items.length > 0);
  doc.order = asList(r.order);
  return doc;
}

export interface TailorReply {
  doc: ResumeDoc;
  changes: TailorChange[];
  gaps: string[];
}

/** Read a tailoring reply. Accepts the resume on its own, too. */
export function readTailorReply(reply: string): TailorReply {
  const value = extractJson(reply) as Record<string, unknown>;
  const resume = value.resume && typeof value.resume === 'object' ? value.resume : value;
  const doc = normalizeResumeDoc(resume);
  if (doc.experience.length + doc.education.length + doc.projects.length === 0) {
    throw new ReplyError('The reply doesn’t contain a resume. Copy the whole reply and paste it again.');
  }
  return {
    doc,
    changes: asObjects(value.changes)
      .map((c) => ({ section: asString(c.section), before: asString(c.before), after: asString(c.after), reason: asString(c.reason) }))
      .filter((c) => c.after || c.before),
    gaps: asList(value.gaps),
  };
}

/** Read a resume-parsing reply. */
export function readResumeReply(reply: string): ResumeDoc {
  const value = extractJson(reply) as Record<string, unknown>;
  return normalizeResumeDoc(value.resume && typeof value.resume === 'object' ? value.resume : value);
}

/** Clean a drafted answer: no preamble, quotes or sign-off. */
export function readDraftReply(reply: string): string {
  let text = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/^```[a-z]*\n?|```$/g, '').trim();
  text = text.replace(/^(here(’|')?s|here is|sure[,!]?|certainly[,!]?)[^\n]*:\s*\n+/i, '').trim();
  if (/^["“].*["”]$/s.test(text)) text = text.slice(1, -1).trim();
  return text;
}
