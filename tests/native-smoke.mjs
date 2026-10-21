// Opt-in Windows test of the production executable. No remote repositories are created.
// The existing settings file is backed up byte-for-byte and restored after the run.
import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, unlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { verifyExpandedScrolling, scrollSizes } from './scrolling.mjs';

const root = path.resolve(import.meta.dirname, '..');
const temporaryRoot = path.resolve(os.tmpdir());
const temporary = await mkdtemp(path.join(temporaryRoot, 'repo-creator-v1.1-'));
const parent = path.join(temporary, 'projects');
const config = path.join(
  process.env.APPDATA,
  'com.definitivedcode.repocreator',
  'preferences.json',
);
const backup = await readFile(config).catch((error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
let child;
let browser;

try {
  await mkdir(parent, { recursive: true });
  await mkdir(path.dirname(config), { recursive: true });
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  // Start from the v1 settings shape to verify migration in the real app.
  await writeFile(config, JSON.stringify({ parentPath: parent, destination: 'local' }));
  child = spawn(path.join(root, 'src-tauri', 'target', 'release', 'repo-creator.exe'), [], {
    cwd: root,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9223',
      WEBVIEW2_USER_DATA_FOLDER: path.join(temporary, 'webview'),
    },
  });
  let endpoint;
  for (let attempt = 0; attempt < 100; attempt++) {
    endpoint = await fetch('http://127.0.0.1:9223/json/version')
      .then((response) => response.json())
      .catch(() => null);
    if (endpoint?.webSocketDebuggerUrl) break;
    if (child.exitCode !== null) throw new Error(`Application exited with ${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(endpoint?.webSocketDebuggerUrl, 'The production WebView2 should start');
  browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);
  let page;
  for (let attempt = 0; attempt < 50; attempt++) {
    page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().includes('tauri.localhost'));
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(page, 'The production application should load');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByText('Git ready', { exact: true }).waitFor({ timeout: 30_000 });
  const invoke = (command, args) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
      command,
      args,
    });
  let preferences = await invoke('get_preferences');
  assert.equal(preferences.schemaVersion, 2);
  assert.equal(preferences.parentPath.replace(/^\\\\\?\\/, ''), parent);

  assert.deepEqual(preferences.defaults.options.ignorePresets, ['os', 'secrets']);
  await page.getByLabel('Project name').fill('scroll-check');
  await page.getByLabel('Project preset').selectOption('tauri');
  await page.getByLabel('README', { exact: true }).selectOption('custom');
  await page.locator('.advanced-panel > summary').click();
  for (const name of ['Features', 'Installation', 'Contributing']) {
    await page.getByRole('checkbox', { name, exact: true }).check();
  }
  await page.getByLabel('License type').selectOption('Apache-2.0');
  const resize = async ({ width, height }) => {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-File',
        path.join(root, 'tests', 'resize-window.ps1'),
        '-ProcessId',
        String(child.pid),
        '-Width',
        String(width),
        '-Height',
        String(height),
      ],
      { windowsHide: true },
    );
  };
  await verifyExpandedScrolling(page, resize);
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-v1.1-scroll-bottom.png') });
  for (const selector of ['.ignore-panel', '.advanced-panel', '.file-preview']) {
    await page.locator(`${selector} > summary`).click();
  }
  await resize(scrollSizes[0]);

  await page.getByLabel('Project name').fill('native-smoke');
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Verified through the production Windows application.');
  await page.getByLabel('Appearance').selectOption('dark');
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-v1.1-dark.png') });
  await page.getByLabel('Appearance').selectOption('light');
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-v1.1-light.png') });

  await page.getByLabel('Project preset').selectOption('tauri');
  await page.getByLabel('README', { exact: true }).selectOption('custom');
  await page.locator('.advanced-panel > summary').click();
  await page.getByLabel('Overview content').fill('A deliberately configured test project.');
  await page.getByLabel('Usage content').fill('Use the project according to its documentation.');
  await page.getByLabel('License type').selectOption('MIT');
  await page.getByLabel('Copyright holder').fill('Native Smoke Author');
  await page.getByLabel('Year', { exact: true }).fill('2026');
  await page.getByLabel('Initial branch').fill('work/start');
  await page.getByLabel('Initial commit message').fill('Start configured repository');
  await page.getByLabel('Initial branch').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-v1.1-advanced.png') });
  await page.locator('.advanced-panel > summary').click();
  await page.locator('.ignore-panel > summary').click();
  for (const rule of ['scratch/*', '!scratch/keep.txt']) {
    await page.getByLabel('Custom patterns').fill(rule);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await expect(page.getByLabel('.gitignore live preview')).toContainText('!scratch/keep.txt');
  await page.getByLabel('.gitignore live preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-v1.1-gitignore.png') });

  await page.getByRole('button', { name: 'Manage…' }).click();
  await page.getByLabel('Save current configuration as').fill('Smoke test preset');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  preferences = await invoke('get_preferences');
  const preset = preferences.customPresets.find((p) => p.name === 'Smoke test preset');
  assert.ok(preset);
  assert.equal(preset.configuration.options.initialBranch, 'work/start');
  const request = {
    name: 'native-smoke',
    description: 'Verified through the production Windows application.',
    destination: 'local',
    visibility: 'private',
    ...preset.configuration,
    githubOwner: '',
    topics: [],
    homepage: '',
  };
  const preview = await invoke('preview_files', { request });
  assert.equal(
    await page.getByLabel('.gitignore live preview').textContent(),
    preview.find((f) => f.path === '.gitignore').content,
  );

  // Exercise native rename/delete persistence and the dialog's Escape handling.
  await page.getByRole('button', { name: 'Manage…' }).click();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Rename preset').fill('Renamed smoke preset');
  await page.getByRole('button', { name: 'Rename', exact: true }).first().click();
  await expect(
    page.getByRole('dialog').getByText('Renamed smoke preset', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  assert.equal((await invoke('get_preferences')).customPresets[0].name, 'Renamed smoke preset');

  await page.getByRole('button', { name: 'Create Repository' }).click();
  await page.getByRole('heading', { name: 'Repository created' }).waitFor();
  const project = path.join(parent, 'native-smoke');
  const git = (values, cwd = project) =>
    execFileSync('git', ['-C', cwd, ...values], { encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(git(['branch', '--show-current']), 'work/start');
  assert.equal(git(['log', '-1', '--format=%s']), 'Start configured repository');
  assert.equal(git(['status', '--porcelain']), '');
  assert.equal(git(['remote']), '');
  const commit = git(['rev-parse', 'HEAD']);
  for (const file of preview)
    assert.equal(
      await readFile(path.join(project, file.path), 'utf8'),
      file.content,
      `${file.path} must match its preview`,
    );
  assert.ok(preview.some((f) => f.path === '.editorconfig'));
  assert.ok(preview.some((f) => f.path === '.gitattributes'));
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-v1.1-success.png') });

  await page.getByRole('button', { name: 'Create Another' }).click();
  assert.equal(await page.getByLabel('Project name').inputValue(), '');
  await page.getByLabel('Project name').fill('native-smoke');
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await page.getByText('A project with this name already exists here.').waitFor();
  assert.equal(git(['rev-parse', 'HEAD']), commit);
  await page.getByRole('button', { name: 'Manage…' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete preset', exact: true }).click();
  await expect(page.getByText('No custom presets saved.')).toBeVisible();
  await page.keyboard.press('Escape');
  assert.equal((await invoke('get_preferences')).customPresets.length, 0);

  await page.getByLabel('Project preset').selectOption('blank');
  await page.getByLabel('Project name').fill('native-empty');
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await page.getByRole('heading', { name: 'Repository created' }).waitFor();
  const emptyProject = path.join(parent, 'native-empty');
  assert.equal(git(['ls-tree', '--name-only', 'HEAD'], emptyProject), '');
  assert.equal(git(['rev-list', '--count', 'HEAD'], emptyProject), '1');
  assert.equal(git(['branch', '--show-current'], emptyProject), 'main');
  const persisted = JSON.parse(await readFile(config, 'utf8'));
  assert.equal(persisted.schemaVersion, 2);
  assert.equal(persisted.defaults.readme, 'none');
  assert.equal(persisted.appearance, 'light');
  assert.ok(
    !JSON.stringify(persisted).includes('Verified through the production Windows application.'),
  );
  assert.deepEqual(errors, []);
  const report = {
    version: '1.1.0',
    checks: [
      'Production WebView and native IPC',
      'Legacy settings migration',
      'Safe fresh ignore defaults',
      'Expanded scrolling at default, minimum, wide and tall native window sizes',
      'Wheel, fractional touchpad deltas, keyboard, scrollbar drag and preview scroll chaining',
      'Native light/dark appearance',
      'Custom preset save/rename/delete',
      'Custom README, MIT license and optional files',
      'Exact preview/output match',
      'Custom branch and commit message',
      'Existing-directory protection',
      'Create Another',
      'Blank preset and empty initial commit',
      'Versioned settings persistence',
      'No JavaScript errors',
    ],
    commit,
  };
  await writeFile(
    path.join(root, 'artifacts', 'native-smoke.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close().catch(() => {});
  child?.kill();
  if (backup !== null) await writeFile(config, backup);
  else
    await unlink(config).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  const resolved = path.resolve(temporary);
  if (
    !resolved.startsWith(temporaryRoot + path.sep) ||
    !path.basename(resolved).startsWith('repo-creator-v1.1-')
  )
    throw new Error('Refusing unexpected cleanup path');
  await rm(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
}
