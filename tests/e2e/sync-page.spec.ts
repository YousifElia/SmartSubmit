import type { Job } from '../../src/core/types';
import { expect, test } from './harness';

// A sync server that is set but never reached: these tests stay signed out.
const withServer = <T extends { sync: { url: string; key: string } }>(s: T): T => ({ ...s, sync: { url: 'https://sync.example', key: 'publishable-key' } });

const job = (id: string, status: Job['status']): Job => ({
  id,
  key: `greenhouse:${id}`,
  site: 'greenhouse',
  url: `https://job-boards.greenhouse.io/acme/jobs/${id}`,
  title: 'Software Developer Intern',
  company: 'Acme Robotics',
  location: 'Windsor, ON',
  description: '',
  blocks: [],
  capturedAt: Date.now(),
  status,
  appliedAt: status === 'applied' ? Date.now() : null,
  resumeRef: null,
  notes: '',
  score: null,
});

test.describe('Sync page', () => {
  test('lists everything an account keeps: the profile, resumes, every application and the rest', async ({ app }) => {
    await app.seed({ resume: true, settings: withServer });
    await app.request('db.mutate', {
      mutations: [
        { op: 'put', collection: 'jobs', id: 'j1', data: job('j1', 'applied') },
        { op: 'put', collection: 'jobs', id: 'j2', data: job('j2', 'interviewing') },
        { op: 'put', collection: 'jobs', id: 'j3', data: job('j3', 'saved') },
      ],
    });
    const page = app.dashboard;
    await page.evaluate(() => (window.location.hash = '#/sync'));
    const contents = page.getByTestId('account-contents');
    await expect(contents).toContainText('Sign in, or create an account, and all of this is kept in it, encrypted');
    await expect(page.getByTestId('contents-about')).toContainText('Avery Testerson with email, phone, address');
    await expect(page.getByTestId('contents-experience')).toContainText('Software Developer Co-op at Example Robotics');
    await expect(page.getByTestId('contents-languages')).toContainText('English, French');
    await expect(page.getByTestId('contents-resumes')).toContainText('General resume (1 uploaded file)');
    await expect(page.getByTestId('contents-jobs')).toContainText('2 applied, 1 saved or started');
    await expect(page.getByTestId('contents-jobs')).toContainText('3');
    await expect(page.getByTestId('contents-jobsite')).toContainText('Not saved');
  });

  test('setup’s “Sign in to sync” opens on signing in, to bring everything back', async ({ app }) => {
    await app.seed({ profile: null, settings: withServer });
    const page = app.dashboard;
    await page.evaluate(() => (window.location.hash = '#/welcome'));
    await page.getByRole('button', { name: 'Sign in to sync' }).click();
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Sync across browsers' })).toBeVisible();
  });
});
