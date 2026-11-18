import type { Page } from '@playwright/test';
import { emptyProfile } from '../../src/core/defaults';
import type { Profile, Settings } from '../../src/core/types';
import { sampleResumeDoc } from '../fixtures/sampleResume';
import { expect, sampleProfile, test } from './harness';

// Callbacks passed to `evaluate` run inside the extension, where `chrome` exists.
declare const chrome: { storage: { local: { get(key: string | null): Promise<Record<string, unknown>> } } };

async function stored(page: Page): Promise<Profile> {
  return page.evaluate(async () => ((await chrome.storage.local.get('r/profile/me'))['r/profile/me'] as { data: Profile }).data);
}

async function openProfile(page: Page): Promise<void> {
  await page.evaluate(() => (window.location.hash = '#/profile'));
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
}

/** The first school's dates, as stored. */
async function education(page: Page): Promise<{ start: string; end: string }> {
  return page.evaluate(async () => {
    const rec = (await chrome.storage.local.get('r/profile/me'))['r/profile/me'] as { data: { education: { start: string; end: string }[] } };
    const { start, end } = rec.data.education[0]!;
    return { start, end };
  });
}

test.describe('Profile', () => {
  test('a date’s month can be chosen before its year', async ({ app }) => {
    const profile = sampleProfile();
    profile.education[0] = { ...profile.education[0]!, start: '', end: '' };
    await app.seed({ profile });
    const page = app.dashboard;
    await page.evaluate(() => (window.location.hash = '#/profile'));
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'Education', exact: true }) });

    // Month first: it stays chosen while the year is missing, and is saved with it.
    await card.getByLabel('Start month').selectOption({ label: 'September' });
    await expect(card.getByLabel('Start month')).toHaveValue('09');
    await expect(card.getByText('Add the full year to save this date.')).toBeVisible();
    await card.getByLabel('Start year').fill('2023');
    await expect.poll(() => education(page)).toMatchObject({ start: '2023-09' });
    await expect(card.getByText('Add the full year to save this date.')).toHaveCount(0);

    // Year first works as before.
    await card.getByLabel('Expected graduation year').fill('2027');
    await card.getByLabel('Expected graduation month').selectOption({ label: 'April' });
    await expect.poll(() => education(page)).toEqual({ start: '2023-09', end: '2027-04' });

    // Clearing the year keeps the month on screen and stops saving a half date.
    await card.getByLabel('Expected graduation year').fill('');
    await expect(card.getByLabel('Expected graduation month')).toHaveValue('04');
    await expect.poll(() => education(page)).toEqual({ start: '2023-09', end: '' });
    await card.getByLabel('Expected graduation year').fill('2028');
    await expect.poll(() => education(page)).toEqual({ start: '2023-09', end: '2028-04' });

    // After a reload, the saved dates are shown.
    await page.reload();
    await expect(card.getByLabel('Start month')).toHaveValue('09');
    await expect(card.getByLabel('Start year')).toHaveValue('2023');
    await expect(card.getByLabel('Expected graduation month')).toHaveValue('04');
  });

  test('fills every job, school, skill and language from a resume, adding or replacing', async ({ app }) => {
    const profile = emptyProfile();
    profile.firstName = 'Avery';
    profile.experience = [{ id: 'own', company: 'Old Co', title: 'Cashier', location: '', type: '', start: '', end: '', current: false, description: 'Mine.' }];
    const doc = sampleResumeDoc();
    doc.extras.push({ title: 'Languages', items: ['English (Native), French (Intermediate)'] });
    await app.seed({ profile, resume: doc });
    const page = app.dashboard;
    await openProfile(page);

    await page.getByRole('button', { name: 'Fill from resume' }).click();
    const dialog = page.getByRole('dialog', { name: 'Fill your profile from a resume' });
    await expect(dialog.getByTestId('resume-contents')).toHaveText('It lists 2 jobs, 1 school, 11 skills, 2 languages.');
    await expect(dialog.getByTestId('fill-preview')).toContainText('2 jobs, 1 school, 11 skills, 2 languages');
    await dialog.getByRole('button', { name: 'Fill my profile' }).click();
    await expect(page.getByText(/Filled in your .*2 jobs, 1 school, 11 skills, 2 languages\. Check them below\./)).toBeVisible();

    // Added after what was there; the name typed in is kept.
    await expect.poll(async () => (await stored(page)).experience.map((e) => e.company)).toEqual(['Old Co', 'Example Robotics', 'University of Windsor']);
    let now = await stored(page);
    expect(now.firstName).toBe('Avery');
    expect(now.experience[1]).toMatchObject({ title: 'Software Developer Co-op', start: '2025-01', end: '2025-04' });
    expect(now.skills).toContain('PostgreSQL');
    expect(now.languages.map((l) => [l.language, l.level])).toEqual([
      ['English', 'native'],
      ['French', 'intermediate'],
    ]);
    // The new sections show them.
    await expect(page.getByRole('list', { name: 'Your skills' }).getByRole('listitem')).toHaveCount(11);
    await expect(page.getByTestId('language-row')).toHaveCount(2);

    // Replacing: the jobs become exactly the resume's.
    await page.getByRole('button', { name: 'Fill from resume' }).click();
    await dialog.getByRole('radio', { name: 'Replace' }).click();
    await dialog.getByRole('button', { name: 'Fill my profile' }).click();
    await expect.poll(async () => (await stored(page)).experience.map((e) => e.company)).toEqual(['Example Robotics', 'University of Windsor']);
    now = await stored(page);
    expect(now.languages).toHaveLength(2);
  });

  test('skills and languages are edited on the profile', async ({ app }) => {
    const profile = sampleProfile();
    profile.skills = [];
    profile.languages = [];
    await app.seed({ profile });
    const page = app.dashboard;
    await openProfile(page);

    // A comma ends a skill; a pasted list becomes several.
    await page.getByLabel('Add skills').fill('Python, Go; SQL');
    await page.getByLabel('Add skills').fill('Rust');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(async () => (await stored(page)).skills).toEqual(['Python', 'Go', 'SQL', 'Rust']);
    await page.getByRole('button', { name: 'Remove Go' }).click();
    await expect.poll(async () => (await stored(page)).skills).toEqual(['Python', 'SQL', 'Rust']);

    await page.getByRole('button', { name: 'Add language' }).click();
    const row = page.getByTestId('language-row').first();
    await row.getByLabel('Language', { exact: true }).fill('Spanish');
    await row.getByLabel('How well').selectOption({ label: 'Fluent' });
    await expect.poll(async () => (await stored(page)).languages.map((l) => [l.language, l.level])).toEqual([['Spanish', 'fluent']]);
  });

  test('the job site account is saved, synced with the rest, and never put in a backup file', async ({ app }) => {
    await app.seed();
    const page = app.dashboard;
    await openProfile(page);
    const settings = () =>
      page.evaluate(
        async () =>
          ((await chrome.storage.local.get('r/credentials/jobsites'))['r/credentials/jobsites'] as { data: { email: string; password: string } } | undefined)?.data ?? {
            email: '',
            password: '',
          },
      );

    await page.getByLabel('Email for these accounts').fill('jobs.avery@example.com');
    await page.getByLabel('Password', { exact: true }).fill('short');
    await expect(page.getByText(/Most of these systems also want at least 8 characters, a capital letter, a number, a symbol/)).toBeVisible();
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect.poll(async () => (await settings()).password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{16}$/);
    expect((await settings()).email).toBe('jobs.avery@example.com');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');

    // Waiting to sync like everything else.
    const dirty = await page.evaluate(async () => (await chrome.storage.local.get('m/dirty'))['m/dirty'] as Record<string, number>);
    expect(Object.keys(dirty)).toContain('credentials/jobsites');
    // Not part of the profile, and never in a backup file, which is plain text.
    const password = (await settings()).password;
    expect(JSON.stringify(await stored(page))).not.toContain(password);
    expect(JSON.stringify((await page.evaluate(async () => (await chrome.storage.local.get('s/settings'))['s/settings'] as Settings)).account)).not.toContain(password);
    await page.evaluate(() => (window.location.hash = '#/settings'));
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup' }).click();
    const file = await (await download).path();
    const backup = (await import('node:fs')).readFileSync(file, 'utf8');
    expect(backup).toContain('Testerson');
    expect(backup).not.toContain(password);
    expect(backup).not.toContain('jobs.avery');
  });
});
