// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { drawable, embedFonts } from '@/core/pdf/layout';
import { displayLink, renderResumePdf, resumeFileName, sectionOrder } from '@/core/pdf/resumeTemplate';
import { emptyResumeDoc } from '@/core/defaults';
import { sampleResumeDoc } from '../fixtures/sampleResume';
import { FONTS } from './fonts';

/** Extract a PDF's text the way an applicant tracking system would. */
function textOf(pdf: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), 'ss-pdf-'));
  const file = join(dir, 'out.pdf');
  writeFileSync(file, pdf);
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
}

describe('resume PDF', () => {
  it('is a one-page PDF whose text can be extracted in reading order', async () => {
    const pdf = await renderResumePdf(sampleResumeDoc(), { fonts: FONTS, pageSize: 'letter' });
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-');

    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getTitle()).toBe('Avery Testerson - Resume');
    expect(doc.getAuthor()).toBe('Avery Testerson');

    const text = textOf(pdf);
    const order = [
      'Avery Testerson',
      'avery.testerson@example.com',
      'EDUCATION',
      'University of Windsor',
      'Bachelor of Computer Science (Honours), Co-op',
      'EXPERIENCE',
      'Software Developer Co-op',
      'Example Robotics',
      'Built an internal dashboard',
      'Teaching Assistant, Data Structures',
      'PROJECTS',
      'ClearBudget',
      'SKILLS',
      'Languages: Python, TypeScript, Java, C, SQL',
      'AWARDS',
      "Dean's Honour List, 2024",
    ];
    let cursor = -1;
    for (const piece of order) {
      const at = text.indexOf(piece, cursor + 1);
      expect(at, `"${piece}" should appear after the previous piece`).toBeGreaterThan(cursor);
      cursor = at;
    }
    // Dates sit on the same line as the title they belong to.
    expect(text).toMatch(/Software Developer Co-op\s+Jan 2025 – Apr 2025/);
    // Links are shown without the scheme.
    expect(text).toContain('linkedin.com/in/avery-testerson-example');
    expect(text).not.toContain('https://');
  });

  it('stays small because fonts are subset', async () => {
    const pdf = await renderResumePdf(sampleResumeDoc(), { fonts: FONTS, pageSize: 'letter' });
    expect(pdf.length).toBeLessThan(120_000);
  });

  it('tightens the layout to keep a slightly long resume on one page', async () => {
    const resume = sampleResumeDoc();
    const extra = resume.experience[0]!;
    resume.experience.push({ ...extra, company: 'Second Co' }, { ...extra, company: 'Third Co' }, { ...extra, company: 'Fourth Co' });
    const pdf = await renderResumePdf(resume, { fonts: FONTS, pageSize: 'letter' });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    expect(textOf(pdf)).toContain('Fourth Co');
  });

  it('runs onto a second page when the content is genuinely long, losing nothing', async () => {
    const resume = sampleResumeDoc();
    const job = resume.experience[0]!;
    for (let i = 0; i < 12; i++) resume.experience.push({ ...job, company: `Company ${i}` });
    const pdf = await renderResumePdf(resume, { fonts: FONTS, pageSize: 'letter' });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
    const text = textOf(pdf);
    for (let i = 0; i < 12; i++) expect(text).toContain(`Company ${i}`);
  });

  it('supports A4', async () => {
    const pdf = await renderResumePdf(sampleResumeDoc(), { fonts: FONTS, pageSize: 'a4' });
    const { width, height } = (await PDFDocument.load(pdf)).getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it('copes with characters the font lacks instead of failing', async () => {
    const resume = sampleResumeDoc();
    resume.basics.name = 'Şebnem Öztürk → Dev ✓ 😀';
    resume.experience[0]!.bullets[0] = 'Shipped\tthe thing ≥ 99% “on time” — twice…';
    const pdf = await renderResumePdf(resume, { fonts: FONTS, pageSize: 'letter' });
    const text = textOf(pdf);
    expect(text).toContain('Sebnem Öztürk -> Dev x');
    // The tab and the non-breaking space come out as ordinary spaces.
    expect(text).toContain('Shipped the thing ≥ 99% “on time” — twice…');
  });

  it('renders an empty resume without throwing', async () => {
    const pdf = await renderResumePdf(emptyResumeDoc(), { fonts: FONTS, pageSize: 'letter' });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('breaks a word that is longer than the line', async () => {
    const resume = sampleResumeDoc();
    resume.summary = `See ${'averyveryverylongunbrokenstring'.repeat(8)} for details.`;
    resume.order = ['summary'];
    const pdf = await renderResumePdf(resume, { fonts: FONTS, pageSize: 'letter' });
    expect(textOf(pdf).replace(/\s/g, '')).toContain('averyveryverylongunbrokenstring'.repeat(8));
  });
});

describe('resume helpers', () => {
  it('orders sections as the resume says, then the rest, skipping empty ones', () => {
    const resume = sampleResumeDoc();
    expect(sectionOrder(resume)).toEqual(['education', 'experience', 'projects', 'skills', 'extra:Awards']);
    resume.order = ['skills', 'experience'];
    expect(sectionOrder(resume)).toEqual(['skills', 'experience', 'education', 'projects', 'extra:Awards']);
    resume.projects = [];
    resume.summary = 'A summary.';
    expect(sectionOrder(resume)).toEqual(['skills', 'experience', 'summary', 'education', 'extra:Awards']);
  });

  it('builds tidy file names', () => {
    expect(resumeFileName('Avery Testerson')).toBe('Avery_Testerson_Resume.pdf');
    expect(resumeFileName('Zoë O’Brien-Smith', 'Acme Robotics Inc.')).toBe('Zoe_O_Brien_Smith_Resume_Acme_Robotics_Inc.pdf');
    expect(resumeFileName('')).toBe('Resume.pdf');
  });

  it('shortens links for display', () => {
    expect(displayLink('https://www.linkedin.com/in/someone/')).toBe('linkedin.com/in/someone');
    expect(displayLink('github.com/someone')).toBe('github.com/someone');
  });

  it('substitutes or drops undrawable characters', async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedFonts(doc, FONTS);
    expect(drawable('a → b', fonts.regular)).toBe('a -> b');
    expect(drawable('naïve café', fonts.regular)).toBe('naïve café');
    expect(drawable('日本語 ok', fonts.regular)).toBe(' ok');
  });
});
