import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readEmailProof } from '../../src/core/sync/emailProof';

// The page the links in the sync emails lead to, served at its real address.
const SITE = resolve(import.meta.dirname, '../../site');
const BASE = 'https://yousifelia.github.io/SmartSubmit/';
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

async function open(page: Page, address: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  await page.route(`${BASE}**`, async (route) => {
    let path = new URL(route.request().url()).pathname.replace('/SmartSubmit/', '');
    if (path === '' || path.endsWith('/')) path += 'index.html';
    await route.fulfill({ body: readFileSync(join(SITE, path)), contentType: TYPES[extname(path)] ?? 'application/octet-stream' });
  });
  await page.goto(`${BASE}${address}`);
  return problems;
}

test.describe('The sync emails’ landing page', () => {
  test('says a new account’s email is confirmed, and drops the sign-in from the address', async ({ page }) => {
    const problems = await open(page, 'confirmed/#access_token=a.b.c&expires_at=1900000000&expires_in=3600&refresh_token=r1&token_type=bearer&type=signup');
    await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible();
    await expect(page.getByText('press Continue to finish turning on sync')).toBeVisible();
    expect(page.url()).toBe(`${BASE}confirmed/`);
    expect(await page.locator('section:not([hidden])').count()).toBe(1);
    expect(problems).toEqual([]);
  });

  test('also when the server confirms with a code instead', async ({ page }) => {
    await open(page, 'confirmed/?code=8a1c0d0e-1111-2222-3333-444455556666');
    await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible();
    expect(page.url()).toBe(`${BASE}confirmed/`);
  });

  test('after an opened reset link, offers the address SmartSubmit takes in its place', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://yousifelia.github.io' });
    const address = `${BASE}confirmed/#access_token=a.b.c&expires_at=1900000000&expires_in=3600&refresh_token=r2&token_type=bearer&type=recovery`;
    const problems = await open(page, address.slice(BASE.length));
    await expect(page.getByRole('heading', { name: 'Finish resetting your password in SmartSubmit' })).toBeVisible();
    // The address stays, so it can be copied from the address bar too.
    expect(page.url()).toBe(address);
    await expect(page.getByLabel('This page’s address')).toHaveValue(address);
    await page.getByRole('button', { name: 'Copy address' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(address);
    // …and SmartSubmit reads it as the session the reset link gave.
    expect(readEmailProof(copied)).toMatchObject({ kind: 'session', type: 'recovery' });
    expect(problems).toEqual([]);
  });

  test('explains an expired or used link', async ({ page }) => {
    await open(page, 'confirmed/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByRole('heading', { name: 'This link has expired or was already used' })).toBeVisible();
    await expect(page.locator('#detail')).toBeHidden();
    expect(page.url()).toBe(`${BASE}confirmed/`);
  });

  test('passes on what the server said about any other problem, as text', async ({ page }) => {
    await open(page, 'confirmed/?error=server_error&error_description=%3Cb%3EDatabase%3C%2Fb%3E+error+saving+new+user');
    await expect(page.getByRole('heading', { name: 'This link has expired or was already used' })).toBeVisible();
    await expect(page.locator('#detail')).toHaveText('The sync server said: <b>Database</b> error saving new user');
  });

  test('says what it is for when opened on its own, and the front page links to the project', async ({ page }) => {
    await open(page, 'confirmed/');
    await expect(page.getByRole('heading', { name: 'SmartSubmit sync emails' })).toBeVisible();
    await page.goto(BASE);
    await expect(page.getByRole('link', { name: 'Source code and install instructions' })).toHaveAttribute('href', 'https://github.com/YousifElia/SmartSubmit');
  });
});
