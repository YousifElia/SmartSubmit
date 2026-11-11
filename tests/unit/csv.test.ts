import { describe, expect, it } from 'vitest';
import { csvCell, jobsToCsv } from '@/core/jobs/csv';
import type { Job, Resume } from '@/core/types';

const job = (over: Partial<Job>): Job => ({
  id: 'j1',
  key: 'k',
  site: 'lever',
  url: 'https://jobs.lever.co/acme/1',
  title: 'Intern',
  company: 'Acme',
  location: 'Windsor, ON',
  description: '',
  blocks: [],
  capturedAt: new Date(2026, 10, 1).getTime(),
  status: 'applied',
  appliedAt: new Date(2026, 10, 3).getTime(),
  resumeRef: { kind: 'resume', id: 'r1' },
  notes: '',
  score: 64,
  ...over,
});

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe('');
  });
  it('neutralises spreadsheet formulas from untrusted text', () => {
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe('"\'=HYPERLINK(""http://evil"",""click"")"');
    expect(csvCell('+1 555')).toBe("'+1 555");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

describe('jobsToCsv', () => {
  it('writes a header and one row per job', () => {
    const resumes = [{ id: 'r1', name: 'Software roles' } as Resume];
    const csv = jobsToCsv([job({ notes: 'Referred by Sam, follow up Friday' })], resumes, []);
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Company,Job title,Location,Status,Applied,Saved,Keyword match,Resume,Link,Notes');
    expect(lines[1]).toBe('Acme,Intern,"Windsor, ON",Applied,2026-11-03,2026-11-01,64%,Software roles,https://jobs.lever.co/acme/1,"Referred by Sam, follow up Friday"');
  });
});
