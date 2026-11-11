import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { Job } from '../../src/core/types';
import { sampleResumeDoc } from '../fixtures/sampleResume';
import { expect, PAGES, test, type App } from './harness';

const jobs = (app: App) =>
  app.dashboard.evaluate(async () => {
    const chromeApi = (globalThis as unknown as { chrome: { storage: { local: { get(k: null): Promise<Record<string, unknown>> } } } }).chrome;
    const all = await chromeApi.storage.local.get(null);
    return Object.entries(all)
      .filter(([key, value]) => key.startsWith('r/jobs/') && !(value as { deleted?: boolean }).deleted)
      .map(([, value]) => (value as { data: Job }).data);
  }) as Promise<Job[]>;

const panel = (page: Page) => page.locator('smartsubmit-panel');

test.describe('Jobs', () => {
  test('autofilling logs the job, and pressing Submit marks it applied', async ({ app }) => {
    await app.seed({ resume: sampleResumeDoc() });
    const page = await app.open(PAGES.greenhouse);

    // Opening the panel shows the job but does not track it.
    await panel(page).locator('.launcher').click();
    await expect(panel(page).locator('.job-title')).toHaveText('Software Developer Intern');
    await expect(panel(page).locator('.job-meta').first()).toHaveText('Acme Robotics · Windsor, Ontario');
    expect(await jobs(app)).toEqual([]);

    await panel(page).locator('.primary').click();
    await app.report(page);
    await expect.poll(async () => (await jobs(app)).length).toBe(1);
    const [started] = await jobs(app);
    expect(started).toMatchObject({
      key: 'greenhouse:acme/1001',
      url: 'https://job-boards.greenhouse.io/acme/jobs/1001',
      title: 'Software Developer Intern',
      company: 'Acme Robotics',
      location: 'Windsor, Ontario',
      status: 'started',
      appliedAt: null,
      resumeRef: { kind: 'resume', id: 'r1' },
    });
    expect(started!.description).toContain('Build internal tools in TypeScript and React');
    await expect(panel(page).getByText('In your tracker as “Started”.')).toBeVisible();

    // The keyword match for the attached resume.
    await expect(panel(page).locator('.score')).toHaveText(/^\d+%$/);
    await panel(page).locator('.match summary').click();
    await expect(panel(page).locator('.kw').first()).toBeVisible();

    // The user submits the application themselves.
    await page.getByRole('button', { name: 'Submit application' }).click();
    await expect.poll(async () => (await jobs(app))[0]?.status).toBe('applied');
    expect((await jobs(app))[0]!.appliedAt).toBeGreaterThan(0);
    await expect(panel(page).locator('.tracked')).toContainText('Applied');
  });

  test('saves the posting as a PDF from the panel', async ({ app }) => {
    await app.seed();
    const page = await app.open(PAGES.greenhouse);
    await panel(page).locator('.launcher').click();
    await expect(panel(page).locator('.job-title')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), panel(page).getByRole('button', { name: 'Save posting as PDF' }).click()]);
    expect(download.suggestedFilename()).toBe('Acme_Robotics_Software_Developer_Intern_Posting.pdf');
    const file = await download.path();
    expect(readFileSync(file).subarray(0, 5).toString()).toBe('%PDF-');
    const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    expect(text).toContain('Software Developer Intern');
    expect(text).toContain('Acme Robotics');
    expect(text).toContain('Build internal tools in TypeScript and React');
    expect(text).toContain('job-boards.greenhouse.io/acme/jobs/1001');
    // Saving the posting adds it to the tracker as "Saved".
    await expect.poll(async () => (await jobs(app))[0]?.status).toBe('saved');
  });

  test('reads a Lever posting from the page behind the form and uses its country', async ({ app }) => {
    await app.seed({ resume: sampleResumeDoc() });
    const page = await app.open(PAGES.lever);
    await app.autofill(page);
    await expect.poll(async () => (await jobs(app)).length).toBe(1);
    const [job] = await jobs(app);
    expect(job).toMatchObject({
      key: 'lever:acme/6ed76ce8-4156-4b60-b120-403538bd66cd',
      url: 'https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd',
      company: 'Acme Robotics',
      location: 'Windsor, ON',
    });
    expect(job!.description).toContain('Comfort with Docker, Kubernetes and Linux');
    // The resume has Python, Java, Docker, Linux and PostgreSQL but not Kubernetes or Go.
    await panel(page).locator('.match summary').click();
    await expect(panel(page).locator('.kw').first()).toContainText('Kubernetes');
    expect(job!.score ?? (await jobs(app))[0]!.score).not.toBeNull();
  });

  test('the tracker lists, updates and exports applications', async ({ app }) => {
    await app.seed({ resume: sampleResumeDoc() });
    const form = await app.open(PAGES.greenhouse);
    await app.autofill(form);
    const ashby = await app.open(PAGES.ashby);
    await app.autofill(ashby);
    await expect.poll(async () => (await jobs(app)).length).toBe(2);

    const page = app.dashboard;
    await page.bringToFront();
    await page.evaluate(() => (window.location.hash = '#/jobs'));
    const rows = page.getByTestId('job-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Acme Robotics · Toronto, ON, Canada' })).toBeVisible();

    // Move one along.
    await page.getByLabel('Status of Software Developer Intern').first().selectOption('interviewing');
    await expect.poll(async () => (await jobs(app)).map((j) => j.status).sort()).toEqual(['interviewing', 'started']);
    await page.getByRole('tab', { name: /Interviewing/ }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole('tab', { name: /All/ }).click();

    // Details: description, notes and the keyword match.
    await rows.first().getByRole('button').first().click();
    await expect(page.getByRole('dialog')).toContainText('Job description');
    await expect(page.getByTestId('match-score')).toHaveText(/^\d+%$/);
    await page.getByLabel('Notes').fill('Interview with Sam on Friday');
    await page.getByLabel('Notes').blur();
    await expect.poll(async () => (await jobs(app)).some((j) => j.notes === 'Interview with Sam on Friday')).toBe(true);
    await page.keyboard.press('Escape');

    // Export.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    const csv = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '');
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Company,Job title,Location,Status,Applied,Saved,Keyword match,Resume,Link,Notes');
    expect(lines).toHaveLength(3);
    expect(csv).toContain('Interview with Sam on Friday');
    expect(csv).toContain('General resume');
  });
});
