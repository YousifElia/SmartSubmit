import type { Page } from '@playwright/test';
import type { Job, ResumeDoc, Settings, TailoredResume } from '../../src/core/types';
import { sampleResumeDoc } from '../fixtures/sampleResume';
import { startFakeOllama, type FakeOllama } from './fakeOllama';
import { expect, PAGES, test, type App } from './harness';

const records = <T>(app: App, collection: string) =>
  app.dashboard.evaluate(async (c) => {
    const chromeApi = (globalThis as unknown as { chrome: { storage: { local: { get(k: null): Promise<Record<string, unknown>> } } } }).chrome;
    const all = await chromeApi.storage.local.get(null);
    return Object.entries(all)
      .filter(([key, value]) => key.startsWith(`r/${c}/`) && !(value as { deleted?: boolean }).deleted)
      .map(([, value]) => (value as { data: unknown }).data);
  }, collection) as Promise<T[]>;

const withOllama = (url: string) => (s: Settings): Settings => ({ ...s, ai: { ...s.ai, provider: 'ollama', ollamaUrl: url, ollamaModel: 'qwen2.5:7b' } });

/** What a careless model might send back: some honest edits, some inventions. */
function cheatingReply(): string {
  const doc: ResumeDoc = sampleResumeDoc();
  doc.experience[0]!.title = 'Senior Software Engineer';
  doc.experience[0]!.bullets[2] = 'Added integration tests to the CI/CD deployment pipeline, catching 3 regressions before release.';
  doc.experience.push({ company: 'Google', title: 'Staff Engineer', location: 'Toronto, ON', start: '2020', end: '2023', bullets: ['Led a team of 12'] });
  doc.skills = [{ category: 'Languages', items: ['TypeScript', 'Python', 'Java', 'Kubernetes'] }];
  doc.order = ['experience', 'skills', 'projects', 'education', 'extra:Awards'];
  return JSON.stringify({
    resume: doc,
    changes: [
      { section: 'Experience', before: 'Added integration tests to the deployment pipeline', after: 'Added integration tests to the CI/CD deployment pipeline', reason: 'The posting mentions CI/CD' },
      { section: 'Skills', before: 'Python, TypeScript', after: 'TypeScript, Python', reason: 'TypeScript first, as the posting lists it' },
    ],
    gaps: ['Kubernetes'],
  });
}

async function trackGreenhouseJob(app: App): Promise<Job> {
  const form = await app.open(PAGES.greenhouse);
  await app.autofill(form);
  await expect.poll(async () => (await records<Job>(app, 'jobs')).length).toBe(1);
  await form.close();
  return (await records<Job>(app, 'jobs'))[0]!;
}

let ollama: FakeOllama;
test.beforeEach(async () => {
  ollama = await startFakeOllama();
});
test.afterEach(async () => {
  await ollama.close();
});

test.describe('AI', () => {
  test('settings explain the one-time Ollama setup, then connect', async ({ app }) => {
    await app.seed();
    ollama.allowExtensions = false;
    const page = app.dashboard;
    await page.evaluate(() => (window.location.hash = '#/ai'));
    await page.getByRole('button', { name: 'Set up a local model' }).click();
    await page.getByLabel('Address').fill(ollama.url);
    await page.getByRole('button', { name: 'Check connection' }).click();
    await expect(page.getByText('Ollama needs to be told to accept SmartSubmit')).toBeVisible();
    await page.getByRole('tab', { name: 'macOS' }).click();
    await expect(page.locator('pre').first()).toHaveText('launchctl setenv OLLAMA_ORIGINS "chrome-extension://*,moz-extension://*"');
    // The request really came from the extension.
    expect(ollama.requests.at(-1)!.origin).toMatch(/^chrome-extension:\/\//);

    ollama.allowExtensions = true;
    await page.getByRole('button', { name: 'Check connection' }).click();
    await expect(page.getByText('Connected. 2 models available; SmartSubmit will use llama3.2:3b.')).toBeVisible();
    await page.getByLabel('Model').selectOption('qwen2.5:7b');
    await expect(page.getByText('SmartSubmit will use qwen2.5:7b.')).toBeVisible();
  });

  test('tailoring on a local model keeps the facts and attaches the result', async ({ app }) => {
    await app.seed({ resume: sampleResumeDoc(), settings: withOllama(ollama.url) });
    ollama.respond = cheatingReply;
    const job = await trackGreenhouseJob(app);

    const page = app.dashboard;
    await page.bringToFront();
    await page.evaluate((id) => (window.location.hash = `#/tailor/${id}`), job.id);
    await expect(page.getByText('Automatic, with qwen2.5:7b.')).toBeVisible();
    await page.getByRole('button', { name: 'Tailor resume' }).click();
    await expect(page.getByRole('heading', { name: 'Review the tailored resume' })).toBeVisible();

    // The request asked for schema-constrained JSON and carried the job and resume.
    const chat = ollama.requests.find((r) => r.path === '/api/chat')!.body as { format: { type: string }; messages: { content: string }[] };
    expect(chat.format.type).toBe('object');
    expect(chat.messages[1]!.content).toContain('Title: Software Developer Intern');
    expect(chat.messages[1]!.content).toContain('Example Robotics');

    // What the guard did is shown, and the result is honest.
    const notes = page.getByTestId('guard-notes');
    await expect(notes).toContainText("Took out: A role your resume doesn't have: Staff Engineer at Google");
    await expect(notes).toContainText('Took out: Skill: Kubernetes');
    await expect(notes).toContainText('Put back as in your original: Software Developer Co-op at Example Robotics');
    await expect(page.getByLabel('Job title').first()).toHaveValue('Software Developer Co-op');
    await expect(page.getByText('TypeScript first, as the posting lists it')).toBeVisible();

    await page.getByRole('button', { name: 'Save and use for this application' }).click();
    await expect(page.getByText('Saved and attached to this application')).toBeVisible();
    const [tailored] = await records<TailoredResume>(app, 'tailored');
    expect(tailored).toMatchObject({ jobId: job.id, resumeId: 'r1', via: 'ollama' });
    expect(tailored!.doc.experience.map((e) => e.company)).toEqual(['Example Robotics', 'University of Windsor']);
    expect(tailored!.doc.skills).toEqual([{ category: 'Languages', items: ['TypeScript', 'Python', 'Java'] }]);
    expect((await records<Job>(app, 'jobs'))[0]!.resumeRef).toEqual({ kind: 'tailored', id: tailored!.id });

    // Back on the application, the tailored version is chosen and attached as a PDF.
    const form = await app.open(PAGES.greenhouse);
    await app.autofill(form);
    await expect(form.locator('smartsubmit-panel #ss-resume')).toHaveValue(`tailored:${tailored!.id}`);
    const state = await form.evaluate(() => (window as unknown as { __state: Record<string, unknown> }).__state);
    expect(state.resume).toBe('Avery_Testerson_Resume_Acme_Robotics.pdf');
  });

  test('tailoring through claude.ai works by copy and paste', async ({ app }) => {
    await app.seed({ resume: sampleResumeDoc() });
    const job = await trackGreenhouseJob(app);
    const page = app.dashboard;
    await page.bringToFront();
    await page.evaluate((id) => (window.location.hash = `#/tailor/${id}`), job.id);
    // No local model: Claude is the choice.
    await expect(page.getByRole('button', { name: /Model on this computer/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Tailor resume' }).click();
    await expect(page.getByRole('button', { name: 'Copy request' })).toBeVisible();
    await page.getByText(/See what will be sent/).click();
    await expect(page.locator('pre')).toContainText('You edit; you never invent.');
    await expect(page.locator('pre')).toContainText('so I can paste it back into SmartSubmit.');

    // A reply as copied from a chat: prose around a fenced block.
    await page.getByLabel('Claude’s reply').fill(`Here is your tailored resume:\n\n\`\`\`json\n${cheatingReply()}\n\`\`\`\n\nGood luck!`);
    await page.getByRole('button', { name: 'Review the changes' }).click();
    await expect(page.getByTestId('guard-notes')).toContainText('Skill: Kubernetes');
    await expect(page.getByTestId('gaps')).toContainText('Kubernetes');
    await page.getByRole('button', { name: 'Save and use for this application' }).click();
    await expect.poll(async () => (await records<TailoredResume>(app, 'tailored'))[0]?.via).toBe('claude-handoff');
  });

  test('a garbled reply gets a clear message instead of a broken resume', async ({ app }) => {
    await app.seed({ resume: sampleResumeDoc() });
    const job = await trackGreenhouseJob(app);
    const page = app.dashboard;
    await page.bringToFront();
    await page.evaluate((id) => (window.location.hash = `#/tailor/${id}`), job.id);
    await page.getByRole('button', { name: 'Tailor resume' }).click();
    await page.getByLabel('Claude’s reply').fill('Sorry, I can’t help with that.');
    await page.getByRole('button', { name: 'Review the changes' }).click();
    await expect(page.getByText(/doesn’t look like the reply SmartSubmit asked for/)).toBeVisible();
  });

  test('the panel drafts an answer on request and inserts it only when asked', async ({ app }) => {
    await app.seed({ resume: sampleResumeDoc(), settings: withOllama(ollama.url) });
    ollama.respond = () => 'Here is a draft:\n\nI want to build tools that warehouse teams rely on every day, and my co-op building robot dashboards at Example Robotics showed me how much good tooling matters.';
    const form = await app.open(PAGES.greenhouse);
    await app.autofill(form);
    const panel = form.locator('smartsubmit-panel');
    const need = panel.locator('.need', { hasText: 'Why do you want to work at Acme Robotics?' });
    await need.getByRole('button', { name: 'Draft with AI' }).click();
    const draft = need.getByLabel('Draft answer');
    await expect(draft).toHaveValue(/^I want to build tools/);
    // Nothing goes into the form until the user says so.
    await expect(form.locator('#question_1001')).toHaveValue('');
    await draft.fill('I want to build tools that warehouse teams rely on.');
    await need.getByRole('button', { name: 'Insert into the form' }).click();
    await expect(form.locator('#question_1001')).toHaveValue('I want to build tools that warehouse teams rely on.');
    await expect(form.locator('#question_1001')).toHaveAttribute('data-smartsubmit-state', 'review');

    // The model was given the question, the posting and the resume.
    const prompt = (ollama.requests.at(-1)!.body as { messages: { content: string }[] }).messages[1]!.content;
    expect(prompt).toContain('Why do you want to work at Acme Robotics?');
    expect(prompt).toContain('Software Developer Co-op, Example Robotics');
    expect(prompt).toContain('Build internal tools in TypeScript and React');
  });

  test('without a local model, the panel prepares the request for claude.ai', async ({ app }) => {
    await app.seed({ resume: sampleResumeDoc() });
    await app.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://job-boards.greenhouse.io' });
    const form = await app.open(PAGES.greenhouse);
    await app.autofill(form);
    const panel = form.locator('smartsubmit-panel');
    const need = panel.locator('.need', { hasText: 'Why do you want to work at Acme Robotics?' });
    const [claude] = await Promise.all([app.context.waitForEvent('page'), need.getByRole('button', { name: 'Draft with Claude' }).click()]);
    expect(claude.url()).toBe('https://claude.ai/new');
    const copied = await form.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('<question>\nWhy do you want to work at Acme Robotics?\n</question>');
    expect(copied).toContain('Reply with only the answer text');

    await need.getByLabel('Draft answer').fill('Because robots.');
    await need.getByRole('button', { name: 'Insert into the form' }).click();
    await expect(form.locator('#question_1001')).toHaveValue('Because robots.');
  });
});

void (null as unknown as Page);
