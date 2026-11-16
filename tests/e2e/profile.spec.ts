import type { Page } from '@playwright/test';
import { expect, sampleProfile, test } from './harness';

// Callbacks passed to `evaluate` run inside the extension, where `chrome` exists.
declare const chrome: { storage: { local: { get(key: string): Promise<Record<string, unknown>> } } };

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
});
