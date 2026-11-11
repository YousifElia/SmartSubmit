/**
 * Turning a job description's HTML into plain, structured blocks.
 *
 * The HTML comes from job sites, so it is never inserted into any page: it is
 * parsed into an inert document (DOMParser does not run scripts or load
 * images) and only its text and basic structure are kept.
 */
import type { RichBlock, RichRun } from '../types';

const SKIP = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'IMG',
  'PICTURE',
  'VIDEO',
  'AUDIO',
  'IFRAME',
  'OBJECT',
  'BUTTON',
  'FORM',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'NAV',
]);

const BLOCK = new Set([
  'P',
  'DIV',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'MAIN',
  'ASIDE',
  'BLOCKQUOTE',
  'PRE',
  'TABLE',
  'TBODY',
  'THEAD',
  'TR',
  'TD',
  'TH',
  'DL',
  'DT',
  'DD',
  'FIGURE',
  'FIGCAPTION',
  'ADDRESS',
  'CENTER',
  'HR',
]);

interface Style {
  bold: boolean;
  italic: boolean;
}

/** A heading made of bold text in an ordinary paragraph: "<p><strong>What you'll do</strong></p>". */
function looksLikeHeading(runs: RichRun[]): boolean {
  const text = runs.map((r) => r.text).join('').trim();
  if (!text || text.length > 80 || /[.!?,;]$/.test(text)) return false;
  return runs.filter((r) => r.text.trim()).every((r) => r.bold);
}

function tidyRuns(runs: RichRun[]): RichRun[] {
  const out: RichRun[] = [];
  for (const run of runs) {
    const text = run.text.replace(/\s+/g, ' ');
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && !!last.bold === !!run.bold && !!last.italic === !!run.italic) last.text += text;
    else out.push({ text, ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}) });
  }
  // Trim the paragraph as a whole, not each run, so spaces between runs survive.
  if (out.length > 0) {
    out[0]!.text = out[0]!.text.replace(/^\s+/, '');
    out[out.length - 1]!.text = out[out.length - 1]!.text.replace(/\s+$/, '');
  }
  return out.filter((r) => r.text !== '');
}

/** Convert an element's content into blocks. */
export function elementToBlocks(root: Node): RichBlock[] {
  const blocks: RichBlock[] = [];
  let runs: RichRun[] = [];
  /** Nesting depth of the list item currently collecting text, or -1 outside lists. */
  let bulletLevel = -1;

  const flush = () => {
    const clean = tidyRuns(runs);
    runs = [];
    if (clean.length === 0) return;
    if (bulletLevel >= 0) blocks.push({ type: 'bullet', runs: clean, level: Math.min(bulletLevel, 3) });
    else if (looksLikeHeading(clean)) blocks.push({ type: 'heading', text: clean.map((r) => r.text).join('') });
    else blocks.push({ type: 'paragraph', runs: clean });
  };

  const walk = (node: Node, style: Style, listDepth: number) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/ /g, ' ');
      if (text) runs.push({ text, bold: style.bold, italic: style.italic });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName?.toUpperCase() ?? '';
    if (SKIP.has(tag)) return;
    if (el.getAttribute?.('aria-hidden') === 'true' || el.hasAttribute?.('hidden')) return;

    if (/^H[1-6]$/.test(tag)) {
      flush();
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) blocks.push({ type: 'heading', text });
      return;
    }
    if (tag === 'BR') {
      flush();
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      flush();
      const saved = bulletLevel;
      for (const child of el.childNodes) walk(child, style, listDepth + 1);
      flush();
      bulletLevel = saved;
      return;
    }
    if (tag === 'LI') {
      flush();
      const saved = bulletLevel;
      bulletLevel = Math.max(0, listDepth - 1);
      for (const child of el.childNodes) {
        // A nested list ends this item's own text.
        if (child.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test((child as Element).tagName)) {
          flush();
          walk(child, style, listDepth);
          bulletLevel = Math.max(0, listDepth - 1);
        } else {
          walk(child, style, listDepth);
        }
      }
      flush();
      bulletLevel = saved;
      return;
    }

    const isBlock = BLOCK.has(tag);
    if (isBlock && bulletLevel < 0) flush();
    const next: Style = {
      bold: style.bold || tag === 'STRONG' || tag === 'B',
      italic: style.italic || tag === 'EM' || tag === 'I',
    };
    for (const child of el.childNodes) walk(child, next, listDepth);
    if (isBlock && bulletLevel < 0) flush();
  };

  walk(root, { bold: false, italic: false }, 0);
  flush();
  return blocks;
}

/** Parse an HTML string (inertly) and convert it into blocks. */
export function htmlToBlocks(html: string): RichBlock[] {
  let source = html;
  // Some sites escape the description twice: "&lt;p&gt;…".
  if (!/<[a-z][\s\S]*>/i.test(source) && /&lt;[a-z]/i.test(source)) {
    source = new DOMParser().parseFromString(source, 'text/html').documentElement.textContent ?? '';
  }
  const doc = new DOMParser().parseFromString(source, 'text/html');
  return elementToBlocks(doc.body);
}

/** Plain text of blocks: headings and paragraphs separated by blank lines, bullets marked. */
export function blocksToText(blocks: RichBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === 'heading') {
      if (lines.length > 0) lines.push('');
      lines.push(block.text);
    } else if (block.type === 'bullet') {
      lines.push(`${'  '.repeat(block.level)}• ${block.runs.map((r) => r.text).join('')}`);
    } else {
      if (lines.length > 0 && !lines[lines.length - 1]!.startsWith('•')) lines.push('');
      lines.push(block.runs.map((r) => r.text).join(''));
    }
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Drop a leading heading that only repeats the job title. */
export function withoutTitle(blocks: RichBlock[], title: string): RichBlock[] {
  const first = blocks[0];
  const same = (a: string) => a.trim().toLowerCase() === title.trim().toLowerCase();
  if (first?.type === 'heading' && same(first.text)) return blocks.slice(1);
  return blocks;
}
