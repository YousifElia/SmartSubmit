import { describe, expect, it } from 'vitest';
import { htmlToBlocks } from '@/core/jobs/html';
import { jobKeywords, matchResume, resumeText } from '@/core/jobs/keywords';
import { sampleResumeDoc } from '../fixtures/sampleResume';

const JOB = htmlToBlocks(`
<h2>About Acme</h2>
<p>Acme builds warehouse robots. Our platform runs on AWS and we love going the extra mile.</p>
<h2>What you'll do</h2>
<ul>
  <li>Build internal tools with React and TypeScript</li>
  <li>Go above and beyond for the rest of the team</li>
</ul>
<h2>What you'll need</h2>
<ul>
  <li>Experience with Python, Go, or Java</li>
  <li>Comfort with Docker, Kubernetes and Terraform</li>
  <li>Knowledge of HIPAA and SOC 2 compliance</li>
  <li>Excellent communication skills</li>
  <li>REST APIs and PostgreSQL</li>
  <li>MUST BE ELIGIBLE TO WORK IN CANADA WITHOUT SPONSORSHIP</li>
</ul>
<h2>Nice to have</h2>
<ul><li>Experience with GCP or Azure</li><li>Familiarity with ROS2</li></ul>
<h2>Compensation</h2>
<p>$90,000 – $110,000 CAD per year, plus Excel training budget.</p>
<h2>Benefits</h2>
<ul><li>Python books club</li></ul>
<h3>Canada</h3>
<ul><li>RRSP matching and Kubernetes swag</li></ul>
`);

const names = (keywords: { name: string }[]) => keywords.map((k) => k.name);

describe('jobKeywords', () => {
  const keywords = jobKeywords(JOB);
  const get = (name: string) => keywords.find((k) => k.name === name);

  it('finds skills in the requirements and weights them highest', () => {
    for (const name of ['Python', 'Go', 'Java', 'Docker', 'Kubernetes', 'Terraform', 'REST APIs', 'PostgreSQL']) {
      expect(get(name), name).toMatchObject({ section: 'required', weight: 2 });
    }
    expect(get('SOC 2')).toMatchObject({ section: 'required' });
  });

  it('weights other sections lower', () => {
    expect(get('React')).toMatchObject({ section: 'other', weight: 1 });
    expect(get('GCP')).toMatchObject({ section: 'preferred', weight: 1.25 });
    expect(get('AWS')).toMatchObject({ section: 'about', weight: 0.35 });
  });

  it('picks up technical terms the dictionary does not know, from requirements only', () => {
    expect(get('HIPAA')).toMatchObject({ section: 'required' });
    expect(get('ROS2')).toBeUndefined(); // ROS2 is a spelling of ROS in the dictionary
    expect(get('ROS')).toMatchObject({ section: 'preferred' });
  });

  it('counts soft skills only when asked for, and lightly', () => {
    expect(get('Communication')!.weight).toBeLessThan(1);
    expect(get('Communication')!.kind).toBe('soft');
  });

  it('ignores ordinary words and pay, benefits and legal text', () => {
    // "Go above and beyond", "the rest of", "$90,000 CAD", shouting lines, place-name sub-headings.
    const all = names(keywords);
    for (const noise of ['CAD', 'Excel', 'MUST', 'ELIGIBLE', 'CANADA', 'SPONSORSHIP', 'RRSP']) expect(all, noise).not.toContain(noise);
    // Python is in the requirements, not because of the book club.
    expect(get('Python')!.section).toBe('required');
    // Mentioned under "Benefits > Canada" only, so the extra mention does not count.
    expect(get('Kubernetes')!.weight).toBe(2);
  });

  it('sorts by weight and respects the limit', () => {
    const weights = keywords.map((k) => k.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(jobKeywords(JOB, 5)).toHaveLength(5);
  });

  it('returns nothing for an empty description', () => {
    expect(jobKeywords([])).toEqual([]);
  });
});

describe('matchResume', () => {
  const keywords = jobKeywords(JOB);
  const doc = sampleResumeDoc();
  const report = matchResume(keywords, resumeText(doc, ''));

  it('lists what the resume has and what it lacks', () => {
    expect(names(report.matched)).toEqual(expect.arrayContaining(['Python', 'Java', 'Docker', 'PostgreSQL', 'React', 'TypeScript']));
    expect(names(report.missing)).toEqual(expect.arrayContaining(['Go', 'Kubernetes', 'Terraform', 'HIPAA', 'GCP', 'AWS']));
    expect(report.matched.length + report.missing.length).toBe(keywords.length);
  });

  it('scores the weighted share of keywords found', () => {
    const total = keywords.reduce((sum, k) => sum + k.weight, 0);
    const got = report.matched.reduce((sum, k) => sum + k.weight, 0);
    expect(report.score).toBe(Math.round((got / total) * 100));
    expect(report.score).toBeGreaterThan(20);
    expect(report.score).toBeLessThan(80);
  });

  it('goes up when the resume adds a missing skill', () => {
    const better = sampleResumeDoc();
    better.skills.push({ category: 'Cloud', items: ['Kubernetes', 'Terraform', 'Go'] });
    expect(matchResume(keywords, resumeText(better, '')).score).toBeGreaterThan(report.score);
  });

  it('matches common alternative spellings', () => {
    const k = jobKeywords(htmlToBlocks('<h3>Requirements</h3><ul><li>Experience with Postgres, k8s, Golang and Node</li></ul>'));
    const r = matchResume(k, 'Skills: PostgreSQL, Kubernetes, Go, Node.js');
    expect(r.missing).toEqual([]);
    expect(r.score).toBe(100);
  });

  it('scores zero when the job lists no keywords', () => {
    expect(matchResume([], 'anything').score).toBe(0);
  });
});
