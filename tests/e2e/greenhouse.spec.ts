import { expect, PAGES, sampleProfile, test } from './harness';

type State = Record<string, unknown>;
const stateOf = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __state: State }).__state);
const submitted = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted);

test.describe('Greenhouse', () => {
  test('fills the application from the profile and attaches the resume', async ({ app }) => {
    await app.seed({ resume: true });
    const page = await app.open(PAGES.greenhouse);
    const report = await app.autofill(page);
    const state = await stateOf(page);
    const profile = sampleProfile();

    // Plain text fields.
    expect(state).toMatchObject({
      first_name: 'Avery',
      last_name: 'Testerson',
      preferred_name: 'Avery',
      email: profile.email,
      question_1002: profile.links.linkedin,
      question_1003: profile.links.website,
      question_1004: 'LinkedIn',
      question_1008: 'May 2027',
    });

    // react-select dropdowns, including the two that search as you type.
    expect(state).toMatchObject({
      country: 'Canada +1',
      'candidate-location': 'Windsor, Ontario, Canada',
      'school--0': 'University of Windsor',
      'degree--0': "Bachelor's Degree",
      'discipline--0': 'Computer Science',
    });

    // Work authorization is answered per country named in the question.
    expect(state).toMatchObject({ question_1005: 'Yes', question_1006: 'No', question_1007: 'No' });

    // The phone widget ends up on the right country with the right number.
    expect(state.phoneCountry).toBe('ca');
    expect(String(state.phone).replace(/\D/g, '')).toMatch(/^1?5195550142$/);

    // Voluntary questions follow the profile, including "decline".
    expect(state).toMatchObject({
      '4033064002': 'Female',
      '4033063002': 'No',
      '4033065002': 'Decline To Self Identify',
      '4033066002': 'I am not a protected veteran',
      '4033067002': 'I do not want to answer',
    });

    // The resume is attached; the cover letter and the consent box are left alone.
    expect(state.resume).toBe('Avery_Testerson_Resume.pdf');
    expect(state.cover_letter ?? '').toBe('');
    expect(state.gdpr_demographic_data_consent_given ?? false).toBe(false);

    // What it could not answer is listed for the user, not guessed.
    expect(report.groups['Needs your answer']).toEqual(
      expect.arrayContaining([
        'Why do you want to work at Acme Robotics?',
        'Which term are you applying for?',
        'What programming language are you strongest in?',
      ]),
    );
    expect(report.review).toBe(0);

    // And it never submits.
    expect(await submitted(page)).toBe(false);
  });
});
