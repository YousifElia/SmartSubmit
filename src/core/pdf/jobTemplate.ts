/**
 * A PDF copy of a job posting, so the description is still on hand after the
 * posting is taken down (often before the interview).
 */
import { PDFDocument, rgb } from 'pdf-lib';
import type { RichBlock } from '../types';
import { drawable, embedFonts, finish, GREY, INK, Layout, PAGE_SIZES, type FontBytes, type TextStyle } from './layout';

export interface JobPdfInput {
  title: string;
  company: string;
  location: string;
  url: string;
  capturedAt: number;
  blocks: RichBlock[];
}

const BODY: TextStyle = { size: 10.5, leading: 1.42, color: INK };
const SMALL: TextStyle = { size: 9, leading: 1.35, color: GREY };

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function renderJobPdf(job: JobPdfInput, options: { fonts: FontBytes; pageSize: 'letter' | 'a4' }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc, options.fonts);
  const setup = { ...PAGE_SIZES[options.pageSize], marginX: 60, marginTop: 56, marginBottom: 64 };
  const layout = new Layout(doc, fonts, setup);

  layout.paragraph([{ text: job.title || 'Job posting', bold: true }], { size: 19, leading: 1.25, color: INK }, { after: 4 });
  const line = [job.company, job.location].filter(Boolean).join('  ·  ');
  if (line) layout.paragraph([{ text: line }], { size: 11.5, leading: 1.35, color: INK }, { after: 6 });
  layout.paragraph([{ text: `Saved ${formatDate(job.capturedAt)} from ` }, { text: job.url, link: job.url }], SMALL, { after: 10 });
  layout.rule(0.8, rgb(0.8, 0.82, 0.86), 12);

  if (job.blocks.length === 0) {
    layout.paragraph([{ text: 'The description could not be read from this page.', italic: true }], BODY);
  }
  let previous: RichBlock['type'] | null = null;
  for (const block of job.blocks) {
    if (block.type === 'heading') {
      const style: TextStyle = { size: 12.5, leading: 1.3, color: INK };
      if (previous) layout.space(8);
      // Keep a heading with at least two lines of what follows.
      layout.ensure(style.size * style.leading + BODY.size * BODY.leading * 2);
      layout.paragraph([{ text: block.text, bold: true }], style, { after: 4 });
    } else if (block.type === 'bullet') {
      const indent = 8 + block.level * 14;
      layout.paragraph(block.runs, BODY, { x: indent, marker: block.level === 0 ? '•' : '–', markerIndent: 12, after: 2.5 });
    } else {
      if (previous === 'bullet') layout.space(4);
      layout.paragraph(block.runs, BODY, { after: 7 });
    }
    previous = block.type;
  }

  // Footer on every page.
  const pages = doc.getPages();
  const footer = drawable([job.company, job.title].filter(Boolean).join(' – '), fonts.regular);
  pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${pages.length}`;
    const size = 8.5;
    page.drawText(footer.length > 90 ? `${footer.slice(0, 87)}…` : footer, { x: setup.marginX, y: 34, size, font: fonts.regular, color: GREY });
    page.drawText(label, {
      x: setup.width - setup.marginX - fonts.regular.widthOfTextAtSize(label, size),
      y: 34,
      size,
      font: fonts.regular,
      color: GREY,
    });
  });

  return finish(doc, {
    title: [job.title, job.company].filter(Boolean).join(' – ') || 'Job posting',
    subject: 'Job posting',
  });
}

export function jobFileName(company: string, title: string): string {
  const clean = (text: string) =>
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  const parts = [clean(company), clean(title)].filter(Boolean);
  return `${parts.length > 0 ? parts.join('_') : 'Job'}_Posting.pdf`;
}
