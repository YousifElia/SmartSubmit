/**
 * Plain text from a .docx file.
 *
 * A .docx is a zip whose `word/document.xml` holds the body as paragraphs of
 * text runs. Reading those directly is enough for a resume and avoids pulling
 * in a full Word converter.
 */
import { strFromU8, unzipSync } from 'fflate';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const point = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function paragraphText(xml: string): string {
  let out = '';
  // Text runs, tabs and line breaks, in document order.
  const token = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/g;
  for (let match = token.exec(xml); match; match = token.exec(xml)) {
    if (match[1] !== undefined) out += decode(match[1]);
    else if (match[0].startsWith('<w:tab')) out += '\t';
    else out += '\n';
  }
  return out;
}

/** Extract the text of a .docx, one line per paragraph, with list items marked as bullets. */
export function extractDocxText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => file.name === 'word/document.xml' });
  } catch {
    throw new Error('This file could not be opened as a Word document.');
  }
  const xmlBytes = files['word/document.xml'];
  if (!xmlBytes) throw new Error('This does not look like a Word document (.docx).');
  const xml = strFromU8(xmlBytes);

  const lines: string[] = [];
  // Self-closing (empty) paragraphs first, so they are not mistaken for an opening tag.
  const paragraph = /<w:p\b[^>]*\/>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  for (let match = paragraph.exec(xml); match; match = paragraph.exec(xml)) {
    const inner = match[1] ?? '';
    const text = paragraphText(inner).replace(/[  ]+$/g, '');
    const isListItem = /<w:numPr\b/.test(inner);
    lines.push(isListItem && text.trim() ? `• ${text.trim()}` : text);
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
