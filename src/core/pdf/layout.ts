/**
 * A small page-layout engine over pdf-lib.
 *
 * It lays out styled text top to bottom on as many pages as needed: wrapped
 * paragraphs, bullets with hanging indents, lines with a right-aligned part,
 * and rules. Text is drawn as real text in reading order, so the result can be
 * selected, searched and parsed by applicant tracking systems.
 *
 * The same code can run without drawing (`measureOnly`), which is how the
 * templates find out how many pages a document needs before committing.
 */
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';

export interface FontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
}

export interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Makes the run a clickable link. */
  link?: string;
  color?: RGB;
}

export interface TextStyle {
  /** Font size in points. */
  size: number;
  /** Line height as a multiple of the font size. */
  leading: number;
  color: RGB;
}

export interface PageSetup {
  width: number;
  height: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
}

export const PAGE_SIZES = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
} as const;

export const INK = rgb(0.07, 0.07, 0.09);
export const GREY = rgb(0.33, 0.35, 0.4);

/** Characters the bundled font lacks, with a close stand-in. */
const SUBSTITUTES: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '⇒': '=>',
  '✓': 'x',
  '✔': 'x',
  '▪': '•',
  '●': '•',
  '○': '•',
  '◦': '•',
  '■': '•',
  '‣': '•',
  '▸': '•',
  '⁃': '-',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '―': '—',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '\t': ' ',
  '​': '',
  '‌': '',
  '‍': '',
  '﻿': '',
  '­': '',
  '′': "'",
  '″': '"',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  'ß': 'ss',
};

/**
 * Make text drawable with the given font: swap characters it lacks for
 * stand-ins, strip accents it cannot draw, and drop what is left.
 */
export function drawable(text: string, font: PDFFont): string {
  const supported = supportedChars(font);
  let out = '';
  // Every kind of space becomes a plain one, even where the font has a glyph
  // for it: a non-breaking space in the PDF confuses text extraction.
  for (const char of text.replace(/[\t\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ')) {
    const code = char.codePointAt(0)!;
    if (supported.has(code)) {
      out += char;
      continue;
    }
    const swap = SUBSTITUTES[char];
    if (swap !== undefined) {
      out += [...swap].every((c) => supported.has(c.codePointAt(0)!)) ? swap : '';
      continue;
    }
    // An accented letter the font lacks: keep the base letter.
    const base = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    if (base && base !== char && [...base].every((c) => supported.has(c.codePointAt(0)!))) {
      out += base;
      continue;
    }
    // Control characters, emoji and other scripts are dropped.
  }
  return out;
}

const charSets = new WeakMap<PDFFont, Set<number>>();
function supportedChars(font: PDFFont): Set<number> {
  let set = charSets.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charSets.set(font, set);
  }
  return set;
}

export async function embedFonts(doc: PDFDocument, bytes: FontBytes): Promise<FontSet> {
  doc.registerFontkit(fontkit);
  // Subsetting keeps a one-page resume around 30 KB instead of 300 KB.
  const embed = (data: Uint8Array) => doc.embedFont(data, { subset: true });
  const [regular, bold, italic, boldItalic] = await Promise.all([
    embed(bytes.regular),
    embed(bytes.bold),
    embed(bytes.italic),
    embed(bytes.boldItalic),
  ]);
  return { regular, bold, italic, boldItalic };
}

interface Segment {
  text: string;
  font: PDFFont;
  width: number;
  color: RGB;
  link?: string;
}

interface Line {
  segments: Segment[];
  width: number;
}

export interface ParagraphOptions {
  /** Left edge, relative to the content area. Default 0. */
  x?: number;
  /** Width available. Default: to the right margin. */
  width?: number;
  /** A marker drawn in the margin of the first line (a bullet). */
  marker?: string;
  /** Indent of the text when a marker is used. */
  markerIndent?: number;
  align?: 'left' | 'center' | 'right';
  /** Space added below, in points. */
  after?: number;
}

export class Layout {
  /** Number of pages used so far. */
  pageCount = 0;
  /** Distance of the cursor from the top edge of the current page. */
  y = 0;
  readonly contentWidth: number;
  private page: PDFPage | null = null;

  constructor(
    private readonly doc: PDFDocument,
    readonly fonts: FontSet,
    readonly setup: PageSetup,
    private readonly measureOnly = false,
  ) {
    this.contentWidth = setup.width - 2 * setup.marginX;
    this.newPage();
  }

  private get bottom(): number {
    return this.setup.height - this.setup.marginBottom;
  }

  newPage(): void {
    this.pageCount++;
    this.y = this.setup.marginTop;
    if (!this.measureOnly) this.page = this.doc.addPage([this.setup.width, this.setup.height]);
  }

  /** Start a new page unless `height` more points fit on this one. */
  ensure(height: number): void {
    if (this.y + height > this.bottom && this.y > this.setup.marginTop) this.newPage();
  }

  space(points: number): void {
    this.y += points;
  }

  /** Space left on the current page. */
  get remaining(): number {
    return this.bottom - this.y;
  }

  fontFor(run: Pick<Run, 'bold' | 'italic'>): PDFFont {
    if (run.bold && run.italic) return this.fonts.boldItalic;
    if (run.bold) return this.fonts.bold;
    if (run.italic) return this.fonts.italic;
    return this.fonts.regular;
  }

  widthOf(runs: Run[], size: number): number {
    return runs.reduce((sum, run) => {
      const font = this.fontFor(run);
      return sum + font.widthOfTextAtSize(drawable(run.text, font), size);
    }, 0);
  }

  /** Break runs into lines no wider than `widths` allows (first line, then the rest). */
  private wrap(runs: Run[], style: TextStyle, firstWidth: number, restWidth: number): Line[] {
    const lines: Line[] = [];
    let current: Segment[] = [];
    let width = 0;
    let pendingSpace: Segment | null = null;
    const limit = () => (lines.length === 0 ? firstWidth : restWidth);

    const push = () => {
      lines.push({ segments: current, width });
      current = [];
      width = 0;
      pendingSpace = null;
    };

    const add = (segment: Segment) => {
      const last = current[current.length - 1];
      // Merge with the previous piece when the styling matches, to keep the PDF small.
      if (last && last.font === segment.font && last.color === segment.color && last.link === segment.link) {
        last.text += segment.text;
        last.width += segment.width;
      } else {
        current.push({ ...segment });
      }
      width += segment.width;
    };

    for (const run of runs) {
      const font = this.fontFor(run);
      const color = run.color ?? style.color;
      const text = drawable(run.text, font);
      // Words and the gaps between them; explicit newlines force a break.
      for (const token of text.split(/(\n|[ ]+)/)) {
        if (token === '') continue;
        if (token === '\n') {
          push();
          continue;
        }
        if (/^ +$/.test(token)) {
          if (current.length > 0) {
            pendingSpace = { text: ' ', font, width: font.widthOfTextAtSize(' ', style.size), color, link: run.link };
          }
          continue;
        }
        let word = token;
        let wordWidth = font.widthOfTextAtSize(word, style.size);
        const space: Segment | null = pendingSpace;
        const spaceWidth = space ? (space as Segment).width : 0;

        if (current.length > 0 && width + spaceWidth + wordWidth > limit()) {
          push();
        } else if (space) {
          add(space);
          pendingSpace = null;
        }

        // A single word longer than the line (a long URL) is split across lines.
        while (wordWidth > limit() && word.length > 1) {
          let cut = word.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), style.size) > limit()) cut--;
          const head = word.slice(0, cut);
          add({ text: head, font, width: font.widthOfTextAtSize(head, style.size), color, link: run.link });
          push();
          word = word.slice(cut);
          wordWidth = font.widthOfTextAtSize(word, style.size);
        }
        add({ text: word, font, width: wordWidth, color, link: run.link });
      }
    }
    if (current.length > 0) push();
    return lines;
  }

  /** Height a paragraph would take, without drawing it. */
  measure(runs: Run[], style: TextStyle, options: ParagraphOptions = {}): number {
    const indent = options.marker ? (options.markerIndent ?? 0) : 0;
    const width = (options.width ?? this.contentWidth - (options.x ?? 0)) - indent;
    const lines = this.wrap(runs, style, width, width);
    return lines.length * style.size * style.leading + (options.after ?? 0);
  }

  private drawLine(line: Line, x: number, baseline: number, style: TextStyle): void {
    if (this.measureOnly || !this.page) return;
    let cursor = x;
    for (const segment of line.segments) {
      const pdfY = this.setup.height - baseline;
      this.page.drawText(segment.text, { x: cursor, y: pdfY, size: style.size, font: segment.font, color: segment.color });
      if (segment.link) this.linkBox(segment.link, cursor, pdfY - style.size * 0.25, segment.width, style.size * 1.1);
      cursor += segment.width;
    }
  }

  private linkBox(url: string, x: number, y: number, width: number, height: number): void {
    const page = this.page!;
    const annotation = this.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    const ref = this.doc.context.register(annotation);
    const existing = page.node.Annots();
    if (existing) existing.push(ref);
    else page.node.set(PDFName.of('Annots'), this.doc.context.obj([ref]));
  }

  /** A wrapped paragraph, optionally with a bullet marker and hanging indent. */
  paragraph(runs: Run[], style: TextStyle, options: ParagraphOptions = {}): void {
    const x0 = this.setup.marginX + (options.x ?? 0);
    const indent = options.marker ? (options.markerIndent ?? 0) : 0;
    const fullWidth = options.width ?? this.contentWidth - (options.x ?? 0);
    const width = fullWidth - indent;
    const lines = this.wrap(runs, style, width, width);
    const lineHeight = style.size * style.leading;

    lines.forEach((line, index) => {
      this.ensure(lineHeight);
      // The baseline sits about 0.8 em below the top of the line box.
      const baseline = this.y + (lineHeight - style.size) / 2 + style.size * 0.8;
      let x = x0 + indent;
      if (options.align === 'center') x = x0 + (fullWidth - line.width) / 2;
      else if (options.align === 'right') x = x0 + fullWidth - line.width;
      if (index === 0 && options.marker && !this.measureOnly && this.page) {
        this.page.drawText(drawable(options.marker, this.fonts.regular), {
          x: x0,
          y: this.setup.height - baseline,
          size: style.size,
          font: this.fonts.regular,
          color: style.color,
        });
      }
      this.drawLine(line, x, baseline, style);
      this.y += lineHeight;
    });
    this.y += options.after ?? 0;
  }

  /**
   * One line with a left part and a right-aligned part (a job title and its
   * dates). The left part wraps under itself if it is long.
   */
  row(left: Run[], right: Run[], style: TextStyle, options: { after?: number } = {}): void {
    const rightWidth = this.widthOf(right, style.size);
    const gap = rightWidth > 0 ? style.size * 1.2 : 0;
    const leftWidth = Math.max(this.contentWidth - rightWidth - gap, this.contentWidth * 0.4);
    const lines = this.wrap(left, style, leftWidth, leftWidth);
    const lineHeight = style.size * style.leading;
    this.ensure(lineHeight * Math.max(lines.length, 1));

    const startY = this.y;
    lines.forEach((line) => {
      const baseline = this.y + (lineHeight - style.size) / 2 + style.size * 0.8;
      this.drawLine(line, this.setup.marginX, baseline, style);
      this.y += lineHeight;
    });
    if (lines.length === 0) this.y += lineHeight;

    if (rightWidth > 0) {
      const [rightLine] = this.wrap(right, style, Infinity, Infinity);
      if (rightLine) {
        const baseline = startY + (lineHeight - style.size) / 2 + style.size * 0.8;
        this.drawLine(rightLine, this.setup.marginX + this.contentWidth - rightLine.width, baseline, style);
      }
    }
    this.y += options.after ?? 0;
  }

  /** A horizontal line across the content area. */
  rule(thickness: number, color: RGB, after = 0): void {
    if (!this.measureOnly && this.page) {
      const y = this.setup.height - this.y - thickness / 2;
      this.page.drawLine({
        start: { x: this.setup.marginX, y },
        end: { x: this.setup.marginX + this.contentWidth, y },
        thickness,
        color,
      });
    }
    this.y += thickness + after;
  }
}

/** Convert the document to bytes with predictable metadata. */
export async function finish(doc: PDFDocument, meta: { title: string; author?: string; subject?: string; keywords?: string[] }): Promise<Uint8Array> {
  doc.setTitle(meta.title);
  if (meta.author) doc.setAuthor(meta.author);
  if (meta.subject) doc.setSubject(meta.subject);
  if (meta.keywords?.length) doc.setKeywords(meta.keywords);
  doc.setCreator('SmartSubmit');
  doc.setProducer('SmartSubmit (pdf-lib)');
  return doc.save();
}
