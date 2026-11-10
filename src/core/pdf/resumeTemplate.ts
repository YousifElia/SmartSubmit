/**
 * The resume template: one column, standard section headings, real text.
 *
 * Built to be read correctly by applicant tracking systems first and to look
 * tidy second. If the content slightly overflows one page, type and spacing
 * are tightened in small steps until it fits; a resume that is genuinely
 * longer simply runs onto a second page.
 */
import { PDFDocument } from 'pdf-lib';
import type { ResumeDoc } from '../types';
import { embedFonts, finish, GREY, INK, Layout, PAGE_SIZES, type FontBytes, type FontSet, type Run, type TextStyle } from './layout';

export interface ResumePdfOptions {
  fonts: FontBytes;
  pageSize: 'letter' | 'a4';
}

interface Scale {
  body: number;
  name: number;
  heading: number;
  leading: number;
  marginX: number;
  marginY: number;
  /** Multiplier on the gaps between blocks. */
  gap: number;
}

/** From comfortable to compact. The first that fits on one page is used. */
const SCALES: Scale[] = [
  { body: 10.5, name: 23, heading: 11, leading: 1.34, marginX: 52, marginY: 48, gap: 1 },
  { body: 10, name: 22, heading: 10.5, leading: 1.3, marginX: 48, marginY: 42, gap: 0.88 },
  { body: 9.5, name: 21, heading: 10, leading: 1.27, marginX: 44, marginY: 38, gap: 0.76 },
  { body: 9, name: 20, heading: 9.5, leading: 1.24, marginX: 40, marginY: 34, gap: 0.64 },
];

const DEFAULT_ORDER = ['summary', 'education', 'experience', 'projects', 'skills'];

/** The sections to print, in order, skipping empty ones. */
export function sectionOrder(resume: ResumeDoc): string[] {
  const extras = resume.extras.map((e) => `extra:${e.title}`);
  const known = new Set([...DEFAULT_ORDER, ...extras]);
  const listed = (resume.order ?? []).filter((key) => known.has(key));
  const order = [...new Set([...listed, ...DEFAULT_ORDER, ...extras])];
  return order.filter((key) => {
    switch (key) {
      case 'summary':
        return resume.summary.trim() !== '';
      case 'education':
        return resume.education.length > 0;
      case 'experience':
        return resume.experience.length > 0;
      case 'projects':
        return resume.projects.length > 0;
      case 'skills':
        return resume.skills.some((g) => g.items.length > 0);
      default: {
        const extra = resume.extras.find((e) => `extra:${e.title}` === key);
        return !!extra && extra.items.length > 0;
      }
    }
  });
}

function dateRange(start: string, end: string): string {
  const a = start.trim();
  const b = end.trim();
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a || b;
}

/** A link as people write it on a resume: no scheme, no trailing slash. */
export function displayLink(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

function hrefFor(link: string): string {
  const t = link.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
  return `https://${t}`;
}

function draw(layout: Layout, resume: ResumeDoc, scale: Scale): void {
  const body: TextStyle = { size: scale.body, leading: scale.leading, color: INK };
  const gap = (points: number) => points * scale.gap;
  const bulletIndent = scale.body * 1.05;

  // ── Header ──
  const name = resume.basics.name.trim();
  if (name) {
    layout.paragraph([{ text: name, bold: true }], { size: scale.name, leading: 1.2, color: INK }, { align: 'center', after: gap(3) });
  }
  const contact: Run[] = [];
  const addContact = (run: Run) => {
    if (contact.length > 0) contact.push({ text: '  |  ', color: GREY });
    contact.push(run);
  };
  if (resume.basics.email.trim()) addContact({ text: resume.basics.email.trim(), link: `mailto:${resume.basics.email.trim()}` });
  if (resume.basics.phone.trim()) addContact({ text: resume.basics.phone.trim() });
  if (resume.basics.location.trim()) addContact({ text: resume.basics.location.trim() });
  for (const link of resume.basics.links) {
    if (link.trim()) addContact({ text: displayLink(link), link: hrefFor(link) });
  }
  if (contact.length > 0) layout.paragraph(contact, body, { align: 'center' });
  layout.space(gap(8));

  const heading = (title: string, keepWith: number) => {
    const style: TextStyle = { size: scale.heading, leading: 1.25, color: INK };
    // Keep a heading with the start of its section rather than stranding it at a page end.
    layout.ensure(style.size * style.leading + 4 + keepWith);
    layout.paragraph([{ text: title.toUpperCase(), bold: true }], style, { after: 1.5 });
    layout.rule(0.7, GREY, gap(4.5));
  };

  const bullets = (items: string[]) => {
    for (const item of items) {
      if (!item.trim()) continue;
      layout.paragraph([{ text: item.trim() }], body, { x: 6, marker: '•', markerIndent: bulletIndent, after: gap(1.2) });
    }
  };

  const lineHeight = scale.body * scale.leading;
  /** Height of an entry's heading rows plus its first bullet, to keep them together. */
  const entryHead = (rows: number, firstBullet: string | undefined) =>
    rows * lineHeight + (firstBullet ? layout.measure([{ text: firstBullet }], body, { x: 6, marker: '•', markerIndent: bulletIndent }) : 0);

  for (const key of sectionOrder(resume)) {
    if (key === 'summary') {
      heading('Summary', lineHeight * 2);
      layout.paragraph([{ text: resume.summary.trim() }], body, { after: gap(8) });
      continue;
    }

    if (key === 'education') {
      heading('Education', entryHead(2, undefined));
      resume.education.forEach((edu, i) => {
        const hasSecond = !!(edu.degree.trim() || dateRange(edu.start, edu.end));
        layout.ensure(entryHead(hasSecond ? 2 : 1, edu.details[0]));
        layout.row([{ text: edu.school.trim() || edu.degree.trim(), bold: true }], [{ text: edu.location.trim() }], body);
        if (hasSecond && edu.school.trim()) {
          layout.row([{ text: edu.degree.trim(), italic: true }], [{ text: dateRange(edu.start, edu.end), italic: true }], body);
        }
        layout.space(gap(1.5));
        bullets(edu.details);
        layout.space(gap(i === resume.education.length - 1 ? 7 : 5));
      });
      continue;
    }

    if (key === 'experience') {
      heading('Experience', entryHead(2, resume.experience[0]?.bullets[0]));
      resume.experience.forEach((job, i) => {
        const title = job.title.trim();
        const company = job.company.trim();
        const second = !!(title && company) || !!job.location.trim();
        layout.ensure(entryHead(second ? 2 : 1, job.bullets[0]));
        layout.row([{ text: title || company, bold: true }], [{ text: dateRange(job.start, job.end) }], body);
        if (second) {
          layout.row([{ text: title ? company : '', italic: true }], [{ text: job.location.trim(), italic: true }], body);
        }
        layout.space(gap(1.5));
        bullets(job.bullets);
        layout.space(gap(i === resume.experience.length - 1 ? 7 : 5));
      });
      continue;
    }

    if (key === 'projects') {
      heading('Projects', entryHead(1, resume.projects[0]?.bullets[0]));
      resume.projects.forEach((project, i) => {
        layout.ensure(entryHead(1, project.bullets[0]));
        const left: Run[] = [{ text: project.name.trim(), bold: true }];
        if (project.subtitle.trim()) left.push({ text: '  |  ', color: GREY }, { text: project.subtitle.trim(), italic: true });
        layout.row(left, [{ text: dateRange(project.start, project.end) }], body);
        layout.space(gap(1.5));
        bullets(project.bullets);
        layout.space(gap(i === resume.projects.length - 1 ? 7 : 5));
      });
      continue;
    }

    if (key === 'skills') {
      heading('Skills', lineHeight);
      for (const group of resume.skills) {
        if (group.items.length === 0) continue;
        const runs: Run[] = [];
        if (group.category.trim()) runs.push({ text: `${group.category.trim()}: `, bold: true });
        runs.push({ text: group.items.map((s) => s.trim()).filter(Boolean).join(', ') });
        layout.paragraph(runs, body, { after: gap(1.5) });
      }
      layout.space(gap(6));
      continue;
    }

    const extra = resume.extras.find((e) => `extra:${e.title}` === key);
    if (extra) {
      heading(extra.title, lineHeight);
      if (extra.items.length === 1) layout.paragraph([{ text: extra.items[0]!.trim() }], body, { after: gap(1.5) });
      else bullets(extra.items);
      layout.space(gap(6));
    }
  }
}

function pageSetup(pageSize: 'letter' | 'a4', scale: Scale) {
  return { ...PAGE_SIZES[pageSize], marginX: scale.marginX, marginTop: scale.marginY, marginBottom: scale.marginY };
}

/** Choose the roomiest scale at which the resume fits on a single page. */
function chooseScale(doc: PDFDocument, fonts: FontSet, resume: ResumeDoc, pageSize: 'letter' | 'a4'): Scale {
  for (const scale of SCALES) {
    const trial = new Layout(doc, fonts, pageSetup(pageSize, scale), true);
    draw(trial, resume, scale);
    if (trial.pageCount === 1) return scale;
  }
  // Too long for one page at any size: lay it out comfortably over two.
  return SCALES[1]!;
}

/** Render a resume to PDF bytes. */
export async function renderResumePdf(resume: ResumeDoc, options: ResumePdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc, options.fonts);
  const scale = chooseScale(doc, fonts, resume, options.pageSize);
  draw(new Layout(doc, fonts, pageSetup(options.pageSize, scale)), resume, scale);

  const name = resume.basics.name.trim();
  return finish(doc, {
    title: name ? `${name} - Resume` : 'Resume',
    author: name || undefined,
    subject: 'Resume',
    keywords: resume.skills.flatMap((g) => g.items).slice(0, 40),
  });
}

/** A tidy file name: Avery_Testerson_Resume.pdf, or with the company appended. */
export function resumeFileName(name: string, company?: string): string {
  const clean = (text: string) =>
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const parts = [clean(name) || 'Resume'];
  if (clean(name)) parts.push('Resume');
  if (company && clean(company)) parts.push(clean(company));
  return `${parts.join('_')}.pdf`;
}
