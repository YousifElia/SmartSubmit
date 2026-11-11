import type { Page } from '@playwright/test';
import { expect, PAGES, sampleProfile, test } from './harness';

const stateOf = (page: Page) => page.evaluate(() => (window as unknown as { __state: Record<string, unknown> }).__state);

test.describe('Workable', () => {
  test('fills the personal details, the resume and the employer’s questions', async ({ app }) => {
    await app.seed({ resume: true });
    const page = await app.open(PAGES.workable);
    const report = await app.autofill(page);
    const state = await stateOf(page);
    const profile = sampleProfile();

    expect(state).toMatchObject({
      firstname: 'Avery',
      lastname: 'Testerson',
      email: profile.email,
      address: '401 Sunset Ave',
      resume: ['Avery_Testerson_Resume.pdf'],
      QA_1001: 'true',
      QA_1002: 'false',
      QA_1005: '2027-05-03',
    });
    expect(String(state.phone)).toMatch(/519\D*555\D*0142/);
    expect(String(state.QA_1004)).toMatch(/70,?000/);
    // Not the person's to have answered for them, or not known.
    expect(state.gdpr).toBeUndefined();
    expect(state.QA_1003).toBeUndefined();
    expect(state.QA_1006).toBeUndefined();
    // Only the resume is attached; other files are the person's choice.
    expect(state.QA_1007).toBeUndefined();
    expect(report.groups['Needs your answer']).toEqual(
      expect.arrayContaining(['How many years of professional experience do you have with Node.js?', 'Which of these databases have you used?']),
    );
    expect(await page.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted)).toBe(false);

    const panel = page.locator('smartsubmit-panel');
    await expect(panel.locator('.job-title')).toHaveText('Junior Backend Developer');
    await expect(panel.locator('.job-meta').first()).toContainText('Northwind Freight');
  });
});
