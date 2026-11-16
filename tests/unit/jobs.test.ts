import { describe, expect, it, vi } from 'vitest';
import { blocksToText, htmlToBlocks } from '@/core/jobs/html';
import { canonicalUrl, captureJob, companyFromHost, jobCountry, postingKey, smartRecruitersIds, workdayIds } from '@/core/jobs/extract';
import {
  ASHBY_PAGE,
  GENERIC_PAGE,
  GREENHOUSE_API,
  GREENHOUSE_EMBED_PAGE,
  GREENHOUSE_PAGE,
  ICIMS_JOB_PAGE,
  ICIMS_LOGIN_PAGE,
  LEVER_APPLY_PAGE,
  LEVER_POSTING_PAGE,
  SMARTRECRUITERS_API,
  SMARTRECRUITERS_POSTING_PAGE,
  WORKABLE_API,
  WORKABLE_APPLY_PAGE,
  WORKDAY_API,
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
    // Application systems' hosts name the employer in the first label.
    expect(companyFromHost('careers-northwind.icims.com')).toBe('Northwind');
    expect(companyFromHost('uscareers-acme.icims.com')).toBe('Acme');
    expect(companyFromHost('nvidia.wd5.myworkdayjobs.com')).toBe('Nvidia');
    expect(companyFromHost('acme-careers.example.com')).toBe('Example');
    expect(companyFromHost('www.acme.com')).toBe('Acme');
    expect(companyFromHost('jobs.example.co')).toBe('Example');
  });
});

describe('Workday', () => {
  const posting = 'https://acme.wd3.myworkdayjobs.com/en-US/AcmeCareers/job/CA-ON-Toronto/Software-Developer--Robotics-Platform_JR1234567';

  it('finds the tenant, site and job in any of its addresses', () => {
    const expected = { tenant: 'acme', site: 'AcmeCareers', path: '/job/CA-ON-Toronto/Software-Developer--Robotics-Platform_JR1234567', req: 'JR1234567' };
    expect(workdayIds(new URL(posting))).toEqual(expected);
    expect(workdayIds(new URL(`${posting}/apply/applyManually`))).toEqual(expected);
    expect(workdayIds(new URL('https://acme.wd3.myworkdayjobs.com/AcmeCareers/job/CA-ON-Toronto/Software-Developer--Robotics-Platform_JR1234567'))).toEqual(expected);
    expect(workdayIds(new URL('https://wd3.myworkdaysite.com/en-US/recruiting/acme/AcmeCareers/job/CA-ON-Toronto/Software-Developer--Robotics-Platform_JR1234567/apply'))).toEqual(expected);
    expect(workdayIds(new URL('https://acme.wd3.myworkdayjobs.com/en-US/AcmeCareers'))).toBeNull();
  });

  it('reads the posting from Workday’s job data, naming the company by its brand', async () => {
    const fetcher = vi.fn(async () => response(WORKDAY_API));
    const job = await captureJob(parse('<html><body><main></main></body></html>'), 'workday', `${posting}/apply/applyManually`, fetcher);
    expect(fetcher).toHaveBeenCalledWith('https://acme.wd3.myworkdayjobs.com/wday/cxs/acme/AcmeCareers/job/CA-ON-Toronto/Software-Developer--Robotics-Platform_JR1234567');
    expect(job).toMatchObject({
      key: 'workday:acme/jr1234567',
      title: 'Software Developer, Robotics Platform',
      company: 'ACME',
      location: 'CA, ON, Toronto',
      url: WORKDAY_API.jobPostingInfo.externalUrl,
    });
    expect(job!.description).toContain('Experience with Kubernetes');
    expect(jobCountry(job!.location)).toBe('CA');
    expect(postingKey('workday', new URL(posting))).toBe(job!.key);
  });

  it('adds the country when the location doesn’t name one', async () => {
    const data = { ...WORKDAY_API, jobPostingInfo: { ...WORKDAY_API.jobPostingInfo, location: 'Remote', country: { descriptor: 'United States of America' } } };
    const job = await captureJob(parse('<html></html>'), 'workday', posting, async () => response(data));
    expect(job!.location).toBe('Remote (United States of America)');
    expect(jobCountry(job!.location)).toBe('US');
  });
});

describe('iCIMS', () => {
  it('reads the posting page’s schema.org data', async () => {
    const job = await captureJob(parse(ICIMS_JOB_PAGE), 'icims', 'https://careers-northwind.icims.com/jobs/1234/software-developer-co-op/job?in_iframe=1&mobile=false', noFetch);
    expect(job).toMatchObject({
      key: 'icims:careers-northwind.icims.com/1234',
      title: 'Software Developer Co-op',
      company: 'Northwind Systems, Inc',
      location: 'Waterloo, ON, CA',
      url: 'https://careers-northwind.icims.com/jobs/1234/software-developer-co-op/job',
    });
    expect(job!.description).toContain('Experience with C++ or Python');
  });

  it('fetches the posting from the sign-in step, which shows none of it', async () => {
    const fetcher = vi.fn(async () => response(ICIMS_JOB_PAGE));
    const job = await captureJob(parse(ICIMS_LOGIN_PAGE), 'icims', 'https://careers-northwind.icims.com/jobs/1234/software-developer-co-op/login?in_iframe=1', fetcher);
    expect(fetcher).toHaveBeenCalledWith('https://careers-northwind.icims.com/jobs/1234/software-developer-co-op/job?in_iframe=1');
    expect(job).toMatchObject({ key: 'icims:careers-northwind.icims.com/1234', title: 'Software Developer Co-op' });
  });
});

describe('SmartRecruiters', () => {
  const apply = `https://jobs.smartrecruiters.com/oneclick-ui/company/AcmeGames/publication/${SMARTRECRUITERS_API.uuid}?dcr_ci=AcmeGames`;
  const postingPage = 'https://jobs.smartrecruiters.com/AcmeGames/744000123456789-tools-programmer-python-';

  it('knows the posting from either of its addresses', () => {
    expect(smartRecruitersIds(new URL(apply))).toEqual({ company: 'AcmeGames', posting: SMARTRECRUITERS_API.uuid });
    expect(smartRecruitersIds(new URL(postingPage))).toEqual({ company: 'AcmeGames', posting: '744000123456789' });
  });

  it('reads the posting from the public API on the application page', async () => {
    const fetcher = vi.fn(async () => response(SMARTRECRUITERS_API));
    const job = await captureJob(parse('<html><body><div id="app"></div></body></html>'), 'smartrecruiters', apply, fetcher);
    expect(fetcher).toHaveBeenCalledWith(`https://api.smartrecruiters.com/v1/companies/AcmeGames/postings/${SMARTRECRUITERS_API.uuid}`);
    expect(job).toMatchObject({
      key: `smartrecruiters:acmegames/${SMARTRECRUITERS_API.uuid}`,
      title: 'Tools Programmer (Python)',
      company: 'Acme Games',
      location: 'Montreal, QC, Canada',
      url: SMARTRECRUITERS_API.postingUrl,
    });
    expect(job!.blocks).toContainEqual({ type: 'heading', text: 'Qualifications' });
    expect(job!.description).toContain('Experience with REST APIs and PostgreSQL');
  });

  it('falls back to the posting page’s microdata, under the same identity', async () => {
    const job = await captureJob(parse(SMARTRECRUITERS_POSTING_PAGE), 'smartrecruiters', postingPage, noFetch);
    expect(job).toMatchObject({
      key: `smartrecruiters:acmegames/${SMARTRECRUITERS_API.uuid}`,
      title: 'Tools Programmer (Python)',
      company: 'Acme Games',
      location: 'Montreal, Québec, Canada',
    });
    expect(job!.description).toContain('Build the tools our artists use every day.');
    expect(job!.description).not.toContain('I’m interested');
  });
});

describe('Workable', () => {
  it('reads the posting from the job data Workable’s pages load', async () => {
    const fetcher = vi.fn(async () => response(WORKABLE_API));
    const job = await captureJob(parse(WORKABLE_APPLY_PAGE), 'workable', 'https://apply.workable.com/northwind-freight/j/B4F2A19C7D/apply/', fetcher);
    expect(fetcher).toHaveBeenCalledWith('https://apply.workable.com/api/v2/accounts/northwind-freight/jobs/B4F2A19C7D');
    expect(job).toMatchObject({
      key: 'workable:northwind-freight/b4f2a19c7d',
      title: 'Junior Backend Developer',
      company: 'Northwind Freight',
      location: 'Vancouver, British Columbia, Canada',
      url: 'https://apply.workable.com/northwind-freight/j/B4F2A19C7D/',
    });
    expect(job!.blocks).toContainEqual({ type: 'heading', text: 'Requirements' });
    expect(postingKey('workable', new URL('https://apply.workable.com/northwind-freight/j/B4F2A19C7D/'))).toBe(job!.key);
  });

  it('still has the title and company when the job data can’t be fetched', async () => {
    const job = await captureJob(parse(WORKABLE_APPLY_PAGE), 'workable', 'https://apply.workable.com/northwind-freight/j/B4F2A19C7D/apply/', noFetch);
    expect(job).toMatchObject({ title: 'Junior Backend Developer', company: 'Northwind Freight' });
  });
});
