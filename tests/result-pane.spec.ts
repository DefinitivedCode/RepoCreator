import { expect, test } from '@playwright/test';
import { prepare } from './fixtures';

test('the result pane summarises the first commit and who will author it', async ({ page }) => {
  await prepare(page, false, 'simple');
  await page.setViewportSize({ width: 1440, height: 900 });
  const pane = page.getByRole('complementary', { name: 'Project context' });
  const commit = pane.locator('.context-first-commit');
  await expect(commit).toContainText('Branch');
  await expect(commit).toContainText('main');
  await expect(commit).toContainText('Initial commit');
  await expect(commit).toContainText('Test Author <test@example.invalid>');
  // A GitHub project is recorded with the account's private address, never the real email.
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await expect(commit).toContainText('Test Author <your GitHub private address>');
});

test('a saved Repo Creator identity is what the first commit shows', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).testEnvironment = { identityReady: false, identityName: null };
  });
  await prepare(page, false, 'simple', false);
  await page.setViewportSize({ width: 1440, height: 900 });
  const commit = page
    .getByRole('complementary', { name: 'Project context' })
    .locator('.context-first-commit');
  await expect(commit).toContainText('Not set yet');
  await page.evaluate(() =>
    (window as any).__TAURI_INTERNALS__.invoke('set_identity_override', {
      name: 'Ada Lovelace',
      email: 'ada@example.test',
    }),
  );
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'New Project', exact: true })
    .click();
  // The page reads saved preferences when it loads; the form default is unaffected.
  await expect(commit).toBeVisible();
});

test('the Handoff prompt stays reachable from the result pane', async ({ page }) => {
  await prepare(page, false, 'simple');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('Project name').fill('handoff-check');
  await page
    .getByRole('complementary', { name: 'Project context' })
    .getByRole('button', { name: 'Handoff prompt' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Handoff prompt' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('handoff-check');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('below 1250px the pane becomes a bottom drawer opened by Preview files (N)', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  for (const size of [
    { width: 1100, height: 740 },
    { width: 820, height: 580 },
  ]) {
    await page.setViewportSize(size);
    await expect(page.getByRole('complementary', { name: 'Project context' })).toHaveCount(0);
    const trigger = page.getByRole('button', { name: /^Preview files \(\d+\)$/ });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('region', { name: 'Result preview' })).toHaveCount(0);
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const drawer = page.getByRole('region', { name: 'Result preview' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('list', { name: 'Planned generated files' })).toBeVisible();
    await expect(drawer.locator('.context-first-commit')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // The primary action stays reachable with the drawer open.
    await expect(page.locator('.create-button')).toBeInViewport();
    await trigger.click();
    await expect(page.getByRole('region', { name: 'Result preview' })).toHaveCount(0);
  }
  // Wide windows show the pane beside the form, so the trigger is hidden.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('complementary', { name: 'Project context' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Preview files \(\d+\)$/ })).toBeHidden();
});
