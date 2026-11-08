import { expect, test, type Page } from '@playwright/test';
import { prepare } from './fixtures';

type Call = { command: string; payload?: any };
const calls = (page: Page) => page.evaluate(() => (window as any).testCalls as Call[]);
const has = async (page: Page, command: string) =>
  (await calls(page)).some((call) => call.command === command);

const firstRun = (environment: object = {}) =>
  `window.testOnboarding = {}; window.testEnvironment = ${JSON.stringify(environment)};`;
const welcome = (page: Page) => page.getByRole('heading', { name: 'Welcome to Repo Creator' });

test('first run shows a checklist, not the app, and explains what is left', async ({ page }) => {
  await page.addInitScript(
    firstRun({ identityReady: false, identityName: null, githubUser: null, githubOwners: [] }),
  );
  await prepare(page, false, 'simple', false);
  await expect(welcome(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  await expect(page.getByText('Git is installed: Ready')).toBeAttached();
  await expect(page.getByText('Your commit identity: Needs attention')).toBeAttached();
  await expect(page.getByText('Publish to GitHub: Not set up')).toBeAttached();
  // The primary actions stay visible but unavailable, with a linked reason.
  const create = page.getByRole('button', { name: 'Create my first project' });
  await expect(create).toHaveAttribute('aria-disabled', 'true');
  await expect(create).toHaveAccessibleDescription('Finish the required setup to continue.');
  await expect(page.getByRole('status').filter({ hasText: 'to continue' })).toContainText(
    'Finish Your commit identity to continue.',
  );
  // aria-disabled buttons stay focusable and inert: force past Playwright's actionability wait.
  await create.click({ force: true });
  expect(await has(page, 'complete_onboarding')).toBe(false);
  await expect(welcome(page)).toBeVisible();
});

test('fixing the identity in place unlocks the primary actions, and creating completes setup', async ({
  page,
}) => {
  await page.addInitScript(firstRun({ identityReady: false, identityName: null }));
  await prepare(page, false, 'simple', false);
  await page.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
  await page.getByLabel('Email', { exact: true }).fill('ada@example.test');
  await page.getByRole('button', { name: 'Save for Repo Creator projects' }).click();
  await expect(page.getByText('Your commit identity: Ready')).toBeAttached();
  const create = page.getByRole('button', { name: 'Create my first project' });
  await expect(create).not.toHaveAttribute('aria-disabled', 'true');
  await create.click();
  await expect(page.getByLabel('Project name')).toBeVisible();
  expect(await has(page, 'complete_onboarding')).toBe(true);
  await expect(welcome(page)).toHaveCount(0);
});

test('an experienced setup shows everything ready with one click to start', async ({ page }) => {
  await page.addInitScript(firstRun());
  await prepare(page, false, 'simple', false);
  await expect(page.getByText('Git is installed: Ready')).toBeAttached();
  await expect(page.getByText('Your commit identity: Ready')).toBeAttached();
  await expect(page.getByText('Commits will be signed as Test Author').first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'to continue' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create my first project' }).click();
  await expect(page.getByLabel('Project name')).toBeVisible();
});

test('a user who already has projects is never interrupted', async ({ page }) => {
  await page.addInitScript(`window.testOnboarding = {}; window.testRecentProjects = [{id:'p1'}];`);
  await prepare(page, false, 'simple');
  await expect(welcome(page)).toHaveCount(0);
  await expect(page.getByLabel('Project name')).toBeVisible();
  // Required items pass, so setup completes silently.
  await expect.poll(() => has(page, 'complete_onboarding')).toBe(true);

  const unready = await page.context().newPage();
  await unready.addInitScript(
    `window.testOnboarding = {}; window.testRecentProjects = [{id:'p1'}]; window.testEnvironment = {identityReady:false,identityName:null};`,
  );
  await prepare(unready, false, 'simple', false);
  await expect(unready.getByLabel('Project name')).toBeVisible();
  await expect(unready.locator('.sidebar-dot')).toHaveCount(1);
  await unready.waitForTimeout(400);
  expect(await has(unready, 'complete_onboarding')).toBe(false);
  await expect(welcome(unready)).toHaveCount(0);
});

test('skipping GitHub is remembered and local setup makes no GitHub call', async ({ page }) => {
  await page.addInitScript(firstRun({ githubUser: null, githubOwners: [] }));
  await prepare(page, false, 'simple', false);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByText('Skipped. Projects stay on this computer.')).toBeVisible();
  expect(await has(page, 'skip_github_setup')).toBe(true);
  await page.getByRole('button', { name: 'Skip for now' }).waitFor({ state: 'detached' });
  const all = await calls(page);
  for (const call of all) {
    expect(['connect_github', 'retry_publish', 'open_github']).not.toContain(call.command);
    if (call.command === 'check_environment') expect(call.payload?.includeGithub).toBe(false);
  }
});

test('missing Git offers the official download and copyable help but installs nothing', async ({
  page,
}) => {
  await page.addInitScript(
    firstRun({
      gitInstalled: false,
      identityReady: false,
      identityName: null,
      platform: 'windows',
    }),
  );
  await prepare(page, false, 'simple', false);
  await expect(page.getByText('Git is installed: Needs attention')).toBeAttached();
  await expect(page.getByText('It isn’t installed.')).toBeVisible();
  await page.getByRole('button', { name: 'Show how' }).click();
  await expect(page.getByText('winget install --id Git.Git -e')).toBeVisible();
  await expect(page.getByText('Repo Creator never installs software for you.')).toBeVisible();
  await page.getByRole('button', { name: 'Copy' }).click();
  expect(await page.evaluate(() => (window as any).testCopied)).toBe(
    'winget install --id Git.Git -e',
  );
  expect(await has(page, 'open_setup_resource')).toBe(false);
  await page.getByRole('button', { name: 'Open the official Git download' }).click();
  expect((await calls(page)).filter((c) => c.command === 'open_setup_resource')).toEqual([
    expect.objectContaining({ payload: { resource: 'git' } }),
  ]);
  await expect(page.getByRole('button', { name: 'Create my first project' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('a failed check says so and can be retried', async ({ page }) => {
  await page.addInitScript(`window.testOnboarding = {}; window.testEnvironmentError = true;`);
  await prepare(page, false, 'simple', false);
  await expect(page.getByText('Couldn’t check')).toBeVisible();
  await page.evaluate(() => ((window as any).testEnvironmentError = false));
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Git is installed: Ready')).toBeAttached();
});

test('Settings → Setup shows the checklist and details, and Run setup again clears only completion', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Setup', exact: true }).click();
  await expect(page.getByText('Git is installed: Ready')).toBeAttached();
  await page.getByRole('button', { name: /^Details\s+versions/ }).click();
  await expect(page.getByText('Global Git settings file')).toBeVisible();
  await page.getByRole('button', { name: 'Run setup again' }).click();
  await expect.poll(() => has(page, 'reset_onboarding')).toBe(true);
  const prefs = await page.evaluate(() =>
    (window as any).__TAURI_INTERNALS__.invoke('get_preferences'),
  );
  expect(prefs.onboarding.completedAt).toBeNull();
  expect(prefs.onboarding.githubSkipped).toBe(false);
  expect(prefs.parentPath).toBe('C:\\Projects');
});

test('first-run setup has no secret inputs and fits 820×580 without page scroll', async ({
  page,
}) => {
  await page.addInitScript(firstRun({ identityReady: false, identityName: null }));
  await prepare(page, false, 'simple', false);
  await page.setViewportSize({ width: 820, height: 580 });
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  const sensitive = await page.evaluate(
    () =>
      [...document.querySelectorAll('input, textarea')].filter((el) =>
        /password|token|secret|credential/i.test(
          [
            (el as HTMLInputElement).type,
            (el as HTMLInputElement).name,
            (el as HTMLInputElement).placeholder,
          ].join(' '),
        ),
      ).length,
  );
  expect(sensitive).toBe(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // The page scrolls inside its own region, so the last action is reachable.
  const create = page.getByRole('button', { name: 'Add an existing project' });
  await create.scrollIntoViewIfNeeded();
  await expect(create).toBeInViewport();
});
