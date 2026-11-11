import type { Page } from '@playwright/test';
import { expect, PAGES, sampleProfile, test, type App, type Report } from './harness';

const stateOf = (page: Page) => page.evaluate(() => (window as unknown as { __state: Record<string, unknown> }).__state);

/** Press "Autofill again" on the next step of the application and wait for it to finish. */
async function fillStep(app: App, page: Page): Promise<Report> {
  const primary = page.locator('smartsubmit-panel .primary');
  await primary.click();
  await expect(primary).toHaveText('Filling…', { timeout: 2000 }).catch(() => undefined);
  await expect(primary).toHaveText('Autofill again', { timeout: 45_000 });
  return app.report(page);
}

/** Save and Continue. (The panel can cover the button on a short page; a person would move it.) */
async function next(page: Page): Promise<void> {
  await page.locator('[data-automation-id="bottom-navigation-next-button"]').evaluate((button: HTMLElement) => button.click());
}

test.describe('Workday', () => {
  test('fills every step: dropdown buttons, search prompts, split dates, the resume and the questions', async ({ app }) => {
    await app.seed({ resume: true });
    const page = await app.open(PAGES.workday);
    const profile = sampleProfile();

    // ── My Information ──
    const info = await app.autofill(page);
    let state = await stateOf(page);
    expect(state).toMatchObject({
      source: ['LinkedIn'], // a search prompt: typed, searched with Enter, picked
      countryDropdown: 'Canada', // a dropdown button
      legalNameSection_firstName: 'Avery',
      legalNameSection_middleName: 'Quinn',
      legalNameSection_lastName: 'Testerson',
      addressSection_addressLine1: '401 Sunset Ave',
      addressSection_city: 'Windsor',
      addressSection_countryRegion: 'Ontario',
      addressSection_postalCode: 'N9B 3P4',
      email: profile.email,
      'phone-device-type': 'Mobile',
      'country-phone-code': ['Canada (+1)'],
    });
    expect(state['phone-number']).toMatch(/519\D*555\D*0142/);
    expect(state.preferredNameCheckbox).toBeUndefined();
    expect(info.groups['Needs your answer']).toContain('Have you previously worked for Acme Robotics?');

    // The person answers what SmartSubmit didn't know, then moves on.
    await page.getByLabel('No', { exact: true }).check();
    const panel = page.locator('smartsubmit-panel');
    await expect(panel.locator('.save-item')).toContainText('Have you previously worked for Acme Robotics?');
    await next(page);

    // ── My Experience ── The answer from the last step is still on offer.
    await expect(panel.locator('.save-item')).toContainText('Have you previously worked for Acme Robotics?');
    await fillStep(app, page);
    state = await stateOf(page);
    expect(state).toMatchObject({
      jobTitle: 'Software Developer Co-op',
      companyName: 'Example Robotics',
      'startDate.Month': '01',
      'startDate.Year': '2025',
      'endDate.Month': '04',
      'endDate.Year': '2025',
      roleDescription: 'Built internal tools.',
      schoolName: ['University of Windsor'], // a prompt with categories, searched
      degree: "Bachelor's Degree",
      fieldOfStudy: ['Computer Science'],
      gradeAverage: '3.8',
      'firstYearAttended.Year': '2023',
      'lastYearAttended.Year': '2027',
      resume: ['Avery_Testerson_Resume.pdf'],
      linkedinQuestion: profile.links.linkedin,
    });
    await panel.locator('.save-item', { hasText: 'Have you previously worked for Acme Robotics?' }).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(panel.locator('.notice')).toContainText('Answer saved');
    await next(page);

    // ── Application Questions ──
    const questions = await fillStep(app, page);
    state = await stateOf(page);
    expect(state).toMatchObject({
      'primaryQuestionnaire--q1': 'Yes',
      'primaryQuestionnaire--q2': 'No',
      'primaryQuestionnaire--q3': 'Yes',
    });
    expect(String(state['primaryQuestionnaire--q5'])).toMatch(/70,?000/);
    expect(state['primaryQuestionnaire--q4']).toBeUndefined();
    expect(questions.groups['Needs your answer']).toContain('How many years of professional experience do you have with C++?');
    await next(page);

    // ── Voluntary Disclosures ── Agreement boxes are left for the person.
    const disclosures = await fillStep(app, page);
    state = await stateOf(page);
    expect(state).toMatchObject({ gender: 'Female', ethnicityDropdown: 'I do not wish to answer', veteranStatus: 'I am not a protected veteran' });
    expect(state.agreementCheckbox).toBeUndefined();
    expect(disclosures.groups['Needs your answer']).toContain('I have read and consent to the terms and conditions');
    await next(page);

    // ── Self Identify ──
    await fillStep(app, page);
    state = await stateOf(page);
    expect(state.disabilityStatus).toEqual(['I do not want to answer']);
    expect(String(state.name)).toContain('Testerson');
    await next(page);

    // Nothing was ever submitted by SmartSubmit.
    expect(await page.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted)).toBe(false);

    // A new application at the same employer: the saved answer is used.
    await page.reload();
    await app.autofill(page);
    expect((await stateOf(page)).candidateIsPreviousWorker).toBe('No');
  });

  test('reads the job from Workday’s own job data', async ({ app }) => {
    await app.seed();
    const page = await app.open(PAGES.workday);
    const panel = page.locator('smartsubmit-panel');
    await panel.locator('.launcher').click();
    await expect(panel.locator('.job-title')).toHaveText('Software Developer, Robotics Platform');
    await expect(panel.locator('.job-meta')).toContainText('ACME');
    await expect(panel.locator('.job-meta')).toContainText('CA, ON, Toronto');
  });
});
