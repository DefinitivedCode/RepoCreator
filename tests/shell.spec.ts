import { expect, test } from '@playwright/test';
import { prepare, setMode } from './fixtures';

const nav = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Main navigation' });

test('the sidebar is the single main navigation and marks the current page', async ({ page }) => {
  await prepare(page, false, 'simple');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(1);
  const items = nav(page).getByRole('button');
  await expect(nav(page).getByRole('button', { name: 'New Project', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const name of ['Projects', 'Presets', 'Settings']) {
    await nav(page).getByRole('button', { name, exact: true }).click();
    await expect(nav(page).getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(items.filter({ has: page.locator('[aria-current="page"]') })).toHaveCount(0);
    expect(await nav(page).locator('[aria-current="page"]').count()).toBe(1);
  }
  // No old header navigation remains, and the page has one main landmark per view.
  await expect(page.locator('.app-header')).toHaveCount(0);
  await expect(page.getByRole('main')).toHaveCount(1);
});

test('a skip link reaches the content region and is hidden until focused', async ({ page }) => {
  await prepare(page, false, 'simple');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  const before = await skip.boundingBox();
  expect(before!.y + before!.height).toBeLessThanOrEqual(0);
  // It comes first in the tab order, so one Tab from the top of the page lands on it.
  expect(
    await page.evaluate(
      () =>
        document.querySelector(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )?.textContent,
    ),
  ).toBe('Skip to content');
  await skip.focus();
  await expect(skip).toBeFocused();
  const after = await skip.boundingBox();
  expect(after!.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('the sidebar collapses to an accessible icon rail at 820px without page scroll', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await page.setViewportSize({ width: 820, height: 580 });
  const sidebar = page.getByRole('complementary', { name: 'Application' });
  expect((await sidebar.boundingBox())!.width).toBe(52);
  // Labels stay as the accessible names, with tooltips.
  for (const name of ['New Project', 'Projects', 'Presets', 'Settings']) {
    const item = nav(page).getByRole('button', { name, exact: true });
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('title', name);
    expect((await item.boundingBox())!.width).toBeLessThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1100, height: 740 });
  expect((await sidebar.boundingBox())!.width).toBe(200);
});

test('navigation is disabled while a project is being created and returns afterwards', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('busy-lock');
  await page
    .getByRole('navigation', { name: 'Project setup' })
    .getByRole('button', { name: 'Review', exact: true })
    .click();
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  for (const name of ['New Project', 'Projects', 'Presets', 'Settings'])
    await expect(nav(page).getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(page.getByText('busy-lock').first()).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
});

test('choosing New project after a finished creation starts a fresh form', async ({ page }) => {
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('first-one');
  await page
    .getByRole('navigation', { name: 'Project setup' })
    .getByRole('button', { name: 'Review', exact: true })
    .click();
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(nav(page).getByRole('button', { name: 'Projects', exact: true })).toBeEnabled();
  await nav(page).getByRole('button', { name: 'New Project', exact: true }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('');
});

test('setup status shows as a dot on Settings only when something required is unmet', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await expect(page.locator('.sidebar-dot')).toHaveCount(0);
  const unready = await page.context().newPage();
  await unready.addInitScript(() => {
    (window as any).testEnvironment = { identityReady: false, identityName: null };
  });
  await prepare(unready, false, 'simple', false);
  await expect(unready.locator('.sidebar-dot')).toHaveCount(1);
  const settings = nav(unready).getByRole('button', { name: 'Settings', exact: true });
  await expect(settings).toHaveAccessibleDescription('Setup needs attention');
});

test('an available update appears as a sidebar line that opens Settings → Updates', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testUpdateOffer = { version: '9.9.0', notes: 'Notes' };
  });
  await prepare(page, false, 'simple');
  await nav(page).getByRole('button', { name: 'Update available' }).click();
  await expect(page.getByRole('tab', { name: 'Updates', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('the mode switch is gone; the preference lives in Settings and sets picker detail', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await expect(page.getByRole('group', { name: 'Experience mode' })).toHaveCount(0);
  // Every section is available to everyone.
  const rail = page.getByRole('navigation', { name: 'Project setup' });
  for (const name of ['Overview', 'Project Files', 'AI Agents', 'Review'])
    await expect(rail.getByRole('button', { name, exact: true })).toBeVisible();
  const picker = page.locator('.technology-selector').first();
  await expect(picker).toHaveAttribute('data-simple', 'true');
  await setMode(page, 'advanced');
  await expect(picker).toHaveAttribute('data-simple', 'false');
  await nav(page).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Show advanced options by default' }),
  ).toBeChecked();
});

for (const mode of ['simple', 'advanced'] as const)
  test(`${mode} mode uses the same wording and offers the same capabilities`, async ({ page }) => {
    await prepare(page, false, mode);
    for (const label of ['Project name', 'Description', 'Starting point', 'AI coding assistant'])
      await expect(page.getByLabel(label, { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Destination', { exact: true })).toBeVisible();
    for (const name of ['On this computer', 'GitHub'])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset configuration' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configure multiple assistants' })).toBeVisible();
    // The brief's optional fields exist in both modes.
    await page.locator('.brief-details > summary').click();
    for (const label of ['Who is it for?', 'Additional context or constraints'])
      await expect(page.getByLabel(label)).toBeVisible();
    // Project Files and AI Agents open and work.
    await page
      .getByRole('navigation', { name: 'Project setup' })
      .getByRole('button', { name: 'Project Files', exact: true })
      .click();
    await expect(page.getByRole('tablist', { name: 'Project file settings' })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Project setup' })
      .getByRole('button', { name: 'AI Agents', exact: true })
      .click();
    await expect(page.getByRole('tablist', { name: 'AI agent settings' })).toBeVisible();
  });
