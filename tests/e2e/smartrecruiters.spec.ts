import type { Page } from '@playwright/test';
import { expect, PAGES, sampleProfile, test } from './harness';

const stateOf = (page: Page) => page.evaluate(() => (window as unknown as { __state: Record<string, unknown> }).__state);

test.describe('SmartRecruiters', () => {
  test('fills a form built from web components, through their shadow roots', async ({ app }) => {
    await app.seed({ resume: true });
    const page = await app.open(PAGES.smartrecruiters);
    const report = await app.autofill(page);
    const state = await stateOf(page);
    const profile = sampleProfile();

    expect(state).toMatchObject({
      // Heard only through input events that cross the shadow boundary.
      firstName: 'Avery',
      lastName: 'Testerson',
      email: profile.email,
      confirmEmail: profile.email,
      linkedin: profile.links.linkedin,
      phoneCountry: 'CA',
      // Reported by the components' own events.
      location: 'Windsor, ON, Canada',
      resume: ['Avery_Testerson_Resume.pdf'],
      authorized: 'Yes',
      sponsorship: 'No',
      degree: "Bachelor's degree",
    });
    expect(String(state.phone)).toMatch(/519\D*555\D*0142/);
    expect(String(state.salary)).toMatch(/70,?000/);
    expect(state.consent).toBeUndefined();
    expect(state.message).toBeUndefined();

    // Questions are reported in the order they appear, across components.
    const order = Object.values(report.groups).flat();
    expect(order.indexOf('First name')).toBeLessThan(order.indexOf('Last name'));
    expect(report.groups['Needs your answer']).toContain('I agree to the privacy policy');
    expect(await page.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted)).toBe(false);

    // The posting, from SmartRecruiters' public API.
    const panel = page.locator('smartsubmit-panel');
    await expect(panel.locator('.job-title')).toHaveText('Tools Programmer (Python)');
    await expect(panel.locator('.job-meta').first()).toContainText('Acme Games');
  });
});
