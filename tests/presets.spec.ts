import { expect, test, type Page } from '@playwright/test';
import { prepare } from './fixtures';

type Call = { command: string; payload?: any };
const calls = (page: Page) => page.evaluate(() => (window as any).testCalls as Call[]);
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const open = async (page: Page) => {
  await nav(page).getByRole('button', { name: 'Presets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Presets', exact: true })).toBeVisible();
};

test('the Presets page explains presets and separates yours from built-in', async ({ page }) => {
  await prepare(page, false, 'simple');
  await open(page);
  await expect(page.getByText('A preset is a saved set of files')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Yours', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Built-in', exact: true })).toBeVisible();
  await expect(page.getByText('You have no presets yet.')).toBeVisible();
  // Built-in presets can be used and duplicated but never deleted.
  const builtIn = page.getByRole('region', { name: 'Built-in' });
  await expect(builtIn.getByRole('button', { name: 'Use preset Default' })).toBeVisible();
  await expect(builtIn.getByRole('button', { name: 'Duplicate Default' })).toBeVisible();
  await expect(builtIn.getByRole('button', { name: /^Delete / })).toHaveCount(0);
  // No all-caps eyebrow labels.
  await expect(page.getByText('REUSABLE STARTING POINTS')).toHaveCount(0);
});

test('Use preset applies the preset and returns to New Project', async ({ page }) => {
  await prepare(page, false, 'simple');
  await open(page);
  await page.getByRole('button', { name: 'Use preset Standard' }).click();
  await expect(page.getByLabel('Project name')).toBeVisible();
  await expect(page.getByLabel('Starting point')).toHaveValue('standard');
});

test('Duplicate makes a custom copy that can be deleted only after confirming', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await open(page);
  await page.getByRole('button', { name: 'Duplicate Standard', exact: true }).click();
  const yours = page.getByRole('region', { name: 'Yours' });
  await expect(yours.getByRole('button', { name: 'Use preset Standard copy' })).toBeVisible();
  await expect(page.getByText('Duplicated “Standard”.')).toBeVisible();
  // A second duplicate gets a distinct name.
  await page.getByRole('button', { name: 'Duplicate Standard', exact: true }).click();
  await expect(yours.getByRole('button', { name: 'Use preset Standard copy 2' })).toBeVisible();
  // Delete asks first; Cancel keeps it.
  await yours.getByRole('button', { name: 'Delete Standard copy 2' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete preset?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await calls(page)).filter((c) => c.command === 'delete_custom_preset')).toHaveLength(0);
  await yours.getByRole('button', { name: 'Delete Standard copy 2' }).click();
  await dialog.getByRole('button', { name: 'Delete preset' }).click();
  await expect(yours.getByRole('button', { name: 'Use preset Standard copy 2' })).toHaveCount(0);
  await expect(
    yours.getByRole('button', { name: 'Use preset Standard copy', exact: true }),
  ).toBeVisible();
  expect((await calls(page)).filter((c) => c.command === 'delete_custom_preset')).toHaveLength(1);
});

test('Manage presets still opens the existing manager', async ({ page }) => {
  await prepare(page, false, 'simple');
  await open(page);
  await page.getByRole('button', { name: 'Manage presets', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
