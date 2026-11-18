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
    // Its sections start empty: SmartSubmit adds a block per job, school and
    // language in the profile, then fills each.
    await expect(page.locator('[data-automation-id^="workExperience-"]')).toHaveCount(0);
    await fillStep(app, page);
    await expect(page.locator('[data-automation-id^="workExperience-"]')).toHaveCount(1);
    await expect(page.locator('[data-automation-id^="education-"]')).toHaveCount(1);
    await expect(page.locator('[data-automation-id^="language-"]')).toHaveCount(2);
    state = await stateOf(page);
    expect(state).toMatchObject({
      'workExperience-1.jobTitle': 'Software Developer Co-op',
      'workExperience-1.companyName': 'Example Robotics',
      'workExperience-1.startDate.Month': '01',
      'workExperience-1.startDate.Year': '2025',
      'workExperience-1.endDate.Month': '04',
      'workExperience-1.endDate.Year': '2025',
      'workExperience-1.roleDescription': 'Built internal tools.',
      'education-1.schoolName': ['University of Windsor'], // a prompt with categories, searched
      'education-1.degree': "Bachelor's Degree",
      'education-1.fieldOfStudy': ['Computer Science'],
      'education-1.gradeAverage': '3.8',
      'education-1.firstYearAttended.Year': '2023',
      'education-1.lastYearAttended.Year': '2027',
      // Each language with its level, asked three times; the fluent box only for the native one.
      'language-1.language': 'English',
      'language-1.nativeLanguage': true,
      'language-1.languageProficiency-reading': '5 - Native or Bilingual',
      'language-1.languageProficiency-speaking': '5 - Native or Bilingual',
      'language-1.languageProficiency-writing': '5 - Native or Bilingual',
      'language-2.language': 'French',
      'language-2.languageProficiency-reading': '2 - Limited Working',
      'language-2.languageProficiency-writing': '2 - Limited Working',
      // Skills go in one at a time, each searched for and picked.
      skills: ['Python', 'TypeScript', 'React.js', 'PostgreSQL', 'Docker'],
      resume: ['Avery_Testerson_Resume.pdf'],
      linkedinQuestion: profile.links.linkedin,
    });
    expect(state['language-2.nativeLanguage']).toBeUndefined();
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

  test('creates the account with the saved email and password, leaving the consent box and the robot trap alone', async ({ app }) => {
    const password = 'Gr8-Applications!';
    await app.seed();
    await app.request('db.mutate', { mutations: [{ op: 'put', collection: 'credentials', id: 'jobsites', data: { email: 'jobs.avery@example.com', password } }] });
    const page = await app.open(`${PAGES.workday}?account=create`);
    const report = await app.autofill(page);
    const state = await stateOf(page);
    expect(state).toMatchObject({ email: 'jobs.avery@example.com', password, verifyPassword: password });
    expect(state.createAccountCheckbox).toBeUndefined();
    expect(state.beecatcher ?? '').toBe('');
    expect(report.groups['Needs your answer']).toContain('Yes, I have read and consent to the terms and conditions');
    // The panel never shows the password.
    expect(await page.locator('smartsubmit-panel').evaluate((el) => el.shadowRoot?.textContent ?? '')).not.toContain(password);
    expect(await page.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted)).toBe(false);
  });

  test('without a saved password, the sign-in page gets the email and says where to save one', async ({ app }) => {
    await app.seed();
    const page = await app.open(`${PAGES.workday}?account=signin`);
    const report = await app.autofill(page);
    const state = await stateOf(page);
    expect(state.email).toBe(sampleProfile().email);
    expect(state.password ?? '').toBe('');
    expect(report.groups['Needs your answer']).toContain('Password');
    await page.locator('smartsubmit-panel').locator('.item', { hasText: 'Password' }).first().click().catch(() => undefined);
    expect(await page.locator('smartsubmit-panel').evaluate((el) => el.shadowRoot?.textContent ?? '')).toContain('application accounts');
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
