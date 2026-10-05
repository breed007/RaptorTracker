// An owner's first session, start to finish. The tests run in order against
// one install, the way a person would use it.
const { test, expect } = require('@playwright/test');
const { signIn, expectAccessible } = require('./helpers');

test.describe.configure({ mode: 'serial' });

test('a wrong password is refused, and the sign-in page is accessible', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Sign in/);
  await expectAccessible(page, 'sign in');
  await page.getByLabel('Username').fill('owner');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
});

test('first run offers a sample truck, which fills the dashboard', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Look around with a sample truck' })).toBeVisible();
  await expectAccessible(page, 'first run');
  await page.getByRole('button', { name: 'Look around with a sample truck' }).click();
  await expect(page.getByRole('heading', { name: 'Sample Raptor' })).toBeVisible();
  await expect(page.getByText('This is a sample truck.')).toBeVisible();
  await expect(page.getByText(/Roof Bar draws more than any AUX switch/)).toBeVisible();
  await expectAccessible(page, 'dashboard');
});

test('a fill-up logged from Quick Add shows in the fuel log', async ({ page }) => {
  await signIn(page);
  await page.goto('/quick');
  await page.getByLabel(/^Odometer/).fill('40000');
  await page.getByLabel(/^Gallons/).fill('24.5');
  await page.getByLabel('$/gal').fill('3.599');
  await page.getByRole('button', { name: 'Log Fill-up' }).click();
  await expect(page.getByText(/Logged|Saved/i)).toBeVisible();
  await page.goto('/fuel');
  await expect(page.getByText('40,000 mi').first()).toBeVisible();
  await expectAccessible(page, 'fuel log');
});

test('a new mod on an AUX switch appears on the AUX panel', async ({ page }) => {
  await signIn(page);
  await page.goto('/mods/new');
  await page.getByLabel('Part Name *').fill('E2E Chase Light');
  await page.getByLabel('Status').selectOption('Installed');
  await page.getByRole('button', { name: 'Assign an AUX Switch' }).click();
  await page.locator('#mod-detail-switch-0').selectOption('1');
  await page.locator('#mod-detail-switch-label-0').fill('Chase');
  await page.getByLabel(/Amp Draw/).fill('3');
  await page.getByRole('button', { name: 'Add Mod' }).click();
  await page.goto('/aux');
  await expect(page.getByText('E2E Chase Light').first()).toBeVisible();
  await expectAccessible(page, 'AUX panel');
});

test('a deleted record can be brought back with Undo', async ({ page }) => {
  await signIn(page);
  await page.goto('/fuel');
  const rows = page.getByRole('button', { name: 'Delete fill-up' });
  // count() doesn't wait; let the list load before taking it.
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  await rows.first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(rows).toHaveCount(before - 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(before);
});

test('Escape closes a dialog and returns focus to what opened it', async ({ page }) => {
  await signIn(page);
  await page.goto('/fuel');
  const del = page.getByRole('button', { name: 'Delete fill-up' }).first();
  await del.focus();
  await page.keyboard.press('Enter');
  const cancel = page.getByRole('dialog').getByRole('button', { name: 'Cancel' });
  // The dialog moves focus to Cancel as it opens; Tab before that lands elsewhere.
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(del).toBeFocused();
});

test('switching to metric converts what the owner sees, and back', async ({ page }) => {
  await signIn(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Metric' }).click();
  await page.getByRole('button', { name: 'Convert and save' }).click();
  await expect(page.getByText(/Units saved/)).toBeVisible();
  await page.goto('/fuel');
  await expect(page.getByText('64,374 km').first()).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'US' }).click();
  await page.getByRole('button', { name: 'Convert and save' }).click();
  await expect(page.getByText(/Units saved/)).toBeVisible();
  await page.goto('/fuel');
  await expect(page.getByText('40,000 mi').first()).toBeVisible();
});

test('the vehicle history report downloads as a PDF', async ({ page }) => {
  await signIn(page);
  await page.goto('/reports');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download vehicle history' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/history.*\.pdf$/);
  await expectAccessible(page, 'reports');
});

test('every main page passes the accessibility check in dark mode', async ({ page }) => {
  await signIn(page);
  for (const path of ['/', '/maintenance', '/garage', '/settings/backups']) {
    await page.goto(path);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expectAccessible(page, `${path} (dark)`);
  }
});

test('removing the sample truck returns to first run', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Remove sample truck' }).click();
  await expect(page.getByRole('button', { name: 'Look around with a sample truck' })).toBeVisible();
});
