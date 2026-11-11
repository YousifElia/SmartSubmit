/**
 * Tailoring and drafting against a real model. Skipped unless you point it at one:
 *
 *   SS_REAL_MODEL_PROVIDER=ollama SS_REAL_MODEL_URL=http://localhost:11434 SS_REAL_MODEL=qwen2.5:7b npx playwright test real-model
 *   SS_REAL_MODEL_PROVIDER=openai-compat SS_REAL_MODEL_URL=http://localhost:1234/v1 SS_REAL_MODEL=<name> npx playwright test real-model
 */
import type { Job, Settings, TailoredResume } from '../../src/core/types';
import { sampleResumeDoc } from '../fixtures/sampleResume';
import { expect, PAGES, test, type App } from './harness';

const provider = process.env.SS_REAL_MODEL_PROVIDER as 'ollama' | 'openai-compat' | undefined;
const url = process.env.SS_REAL_MODEL_URL ?? '';
const model = process.env.SS_REAL_MODEL ?? '';

test.skip(!provider || !url || !model, 'Set SS_REAL_MODEL_PROVIDER, SS_REAL_MODEL_URL and SS_REAL_MODEL to run against a real model.');
test.setTimeout(600_000);

const settings = (s: Settings): Settings => ({
  ...s,
  ai:
    provider === 'ollama'
      ? { ...s.ai, provider: 'ollama', ollamaUrl: url, ollamaModel: model }
      : { ...s.ai, provider: 'openai-compat', compatUrl: url, compatModel: model },
});

const records = <T>(app: App, collection: string) =>
  app.dashboard.evaluate(async (c) => {
    const all = await (globalThis as unknown as { chrome: { storage: { local: { get(k: null): Promise<Record<string, unknown>> } } } }).chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([key, value]) => key.startsWith(`r/${c}/`) && !(value as { deleted?: boolean }).deleted)
      .map(([, value]) => (value as { data: unknown }).data);
  }, collection) as Promise<T[]>;

test('a real model tailors a resume through the extension, and the result stays honest', async ({ app }) => {
  const original = sampleResumeDoc();
  await app.seed({ resume: original, settings });
  const form = await app.open(PAGES.lever);
  await app.autofill(form);
  await expect.poll(async () => (await records<Job>(app, 'jobs')).length).toBe(1);
  const [job] = await records<Job>(app, 'jobs');

  const page = app.dashboard;
  await page.bringToFront();
  await page.evaluate((id) => (window.location.hash = `#/tailor/${id}`), job!.id);
  await page.getByRole('button', { name: 'Tailor resume' }).click();
  await expect(page.getByRole('heading', { name: 'Review the tailored resume' })).toBeVisible({ timeout: 540_000 });
  await page.getByRole('button', { name: 'Save and use for this application' }).click();
  await expect.poll(async () => (await records<TailoredResume>(app, 'tailored')).length).toBe(1);
  const [tailored] = await records<TailoredResume>(app, 'tailored');

  // Whatever the model wrote, the saved version keeps the original's facts.
  const roles = (doc: typeof original) => doc.experience.map((e) => [e.company, e.title, e.start, e.end]);
  for (const role of roles(tailored!.doc)) expect(roles(original)).toContainEqual(role);
  expect(tailored!.doc.basics).toEqual(original.basics);
  const text = JSON.stringify(tailored!.doc);
  for (const invented of ['Kubernetes', 'Terraform', 'Golang']) expect(text).not.toContain(invented);
  console.log(`Tailored with ${model}: ${tailored!.doc.experience.length} roles, summary: ${tailored!.doc.summary || '(none)'}`);
});
