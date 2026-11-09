import { expect, test } from '@playwright/test';
import { prepare, setMode } from './fixtures';

const index = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Project setup' });

test('New Project is one scrolling page with an index and no Review or Handoff step', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  const main = page.getByRole('main', { name: 'Repository configuration' });
  for (const name of ['Overview', 'Project Files', 'AI Agents'])
    await expect(main.getByRole('heading', { name, level: 2, exact: true })).toBeAttached();
  await expect(main.getByRole('heading', { name: 'New project', level: 1 })).toBeVisible();
  await expect(index(page).getByRole('button')).toHaveText([
    'Overview',
    'Project Files',
    'AI Agents',
  ]);
  await expect(index(page).getByRole('button', { name: 'Review' })).toHaveCount(0);
  await expect(index(page).getByRole('button', { name: 'AI Handoff' })).toHaveCount(0);
});

test('the index scrolls to a section, focuses its heading and follows the scroll position', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await prepare(page, false, 'advanced');
  const main = page.locator('.workspace-main');
  await index(page).getByRole('button', { name: 'AI Agents', exact: true }).click();
  await expect(main.getByRole('heading', { name: 'AI Agents', exact: true })).toBeFocused();
  await expect(index(page).getByRole('button', { name: 'AI Agents', exact: true })).toHaveAttribute(
    'aria-current',
    'location',
  );
  expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // Scrolling back to the top moves the index with it (after the short lock set by the click).
  await page.waitForTimeout(600);
  await main.evaluate((el) => el.scrollTo(0, 0));
  await expect(index(page).getByRole('button', { name: 'Overview', exact: true })).toHaveAttribute(
    'aria-current',
    'location',
  );
});

test('Customize regions start collapsed in simple mode and expanded in advanced mode', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  const files = page.getByRole('button', { name: /^Customize files/ });
  const agents = page.getByRole('button', { name: /^Customize AI agents/ });
  await expect(files).toHaveAttribute('aria-expanded', 'false');
  await expect(agents).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('tablist', { name: 'Project file settings' })).toHaveCount(0);
  await files.click();
  await expect(page.getByRole('tablist', { name: 'Project file settings' })).toBeVisible();
  await setMode(page, 'advanced');
  await expect(page.getByRole('button', { name: /^Customize AI agents/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('Create is one action: a local project is created at once, with no review step', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('one-step');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  const created = await page.evaluate(
    () => (window as any).testCalls.filter((c: any) => c.command === 'create_repository').length,
  );
  expect(created).toBe(1);
});

test('the AI files switch exists once and the Handoff prompt opens from the result pane', async ({
  page,
}) => {
  await prepare(page, false, 'advanced');
  await expect(page.getByLabel('Generate AI agent files')).toHaveCount(1);
  await page.getByRole('button', { name: /^Preview files \(\d+\)$/ }).click();
  await page.getByRole('button', { name: 'Handoff prompt', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Handoff prompt' })).toBeVisible();
});
