// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderResumePdf } from '@/core/pdf/resumeTemplate';
import { extractDates, looksStructured, parseResumeText } from '@/core/resume/heuristics';
import { sampleResumeDoc } from '../fixtures/sampleResume';
import { FONTS } from './fonts';

const PASTED = `
Jordan Lee
Toronto, ON | jordan.lee@example.com | 416-555-0199 | linkedin.com/in/jordan-lee-example | github.com/jordanlee-example

EDUCATION
University of Toronto                                                    Toronto, ON
Bachelor of Applied Science in Computer Engineering                     Sep 2022 - Apr 2026
GPA: 3.7/4.0
Relevant Coursework: Operating Systems, Computer Networks

EXPERIENCE
Software Engineering Intern | Maple Payments | Toronto, ON               May 2025 - Aug 2025
• Built a fraud-scoring service in Go that reviews 1.2M transactions a day
• Reduced p99 latency from 480 ms to 120 ms by adding a read-through cache
  and batching database writes
• Wrote the runbook now used by the on-call team

Research Assistant, Systems Lab                                         Jan 2024 - Apr 2025
University of Toronto
- Profiled a distributed key-value store and found a lock contention bug
- Co-authored a workshop paper

PROJECTS
TransitNow | React Native, Firebase                                      2024
• A bus-arrival app with 3,000 monthly users

Compiler for a toy language — Rust
• Wrote a lexer, parser and x86 code generator

TECHNICAL SKILLS
Languages: Go, Python, C++, TypeScript
Frameworks: React, React Native, gRPC
Tools: Docker, Kubernetes, Git

AWARDS
Dean's List, 2023 and 2024
1st place, UofT Hacks 2024
`;

describe('parseResumeText: a typical pasted resume', () => {
  const doc = parseResumeText(PASTED);

  it('reads the contact block', () => {
    expect(doc.basics).toEqual({
      name: 'Jordan Lee',
      email: 'jordan.lee@example.com',
      phone: '416-555-0199',
      location: 'Toronto, ON',
      links: ['linkedin.com/in/jordan-lee-example', 'github.com/jordanlee-example'],
    });
  });

  it('reads education with dates, location and details', () => {
    expect(doc.education).toHaveLength(1);
    expect(doc.education[0]).toMatchObject({
      school: 'University of Toronto',
      degree: 'Bachelor of Applied Science in Computer Engineering',
      location: 'Toronto, ON',
      start: 'Sep 2022',
      end: 'Apr 2026',
    });
    expect(doc.education[0]!.details).toEqual(['GPA: 3.7/4.0', 'Relevant Coursework: Operating Systems, Computer Networks']);
  });

  it('splits experience into entries, whichever way the heading is laid out', () => {
    expect(doc.experience).toHaveLength(2);
    expect(doc.experience[0]).toMatchObject({
      title: 'Software Engineering Intern',
      company: 'Maple Payments',
      location: 'Toronto, ON',
      start: 'May 2025',
      end: 'Aug 2025',
    });
    expect(doc.experience[1]).toMatchObject({
      title: 'Research Assistant, Systems Lab',
      company: 'University of Toronto',
      start: 'Jan 2024',
      end: 'Apr 2025',
    });
  });

  it('joins a bullet that wraps onto a second line', () => {
    expect(doc.experience[0]!.bullets).toEqual([
      'Built a fraud-scoring service in Go that reviews 1.2M transactions a day',
      'Reduced p99 latency from 480 ms to 120 ms by adding a read-through cache and batching database writes',
      'Wrote the runbook now used by the on-call team',
    ]);
    expect(doc.experience[1]!.bullets).toHaveLength(2);
  });

  it('reads projects with their tech stack', () => {
    expect(doc.projects).toEqual([
      { name: 'TransitNow', subtitle: 'React Native, Firebase', start: '', end: '2024', bullets: ['A bus-arrival app with 3,000 monthly users'] },
      { name: 'Compiler for a toy language', subtitle: 'Rust', start: '', end: '', bullets: ['Wrote a lexer, parser and x86 code generator'] },
    ]);
  });

  it('groups skills by category', () => {
    expect(doc.skills).toEqual([
      { category: 'Languages', items: ['Go', 'Python', 'C++', 'TypeScript'] },
      { category: 'Frameworks', items: ['React', 'React Native', 'gRPC'] },
      { category: 'Tools', items: ['Docker', 'Kubernetes', 'Git'] },
    ]);
  });

  it('keeps other sections and the original section order', () => {
    expect(doc.extras).toEqual([{ title: 'Awards', items: ["Dean's List, 2023 and 2024", '1st place, UofT Hacks 2024'] }]);
    expect(doc.order).toEqual(['education', 'experience', 'projects', 'skills', 'extra:Awards']);
    expect(looksStructured(doc)).toBe(true);
  });
});

describe('parseResumeText: other layouts', () => {
  it('handles company-first headings and a summary', () => {
    const doc = parseResumeText(`
SAM RIVERA
sam@example.com · (604) 555-0123 · Vancouver, British Columbia

PROFESSIONAL SUMMARY
Data analyst with two years of experience turning messy operational data into dashboards people use.

WORK EXPERIENCE

Northwind Logistics — Vancouver, BC
Data Analyst                                                 March 2023 – Present
* Automated a weekly report in Python, saving 6 hours a week
* Built Tableau dashboards for the operations team

Harbour Coffee
Barista, June 2021 to February 2023
* Trained 8 new staff

EDUCATION

BSc in Statistics, University of British Columbia, 2019 – 2023

SKILLS
Python, SQL, Tableau, Excel
`);
    expect(doc.basics.name).toBe('SAM RIVERA');
    expect(doc.basics.location).toBe('Vancouver, British Columbia');
    expect(doc.summary).toContain('Data analyst with two years');
    expect(doc.experience).toHaveLength(2);
    expect(doc.experience[0]).toMatchObject({ company: 'Northwind Logistics', title: 'Data Analyst', location: 'Vancouver, BC', start: 'March 2023', end: 'Present' });
    expect(doc.experience[1]).toMatchObject({ company: 'Harbour Coffee', title: 'Barista', start: 'June 2021', end: 'February 2023' });
    expect(doc.education[0]).toMatchObject({ school: 'University of British Columbia', degree: 'BSc in Statistics', start: '2019', end: '2023' });
    expect(doc.skills).toEqual([{ category: '', items: ['Python', 'SQL', 'Tableau', 'Excel'] }]);
    expect(doc.order).toEqual(['summary', 'experience', 'education', 'skills']);
  });

  it('returns an empty structure for text that is not a resume', () => {
    const doc = parseResumeText('Hello, this is just a note to myself about groceries.');
    expect(looksStructured(doc)).toBe(false);
    expect(doc.experience).toEqual([]);
  });

  it('survives empty input', () => {
    expect(parseResumeText('').basics.name).toBe('');
  });
});

describe('parseResumeText: round trip through our own PDF', () => {
  it('recovers the structure from the text of a generated resume', async () => {
    const original = sampleResumeDoc();
    const pdf = await renderResumePdf(original, { fonts: FONTS, pageSize: 'letter' });
    const file = join(mkdtempSync(join(tmpdir(), 'ss-rt-')), 'r.pdf');
    writeFileSync(file, pdf);
    const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    const doc = parseResumeText(text);

    expect(doc.basics.name).toBe('Avery Testerson');
    expect(doc.basics.email).toBe(original.basics.email);
    expect(doc.basics.phone).toBe(original.basics.phone);
    expect(doc.basics.location).toBe('Windsor, ON');
    expect(doc.education[0]).toMatchObject({ school: 'University of Windsor', start: 'Sep 2023', end: 'May 2027' });
    expect(doc.experience.map((e) => [e.title, e.company, e.start, e.end])).toEqual([
      ['Software Developer Co-op', 'Example Robotics', 'Jan 2025', 'Apr 2025'],
      ['Teaching Assistant, Data Structures', 'University of Windsor', 'Sep 2024', 'Dec 2024'],
    ]);
    // Wrapped bullets are rejoined exactly.
    expect(doc.experience[0]!.bullets).toEqual(original.experience[0]!.bullets);
    expect(doc.projects[0]).toMatchObject({ name: 'ClearBudget', subtitle: 'React, Node.js, PostgreSQL' });
    expect(doc.skills).toEqual(original.skills);
    expect(doc.extras).toEqual(original.extras);
    expect(doc.order).toEqual(original.order);
  });
});

describe('extractDates', () => {
  it('finds ranges in the usual formats', () => {
    expect(extractDates('Intern | Acme\tMay 2025 - Aug 2025')).toMatchObject({ start: 'May 2025', end: 'Aug 2025' });
    expect(extractDates('Analyst, Jan. 2023 – Present')).toMatchObject({ start: 'Jan. 2023', end: 'Present' });
    expect(extractDates('09/2022 to 04/2026')).toMatchObject({ start: '09/2022', end: '04/2026' });
    expect(extractDates('2019 – 2023')).toMatchObject({ start: '2019', end: '2023' });
    expect(extractDates('Summer 2024 - Fall 2024')).toMatchObject({ start: 'Summer 2024', end: 'Fall 2024' });
  });
  it('finds a lone date and leaves the rest of the line', () => {
    expect(extractDates('BSc Computer Science, Expected May 2027')).toEqual({ start: '', end: 'May 2027', rest: 'BSc Computer Science' });
  });
  it('ignores a year inside a long sentence', () => {
    const line = 'Grew the newsletter to 2,000 subscribers over the course of 2024 through weekly posts';
    expect(extractDates(line)).toEqual({ start: '', end: '', rest: line });
  });
});
