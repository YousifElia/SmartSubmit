import type { Page } from '@playwright/test';
import { expect, PAGES, sampleProfile, test } from './harness';

const submitted = (page: Page) => page.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted);

/** Read a plain HTML form the way a server would receive it. */
function formData(page: Page, selector: string): Promise<Record<string, string | string[]>> {
  return page.evaluate((sel) => {
    const form = document.querySelector(sel) as HTMLFormElement;
    const out: Record<string, string | string[]> = {};
    for (const [key, value] of new FormData(form).entries()) {
      const text = value instanceof File ? value.name : value;
      if (key in out) out[key] = ([] as string[]).concat(out[key]!, text);
      else out[key] = text;
    }
    return out;
  }, selector);
}

test.describe('Lever', () => {
  test('fills the standard fields, question cards and EEO selects', async ({ app }) => {
    await app.seed({ resume: true });
    const page = await app.open(PAGES.lever);
    const report = await app.autofill(page);
    const data = await formData(page, '#application-form');
    const profile = sampleProfile();
    const card = (id: string, field: number) => `cards[${id}][field${field}]`;

    expect(data).toMatchObject({
      name: 'Avery Testerson',
      email: profile.email,
      phone: '(519) 555-0142',
      location: 'Windsor, ON, Canada',
      org: 'Example Robotics',
      'urls[LinkedIn]': profile.links.linkedin,
      'urls[GitHub]': profile.links.github,
      // No portfolio in the profile, so the personal website stands in.
      'urls[Portfolio]': profile.links.website,
      resume: 'Avery_Testerson_Resume.pdf',
    });
    // Choosing a location also fills Lever's hidden structured field.
    expect(String(data.selectedLocation)).toContain('Windsor, ON, Canada');

    // "The country for which you are applying" names no country. The profile
    // differs between Canada and the US, so the answer is entered but flagged.
    expect(data[card('1c719ca9-5069-4afe-9e82-39ca420e0edb', 0)]).toBe('Yes');
    expect(report.groups['Check these']).toContain('Are you legally authorized to work in the country for which you are applying?');

    // The dropdown is matched on the option's wording, not its value.
    expect(data[card('a6197d84-549e-4a91-8bb0-6af972510013', 0)]).toBe('LinkedIn');

    expect(data).toMatchObject({
      'eeo[gender]': 'Female',
      'eeo[race]': 'Decline to self-identify',
      'eeo[veteran]': 'I am not a veteran',
    });

    // Company-specific questions are left for the user.
    expect(report.groups['Needs your answer']).toEqual(
      expect.arrayContaining([
        'Which languages do you speak fluently?',
        'Name Pronunciation | How do you pronounce your name?',
        'What interests you about robotics?',
      ]),
    );
    expect(data[card('a6197d84-549e-4a91-8bb0-6af972510013', 2)]).toBe('');
    expect(await submitted(page)).toBe(false);
  });
});

test.describe('Ashby', () => {
  test('fills text fields, the location search, Yes/No buttons and the resume', async ({ app }) => {
    await app.seed({ resume: true });
    const page = await app.open(PAGES.ashby);
    const report = await app.autofill(page);
    const state = await page.evaluate(() => (window as unknown as { __state: Record<string, unknown> }).__state);
    const profile = sampleProfile();

    expect(state).toMatchObject({
      // "Legal Name" asks for the full name, middle name included.
      _systemfield_name: 'Avery Quinn Testerson',
      _systemfield_email: profile.email,
      _systemfield_location: 'Windsor, Ontario, Canada',
      _systemfield_resume: 'Avery_Testerson_Resume.pdf',
      'dc915b3a-c535-49df-abd6-dc8f3ddf6728': profile.links.linkedin,
      'a1a1a1a1-0000-4000-8000-000000000001': profile.links.github,
      '3e666775-f7f9-4eab-bbdb-1a3bb13bc8a4': 'May 2027',
    });
    expect(String(state['4b71793a-c95c-4cc9-9d06-02e6ef7c5777']).replace(/\D/g, '')).toBe('5195550142');

    // Yes/No toggles.
    expect(state['3080cfba-13cc-4441-94b9-159da1278e66']).toBe('yes');
    expect(state['66d3b6e2-6cef-4cf8-9193-87200193ab98']).toBe('no');
    expect(state['77e4c7f3-7df0-5d09-a2a4-98311204bc09'] ?? '').toBe('');

    // The "autofill from resume" drop zone must not be used: it would upload the file for parsing.
    expect(state.autofillTrap ?? false).toBe(false);
    // Only the resume is attached, not the cover letter.
    expect(state['6686ff1d-a7f9-484b-af56-4c32ff8cd99f'] ?? '').toBe('');

    expect(report.groups['Needs your answer']).toEqual(
      expect.arrayContaining([
        'Have you completed at least two years of your degree?',
        'Which languages have you used professionally?',
        'Tell us about a project you are proud of',
      ]),
    );
    expect(await submitted(page)).toBe(false);
  });
});

test.describe('A site SmartSubmit has never seen', () => {
  test('is filled from wording alone once the user starts it from the toolbar', async ({ app }) => {
    await app.seed({ resume: true });
    const page = await app.open(PAGES.generic);
    // Nothing runs here on its own.
    await page.waitForTimeout(1500);
    await expect(page.locator('smartsubmit-panel')).toHaveCount(0);

    // What the toolbar button does.
    const tabId = await app.request<number>('page.activate', {
      tabId: await app.dashboard.evaluate(async (url) => {
        const tabs = await (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id: number; url?: string }[]> } } }).chrome.tabs.query({});
        return tabs.find((t) => t.url === url)!.id;
      }, PAGES.generic),
      run: true,
    });
    void tabId;
    const report = await app.report(page);
    const data = await formData(page, '#apply');
    const profile = sampleProfile();

    expect(data).toMatchObject({
      fn: 'Avery', // <label for>
      ln: 'Testerson',
      contact_email: profile.email, // label wrapping the input
      p1: '(519) 555-0142', // no label element: text before the input
      li: profile.links.linkedin, // aria-label only
      c: 'Windsor', // table layout
      prov: 'ON', // province by abbreviation
      pc: 'N9B 3P4',
      edu_school: 'University of Windsor',
      edu_program: 'Computer Science',
      grad_month: 'May',
      grad_year: '2027',
      entitled: 'y', // fieldset + legend radio group
      cv_file: 'Avery_Testerson_Resume.pdf',
    });

    // Specific questions must not be answered from general profile facts.
    expect(data.sql_years).toBe('');
    expect(data.returning).toBeUndefined();
    expect(data.term).toBe('');
    expect(data.sin).toBe('');
    expect(data.agree).toBeUndefined();
    expect(report.groups['Needs your answer']).toEqual(
      expect.arrayContaining([
        'Are you returning to school after this work term?',
        'How many years of experience do you have with SQL?',
        'Which co-op term are you available for?',
        'Social Insurance Number',
      ]),
    );
    expect(await submitted(page)).toBe(false);
  });
});
