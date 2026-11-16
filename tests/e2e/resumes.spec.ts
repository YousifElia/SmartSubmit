import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { renderResumePdf } from '../../src/core/pdf/resumeTemplate';
import { emptyProfile } from '../../src/core/defaults';
import type { Profile, Resume } from '../../src/core/types';
import { sampleResumeDoc } from '../fixtures/sampleResume';
import { expect, launchApp, PAGES, test, type App } from './harness';

const font = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, '../../public/fonts', name)));
const FONTS = { regular: font('Lato-Regular.ttf'), bold: font('Lato-Bold.ttf'), italic: font('Lato-Italic.ttf'), boldItalic: font('Lato-BoldItalic.ttf') };

const PASTED = `Avery Testerson
Windsor, ON | avery.testerson@example.com | (519) 555-0142 | linkedin.com/in/avery-testerson-example

EDUCATION
University of Windsor                                     Windsor, ON
Bachelor of Computer Science (Honours)                    Sep 2023 - May 2027

EXPERIENCE
Software Developer Co-op | Example Robotics | Windsor, ON     Jan 2025 - Apr 2025
• Built an internal dashboard in TypeScript and React
• Wrote Python services that stream robot telemetry

SKILLS
Languages: Python, TypeScript, Java
`;

async function openResumes(app: App): Promise<Page> {
  await app.dashboard.evaluate(() => (window.location.hash = '#/resumes'));
  await expect(app.dashboard.getByRole('heading', { name: 'Resumes', exact: true })).toBeVisible();
  return app.dashboard;
}

const resumesIn = (app: App) =>
  app.dashboard.evaluate(async () => {
    const chromeApi = (globalThis as unknown as { chrome: { storage: { local: { get(k: null): Promise<Record<string, unknown>> } } } }).chrome;
    const all = await chromeApi.storage.local.get(null);
    return Object.entries(all)
      .filter(([key]) => key.startsWith('r/resumes/'))
      .map(([, value]) => (value as { data: unknown }).data);
  }) as Promise<Resume[]>;

test.describe('Resumes', () => {
  test('a pasted resume is split into sections and attached as a generated PDF', async ({ app }) => {
    await app.seed();
    const page = await openResumes(app);

    await page.getByRole('button', { name: 'Paste text' }).click();
    await page.getByLabel('Name for this resume').fill('Software roles');
    await page.getByLabel('Resume text').fill(PASTED);
    await page.getByRole('button', { name: 'Add resume' }).click();

    const card = page.getByTestId('resume-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Software roles');
    await expect(card).toContainText('Default');
    await expect(card).toContainText('1 role · 1 school · 3 skills');

    const [stored] = await resumesIn(app);
    expect(stored!.doc?.experience[0]).toMatchObject({ title: 'Software Developer Co-op', company: 'Example Robotics', start: 'Jan 2025', end: 'Apr 2025' });

    // The preview builds a real PDF.
    await card.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByRole('button', { name: /Download Avery_Testerson_Resume\.pdf/ })).toBeEnabled();
    const built = await app.request<{ name: string; mime: string; base64: string }>('resume.file', { kind: 'resume', id: stored!.id });
    expect(built.mime).toBe('application/pdf');
    expect(Buffer.from(built.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();

    // On an application, that generated PDF is what gets attached.
    const form = await app.open(PAGES.greenhouse);
    await app.autofill(form);
    const state = await form.evaluate(() => (window as unknown as { __state: Record<string, unknown> }).__state);
    expect(state.resume).toBe('Avery_Testerson_Resume.pdf');
  });

  test('an uploaded PDF is read, kept as the original file, and can fill the profile', async ({ app }) => {
    // Start with an empty profile so the import has something to do.
    await app.seed({ profile: emptyProfile() });
    const page = await openResumes(app);

    const pdf = await renderResumePdf(sampleResumeDoc(), { fonts: FONTS, pageSize: 'letter' });
    await page.getByTestId('resume-file-input').setInputFiles({ name: 'avery_resume-2026.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });

    const card = page.getByTestId('resume-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('avery resume 2026');
    await expect(card).toContainText('PDF upload');
    await expect(card).toContainText('2 roles · 1 school · 1 project · 11 skills');
    await expect(card).toContainText('Attached to applications as your original file, avery_resume-2026.pdf');

    // The original bytes are stored untouched.
    const [stored] = await resumesIn(app);
    const file = await app.request<{ name: string; base64: string }>('resume.file', { kind: 'resume', id: stored!.id });
    expect(file.name).toBe('avery_resume-2026.pdf');
    expect(Buffer.from(file.base64, 'base64').equals(Buffer.from(pdf))).toBe(true);

    // Offer to fill the empty profile from it.
    await page.getByRole('button', { name: 'Fill my profile' }).click();
    await expect(page.getByText(/Filled in your name, email, phone, location/)).toBeVisible();
    const profile = (await app.request<{ profile: Profile }>('snapshot')).profile;
    expect(profile).toMatchObject({ firstName: 'Avery', lastName: 'Testerson', email: 'avery.testerson@example.com' });
    expect(profile.address).toMatchObject({ city: 'Windsor', region: 'Ontario', country: 'CA' });
    expect(profile.education[0]).toMatchObject({ school: 'University of Windsor', degree: 'bachelor', end: '2027-05' });
    expect(profile.experience).toHaveLength(2);
  });

  test('sections can be edited and the PDF follows', async ({ app }) => {
    await app.seed();
    const page = await openResumes(app);
    await page.getByRole('button', { name: 'Paste text' }).click();
    await page.getByLabel('Resume text').fill(PASTED);
    await page.getByRole('button', { name: 'Add resume' }).click();
    await page.getByRole('button', { name: 'Edit sections' }).click();

    await expect(page.getByLabel('Job title')).toHaveValue('Software Developer Co-op');
    await page.getByLabel('Job title').fill('Backend Developer Co-op');
    await page.getByLabel('Bullet points').fill('Shipped a telemetry pipeline\nCut dashboard load time by 80%');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    const [stored] = await resumesIn(app);
    expect(stored!.doc?.experience[0]).toMatchObject({
      title: 'Backend Developer Co-op',
      bullets: ['Shipped a telemetry pipeline', 'Cut dashboard load time by 80%'],
    });
  });

  test('the first resume is the default, and deleting it promotes the next', async ({ app }) => {
    await app.seed();
    const page = await openResumes(app);
    for (const name of ['First', 'Second']) {
      await page.getByRole('button', { name: 'Paste text' }).click();
      await page.getByLabel('Name for this resume').fill(name);
      await page.getByLabel('Resume text').fill(PASTED);
      await page.getByRole('button', { name: 'Add resume' }).click();
      await expect(page.getByTestId('resume-card').filter({ hasText: name })).toBeVisible();
    }
    const first = page.getByTestId('resume-card').filter({ hasText: 'First' });
    const second = page.getByTestId('resume-card').filter({ hasText: 'Second' });
    await expect(first).toContainText('Default');
    await expect(second).not.toContainText('Default');

    await first.getByRole('button', { name: 'Delete First' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByTestId('resume-card')).toHaveCount(1);
    await expect(second).toContainText('Default');
  });

  test('a PDF can be read in a browser without the newest built-in functions', async () => {
    // Chrome versions from before late 2025 lack Uint8Array.prototype.toHex,
    // which the current pdf.js expects; this switches it off to match them.
    const { app, close } = await launchApp({ args: ['--js-flags=--no-js-base-64'] });
    try {
      expect(await app.dashboard.evaluate(() => typeof (Uint8Array.prototype as unknown as { toHex?: unknown }).toHex)).toBe('undefined');
      await app.seed({ profile: emptyProfile() });
      const page = await openResumes(app);
      const pdf = await renderResumePdf(sampleResumeDoc(), { fonts: FONTS, pageSize: 'letter' });
      await page.getByTestId('resume-file-input').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
      await expect(page.getByTestId('resume-card')).toContainText('2 roles · 1 school · 1 project · 11 skills');
    } finally {
      await close();
    }
  });
});
