import type { Page } from '@playwright/test';
import { makeAnswer } from '../../src/core/autofill/answers';
import { expect, PAGES, test } from './harness';

const stateOf = (page: Page) => page.evaluate(() => (window as unknown as { __state: Record<string, unknown> }).__state);

test.describe('Learning', () => {
  test('offers to save a new answer, then fills it next time', async ({ app }) => {
    await app.seed();
    const page = await app.open(PAGES.greenhouse);
    await app.autofill(page);
    const panel = page.locator('smartsubmit-panel');

    // The user answers two questions SmartSubmit did not know.
    await page.locator('#question_1010').fill('TypeScript');
    await page.locator('#question_1009').click();
    await page.getByRole('option', { name: 'Summer 2027' }).click();

    // Both show up as answers worth keeping.
    const offers = panel.locator('.save-item');
    await expect(offers).toHaveCount(2);
    await expect(offers.nth(0)).toContainText('Which term are you applying for?');
    await expect(offers.nth(0)).toContainText('Summer 2027');
    await panel.getByRole('button', { name: 'Save all' }).click();
    await expect(panel.locator('.notice')).toContainText('2 answers saved');
    await expect(offers).toHaveCount(0);

    // A fresh visit to the same form: both are now filled without asking.
    await page.reload();
    const report = await app.autofill(page);
    const state = await stateOf(page);
    expect(state.question_1009).toBe('Summer 2027');
    expect(state.question_1010).toBe('TypeScript');
    expect(report.groups['Needs your answer']).not.toContain('Which term are you applying for?');
    expect(report.groups['Save for next time']).toBeUndefined();
  });

  test('reuses an answer to a similar question and flags it for review', async ({ app }) => {
    const similar = makeAnswer({
      id: 'a1',
      question: 'What is your strongest programming language?',
      kind: 'text',
      answer: 'Python',
      options: [],
      host: 'example.com',
      now: 1,
    });
    await app.seed({ answers: [similar] });
    const page = await app.open(PAGES.greenhouse);
    const report = await app.autofill(page);

    expect((await stateOf(page)).question_1010).toBe('Python');
    expect(report.groups['Check these']).toEqual(['What programming language are you strongest in?']);
    await expect(page.locator('smartsubmit-panel .group', { hasText: 'Check these' })).toContainText(
      'Reused your answer to “What is your strongest programming language?”',
    );
    // On the page it is outlined as "check", not as a confident fill.
    await expect(page.locator('#question_1010')).toHaveAttribute('data-smartsubmit-state', 'review');
    await expect(page.locator('#first_name')).toHaveAttribute('data-smartsubmit-state', 'filled');
  });

  test('a saved answer overrides the built-in guess', async ({ app }) => {
    // The profile says "LinkedIn"; the user has since saved a different answer for this exact question.
    const override = makeAnswer({
      id: 'a2',
      question: 'How did you hear about this job?',
      kind: 'text',
      answer: 'University of Windsor co-op board',
      options: [],
      host: 'example.com',
      now: 1,
    });
    await app.seed({ answers: [override] });
    const page = await app.open(PAGES.greenhouse);
    await app.autofill(page);
    expect((await stateOf(page)).question_1004).toBe('University of Windsor co-op board');
  });

  test('never overwrites what the user already typed', async ({ app }) => {
    await app.seed();
    const page = await app.open(PAGES.greenhouse);
    await page.locator('#first_name').fill('Someone Else');
    await page.locator('#question_1002').fill('https://linkedin.example/custom');
    await app.autofill(page);
    const state = await stateOf(page);
    expect(state.first_name).toBe('Someone Else');
    expect(state.question_1002).toBe('https://linkedin.example/custom');
    expect(state.last_name).toBe('Testerson');
  });

  test('never offers to remember sensitive numbers', async ({ app }) => {
    await app.seed();
    const page = await app.open(PAGES.generic);
    const tabId = await app.dashboard.evaluate(async (url) => {
      const tabs = await (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id: number; url?: string }[]> } } }).chrome.tabs.query({});
      return tabs.find((t) => t.url === url)!.id;
    }, PAGES.generic);
    await app.request('page.activate', { tabId, run: true });
    await app.report(page);

    await page.locator('input[name="sin"]').fill('123 456 789');
    await page.locator('input[name="term"]').fill('Fall 2027');
    const offers = page.locator('smartsubmit-panel .save-item');
    await expect(offers).toHaveCount(1);
    await expect(offers).toContainText('Which co-op term are you available for?');
  });

  test('leaves voluntary questions alone when that setting is off', async ({ app }) => {
    await app.seed({ settings: (s) => ({ ...s, autofill: { ...s.autofill, demographics: false } }) });
    const page = await app.open(PAGES.greenhouse);
    await app.autofill(page);
    const state = await stateOf(page);
    expect(state['4033064002'] ?? '').toBe('');
    expect(state['4033066002'] ?? '').toBe('');
    expect(state.first_name).toBe('Avery');
  });

  test('stays hidden on a site after "Hide on this site"', async ({ app }) => {
    await app.seed();
    const page = await app.open(PAGES.greenhouse);
    const panel = page.locator('smartsubmit-panel');
    await panel.locator('.launcher').click();
    await panel.getByRole('button', { name: 'Hide on this site' }).click();
    await expect(panel).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.locator('smartsubmit-panel')).toHaveCount(0);
  });
});
