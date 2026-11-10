/**
 * Reading an uploaded resume file in the dashboard: its text, and its bytes
 * for attaching to applications unchanged.
 */
import { extractDocxText } from '@/core/resume/parseDocx';
import { linesFromItems, type TextItem } from '@/core/resume/pdfText';
import { bytesToBase64 } from '@/core/util/base64';

export interface ReadResume {
  name: string;
  mime: string;
  size: number;
  base64: string;
  text: string;
}

export const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
const MAX_BYTES = 8 * 1024 * 1024;

async function pdfText(bytes: Uint8Array): Promise<string> {
  // Loaded on demand: pdf.js is large and only needed when a PDF is uploaded.
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const pdf = await task.promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is typeof item & TextItem => 'str' in item);
      pages.push(linesFromItems(items).join('\n'));
    }
    return pages.join('\n\n').trim();
  } finally {
    await task.destroy();
  }
}

export async function readResumeFile(file: File): Promise<ReadResume> {
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 8 MB. Resumes are usually well under 1 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lower = file.name.toLowerCase();
  let text: string;
  let mime = file.type;

  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    mime = 'application/pdf';
    text = await pdfText(bytes);
    if (text.replace(/\s/g, '').length < 40) {
      throw new Error(
        'No text could be read from this PDF. It may be a scan or an image. Upload a text-based PDF or paste the text instead.',
      );
    }
  } else if (lower.endsWith('.docx')) {
    mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    text = extractDocxText(bytes);
  } else if (lower.endsWith('.txt') || file.type.startsWith('text/')) {
    mime = 'text/plain';
    text = new TextDecoder().decode(bytes);
  } else if (lower.endsWith('.doc')) {
    throw new Error('Old-style .doc files are not supported. Save it as .docx or PDF, or paste the text.');
  } else {
    throw new Error('Upload a PDF, a Word document (.docx) or a text file.');
  }

  return { name: file.name, mime, size: file.size, base64: bytesToBase64(bytes), text: text.trim() };
}
