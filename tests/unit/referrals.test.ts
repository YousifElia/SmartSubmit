import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { linkedinSearches, parseConnectionsCsv, readConnectionsFile } from '@/core/referrals/linkedin';
import { companyMatch, connectionsAt, normalizeCompany, rankForRole } from '@/core/referrals/match';
import { finishMessage, pickPrompt, readPicks, templateMessage } from '@/core/referrals/message';
import type { Connection } from '@/core/types';

// The shape of LinkedIn's export: notes, a blank line, then the table. Invented people.
const CSV = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Jordan,Lee,https://www.linkedin.com/in/jordan-lee-example,,Northwind Systems,Senior Software Engineer,03 Feb 2025
Priya,Natarajan,https://www.linkedin.com/in/priya-n-example,priya@example.com,"Northwind Systems, Inc.",Technical Recruiter,14 Aug 2023
Sam,O'Brien,https://www.linkedin.com/in/sam-obrien-example,,Northwind Systems Canada,Account Executive,01 Jan 2019
Alex,Chen,https://www.linkedin.com/in/alex-chen-example,,Acme Robotics,"Engineering Manager, Platform",22 Jun 2024
Mo,Haddad,https://www.linkedin.com/in/mo-haddad-example,,Northwinds Bakery,Baker,10 Oct 2022
`;

const at = (company: string): Connection => ({ firstName: 'A', lastName: 'B', url: '', email: '', company, position: '', connectedOn: '' });

describe('LinkedIn connections export', () => {
  it('reads the table under the notes, with quoted commas', () => {
    const people = parseConnectionsCsv(CSV);
    expect(people).toHaveLength(5);
    expect(people[1]).toEqual({
      firstName: 'Priya',
      lastName: 'Natarajan',
      url: 'https://www.linkedin.com/in/priya-n-example',
      email: 'priya@example.com',
      company: 'Northwind Systems, Inc.',
      position: 'Technical Recruiter',
      connectedOn: '14 Aug 2023',
    });
    expect(people[3]!.position).toBe('Engineering Manager, Platform');
  });

  it('reads the archive LinkedIn sends, or the file inside it, and refuses anything else', () => {
    const archive = zipSync({ 'Basic_LinkedInDataExport_11-18-2026/Connections.csv': strToU8(CSV), 'Profile.csv': strToU8('x') });
    expect(readConnectionsFile('Basic_LinkedInDataExport.zip', archive)).toHaveLength(5);
    expect(readConnectionsFile('Connections.csv', strToU8(CSV))).toHaveLength(5);
    expect(() => readConnectionsFile('other.zip', zipSync({ 'Profile.csv': strToU8('x') }))).toThrow(/no Connections\.csv/);
    expect(() => readConnectionsFile('people.csv', strToU8('Name,Phone\nA,1'))).toThrow(/First Name and Last Name/);
  });
});

describe('matching a company', () => {
  it('ignores legal endings, punctuation and "the"', () => {
    expect(normalizeCompany('Northwind Systems, Inc.')).toBe('northwind systems');
    expect(normalizeCompany('The Home Depot')).toBe('home depot');
    expect(companyMatch('Northwind Systems', 'Northwind Systems Inc')).toBe(1);
    expect(companyMatch('AT&T', 'AT and T Inc.')).toBe(1);
  });

  it('counts a name with more words after it, but not a different name that starts alike', () => {
    expect(companyMatch('Amazon', 'Amazon Web Services (AWS)')).toBe(0.85);
    expect(companyMatch('Northwind Systems', 'Northwinds Bakery')).toBe(0);
    expect(companyMatch('Meta', 'Metalworks Ltd')).toBe(0);
    expect(companyMatch('Global', 'Global Payments')).toBe(0);
  });

  it('finds the connections at a company, the surest first', () => {
    const people = parseConnectionsCsv(CSV);
    expect(connectionsAt('Northwind Systems', people).map((p) => p.firstName)).toEqual(['Jordan', 'Priya', 'Sam']);
    expect(connectionsAt('', [at('Anything')])).toEqual([]);
  });
});

describe('ranking who to ask', () => {
  it('puts people in the same kind of work first, then recruiters', () => {
    const people = connectionsAt('Northwind Systems', parseConnectionsCsv(CSV));
    const ranked = rankForRole(people, 'Software Developer Intern', Date.parse('2026-11-18'));
    expect(ranked.map((r) => r.connection.firstName)).toEqual(['Jordan', 'Priya', 'Sam']);
    expect(ranked[0]!.reason).toBe('Does the same kind of work as this role');
    expect(ranked[1]!.reason).toBe('Recruits for the company');
    expect(ranked[2]!.reason).toBe('Works there');
  });
});

describe('the model’s part', () => {
  const job = { title: 'Software Developer Intern', company: 'Northwind Systems', url: 'https://example.com/job/1', description: 'Build tools in Go.' };

  it('asks about job titles only, never names', () => {
    const prompt = pickPrompt(job, ['Senior Software Engineer', 'Technical Recruiter']);
    expect(prompt.user).toContain('0. Senior Software Engineer\n1. Technical Recruiter');
    expect(prompt.user).not.toMatch(/Jordan|Priya/);
  });

  it('reads its picks leniently, dropping ones it made up', () => {
    expect(readPicks('```json\n{"picks":[{"index":1,"reason":"Hires engineers"},{"index":7,"reason":"x"},{"index":1,"reason":"again"}]}\n```', 2)).toEqual([
      { index: 1, reason: 'Hires engineers' },
    ]);
    expect(readPicks('Sorry, I cannot help with that.', 2)).toEqual([]);
  });

  it('puts the name in itself, and keeps a connection note under 300 characters', () => {
    expect(finishMessage('Hi [FIRST_NAME],\n\nCould you refer me?\n\nAvery', 'Jordan', 'linkedin')).toBe('Hi Jordan,\n\nCould you refer me?\n\nAvery');
    expect(finishMessage(`Hi [FIRST_NAME], ${'very '.repeat(80)}long`, 'Jordan', 'note').length).toBeLessThanOrEqual(300);
  });

  it('writes a message without any AI too', () => {
    const base = { job, myName: 'Avery', highlights: ['Go', 'PostgreSQL', 'Docker'], contact: { position: 'Engineer', relationship: '' }, firstName: 'Jordan' };
    const message = templateMessage({ ...base, channel: 'linkedin' });
    expect(message).toMatch(/^Hi Jordan,/);
    expect(message).toContain('the Software Developer Intern role at Northwind Systems (https://example.com/job/1)');
    expect(message).toContain('My background in Go, PostgreSQL and Docker');
    expect(message.endsWith('Avery')).toBe(true);
    expect(templateMessage({ ...base, channel: 'email' })).toMatch(/^Subject: Referral for Software Developer Intern at Northwind Systems\n\nHi Jordan,/);
    expect(templateMessage({ ...base, channel: 'note' }).length).toBeLessThanOrEqual(300);
  });
});

describe('LinkedIn searches to open', () => {
  it('builds people searches for the company, its recruiters and your school’s alumni', () => {
    const links = linkedinSearches('Northwind Systems', 'University of Windsor');
    expect(links.map((l) => l.label)).toEqual([
      'People at Northwind Systems you know through a connection',
      'University of Windsor alumni at Northwind Systems',
      'Recruiters at Northwind Systems',
    ]);
    const first = new URL(links[0]!.url);
    expect(first.origin + first.pathname).toBe('https://www.linkedin.com/search/results/people/');
    expect(first.searchParams.get('keywords')).toBe('Northwind Systems');
    expect(first.searchParams.get('network')).toBe('["S"]');
  });
});
