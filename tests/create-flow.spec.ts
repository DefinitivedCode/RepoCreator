import { expect, test, type Page } from '@playwright/test';
import { navigate, prepare } from './fixtures';

type Call = { command: string; payload?: any };
const calls = (page: Page) => page.evaluate(() => (window as any).testCalls as Call[]);
const created = async (page: Page) =>
  (await calls(page)).filter((call) => call.command === 'create_repository');

async function toReview(page: Page, name: string) {
  await page.getByLabel('Project name').fill(name);
  await navigate(page, 'Review');
}

test('an unavailable Create button stays focusable and opens a popover with a fix for each blocker', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testEnvironment = { identityReady: false, identityName: null };
  });
  await prepare(page, false, 'simple', false);
  await page.getByLabel('Project name').fill('needs-identity');
  const button = page.getByRole('button', { name: 'Review project', exact: true });
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(button).not.toHaveAttribute('disabled', '');
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  const popover = page.getByRole('dialog', { name: 'To create this project' });
  await expect(popover).toBeVisible();
  await expect(popover).toContainText('Git needs your name and email to record commits');
  expect(await created(page)).toHaveLength(0);
  // Escape closes it and returns focus to the button.
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(button).toBeFocused();
  // Its fix opens the right Settings tab without losing the form.
  // aria-disabled buttons are inert but focusable, so click past Playwright's enabled wait.
  await button.click({ force: true });
  await popover.getByRole('button', { name: 'Add name and email' }).click();
  await expect(page.getByRole('tab', { name: 'Git & identity' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'New Project', exact: true })
    .click();
  await expect(page.getByLabel('Project name')).toHaveValue('needs-identity');
});

test('a ready Create button has no popover and a local project is created without a confirmation', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await toReview(page, 'local-only');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await created(page)).toHaveLength(1);
});

test('publishing to GitHub asks first, names the repository, and Cancel creates nothing', async ({
  page,
}) => {
  await prepare(page, false, 'advanced');
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await toReview(page, 'octo-notes');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create on GitHub?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('octocat/octo-notes');
  await expect(dialog).toContainText('Private');
  await expect(dialog).toContainText('main');
  // Cancel is the default focus, so a stray Enter cannot publish.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await created(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(await created(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create on GitHub' }).click();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  const [request] = await created(page);
  expect(request.payload.request.destination).toBe('github');
});

test('a public repository is called out in the confirmation', async ({ page }) => {
  await prepare(page, false, 'advanced');
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByRole('radio', { name: 'Public' }).check();
  await toReview(page, 'open-notes');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create on GitHub?' });
  await expect(dialog).toContainText('Public. Anyone on the internet can see it.');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(await created(page)).toHaveLength(0);
});
