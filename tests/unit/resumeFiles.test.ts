// @vitest-environment node
import { strToU8, zipSync } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { renderResumePdf } from '@/core/pdf/resumeTemplate';
import { parseResumeText } from '@/core/resume/heuristics';
import { extractDocxText } from '@/core/resume/parseDocx';
import { linesFromItems, type TextItem } from '@/core/resume/pdfText';
import { sampleResumeDoc } from '../fixtures/sampleResume';
import { FONTS } from './fonts';

function docx(body: string): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  return zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<Types/>') });
}
const p = (text: string, list = false) =>
  `<w:p>${list ? '<w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>' : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

describe('extractDocxText', () => {
  it('reads paragraphs, list items, tabs and entities', () => {
    const bytes = docx(
      p('Jordan Lee') +
        p('jordan@example.com') +
        '<w:p/>' +
        p('EXPERIENCE') +
        '<w:p><w:r><w:t>Intern | R&amp;D Labs</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>May 2025 - Aug 2025</w:t></w:r></w:p>' +
        p('Built a thing &#8212; fast', true) +
        p('Split across</w:t></w:r><w:r><w:t xml:space="preserve"> two runs', true),
    );
    expect(extractDocxText(bytes)).toBe(
      ['Jordan Lee', 'jordan@example.com', '', 'EXPERIENCE', 'Intern | R&D Labs\tMay 2025 - Aug 2025', '• Built a thing — fast', '• Split across two runs'].join('\n'),
    );
  });

  it('feeds the parser well enough to find the entry', () => {
    const bytes = docx(p('Jordan Lee') + p('EXPERIENCE') + '<w:p><w:r><w:t>Intern | Acme</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>May 2025 - Aug 2025</w:t></w:r></w:p>' + p('Did work', true));
    const doc = parseResumeText(extractDocxText(bytes));
    expect(doc.experience[0]).toMatchObject({ title: 'Intern', company: 'Acme', start: 'May 2025', end: 'Aug 2025', bullets: ['Did work'] });
  });

  it('rejects files that are not Word documents', () => {
    expect(() => extractDocxText(new Uint8Array([1, 2, 3, 4]))).toThrow(/Word document/);
    expect(() => extractDocxText(zipSync({ 'other.txt': strToU8('x') }))).toThrow(/does not look like a Word document/);
  });
});

describe('linesFromItems', () => {
  const item = (str: string, x: number, y: number, width: number, size = 10): TextItem => ({ str, transform: [size, 0, 0, size, x, y], width, height: size });

  it('groups by baseline, orders left to right and marks wide gaps', () => {
    const lines = linesFromItems([
      item('Apr 2025', 480, 700, 40),
      item('Software', 50, 700, 40),
      item('Developer', 93, 700, 45),
      item('Second line', 50, 686, 60),
      item('After a gap', 50, 640, 60),
    ]);
    expect(lines).toEqual(['Software Developer    Apr 2025', 'Second line', '', 'After a gap']);
  });
});

describe('PDF upload round trip', () => {
  it('reads our own PDF with pdf.js and parses it back into sections', async () => {
    const original = sampleResumeDoc();
    const pdf = await renderResumePdf(original, { fonts: FONTS, pageSize: 'letter' });
    const loaded = await getDocument({ data: pdf.slice(), useSystemFonts: false }).promise;
    const page = await loaded.getPage(1);
    const content = await page.getTextContent();
    const text = linesFromItems(content.items.filter((i): i is typeof i & TextItem => 'str' in i)).join('\n');
    const doc = parseResumeText(text);

    expect(doc.basics.name).toBe('Avery Testerson');
    expect(doc.basics.email).toBe(original.basics.email);
    expect(doc.experience.map((e) => [e.title, e.company, e.start, e.end])).toEqual([
      ['Software Developer Co-op', 'Example Robotics', 'Jan 2025', 'Apr 2025'],
      ['Teaching Assistant, Data Structures', 'University of Windsor', 'Sep 2024', 'Dec 2024'],
    ]);
    expect(doc.experience[0]!.bullets).toEqual(original.experience[0]!.bullets);
    expect(doc.education[0]).toMatchObject({ school: 'University of Windsor', end: 'May 2027' });
    expect(doc.skills).toEqual(original.skills);
  });
});
