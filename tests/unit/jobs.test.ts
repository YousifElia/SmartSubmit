import { describe, expect, it, vi } from 'vitest';
import { blocksToText, htmlToBlocks } from '@/core/jobs/html';
import { canonicalUrl, captureJob, companyFromHost, jobCountry, postingKey } from '@/core/jobs/extract';
import {
  ASHBY_PAGE,
  GENERIC_PAGE,
  GREENHOUSE_API,
  GREENHOUSE_EMBED_PAGE,
  GREENHOUSE_PAGE,
  LEVER_APPLY_PAGE,
  LEVER_POSTING_PAGE,
} from '../fixtures/pages/jobs';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const response = (body: string | object, ok = true) =>
  ({ ok, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }) as Response;
const noFetch = vi.fn(async () => response('', false));

describe('htmlToBlocks', () => {
  it('keeps headings, paragraphs, emphasis and nested bullets', () => {
    const blocks = htmlToBlocks(
      '<h2>About</h2><p>We <strong>ship</strong> <em>fast</em>.</p><p><b>Requirements</b></p><ul><li>One<ul><li>One-a</li></ul></li><li>Two</li></ol>',
    );
    expect(blocks).toEqual([
      { type: 'heading', text: 'About' },
      { type: 'paragraph', runs: [{ text: 'We ' }, { text: 'ship', bold: true }, { text: ' ' }, { text: 'fast', italic: true }, { text: '.' }] },
      { type: 'heading', text: 'Requirements' },
      { type: 'bullet', runs: [{ text: 'One' }], level: 0 },
      { type: 'bullet', runs: [{ text: 'One-a' }], level: 1 },
      { type: 'bullet', runs: [{ text: 'Two' }], level: 0 },
    ]);
  });

  it('splits on line breaks and drops empty and non-text content', () => {
    const blocks = htmlToBlocks('<div>Line one<br>Line two</div><p>&nbsp;</p><script>alert(1)</script><img src=x onerror=alert(1)><p>End</p>');
    expect(blocksToText(blocks)).toBe('Line one\n\nLine two\n\nEnd');
  });

  it('reads descriptions that were escaped twice', () => {
    expect(blocksToText(htmlToBlocks('&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;'))).toBe('Hello & welcome');
  });

  it('does not treat a bold sentence as a heading', () => {
    const [block] = htmlToBlocks('<p><strong>This is an important sentence about the role.</strong></p>');
    expect(block!.type).toBe('paragraph');
  });
});

describe('captureJob', () => {
  it('reads a Greenhouse job board page', async () => {
    const job = await captureJob(parse(GREENHOUSE_PAGE), 'greenhouse', 'https://job-boards.greenhouse.io/acme/jobs/1001?gh_src=abc', noFetch);
    expect(job).toMatchObject({
      key: 'greenhouse:acme/1001',
      url: 'https://job-boards.greenhouse.io/acme/jobs/1001',
      title: 'Software Developer Intern',
      company: 'Acme Robotics',
      location: 'Windsor, Ontario',
    });
    expect(job!.description).toContain('Acme Robotics builds warehouse robots');
    expect(job!.description).toContain("What you'll need\n• Experience with Python, Go, or Rust");
    expect(job!.description).toContain('  • Mostly gRPC');
    expect(job!.description).not.toContain('secret');
    expect(job!.blocks.filter((b) => b.type === 'heading').map((b) => (b as { text: string }).text)).toEqual(["What you'll do", "What you'll need", 'Benefits']);
    // Everything was on the page: no network request needed.
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('asks the Greenhouse API when the form is embedded without its description', async () => {
    const fetcher = vi.fn(async () => response(GREENHOUSE_API));
    const job = await captureJob(parse(GREENHOUSE_EMBED_PAGE), 'greenhouse', 'https://job-boards.greenhouse.io/embed/job_app?for=northwind&token=4242', fetcher);
    expect(fetcher).toHaveBeenCalledWith('https://boards-api.greenhouse.io/v1/boards/northwind/jobs/4242');
    expect(job).toMatchObject({
      key: 'greenhouse:northwind/4242',
      url: 'https://job-boards.greenhouse.io/northwind/jobs/4242',
      title: 'Data Engineer',
      company: 'Northwind',
      location: 'Toronto, Ontario, Canada',
    });
    expect(job!.description).toBe('Northwind moves data for thousands of stores.\n\nRequirements\n• SQL and Airflow\n• Experience with Snowflake or BigQuery');
  });

  it('fetches the Lever posting page from the application page', async () => {
    const fetcher = vi.fn(async () => response(LEVER_POSTING_PAGE));
    const href = 'https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd/apply?lever-source=LinkedIn';
    const job = await captureJob(parse(LEVER_APPLY_PAGE), 'lever', href, fetcher);
    expect(fetcher).toHaveBeenCalledWith('https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd');
    expect(job).toMatchObject({
      key: 'lever:acme/6ed76ce8-4156-4b60-b120-403538bd66cd',
      url: 'https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd',
      title: 'Software Developer Intern',
      company: 'Acme Robotics',
      location: 'Windsor, ON',
    });
    expect(job!.description).toContain('Requirements\n• Python and C++\n• ROS2 experience');
  });

  it('falls back to the Lever page header when the posting page cannot be fetched', async () => {
    const job = await captureJob(parse(LEVER_APPLY_PAGE), 'lever', 'https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd/apply', noFetch);
    expect(job).toMatchObject({ title: 'Software Developer Intern', company: 'Acme Robotics', location: 'Windsor, ON', description: '' });
  });

  it('reads schema.org data on Ashby, including remote locations', async () => {
    const job = await captureJob(parse(ASHBY_PAGE), 'ashby', 'https://jobs.ashbyhq.com/acme/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application', noFetch);
    expect(job).toMatchObject({
      key: 'ashby:acme/34413f8d-26bf-4bbc-8ade-eb309a0e2245',
      url: 'https://jobs.ashbyhq.com/acme/34413f8d-26bf-4bbc-8ade-eb309a0e2245',
      title: 'Security Engineer, Cloud',
      company: 'Acme Robotics',
      location: 'New York City, NY, USA · Remote (Canada, United States)',
    });
    expect(job!.description).toContain('What You Need\n• 3 years building in AWS with Terraform');
  });

  it('reads an unknown careers page from its heading and text, leaving out the form and menus', async () => {
    const job = await captureJob(parse(GENERIC_PAGE), 'generic', 'https://careers.mapleleaf.example/apply#top', noFetch);
    expect(job).toMatchObject({
      key: 'generic:careers.mapleleaf.example/',
      url: 'https://careers.mapleleaf.example/',
      title: 'Junior Data Analyst (Co-op)',
      company: 'Maple Leaf Analytics',
    });
    expect(job!.description).toBe(
      'Maple Leaf Analytics is hiring a co-op student for the fall term in Toronto, Ontario. You will build dashboards in Tableau and write SQL against our warehouse.',
    );
  });

  it('returns null for a page with no job on it', async () => {
    expect(await captureJob(parse('<html><body><p>Hi</p></body></html>'), 'generic', 'https://example.com/', noFetch)).toBeNull();
  });
});

describe('jobCountry', () => {
  it.each([
    ['Windsor, ON', 'CA'],
    ['Windsor, Ontario', 'CA'],
    ['Toronto, Ontario, Canada', 'CA'],
    ['Austin, TX', 'US'],
    ['San Francisco Bay Area or Remote (U.S.)', 'US'],
    ['Remote - United States', 'US'],
    ['London, UK', 'GB'],
    ['Singapore, Singapore', 'SG'],
    // California or Canada? Too ambiguous to rely on.
    ['San Francisco, CA', ''],
    ['New York City, NY, USA · Remote (Canada, United States)', ''],
    ['Remote', ''],
    ['Atlanta, Georgia', ''],
    ['', ''],
  ])('%s → %s', (location, expected) => {
    expect(jobCountry(location)).toBe(expected);
  });
});

describe('posting identity', () => {
  it('strips tracking and application suffixes', () => {
    expect(canonicalUrl(new URL('https://jobs.lever.co/a/123/apply?lever-source=x&utm_source=y#z'))).toBe('https://jobs.lever.co/a/123');
    expect(canonicalUrl(new URL('https://jobs.ashbyhq.com/a/123/application'))).toBe('https://jobs.ashbyhq.com/a/123');
  });
  it('gives the posting page and its application page the same key', () => {
    const a = postingKey('lever', new URL('https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd'));
    const b = postingKey('lever', new URL('https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd/apply?x=1'));
    expect(a).toBe(b);
    expect(postingKey('greenhouse', new URL('https://boards.greenhouse.io/acme/jobs/55?gh_src=1'))).toBe(
      postingKey('greenhouse', new URL('https://job-boards.greenhouse.io/embed/job_app?for=acme&token=55')),
    );
  });
  it('names a company after its domain as a last resort', () => {
    expect(companyFromHost('careers.mapleleaf.example')).toBe('Mapleleaf');
    expect(companyFromHost('www.acme.com')).toBe('Acme');
    expect(companyFromHost('jobs.example.co')).toBe('Example');
  });
});
