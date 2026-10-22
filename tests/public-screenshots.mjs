// Capture the production UI with isolated, generic demonstration data.
// No repository is created and no GitHub account is queried.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

assert.equal(process.platform, 'win32', 'Production screenshot capture uses Windows WebView2');
const root = path.resolve(import.meta.dirname, '..');
const temporaryRoot = path.resolve(os.tmpdir());
const temporary = await mkdtemp(path.join(temporaryRoot, 'repo-creator-public-'));
const data = path.join(temporary, 'app-data');
const output = path.join(root, 'docs', 'assets');
const executable =
  process.env.REPO_CREATOR_SMOKE_EXE ||
  path.join(root, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'repo-creator.exe');
const endpointUrl = 'http://127.0.0.1:9225/json/version';
const demonstrationDirectory = 'C:\\Projects';
let child,
  browser,
  createdDemonstrationDirectory = false;
try {
  assert.equal(
    await fetch(endpointUrl, { signal: AbortSignal.timeout(1000) })
      .then(() => true)
      .catch(() => false),
    false,
    'Screenshot debugging port must be unused',
  );
  await mkdir(data, { recursive: true });
  await mkdir(output, { recursive: true });
  // Preferences accept only existing folders. Keep the actual directory generic
  // rather than allowing native fallback to the current user's Documents path.
  try {
    await mkdir(demonstrationDirectory);
    createdDemonstrationDirectory = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await writeFile(
    path.join(data, 'preferences.json'),
    JSON.stringify({
      schemaVersion: 4,
      experienceMode: 'simple',
      parentPath: demonstrationDirectory,
      destination: 'local',
      appearance: 'light',
    }),
  );
  child = spawn(executable, [], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      REPO_CREATOR_DATA_DIR: data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(temporary, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9225',
    },
  });
  let launchError, endpoint;
  child.once('error', (error) => (launchError = error));
  await expect
    .poll(
      async () => {
        if (launchError) throw launchError;
        endpoint = await fetch(endpointUrl, { signal: AbortSignal.timeout(1000) })
          .then((response) => response.json())
          .catch(() => null);
        return !!endpoint?.webSocketDebuggerUrl;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);
  let page;
  await expect
    .poll(() => {
      page = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => candidate.url().includes('tauri.localhost'));
      return !!page;
    })
    .toBe(true);
  await page.getByLabel('Project name', { exact: true }).waitFor();
  await expect(page.locator('.version')).toHaveText('1.4.0');
  await page.getByLabel('Project name', { exact: true }).fill('weekend-notes');
  await page.getByLabel('Starting point', { exact: true }).selectOption('experiment');
  await page
    .getByLabel('What are you making?', { exact: false })
    .fill('Notes and reading experiments.');
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  await page.getByRole('heading', { name: 'Overview', exact: true }).click();
  const capture = async (name) => {
    const text = await page.locator('body').innerText();
    assert(!text.toLowerCase().includes(os.userInfo().username.toLowerCase()));
    assert(!/[/\\]Users[/\\]|[/\\]home[/\\]|@|https:\/\/github\.com\//i.test(text));
    assert(text.includes('C:\\Projects'));
    await expect(page.locator('.action-bar .primary')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
  };
  await capture('simple-mode.png');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('reading-list');
  await page.getByLabel('Project preset', { exact: true }).selectOption('website');
  await page.getByLabel('Description', { exact: false }).fill('Explore a shared reading list.');
  await page.getByLabel('AI coding assistant', { exact: true }).selectOption('claude');
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  await page.getByRole('heading', { name: 'Overview', exact: true }).click();
  await capture('advanced-mode.png');
  console.log('Captured the production Simple and Advanced UI with generic local-only data.');
} finally {
  await browser?.close().catch(() => {});
  if (child?.pid && child.exitCode === null) {
    const stopped = once(child, 'exit');
    child.kill();
    await stopped;
  }
  const resolved = path.resolve(temporary);
  assert.equal(path.dirname(resolved), temporaryRoot);
  assert(path.basename(resolved).startsWith('repo-creator-public-'));
  await rm(resolved, { recursive: true, force: true, maxRetries: 25, retryDelay: 200 });
  // Remove only the empty directory created by this process. Never remove contents.
  if (createdDemonstrationDirectory)
    await rmdir(demonstrationDirectory).catch((error) => {
      if (!['ENOTEMPTY', 'ENOENT'].includes(error.code)) throw error;
    });
}
