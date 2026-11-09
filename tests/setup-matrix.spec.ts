import { expect, test } from '@playwright/test';
import { prepare } from './fixtures';

const gitCases = [
  { gitState: 'ok', gitInstalled: true, gitVersion: '2.45.1', text: 'Git 2.45.1' },
  { gitState: 'missing', gitInstalled: false, gitVersion: null, text: 'It isn’t installed.' },
  {
    gitState: 'too-old',
    gitInstalled: true,
    gitVersion: '2.27.0',
    text: 'too old to name the first branch',
  },
] as const;
const identityCases = [
  {
    kind: 'complete',
    name: 'Example Author',
    email: 'author@example.test',
    text: 'Commits will be signed as Example Author',
  },
  {
    kind: 'name-only',
    name: 'Example Author',
    email: null,
    text: 'Git has your name but no email.',
  },
  {
    kind: 'email-only',
    name: null,
    email: 'author@example.test',
    text: 'Git has your email but no name.',
  },
  { kind: 'missing', name: null, email: null, text: 'Git doesn’t have a name or email yet.' },
] as const;
const githubCases = [
  {
    githubState: 'cli-missing',
    ghInstalled: false,
    githubUser: null,
    text: 'GitHub CLI isn’t installed.',
  },
  {
    githubState: 'signed-out',
    ghInstalled: true,
    githubUser: null,
    text: 'Optional. Not signed in.',
  },
  {
    githubState: 'signed-in',
    ghInstalled: true,
    githubUser: 'octocat',
    text: 'Connected as octocat',
  },
  {
    githubState: 'unverified',
    ghInstalled: true,
    githubUser: null,
    text: 'Couldn’t reach GitHub to check your sign-in',
  },
] as const;

for (const { text: gitText, ...git } of gitCases) {
  for (const { text: identityText, kind, name, email } of identityCases) {
    for (const { text: githubText, ...github } of githubCases) {
      test(`first-run matrix: Git ${git.gitState}, identity ${kind}, GitHub ${github.githubState}`, async ({
        page,
      }) => {
        const identityReady = kind === 'complete';
        const gitReady = git.gitState === 'ok';
        await page.addInitScript(
          (environment) => {
            (window as any).testOnboarding = {};
            (window as any).testEnvironment = environment;
          },
          {
            ...git,
            ...github,
            identityReady,
            githubOwners: github.githubUser ? [github.githubUser] : [],
            identityName: name,
            identity: {
              name,
              email,
              nameScope: name ? 'global' : null,
              emailScope: email ? 'global' : null,
              resolves: identityReady,
              emailValid: !!email,
              globalConfigPath: null,
            },
          },
        );
        await prepare(page, false, 'simple', false);
        const checklist = page.getByRole('region', { name: 'Setup checklist' });
        const row = (title: string) =>
          checklist.locator('.ui-status-row').filter({ hasText: title });
        await expect(row('Git is installed')).toContainText(gitText);
        await expect(row('Git is installed')).toHaveAttribute(
          'data-state',
          gitReady ? 'ok' : 'warning',
        );
        await expect(row('Your commit identity')).toHaveAttribute(
          'data-state',
          gitReady ? (identityReady ? 'ok' : 'warning') : 'neutral',
        );
        if (gitReady)
          await expect(checklist.getByText(identityText, { exact: false }).first()).toBeVisible();
        else await expect(row('Your commit identity')).toContainText('Needs Git first.');
        await expect(row('Publish to GitHub')).toContainText(githubText);
        await expect(row('Publish to GitHub')).toHaveAttribute(
          'data-state',
          github.githubState === 'signed-in'
            ? 'ok'
            : github.githubState === 'unverified'
              ? 'warning'
              : 'neutral',
        );
        const create = page.getByRole('button', { name: 'Create my first project' });
        if (gitReady && identityReady) await expect(create).toBeEnabled();
        else await expect(create).toHaveAttribute('aria-disabled', 'true');
        expect(
          await page.locator('main button[data-variant="primary"]:visible').count(),
        ).toBeLessThanOrEqual(1);
      });
    }
  }
}
