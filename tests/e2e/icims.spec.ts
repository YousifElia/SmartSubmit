import type { Frame, Page } from '@playwright/test';
import { expect, PAGES, sampleProfile, test } from './harness';

const FRAME = 'icims_content_iframe';

async function contentFrame(page: Page): Promise<Frame> {
  await expect.poll(() => page.frame({ name: FRAME })?.url() ?? '').toContain('in_iframe=1');
  const frame = page.frame({ name: FRAME })!;
  await frame.waitForLoadState('domcontentloaded');
  return frame;
}

/** A plain HTML form as the server would receive it. */
function formData(frame: Frame, selector: string): Promise<Record<string, string>> {
  return frame.evaluate((sel) => {
    const out: Record<string, string> = {};
    for (const [key, value] of new FormData(document.querySelector(sel) as HTMLFormElement).entries()) {
      out[key] = value instanceof File ? value.name : value;
    }
    return out;
  }, selector);
}

test.describe('iCIMS', () => {
  test('fills the application inside iCIMS’s frame, including its enhanced dropdowns', async ({ app }) => {
    await app.seed({ resume: true });
    const page = await app.open(PAGES.icims);
    const frame = await contentFrame(page);
    const panel = page.frameLocator(`#${FRAME}`).locator('smartsubmit-panel');

    // One panel, in the frame that holds the form; none on the wrapper page.
    await expect(panel).toHaveCount(1);
    await expect(page.locator('smartsubmit-panel')).toHaveCount(0);

    await panel.locator('.launcher').click();
    await panel.locator('.primary').click();
    await expect(panel.locator('.primary')).toHaveText('Autofill again', { timeout: 45_000 });

    const profile = sampleProfile();
    const data = await formData(frame, '#icims_application_form');
    expect(data).toMatchObject({
      '-1_PersonProfileFields.FirstName': 'Avery',
      '-1_PersonProfileFields.MiddleName': 'Quinn',
      '-1_PersonProfileFields.LastName': 'Testerson',
      '-1_PersonProfileFields.Email': profile.email,
      '-1_PersonProfileFields.PhoneType': 'M',
      '-1_PersonProfileFields.AddressStreet1': '401 Sunset Ave',
      '-1_PersonProfileFields.AddressCity': 'Windsor',
      '-1_PersonProfileFields.AddressCountry': 'CA',
      '-1_PersonProfileFields.AddressState': 'ON',
      '-1_PersonProfileFields.AddressZip': 'N9B 3P4',
      '-1_ResumeUpload': 'Avery_Testerson_Resume.pdf',
      '-1_PersonProfileFields.LinkedInURL': profile.links.linkedin,
      '-1_Source': 'LinkedIn',
      '-1_Q1': 'Yes',
      '-1_Q2': 'No',
      '-1_Gender': 'Female',
      '-1_Veteran': 'I am not a protected veteran',
    });
    expect(data['-1_PersonProfileFields.PhoneNumber']).toMatch(/519\D*555\D*0142/);
    // The enhanced widgets show what their selects now hold.
    await expect(frame.locator('[id="-1_PersonProfileFields.AddressState"] + .dropdown .dropdown-toggle')).toHaveText('Ontario');
    // The certification is the person's to give.
    expect(data['-1_Certify']).toBeUndefined();
    expect(data['-1_Why']).toBe('');
    expect(await frame.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted)).toBe(false);

    // The posting, read from its own page.
    await expect(panel.locator('.job-title')).toHaveText('Software Developer Co-op');
    await expect(panel.locator('.job-meta').first()).toContainText('Northwind Systems');

    // The frame is as tall as the form and the outer page scrolls: the panel stays in view.
    await page.evaluate(() => window.scrollTo(0, 1400));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await expect
      .poll(async () => {
        const box = await panel.locator('.panel').boundingBox();
        return box ? box.y >= 0 && box.y < 200 : false;
      })
      .toBe(true);
  });

  test('fills the email on the sign-in step, and leaves the consent box and the CAPTCHA alone', async ({ app }) => {
    await app.seed();
    const page = await app.open(PAGES.icimsLogin);
    const frame = await contentFrame(page);
    const panel = page.frameLocator(`#${FRAME}`).locator('smartsubmit-panel');
    await panel.locator('.launcher').click();
    await panel.locator('.primary').click();
    await expect(panel.locator('.primary')).toHaveText('Autofill again', { timeout: 45_000 });

    expect(await frame.locator('#email').inputValue()).toBe(sampleProfile().email);
    expect(await frame.locator('#accept_gdpr').isChecked()).toBe(false);
    expect(await frame.locator('textarea[name="h-captcha-response"]').inputValue()).toBe('');
    expect(await frame.evaluate(() => (window as unknown as { __submitted: boolean }).__submitted)).toBe(false);
  });
});
