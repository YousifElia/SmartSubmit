import type { Page } from '@playwright/test';
import type { Job, Referral, Settings } from '../../src/core/types';
import { sampleResumeDoc } from '../fixtures/sampleResume';
import { startFakeOllama, type FakeOllama } from './fakeOllama';
import { expect, PAGES, test, type App } from './harness';

// LinkedIn's export: notes first, then the table. Invented people.
const CONNECTIONS = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Jordan,Lee,https://www.linkedin.com/in/jordan-lee-example,,"Acme Robotics, Inc.",Senior Software Engineer,03 Feb 2025
Priya,Natarajan,https://www.linkedin.com/in/priya-n-example,priya@example.com,Acme Robotics,Talent Acquisition Partner,14 Aug 2023
Sam,Okafor,https://www.linkedin.com/in/sam-okafor-example,,Acme Robotics Canada,Sales Director,01 Jan 2019
Mo,Haddad,https://www.linkedin.com/in/mo-haddad-example,,Acme Bakery,Baker,10 Oct 2022
`;

const withOllama = (url: string) => (s: Settings): Settings => ({ ...s, ai: { ...s.ai, provider: 'ollama', ollamaUrl: url, ollamaModel: 'qwen2.5:7b' } });

const records = <T>(app: App, collection: string) =>
  app.dashboard.evaluate(async (c) => {
    const api = (globalThis as unknown as { chrome: { storage: { local: { get(k: null): Promise<Record<string, { data: unknown; deleted?: boolean }>> } } } }).chrome;
    const all = await api.storage.local.get(null);
    return Object.entries(all)
      .filter(([key, rec]) => key.startsWith(`r/${c}/`) && !rec.deleted)
      .map(([, rec]) => rec.data);
  }, collection) as Promise<T[]>;

async function trackGreenhouseJob(app: App): Promise<{ job: Job; form: Page }> {
  const form = await app.open(PAGES.greenhouse);
  await app.autofill(form);
  await expect.poll(async () => (await records<Job>(app, 'jobs')).length).toBe(1);
  return { job: (await records<Job>(app, 'jobs'))[0]!, form };
}

let ollama: FakeOllama;
test.beforeEach(async () => {
  ollama = await startFakeOllama();
});
test.afterEach(async () => {
  await ollama.close();
});

test.describe('Referrals', () => {
  test('finds who you know at the company, drafts the ask with your model, and keeps track', async ({ app }) => {
    await app.seed({ resume: sampleResumeDoc(), settings: withOllama(ollama.url) });
    const { job, form } = await trackGreenhouseJob(app);
    // Before any import, the panel only offers to look.
    await expect(form.locator('smartsubmit-panel').getByTestId('panel-referrals')).toContainText('Find someone at Acme Robotics to refer you.');

    const page = app.dashboard;
    await page.bringToFront();
    await page.evaluate((id) => (window.location.hash = `#/referrals/${id}`), job.id);
    await page.getByTestId('connections-input').setInputFiles({ name: 'Connections.csv', mimeType: 'text/csv', buffer: Buffer.from(CONNECTIONS) });
    await expect(page.getByTestId('connections-status')).toContainText('4 connections, imported');

    // Everyone at Acme Robotics (not Acme Bakery), the best placed first.
    const people = page.getByTestId('person');
    await expect(people).toHaveCount(3);
    await expect(people.nth(0)).toContainText('Jordan Lee');
    await expect(people.nth(0)).toContainText('Does the same kind of work as this role');
    await expect(people.nth(1)).toContainText('Priya Natarajan');
    await expect(people.nth(2)).toContainText('Sam Okafor');

    // The model weighs their job titles, and never sees a name.
    ollama.respond = (body) =>
      body.format ? '{"picks":[{"index":1,"reason":"Hires for the engineering teams"}]}' : 'Hi [FIRST_NAME],\n\nCould you refer me for the Software Developer Intern role at Acme Robotics?\n\nAvery';
    await page.getByRole('button', { name: 'Ask your model who’s best' }).click();
    await expect(people.nth(0)).toContainText('Priya Natarajan');
    await expect(people.nth(0)).toContainText('Your model’s pick');
    await expect(people.nth(0)).toContainText('Hires for the engineering teams');
    const picking = JSON.stringify(ollama.requests.find((r) => r.path === '/api/chat')!.body);
    expect(picking).toContain('Talent Acquisition Partner');
    expect(picking).not.toMatch(/Jordan|Priya|Sam|linkedin\.com\/in/);

    // The message, with her name put in by SmartSubmit.
    await people.nth(0).getByRole('button', { name: 'Ask for a referral' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ask Priya Natarajan for a referral' });
    await dialog.getByRole('button', { name: 'Write it with your model' }).click();
    await expect(dialog.getByTestId('referral-message')).toHaveValue(/^Hi Priya,\n\nCould you refer me/);
    const writing = JSON.stringify(ollama.requests.filter((r) => r.path === '/api/chat').at(-1)!.body);
    expect(writing).not.toContain('Priya');
    // Or without any AI.
    await dialog.getByRole('button', { name: 'Use a plain template' }).click();
    await expect(dialog.getByTestId('referral-message')).toHaveValue(/^Hi Priya,\n\nI hope you're doing well! I'm applying for the Software Developer Intern role at Acme Robotics/);
    await dialog.getByRole('button', { name: 'I sent it: save as asked' }).click();
    await expect(dialog.getByRole('button', { name: 'Saved as asked' })).toBeDisabled();
    await dialog.press('Escape');

    // On the list, and moved along by hand.
    const saved = page.getByTestId('referral');
    await expect(saved).toHaveCount(1);
    await expect(page.getByTestId('referral-company')).toContainText('Acme Robotics');
    await page.getByLabel('Where it stands with Priya Natarajan').selectOption({ label: 'Agreed to refer' });
    await expect.poll(async () => (await records<Referral>(app, 'referrals'))[0]).toMatchObject({
      name: 'Priya Natarajan',
      company: 'Acme Robotics',
      title: 'Talent Acquisition Partner',
      status: 'agreed',
      jobIds: [job.id],
    });

    // Back on the application, the panel knows, in counts only.
    await form.reload();
    const panel = form.locator('smartsubmit-panel');
    await panel.locator('.launcher').click();
    await expect(panel.getByTestId('panel-referrals')).toHaveText(/Referral: someone agreed to refer you\. You know 3 people at Acme Robotics\./);
    expect(await panel.evaluate((el) => el.shadowRoot?.textContent ?? '')).not.toContain('Priya');
    const opened = app.context.waitForEvent('page');
    await panel.getByRole('button', { name: 'Referrals' }).click();
    expect((await opened).url()).toContain(`#/referrals/${job.id}`);
  });

  test('suggests LinkedIn searches when you know nobody there, and keeps referrals added by hand', async ({ app }) => {
    await app.seed({ resume: true });
    const { job } = await trackGreenhouseJob(app);
    const page = app.dashboard;
    await page.bringToFront();
    await page.evaluate((id) => (window.location.hash = `#/referrals/${id}`), job.id);
    await page.getByTestId('connections-input').setInputFiles({
      name: 'Connections.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('First Name,Last Name,URL,Email Address,Company,Position,Connected On\nMo,Haddad,,,Acme Bakery,Baker,10 Oct 2022\n'),
    });
    const none = page.getByTestId('no-connections');
    await expect(none).toContainText('None of your connections work at Acme Robotics');
    await expect(none.getByRole('link', { name: 'People at Acme Robotics you know through a connection' })).toHaveAttribute('href', /linkedin\.com\/search\/results\/people\/\?keywords=Acme\+Robotics/);
    await expect(none.getByRole('link', { name: 'University of Windsor alumni at Acme Robotics' })).toBeVisible();

    await page.getByRole('button', { name: 'Add a referral' }).click();
    const form = page.getByRole('dialog', { name: 'Add a referral' });
    await form.getByLabel('Name').fill('Taylor Brooks');
    await form.getByLabel('Company').fill('Acme Robotics');
    await form.getByLabel('How you know them').fill('Former coworker');
    await form.getByLabel('Where it stands').selectOption({ label: 'Referred me' });
    await form.getByLabel('Software Developer Intern').check();
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('saved-at-company')).toContainText('Taylor Brooks');
    await expect(page.getByTestId('saved-at-company')).toContainText('Referred me');
    expect((await records<Referral>(app, 'referrals'))[0]).toMatchObject({ relationship: 'Former coworker', status: 'referred', jobIds: [job.id] });
  });
});
