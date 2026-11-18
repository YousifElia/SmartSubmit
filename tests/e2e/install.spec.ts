import { expect, test } from './harness';

test('Chrome gives SmartSubmit the same extension ID whatever folder it is loaded from', async ({ app }) => {
  // Fixed by the manifest key: a new version loaded from another folder keeps its data.
  expect(app.extensionId).toBe('henggcjkamgnddjcjhfnfbgfecmankpd');
});
