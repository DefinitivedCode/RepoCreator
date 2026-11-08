import { expect, test, type Page } from '@playwright/test';
import { navigate, prepare } from './fixtures';

type Call = { command: string; payload?: any };
const calls = (page: Page) => page.evaluate(() => (window as any).testCalls as Call[]);
const commands = async (page: Page) => (await calls(page)).map((call) => call.command);

const noIdentity = {
  identityReady: false,
  identityName: null,
};

async function openSettings(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
}

test('a missing identity is named in the footer, described on the button, and fixed in place', async ({
  page,
}) => {
  await page.addInitScript((environment) => {
    (window as any).testEnvironment = environment;
  }, noIdentity);
  await prepare(page, false, 'simple', false);
  await page.getByLabel('Project name').fill('fresh-start');
  const reason = page.locator('#creation-reason');
  await expect(reason).toContainText('Git needs your name and email to record commits');
  await expect(reason).not.toContainText('Complete the required setup');
  await expect(page.locator('.creation-git-status')).toContainText('Setup incomplete');
  // The disabled button is described by the visible reason.
  const review = page.getByRole('button', { name: 'Review project', exact: true });
  await expect(review).toBeDisabled();
  await expect(review).toHaveAttribute('aria-describedby', 'creation-reason');
  // The inline fix opens the Settings tab that actually contains the fields.
  await reason.getByRole('button', { name: 'Add name and email' }).click();
  await expect(page.getByRole('tab', { name: 'Git & identity' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Git records a name and email with every commit.', { exact: false }),
  ).toBeVisible();
});

test('the Review step offers the first setup fix, labelled by what is wrong', async ({ page }) => {
  await page.addInitScript((environment) => {
    (window as any).testEnvironment = environment;
  }, noIdentity);
  await prepare(page, false, 'simple', false);
  await page.getByLabel('Project name').fill('fresh-start');
  await navigate(page, 'Review');
  await page
    .getByRole('button', { name: 'Git needs your name and email to record commits' })
    .click();
  await expect(page.getByRole('tab', { name: 'Git & identity' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('several blockers are counted and listed, each with its own fix', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).testEnvironment = {
      identityReady: false,
      identityName: null,
      githubUser: null,
      githubOwners: [],
    };
  });
  await prepare(page, false, 'advanced', false);
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByLabel('Project name').fill('fresh-start');
  const list = page.getByRole('group', { name: 'To create this project' });
  await expect(list).toContainText('2 things to fix');
  await expect(list).toContainText('Git needs your name and email to record commits');
  await expect(list).toContainText('Sign in to GitHub to publish');
  await expect(page.locator('#creation-reason')).toContainText('2 things to fix');
  // The alternative to signing in is publishing locally, without losing the form.
  await list.getByRole('button', { name: 'Use a local project instead' }).click();
  await expect(page.getByRole('group', { name: 'To create this project' })).toHaveCount(0);
  await expect(page.getByLabel('Project name')).toHaveValue('fresh-start');
  await expect(page.locator('#creation-reason')).toContainText(
    'Git needs your name and email to record commits',
  );
  // And the GitHub sign-in fix opens the GitHub tab.
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page
    .getByRole('group', { name: 'To create this project' })
    .getByRole('button', { name: 'Sign in' })
    .click();
  await expect(page.getByRole('tab', { name: 'GitHub', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('an unreachable GitHub is never shown as not connected, and offers a retry', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testEnvironment = {
      githubUser: null,
      githubOwners: [],
      githubState: 'unverified',
    };
  });
  await prepare(page, false, 'advanced', false);
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByLabel('Project name').fill('fresh-start');
  await expect(page.locator('#creation-reason')).toContainText(
    'Couldn’t reach GitHub to check your sign-in',
  );
  await expect(
    page.locator('#creation-reason').getByRole('button', { name: 'Retry' }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Not connected');
  await openSettings(page);
  await page.getByRole('tab', { name: 'GitHub', exact: true }).click();
  const panel = page.getByRole('tabpanel');
  await expect(panel).toContainText('Couldn’t reach GitHub to check your sign-in');
  await expect(panel).not.toContainText('Not connected');
  await expect(panel).not.toContainText('not signed in');
  await expect(panel.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(panel).toContainText(
    'A terminal window will open and show a one-time code. Enter it on github.com, then return here.',
  );
  // A local project is unaffected by an unreachable GitHub.
  await page.getByRole('button', { name: 'Return to project setup' }).click();
  await page.getByRole('button', { name: 'Local only', exact: true }).click();
  await expect(page.locator('#creation-reason')).toHaveText('Ready to create');
});

test('the GitHub tab always checks, rechecks on focus at most every three seconds, and stops once signed in', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testEnvironment = { githubUser: null, githubOwners: [] };
  });
  await prepare(page, false, 'simple', false);
  await expect(page.locator('.creation-git-status')).toContainText('Git ready');
  // Local destination: no GitHub check yet.
  const githubChecks = async () =>
    (await calls(page)).filter(
      (call) => call.command === 'check_environment' && call.payload?.includeGithub === true,
    ).length;
  expect(await githubChecks()).toBe(0);
  await openSettings(page);
  await page.getByRole('tab', { name: 'GitHub', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('You’re not signed in to GitHub');
  expect(await githubChecks()).toBe(1);
  // Immediate focus events are debounced.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(300);
  expect(await githubChecks()).toBe(1);
  // After the debounce window a focus rechecks once; sign-in then ends the rechecking.
  await page.waitForTimeout(3100);
  await page.evaluate(() => {
    (window as any).testEnvironment = { githubUser: 'octocat', githubOwners: ['octocat'] };
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('tabpanel')).toContainText('Connected as octocat');
  expect(await githubChecks()).toBe(2);
  await page.waitForTimeout(3100);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(300);
  expect(await githubChecks()).toBe(2);
});

test('saving an identity for Repo Creator projects is explicit, validated, and never global', async ({
  page,
}) => {
  await page.addInitScript((environment) => {
    (window as any).testEnvironment = environment;
  }, noIdentity);
  await prepare(page, false, 'simple', false);
  await openSettings(page);
  const projectOption = page.getByRole('radio', { name: 'Use only for Repo Creator projects' });
  await expect(projectOption).toBeChecked();
  await expect(
    page.getByText(
      'Saved in Repo Creator and applied inside each new project. Your global Git settings are not changed.',
    ),
  ).toBeVisible();
  const name = page.getByLabel('Name', { exact: true });
  const email = page.getByLabel('Email', { exact: true });
  const save = page.getByRole('button', { name: 'Save for Repo Creator projects' });
  await expect(save).toBeDisabled();
  await name.fill('Ada Lovelace');
  await email.fill('not-an-email');
  await expect(page.getByText('Enter an email like name@example.com')).toBeVisible();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(save).toBeDisabled();
  expect(await commands(page)).not.toContain('set_identity_override');
  await email.fill('ada@example.test');
  await save.click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toContainText(
    'Ada Lovelace <ada@example.test>',
  );
  const sent = (await calls(page)).filter((call) => call.command === 'set_identity_override');
  expect(sent.map((call) => call.payload)).toEqual([
    { name: 'Ada Lovelace', email: 'ada@example.test' },
  ]);
  expect(await commands(page)).not.toContain('set_git_identity_global');
  // The saved identity satisfies setup for new projects.
  await page.getByRole('button', { name: 'Return to project setup' }).click();
  await page.getByLabel('Project name').fill('fresh-start');
  await expect(page.locator('.creation-git-status')).toContainText('Git ready');
  await expect(page.locator('#creation-reason')).toHaveText('Ready to create');
});

test('making an identity the Git default needs the labelled button and shows what it replaces', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testEnvironment = {
      identityReady: false,
      identityName: null,
      identity: {
        name: 'Old Name',
        email: 'old@example.test',
        nameScope: 'global',
        emailScope: 'global',
        resolves: false,
        emailValid: true,
        globalConfigPath: 'C:/Users/test/.gitconfig',
      },
    };
    (window as any).testGlobalPrevious = { name: 'Old Name', email: 'old@example.test' };
  });
  await prepare(page, false, 'simple', false);
  await openSettings(page);
  await page.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
  await page.getByLabel('Email', { exact: true }).fill('ada@example.test');
  // Choosing the option reveals the details but changes nothing.
  await page.getByRole('radio', { name: 'Set as my Git default' }).check();
  const confirm = page.getByRole('group', { name: 'Change my Git default' });
  await expect(confirm).toContainText('git config --global user.name "Ada Lovelace"');
  await expect(confirm).toContainText('git config --global user.email "ada@example.test"');
  await expect(confirm).toContainText('C:/Users/test/.gitconfig');
  await expect(confirm).toContainText('It replaces Old Name <old@example.test>');
  const button = confirm.getByRole('button', { name: 'Save to my Git configuration' });
  await expect(button).not.toBeFocused();
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeVisible();
  expect(await commands(page)).not.toContain('set_git_identity_global');
  expect(await commands(page)).not.toContain('set_identity_override');
  // Cancel leaves everything untouched and returns to the default option.
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('radio', { name: 'Use only for Repo Creator projects' }),
  ).toBeChecked();
  expect(await commands(page)).not.toContain('set_git_identity_global');
  await page.getByRole('radio', { name: 'Set as my Git default' }).check();
  await button.click();
  await expect(page.getByRole('status').filter({ hasText: 'Tested:' })).toContainText(
    'Tested: commits will be signed as Ada Lovelace <ada@example.test>',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Tested:' })).toContainText(
    'Replaced Old Name <old@example.test>.',
  );
  const written = (await calls(page)).filter((call) => call.command === 'set_git_identity_global');
  expect(written.map((call) => call.payload)).toEqual([
    { name: 'Ada Lovelace', email: 'ada@example.test', confirm: true },
  ]);
  // The environment is rechecked and now reports the identity as ready.
  await expect(page.getByText('Git identity ready')).toBeVisible();
});

test('setup screens never ask for a password or token', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).testEnvironment = {
      identityReady: false,
      identityName: null,
      githubUser: null,
      githubOwners: [],
    };
  });
  await prepare(page, false, 'advanced', false);
  await openSettings(page);
  for (const tab of ['Git & identity', 'GitHub', 'Development tools']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const sensitive = await page.evaluate(
      () =>
        [...document.querySelectorAll('input, textarea')].filter((el) => {
          const input = el as HTMLInputElement;
          const text = [input.type, input.name, input.id, input.placeholder, input.autocomplete]
            .join(' ')
            .toLowerCase();
          return /password|token|secret|credential|apikey|api-key/.test(text);
        }).length,
    );
    expect(sensitive, tab).toBe(0);
  }
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('creating a local project makes no GitHub call', async ({ page }) => {
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('local-only');
  await navigate(page, 'Review');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page.getByText('local-only').first()).toBeVisible();
  const all = await calls(page);
  expect(all.some((call) => call.command === 'create_repository')).toBe(true);
  for (const call of all) {
    expect(['connect_github', 'retry_publish', 'open_github']).not.toContain(call.command);
    if (call.command === 'check_environment') expect(call.payload?.includeGithub).toBe(false);
  }
});
