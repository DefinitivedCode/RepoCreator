import { expect, test, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

// Use Tauri's official IPC/event mock only in the browser tests. Production always uses Rust.
const mockSource = readFileSync('node_modules/@tauri-apps/api/mocks.js', 'utf8').replace(/^export \{[^\n]*\};\s*$/m, '');

async function prepare(page: Page, failPublish = false) {
  await page.addInitScript({ content: `${mockSource}
    window.isTauri = true;
    window.testCalls = [];
    let attempts = 0;
    mockIPC(async (command, payload) => {
      window.testCalls.push({ command, payload });
      if (command === 'get_preferences') return { parentPath: 'C:\\\\Projects', destination: 'local' };
      if (command === 'check_environment') return { gitInstalled: true, identityReady: true, ghInstalled: true, githubUser: 'octocat' };
      if (command === 'choose_parent') return null;
      if (command === 'create_repository' || command === 'retry_publish') {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 220));
        if (${failPublish} && attempts === 1) throw { message: 'The GitHub repository exists, but the initial commit could not be pushed.', guidance: 'Your local repository and commit are safe. Check your connection, then retry publishing.', localPath: 'C:\\\\Projects\\\\fresh-start', localReady: true, canRetry: true, githubUrl: 'https://github.com/octocat/fresh-start' };
        return { name: payload?.request?.name || 'fresh-start', path: 'C:\\\\Projects\\\\fresh-start', githubUrl: payload?.request?.destination === 'github' || command === 'retry_publish' ? 'https://github.com/octocat/fresh-start' : null, commit: 'a'.repeat(40) };
      }
    }, { shouldMockEvents: true });` });
  await page.goto('/');
  await expect(page.getByText('Git is ready', { exact: true })).toBeVisible();
}

test('validates names, supports folder cancellation, and fits the compact window', async ({ page }, info) => {
  await prepare(page);
  const create = page.getByRole('button', { name: 'Create Repository' });
  await expect(create).toBeDisabled();
  await page.getByLabel('Project name').fill('../escape');
  await page.getByLabel('Project name').blur();
  await expect(page.locator('#name-help')).toHaveClass(/invalid/);
  await expect(create).toBeDisabled();
  await page.getByLabel('Project name').fill('fresh-start');
  await page.getByRole('button', { name: 'Browse' }).click();
  await expect(page.getByText('C:\\Projects', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Private' })).toBeChecked();
  await expect(create).toBeEnabled();
  const height = await page.evaluate(() => ({ document: document.documentElement.scrollHeight, viewport: innerHeight }));
  expect(height.document).toBeLessThanOrEqual(height.viewport);
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/app-${info.project.name}.png` });
});

test('creates once, shows verified result, and resets while keeping destination', async ({ page }) => {
  await prepare(page);
  await page.getByLabel('Project name').fill('fresh-start');
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByLabel('Description optional').fill('A fresh idea');
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await expect(page.getByRole('heading', { name: 'Making room for your idea.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open on GitHub' })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { testCalls: { command: string; payload: unknown }[] }).testCalls.filter(c => c.command === 'create_repository'));
  expect(calls).toHaveLength(1);
  expect(calls[0].payload).toMatchObject({ request: { name: 'fresh-start', destination: 'github', visibility: 'private', description: 'A fresh idea' } });
  await page.getByRole('button', { name: 'Create Another' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'GitHub', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radio', { name: 'Private' })).toBeChecked();
});

test('shows partial failure honestly and retries the existing publication', async ({ page }) => {
  await prepare(page, true);
  await page.getByLabel('Project name').fill('fresh-start');
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await expect(page.getByRole('heading', { name: 'Your local repository is safe.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Repository created' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Retry publishing' }).click();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  const commands = await page.evaluate(() => (window as unknown as { testCalls: { command: string }[] }).testCalls.map(c => c.command));
  expect(commands.filter(c => c === 'create_repository')).toHaveLength(1);
  expect(commands.filter(c => c === 'retry_publish')).toHaveLength(1);
});
