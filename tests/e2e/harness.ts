/**
 * Test harness: a real Chromium with the built extension loaded, and the
 * replica application forms served at the hostnames of the real sites, so the
 * extension's own match patterns and site detection are exercised.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { defaultSettings } from '../../src/core/defaults';
import type { Profile, Resume, ResumeDoc, SavedAnswer, Settings } from '../../src/core/types';

// Callbacks passed to `evaluate` run inside the extension, where `chrome` exists.
declare const chrome: {
  runtime: { sendMessage(message: unknown): Promise<{ ok: boolean; data?: unknown; error?: string } | undefined> };
  storage: { local: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> } };
};

const ROOT = resolve(import.meta.dirname, '../..');
const EXTENSION = join(ROOT, '.output/chrome-mv3-e2e');
const FIXTURES = join(ROOT, 'tests/fixtures/dist');

/** Where each replica is served. */
export const PAGES = {
  greenhouse: 'https://job-boards.greenhouse.io/acme/jobs/1001',
  lever: 'https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd/apply',
  ashby: 'https://jobs.ashbyhq.com/acme/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application',
  generic: 'https://careers.mapleleaf.example/apply',
  workday: 'https://acme.wd3.myworkdayjobs.com/en-US/AcmeCareers/job/CA-ON-Toronto/Software-Developer--Robotics-Platform_JR1234567/apply/applyManually',
  icims: 'https://careers-northwind.icims.com/jobs/1234/software-developer-co-op/candidate',
  icimsLogin: 'https://careers-northwind.icims.com/jobs/1234/software-developer-co-op/login',
  smartrecruiters: 'https://jobs.smartrecruiters.com/oneclick-ui/company/AcmeGames/publication/0b9e3c1a-5f7d-4e2b-9c8a-1d2e3f4a5b6c?dcr_ci=AcmeGames',
  workable: 'https://apply.workable.com/northwind-freight/j/B4F2A19C7D/apply/',
} as const;

const FILE_FOR_HOST: Record<string, string> = {
  'job-boards.greenhouse.io': 'greenhouse.html',
  'jobs.lever.co': 'lever.html',
  'jobs.ashbyhq.com': 'ashby.html',
  'careers.mapleleaf.example': 'generic.html',
  'acme.wd3.myworkdayjobs.com': 'workday.html',
};

/** The replica page for a URL: on Lever, the posting and its application form are separate pages. */
function pageFor(url: URL): string | undefined {
  if (url.hostname === 'jobs.lever.co' && !/\/apply\/?$/.test(url.pathname)) return 'lever-posting.html';
  // iCIMS: a wrapper page, and its iframe showing the posting, the sign-in step or the application.
  if (url.hostname === 'careers-northwind.icims.com') {
    if (url.searchParams.get('in_iframe') !== '1') return 'icims.html';
    if (url.pathname.endsWith('/login')) return 'icims-login.html';
    if (url.pathname.endsWith('/job')) return 'icims-job.html';
    return 'icims-form.html';
  }
  if (url.hostname === 'jobs.smartrecruiters.com' && url.pathname.startsWith('/oneclick-ui/')) return 'smartrecruiters.html';
  // SmartRecruiters' public posting API, open to any site.
  if (url.hostname === 'api.smartrecruiters.com') return '../smartrecruiters-posting.json';
  // Workable: the job data its pages load, and the application form.
  if (url.hostname === 'apply.workable.com') return url.pathname.startsWith('/api/') ? '../workable-job.json' : 'workable.html';
  // Workday's public job data, which its pages load from the same host.
  if (url.hostname.endsWith('.myworkdayjobs.com') && url.pathname.startsWith('/wday/cxs/')) return '../workday-job.json';
  return FILE_FOR_HOST[url.hostname];
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  webp: 'image/webp',
};

export function sampleProfile(): Profile {
  return {
    firstName: 'Avery',
    middleName: 'Quinn',
    lastName: 'Testerson',
    preferredName: '',
    pronouns: 'they/them',
    email: 'avery.testerson@example.com',
    phone: '519 555 0142',
    phoneCountry: 'CA',
    address: { line1: '401 Sunset Ave', line2: '', city: 'Windsor', region: 'Ontario', postalCode: 'N9B 3P4', country: 'CA' },
    links: {
      linkedin: 'https://www.linkedin.com/in/avery-testerson-example',
      github: 'https://github.com/avery-testerson-example',
      portfolio: '',
      website: 'https://avery.example/portfolio',
      twitter: '',
      other: [],
    },
    education: [
      {
        id: 'e1',
        school: 'University of Windsor',
        degree: 'bachelor',
        degreeName: 'Bachelor of Computer Science (Honours)',
        field: 'Computer Science',
        minor: '',
        start: '2023-09',
        end: '2027-05',
        current: true,
        gpa: '3.8',
        gpaScale: '4.0',
        city: 'Windsor',
        region: 'Ontario',
        country: 'CA',
      },
    ],
    experience: [
      {
        id: 'x1',
        company: 'Example Robotics',
        title: 'Software Developer Co-op',
        location: 'Windsor, ON',
        type: 'co-op',
        start: '2025-01',
        end: '2025-04',
        current: false,
        description: 'Built internal tools.',
      },
    ],
    workAuth: {
      CA: { authorized: 'yes', sponsorship: 'no', status: 'citizen', detail: '' },
      US: { authorized: 'no', sponsorship: 'yes', status: 'none', detail: '' },
    },
    preferences: {
      salary: '70000',
      salaryCurrency: 'CAD',
      startDate: '2027-05-03',
      noticePeriod: '2 weeks',
      relocate: 'yes',
      workMode: 'hybrid',
      over18: 'yes',
      howHeard: 'LinkedIn',
      yearsExperience: '1',
    },
    demographics: {
      gender: 'female',
      race: ['decline'],
      hispanic: 'no',
      veteran: 'not-veteran',
      disability: 'decline',
      indigenous: '',
      visibleMinority: '',
    },
  };
}

/** A tiny but valid PDF, standing in for an uploaded resume. */
export const TINY_PDF_BASE64 = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
).toString('base64');

export function sampleResume(): { resume: Resume; fileBase64: string } {
  return {
    resume: {
      id: 'r1',
      name: 'General resume',
      isDefault: true,
      source: 'upload',
      text: 'Avery Testerson\nSoftware developer',
      doc: null,
      file: { id: 'f1', name: 'Avery_Testerson_Resume.pdf', mime: 'application/pdf', size: 200 },
      createdAt: 1,
    },
    fileBase64: TINY_PDF_BASE64,
  };
}

export interface Report {
  filled: number;
  review: number;
  needs: number;
  groups: Record<string, string[]>;
}

export class App {
  constructor(
    readonly context: BrowserContext,
    readonly extensionId: string,
    readonly dashboard: Page,
  ) {}

  /** Send a request to the background script, as the dashboard would. */
  request<T = unknown>(type: string, payload?: unknown): Promise<T> {
    return this.dashboard.evaluate(
      async ([type, payload]) => {
        const reply = await chrome.runtime.sendMessage({ __smartsubmit: true, type, payload });
        if (!reply?.ok) throw new Error(reply?.error ?? 'No reply from the background script');
        return reply.data;
      },
      [type, payload] as const,
    ) as Promise<T>;
  }

  /**
   * Store test data. `resume: true` adds an uploaded PDF resume; passing a
   * ResumeDoc also gives it parsed sections (needed for keyword matching).
   */
  async seed(data: { profile?: Profile | null; answers?: SavedAnswer[]; resume?: boolean | ResumeDoc; settings?: (s: Settings) => Settings } = {}): Promise<void> {
    const mutations: unknown[] = [];
    if (data.profile !== null) mutations.push({ op: 'put', collection: 'profile', id: 'me', data: data.profile ?? sampleProfile() });
    for (const answer of data.answers ?? []) mutations.push({ op: 'put', collection: 'answers', id: answer.id, data: answer });
    if (data.resume) {
      const { resume, fileBase64 } = sampleResume();
      if (typeof data.resume === 'object') resume.doc = data.resume;
      mutations.push({ op: 'put', collection: 'resumes', id: resume.id, data: resume });
      mutations.push({ op: 'putFile', id: resume.file!.id, base64: fileBase64 });
    }
    const stored = (await this.dashboard.evaluate(async () => (await chrome.storage.local.get('s/settings'))['s/settings'] ?? null)) as Settings | null;
    const settings: Settings = { ...(stored ?? defaultSettings()), onboarded: true };
    mutations.push({ op: 'settings', value: data.settings ? data.settings(settings) : settings });
    await this.request('db.mutate', { mutations });
  }

  async open(url: string): Promise<Page> {
    const page = await this.context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return page;
  }

  /** Open the panel on a page and run autofill. */
  async autofill(page: Page): Promise<Report> {
    const panel = page.locator('smartsubmit-panel');
    await panel.locator('.launcher').click();
    await panel.locator('.primary').click();
    return this.report(page);
  }

  /** Read what the panel currently reports. */
  async report(page: Page): Promise<Report> {
    const panel = page.locator('smartsubmit-panel');
    await panel.locator('.stats').waitFor({ state: 'visible', timeout: 45_000 });
    const stats = await panel.locator('.stat b').allTextContents();
    const groups = await panel.locator('.group').evaluateAll((els) =>
      Object.fromEntries(
        els.map((g) => [
          (g.querySelector('header, summary')?.childNodes[0]?.textContent ?? '').trim(),
          [...g.querySelectorAll('.item, .save-item')].map((i) => (i.querySelector('.q')?.textContent ?? '').replace(/\s*\*$/, '').trim()),
        ]),
      ),
    );
    return { filled: Number(stats[0]), review: Number(stats[1]), needs: Number(stats[2]), groups };
  }
}

export interface LaunchOptions {
  /**
   * Real hosts this browser may reach, through the environment's proxy if it
   * has one (the sync server, for instance). Everything else is served from
   * the replicas or blocked.
   */
  network?: string[];
}

/** Launch Chromium with the built extension in a fresh profile. */
export async function launchApp(options: LaunchOptions = {}): Promise<{ app: App; close: () => Promise<void> }> {
  const profileDir = mkdtempSync(join(tmpdir(), 'smartsubmit-e2e-'));
  const network = new Set(options.network ?? []);
  const proxy = network.size > 0 && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1360, height: 950 },
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    proxy,
  });

  // Serve the replicas at the real hostnames; nothing else reaches the network.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:') return route.fallback();
    // Local test servers (a stand-in for Ollama) are reached for real.
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (network.has(url.hostname)) return route.continue();
    const page = pageFor(url);
    if (!page) return route.abort();
    const isAsset = url.pathname.includes('/assets/');
    const file = isAsset ? join(FIXTURES, 'assets', basename(url.pathname)) : join(FIXTURES, page);
    const ext = file.split('.').pop() ?? 'html';
    try {
      // JSON stands in for public APIs, which allow any site to read them.
      const headers = ext === 'json' ? { 'access-control-allow-origin': '*' } : undefined;
      await route.fulfill({ status: 200, contentType: TYPES[ext] ?? 'application/octet-stream', headers, body: readFileSync(file) });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });

  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker', { timeout: 20_000 });
  const extensionId = worker.url().split('/')[2]!;

  // Installing opens the dashboard on the setup screen; reuse that tab.
  const dashboard =
    context.pages().find((p) => p.url().includes('dashboard.html')) ??
    (await context.waitForEvent('page', { predicate: (p) => p.url().includes('dashboard.html'), timeout: 10_000 }).catch(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
      return page;
    }));
  await dashboard.waitForLoadState('domcontentloaded');

  return {
    app: new App(context, extensionId, dashboard),
    close: async () => {
      await context.close();
      rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

export const test = base.extend<{ app: App }>({
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    const { app, close } = await launchApp();
    await use(app);
    await close();
  },
});

export { expect } from '@playwright/test';
