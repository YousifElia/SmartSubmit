/**
 * Turning a resume's plain text into structured sections, without AI.
 *
 * This is a best-effort reading of the conventions resumes follow: a contact
 * block at the top, recognisable section headings, entries made of a heading
 * line or two followed by bullets, and date ranges on the heading lines. The
 * result is always editable afterwards; a connected AI model does this job
 * better and is used instead when available.
 */
import { emptyResumeDoc } from '../defaults';
import type { ResumeDoc, ResumeEducation, ResumeExperience, ResumeProject } from '../types';

type SectionKind = 'summary' | 'education' | 'experience' | 'projects' | 'skills' | 'extra';

const SECTION_PATTERNS: [RegExp, Exclude<SectionKind, 'extra'>][] = [
  [/^(education|academic background|education (and|&) training|academics|academic history)$/, 'education'],
  [
    /^((work|professional|relevant|employment|industry|related|technical|internship|co-?op) (experience|history)|experience|employment|work history|professional background|internships?)$/,
    'experience',
  ],
  [/^((personal|academic|selected|technical|side|notable|key|software|course|relevant) )?projects?$/, 'projects'],
  [
    /^((technical|core|key|relevant|programming|additional) )?(skills|competencies|proficiencies)( (and|&) (interests|tools|technologies|abilities|languages))?$|^(technologies|tech stack|tools|languages (and|&) (tools|technologies|frameworks))$/,
    'skills',
  ],
  [/^(summary|professional summary|profile|professional profile|objective|career objective|about( me)?|career summary|personal statement|summary of qualifications)$/, 'summary'],
];

const EXTRA_PATTERN =
  /^(certifications?|licen[cs]es?( (and|&) certifications?)?|awards?|honou?rs?( (and|&) awards?)?|awards? (and|&) honou?rs?|achievements?|accomplishments?|publications?|volunteer(ing)?( experience| work)?|leadership( experience)?|leadership (and|&) activities|activities|extracurriculars?( activities)?|languages|interests|hobbies|hobbies (and|&) interests|relevant coursework|coursework|courses|references|affiliations|memberships|community involvement|research( experience)?|scholarships?|training|additional information)$/;

const BULLET = /^\s*(?:[•●▪■◦○∙·‣⁃➢►▸*]|[-–—](?=\s))\s*/;

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|spring|summer|fall|autumn|winter)';
const DATE = `(?:${MONTH}\\.?,?\\s+\\d{4}|\\d{1,2}/\\d{4}|(?:19|20)\\d{2})`;
const OPEN_END = '(?:present|current|now|ongoing|today)';
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until|through)\\s*(${DATE}|${OPEN_END})`, 'i');
const SINGLE = new RegExp(`(?:(?:expected|anticipated|graduating|graduation|class of)[:\\s]+)?(${DATE})`, 'i');

const ROLE_WORDS =
  /\b(engineer|developer|intern|internship|analyst|manager|assistant|co-?op|researcher|designer|consultant|lead|specialist|associate|tutor|instructor|teaching|president|vice[- ]president|member|coordinator|technician|administrator|architect|scientist|director|officer|representative|clerk|cashier|server|barista|volunteer|programmer|founder|mentor|ambassador|supervisor|trainee|apprentice|fellow|contractor|freelance|writer|editor|strategist|accountant|advisor|agent|captain|treasurer|secretary|organizer|executive|operator|support|student)\b/i;
const SCHOOL_WORDS = /\b(university|college|institute|school|academy|polytechnic|universit[éy]|c[ée]gep|faculty of)\b/i;
const DEGREE_WORDS =
  /\b(bachelor|master|doctor|ph\.?d|b\.?sc?\.?|m\.?sc?\.?|b\.?a\.?|m\.?a\.?|b\.?eng\.?|m\.?eng\.?|b\.?a\.?sc\.?|b\.?c\.?s\.?|b\.?b\.?a\.?|m\.?b\.?a\.?|diploma|certificate|associate|honou?rs|major|minor|degree|undergraduate|graduate|secondary|ossd|ged)\b/i;
const LOCATION = /\b([A-Z][A-Za-z.'’-]+(?: [A-Z][A-Za-z.'’-]+){0,2}),\s*([A-Z]{2}\b|[A-Z][a-z]+(?: [A-Z][a-z]+)?)|\b(remote|hybrid)\b/;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const URL = /(?:https?:\/\/|www\.)[^\s|,;]+|(?:linkedin\.com|github\.com|gitlab\.com|devpost\.com|behance\.net|dribbble\.com)\/[^\s|,;]+|\b[a-z0-9-]+\.(?:dev|io|me|app|tech|codes|page)(?:\/[^\s|,;]*)?/gi;

/** Marks a wide gap between a left and a right part of a line. */
const GAP = '\t';

interface Line {
  raw: string;
  text: string;
  bullet: boolean;
  blank: boolean;
}

function prepare(text: string): Line[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map((raw) => {
      const trimmed = raw.replace(/\s+$/, '');
      const bullet = BULLET.test(trimmed);
      const body = (bullet ? trimmed.replace(BULLET, '') : trimmed.trim()).replace(/\t+| {3,}/g, GAP).trim();
      return { raw: trimmed, text: body, bullet, blank: body === '' };
    });
}

function headingOf(line: Line): { kind: SectionKind; title: string } | null {
  if (line.bullet || line.blank || line.text.includes(GAP)) return null;
  const stripped = line.text.replace(/^[\s\-–—=_*#|]+|[\s\-–—=_*#|:]+$/g, '');
  if (!stripped || stripped.split(/\s+/).length > 5 || /[.!?]$/.test(stripped)) return null;
  const key = stripped.toLowerCase().replace(/\s+/g, ' ');
  for (const [pattern, kind] of SECTION_PATTERNS) if (pattern.test(key)) return { kind, title: stripped };
  if (EXTRA_PATTERN.test(key)) return { kind: 'extra', title: titleCase(stripped) };
  return null;
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(And|Of|In|The|For)\b/g, (w) => w.toLowerCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** Pull a date range (or a lone date) out of a line, returning what is left. */
export function extractDates(text: string): { start: string; end: string; rest: string } {
  const tidy = (rest: string) =>
    rest
      .replace(/\(\s*\)/g, ' ')
      .replace(new RegExp(`\\s*${GAP}\\s*${GAP}\\s*`, 'g'), GAP)
      .replace(/[ ]{2,}/g, ' ')
      .replace(new RegExp(`^[\\s,|·•${GAP}–—-]+|[\\s,|·•${GAP}–—-]+$`, 'g'), '');
  const clean = (date: string) => date.replace(/\s+/g, ' ').replace(/^([a-z])/, (c) => c.toUpperCase()).trim();

  const range = RANGE.exec(text);
  if (range) {
    return { start: clean(range[1]!), end: clean(range[2]!), rest: tidy(text.replace(range[0], ' ')) };
  }
  const single = SINGLE.exec(text);
  // A bare year inside a sentence ("2,000 users in 2024") is not an entry date.
  if (single && (single[0].length > 4 || text.trim().length < 60)) {
    return { start: '', end: clean(single[1]!), rest: tidy(text.replace(single[0], ' ')) };
  }
  return { start: '', end: '', rest: text };
}

function hasDate(text: string): boolean {
  return RANGE.test(text) || new RegExp(`${MONTH}\\.?,?\\s+\\d{4}`, 'i').test(text);
}

/** Split a heading line into its parts on the separators resumes use. */
function parts(text: string): string[] {
  return text
    .split(new RegExp(`${GAP}|\\s+[|·•]\\s+|\\s+[–—]\\s+|\\s+-\\s+|\\s+@\\s+`))
    .map((p) => p.trim().replace(/^[,;]+|[,;]+$/g, '').trim())
    .filter(Boolean);
}

function takeLocation(list: string[]): string {
  const index = list.findIndex((p) => LOCATION.test(p) && !ROLE_WORDS.test(p) && !SCHOOL_WORDS.test(p) && p.length < 40);
  if (index < 0) return '';
  return list.splice(index, 1)[0]!;
}

interface RawEntry {
  head: string[];
  bullets: string[];
}

/** Lines under an education heading that describe it rather than start a new entry. */
const EDUCATION_DETAIL = /^(c?gpa|grade|average|relevant coursework|coursework|courses|honou?rs|awards?|scholarships?|minor|thesis|activities|dean)\b/i;

/**
 * Group a section's lines into entries: heading lines followed by bullets.
 * Lines matching `detail` count as bullets even without a bullet mark.
 */
function entries(lines: Line[], longLine: number, detail?: RegExp): RawEntry[] {
  const out: RawEntry[] = [];
  let current: RawEntry | null = null;
  let afterBlank = false;
  let previous: Line | null = null;

  for (const line of lines) {
    if (line.blank) {
      afterBlank = true;
      continue;
    }
    if (line.bullet || (detail && current && detail.test(line.text))) {
      current ??= { head: [], bullets: [] };
      if (!out.includes(current)) out.push(current);
      current.bullets.push(line.text.replace(new RegExp(GAP, 'g'), ' '));
    } else {
      // Text extracted from a PDF wraps long bullets onto a new line with no bullet mark.
      const wrapsPrevious =
        !!current &&
        current.bullets.length > 0 &&
        !afterBlank &&
        !!previous &&
        !hasDate(line.text) &&
        !line.text.includes(GAP) &&
        (/^[a-z0-9(]/.test(line.text) || (previous.raw.length >= longLine * 0.82 && !/[.!?]$/.test(previous.text)));
      if (wrapsPrevious) {
        const last = current!.bullets.length - 1;
        current!.bullets[last] = `${current!.bullets[last]} ${line.text}`;
      } else if (!current || current.bullets.length > 0 || current.head.length >= 3 || (afterBlank && current.head.length > 0 && hasDate(current.head.join(' ')))) {
        current = { head: [line.text], bullets: [] };
        out.push(current);
      } else {
        current.head.push(line.text);
      }
    }
    afterBlank = false;
    previous = line;
  }
  return out;
}

function toExperience(entry: RawEntry): ResumeExperience {
  let start = '';
  let end = '';
  const pieces: string[] = [];
  for (const line of entry.head) {
    const dates = extractDates(line);
    if (!start && !end && (dates.start || dates.end)) ({ start, end } = dates);
    pieces.push(...parts(dates.start || dates.end ? dates.rest : line));
  }
  const location = takeLocation(pieces);
  let title = '';
  let company = '';
  const roleIndex = pieces.findIndex((p) => ROLE_WORDS.test(p));
  if (roleIndex >= 0) {
    title = pieces.splice(roleIndex, 1)[0]!;
    company = pieces.shift() ?? '';
  } else {
    // No recognisable job title: assume "Title, then Company".
    title = pieces.shift() ?? '';
    company = pieces.shift() ?? '';
  }
  // "Software Developer at Shopify" on one line.
  const at = /^(.+?)\s+at\s+(.+)$/i.exec(title);
  if (at && !company) {
    title = at[1]!;
    company = at[2]!;
  }
  const extra = pieces.join(', ');
  return { company, title, location, start, end, bullets: [...(extra ? [extra] : []), ...entry.bullets] };
}

function toEducation(entry: RawEntry): ResumeEducation {
  let start = '';
  let end = '';
  let pieces: string[] = [];
  for (const line of entry.head) {
    const dates = extractDates(line);
    if (!start && !end && (dates.start || dates.end)) ({ start, end } = dates);
    pieces.push(...parts(dates.start || dates.end ? dates.rest : line));
  }
  const location = takeLocation(pieces);

  // "BSc in Statistics, University of British Columbia" on one line: the
  // comma separates degree from school.
  const isSchoolOnly = (p: string) => SCHOOL_WORDS.test(p) && !DEGREE_WORDS.test(p.replace(SCHOOL_WORDS, ''));
  if (!pieces.some(isSchoolOnly)) {
    pieces = pieces.flatMap((p) => (SCHOOL_WORDS.test(p) && DEGREE_WORDS.test(p) ? p.split(/,\s+/) : [p]));
  }

  const schoolIndex = pieces.findIndex((p) => SCHOOL_WORDS.test(p));
  const school = schoolIndex >= 0 ? pieces.splice(schoolIndex, 1)[0]! : '';
  const degreeIndex = pieces.findIndex((p) => DEGREE_WORDS.test(p));
  let degree = '';
  if (degreeIndex >= 0) {
    // A degree and what follows it belong together ("BSc, Computer Science").
    degree = pieces.splice(degreeIndex).join(', ');
  } else if (school) {
    degree = pieces.splice(0).join(', ');
  }
  return {
    school: school || pieces.shift() || '',
    degree,
    location,
    start,
    end,
    details: [...pieces, ...entry.bullets],
  };
}

function toProject(entry: RawEntry): ResumeProject {
  let start = '';
  let end = '';
  const pieces: string[] = [];
  for (const line of entry.head) {
    const dates = extractDates(line);
    if (!start && !end && (dates.start || dates.end)) ({ start, end } = dates);
    pieces.push(...parts(dates.start || dates.end ? dates.rest : line));
  }
  const name = pieces.shift() ?? '';
  return { name, subtitle: pieces.join(' | '), start, end, bullets: entry.bullets };
}

function toSkills(lines: Line[]): ResumeDoc['skills'] {
  const groups = new Map<string, string[]>();
  for (const line of lines) {
    if (line.blank) continue;
    const text = line.text.replace(new RegExp(GAP, 'g'), ' ');
    const colon = text.indexOf(':');
    const category = colon > 0 && colon < 40 ? text.slice(0, colon).trim() : '';
    const list = (category ? text.slice(colon + 1) : text)
      .split(/[,;|•·]|\s{2,}/)
      .map((s) => s.trim().replace(/\.$/, ''))
      .filter(Boolean);
    if (list.length === 0) continue;
    groups.set(category, [...(groups.get(category) ?? []), ...list]);
  }
  return [...groups].map(([category, items]) => ({ category, items: [...new Set(items)] }));
}

function toItems(lines: Line[], longLine: number): string[] {
  const out: string[] = [];
  let previous: Line | null = null;
  for (const line of lines) {
    if (line.blank) {
      previous = null;
      continue;
    }
    const text = line.text.replace(new RegExp(GAP, 'g'), ' — ');
    const continues = previous && !line.bullet && (/^[a-z]/.test(text) || (previous.raw.length >= longLine * 0.82 && !/[.!?]$/.test(previous.text)));
    if (continues && out.length > 0) out[out.length - 1] = `${out[out.length - 1]} ${text}`;
    else out.push(text);
    previous = line;
  }
  return out;
}

function parseHeader(lines: Line[], doc: ResumeDoc): void {
  const text = lines.map((l) => l.text).join('\n');
  doc.basics.email = EMAIL.exec(text)?.[0] ?? '';
  doc.basics.phone = PHONE.exec(text)?.[0].trim() ?? '';
  const links = (text.replace(EMAIL, ' ').match(URL) ?? []).map((l) => l.replace(/[).,]+$/, ''));
  doc.basics.links = [...new Set(links)];

  const content = lines.filter((l) => !l.blank);
  const nameLine = content.find((l) => !/[@\d]/.test(l.text) && !/https?:|www\.|\.com/i.test(l.text) && l.text.split(/\s+/).length <= 6);
  doc.basics.name = nameLine ? nameLine.text.replace(new RegExp(GAP, 'g'), ' ').trim() : '';

  // The location is what remains of the contact lines once everything else is removed.
  for (const line of content) {
    if (line === nameLine) continue;
    const rest = line.text.replace(EMAIL, ' ').replace(PHONE, ' ').replace(URL, ' ');
    const match = LOCATION.exec(rest);
    if (match && !match[3]) {
      doc.basics.location = match[0].trim();
      break;
    }
  }

  // A paragraph before the first heading is a summary with no heading of its own.
  const prose = content.filter((l) => l !== nameLine && l.text.length > 90 && !EMAIL.test(l.text));
  if (prose.length > 0) doc.summary = prose.map((l) => l.text).join(' ');
}

/** Parse a resume's plain text into structured sections. */
export function parseResumeText(text: string): ResumeDoc {
  const doc = emptyResumeDoc();
  const lines = prepare(text);
  const longLine = Math.max(0, ...lines.map((l) => l.raw.length));

  // Cut the text into the header and the sections that follow.
  const sections: { kind: SectionKind; title: string; lines: Line[] }[] = [];
  const header: Line[] = [];
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) sections.push({ ...heading, lines: [] });
    else if (sections.length > 0) sections[sections.length - 1]!.lines.push(line);
    else header.push(line);
  }
  parseHeader(header, doc);

  for (const section of sections) {
    switch (section.kind) {
      case 'summary':
        doc.summary = section.lines
          .filter((l) => !l.blank)
          .map((l) => l.text.replace(new RegExp(GAP, 'g'), ' '))
          .join(' ');
        doc.order.push('summary');
        break;
      case 'education':
        doc.education.push(...entries(section.lines, longLine, EDUCATION_DETAIL).map(toEducation).filter((e) => e.school || e.degree));
        doc.order.push('education');
        break;
      case 'experience':
        doc.experience.push(...entries(section.lines, longLine).map(toExperience).filter((e) => e.title || e.company));
        doc.order.push('experience');
        break;
      case 'projects':
        doc.projects.push(...entries(section.lines, longLine).map(toProject).filter((p) => p.name));
        doc.order.push('projects');
        break;
      case 'skills':
        doc.skills.push(...toSkills(section.lines));
        doc.order.push('skills');
        break;
      case 'extra': {
        const items = toItems(section.lines, longLine);
        if (items.length > 0) {
          doc.extras.push({ title: section.title, items });
          doc.order.push(`extra:${section.title}`);
        }
        break;
      }
    }
  }
  doc.order = [...new Set(doc.order)];
  return doc;
}

/** Whether parsing found enough structure to be worth showing as sections. */
export function looksStructured(doc: ResumeDoc): boolean {
  return doc.experience.length + doc.education.length + doc.projects.length > 0;
}
