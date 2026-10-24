// Capture the real Windows WebView2 app with isolated, fictional local data.
// Build the intended source first; no UI mocks, model calls or remote repositories.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

assert.equal(process.platform, 'win32', 'Screenshot capture requires Windows WebView2');
const root = path.resolve(import.meta.dirname, '..');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const temporaryRoot = path.resolve(os.tmpdir());
const temporary = await mkdtemp(path.join(temporaryRoot, 'repo-creator-public-'));
const data = path.join(temporary, 'app-data');
const output = process.env.REPO_CREATOR_SCREENSHOT_OUTPUT || path.join(root, 'docs', 'assets');
const executable =
  process.env.REPO_CREATOR_SMOKE_EXE ||
  path.join(root, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'repo-creator.exe');
const endpointUrl = 'http://127.0.0.1:9225/json/version';
const demonstrationDirectory = 'C:\\Projects';
const project = path.join(demonstrationDirectory, 'field-notes');
const previewPort = 5187;
let child,
  browser,
  page,
  previewRun,
  createdParent = false,
  createdProject = false;
const errors = [];
const invoke = (command, args = {}) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
    command,
    args,
  });
const mainNavigation = () => page.getByRole('navigation', { name: 'Main navigation' });
async function theme(appearance) {
  await mainNavigation().getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await page
    .getByRole('radio', { name: appearance === 'dark' ? 'Dark' : 'Light', exact: true })
    .check();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', appearance);
}
async function capture(name) {
  const text = await page.locator('body').innerText();
  // npm's own package/version header contains @; it is fixed fictional data.
  const privacyText = text.replaceAll('field-notes@0.1.0', 'field-notes package');
  assert(!text.toLowerCase().includes(os.userInfo().username.toLowerCase()));
  assert(
    !/[/\\]Users[/\\]|[/\\]home[/\\]|@|https:\/\/github\.com\//i.test(privacyText),
    'Private data in screenshot',
  );
  assert(
    name.startsWith('configuration-') ||
      name.startsWith('settings-') ||
      name.startsWith('readiness-') ||
      text.includes('C:\\Projects'),
    'Visible demonstration paths must be generic',
  );
  assert.equal(
    await page.locator('.brand-mark').count(),
    1,
    'Build Keystone integration before capture',
  );
  assert.deepEqual(await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), {
    width: 1100,
    height: 740,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  console.log(`Captured ${name}`);
}
try {
  assert.equal(
    await fetch(endpointUrl, { signal: AbortSignal.timeout(1000) })
      .then(() => true)
      .catch(() => false),
    false,
    'Capture port must be unused',
  );
  await mkdir(data, { recursive: true });
  await mkdir(output, { recursive: true });
  try {
    await mkdir(demonstrationDirectory);
    createdParent = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await writeFile(
    path.join(data, 'preferences.json'),
    JSON.stringify({
      schemaVersion: 5,
      experienceMode: 'simple',
      parentPath: demonstrationDirectory,
      destination: 'local',
      appearance: 'light',
      accent: 'teal',
      customAccent: '#4FA69B',
      updates: { channel: 'stable', automatic: false },
    }),
  );
  const gitConfig = path.join(temporary, '.gitconfig');
  await writeFile(
    gitConfig,
    '[user]\nname = Example Developer\nemail = developer@example.invalid\n',
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
      HOME: temporary,
      FORCE_COLOR: '1',
      NO_COLOR: undefined,
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
      { timeout: 30000 },
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);
  await expect
    .poll(() => {
      page = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => candidate.url().includes('tauri.localhost'));
      return !!page;
    })
    .toBe(true);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByLabel('Project name', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(
    (await invoke('get_update_info')).currentVersion,
    version,
    'Build the current application version before capturing screenshots',
  );
  await expect(page.locator('.app-header .version')).toHaveText(version);
  assert.equal(
    (await invoke('check_environment', { includeGithub: false })).identityName,
    'Example Developer',
  );
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-File',
      path.join(root, 'tests', 'resize-window.ps1'),
      '-ProcessId',
      String(child.pid),
      '-Width',
      '1100',
      '-Height',
      '740',
    ],
    { windowsHide: true },
  );
  await page.getByLabel('Project name', { exact: true }).fill('field-notes');
  await page.getByLabel('Starting point', { exact: true }).selectOption('website');
  await page
    .getByLabel('What are you making?', { exact: false })
    .fill('Collect notes and small discoveries.');
  await page.getByLabel('AI coding assistant', { exact: true }).selectOption('codex');
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  for (const appearance of ['light', 'dark']) {
    await theme(appearance);
    await page.getByRole('radio', { name: 'Muted Teal', exact: true }).check();
    assert.equal((await invoke('get_preferences')).accent, 'teal');
    await page.getByRole('tab', { name: 'Git & identity', exact: true }).click();
    await capture(`settings-${appearance}`);
    await mainNavigation().getByRole('button', { name: 'New Project', exact: true }).click();
    await page.getByRole('heading', { name: 'Overview', exact: true }).click();
    await capture(`overview-${appearance}`);
  }
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Project setup' })
    .getByRole('button', { name: 'Project Files', exact: true })
    .click();
  for (const appearance of ['light', 'dark']) {
    await theme(appearance);
    await mainNavigation().getByRole('button', { name: 'New Project', exact: true }).click();
    await capture(`configuration-${appearance}`);
  }
  // This owned local Git fixture has no remotes or private configuration.
  // Only its explicit Vite preview runs below; nothing is installed.
  await mkdir(project);
  createdProject = true;
  const manifest = {
    name: 'field-notes',
    private: true,
    version: '0.1.0',
    type: 'module',
    description: 'A quiet place for notes, bookmarks and small discoveries.',
    engines: { node: '>=22' },
    scripts: {
      dev: `vite --host 127.0.0.1 --port ${previewPort} --strictPort`,
      build: 'tsc -b && vite build',
      test: 'vitest run',
    },
    dependencies: { react: '^19.0.0' },
    devDependencies: { typescript: '^5.0.0', vite: '^6.0.0', vitest: '^3.0.0' },
  };
  await writeFile(path.join(project, 'package.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(project, '.gitignore'), 'node_modules/\ndist/\n.vite-cache/\n.env\n');
  await writeFile(
    path.join(project, 'vite.config.mjs'),
    "export default { cacheDir: '.vite-cache', optimizeDeps: { noDiscovery: true } };\n",
  );
  await writeFile(path.join(project, '.env.example'), 'VITE_NOTES_TITLE=Field Notes\n');
  await writeFile(
    path.join(project, 'index.html'),
    '<!doctype html><title>Field Notes</title><h1>Field Notes</h1>',
  );
  await writeFile(
    path.join(project, 'README.md'),
    '# Field Notes\n\nA local collection of ideas and discoveries.\n',
  );
  const git = (args) =>
    execFileSync('git', ['-C', project, ...args], { windowsHide: true, stdio: 'ignore' });
  git(['init', '-b', 'main']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Example Developer',
    '-c',
    'user.email=developer@example.invalid',
    'commit',
    '-m',
    'Start Field Notes',
  ]);
  const added = await invoke('add_existing_project', { path: project });
  await invoke('save_project_settings', {
    id: added.id,
    pinned: true,
    technologies: { ids: ['typescript', 'react', 'vite'], custom: [] },
    launcher: { terminal: 'auto', executables: {} },
  });
  const commands = [
    ['dev', 'Development server', 'development'],
    ['build', 'Build application', 'build'],
  ].map(([id, name, category]) => ({
    id,
    name,
    category,
    mode: 'executable',
    executable: 'npm',
    args: ['run', id],
    shellCommand: '',
    workingDirectory: '.',
    environment: {},
    description: '',
    enabled: true,
    imported: false,
  }));
  await invoke('save_project_commands', { id: added.id, commands });
  await mainNavigation().getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
  const workspace = page.getByRole('main', { name: 'Project workspace' });
  // Capture read-only findings before linking tooling or starting any project command.
  for (const appearance of ['light', 'dark']) {
    await theme(appearance);
    await mainNavigation().getByRole('button', { name: 'Projects', exact: true }).click();
    await workspace.getByRole('button', { name: /^Readiness/ }).click();
    await expect(
      workspace.getByRole('button', { name: 'Run full check', exact: true }),
    ).toBeEnabled();
    await expect(
      workspace.getByRole('heading', { name: 'Project readiness', exact: true }),
    ).toBeVisible();
    await workspace
      .getByRole('heading', { name: 'Configuration files', exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await capture(`readiness-${appearance}`);
  }
  // Use installed build tooling in this owned demo; never install packages.
  await symlink(path.join(root, 'node_modules'), path.join(project, 'node_modules'), 'junction');
  previewRun = await invoke('run_project_command', {
    projectId: added.id,
    commandId: 'dev',
    confirmed: false,
  });
  for (const appearance of ['light', 'dark']) {
    await theme(appearance);
    await mainNavigation().getByRole('button', { name: 'Projects', exact: true }).click();
    await workspace.getByRole('button', { name: 'Commands', exact: true }).click();
    await expect(
      workspace.getByRole('heading', { name: 'Development server', exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        (await invoke('list_command_runs', { projectId: added.id }))[0].output.replace(
          /\x1b\[[\d;]*m/g,
          '',
        ),
      )
      .toContain(`http://127.0.0.1:${previewPort}/`);
    await page.getByRole('main', { name: 'Project workspace' }).evaluate((el) => {
      el.scrollTop = 0;
    });
    await capture(`workspace-${appearance}`);
    await page.getByRole('main', { name: 'Project workspace' }).evaluate((el) => {
      el.scrollTop = 120;
    });
    await capture(`commands-${appearance}`);
  }
  assert.deepEqual(errors, []);
  console.log(
    `Repo Creator ${version} captures completed. Readiness ran before project commands; the Vite preview was explicit. No installs, model calls or remote operations.`,
  );
} finally {
  if (previewRun) await invoke('stop_project_command', { runId: previewRun.id }).catch(() => {});
  await browser?.close().catch(() => {});
  if (child?.pid && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  const resolved = path.resolve(temporary);
  assert.equal(path.dirname(resolved), temporaryRoot);
  assert(path.basename(resolved).startsWith('repo-creator-public-'));
  await rm(resolved, { recursive: true, force: true, maxRetries: 25, retryDelay: 200 });
  if (createdProject) {
    assert.equal(path.resolve(project), 'C:\\Projects\\field-notes');
    await rm(project, { recursive: true, force: true, maxRetries: 25, retryDelay: 200 });
  }
  if (createdParent)
    await rmdir(demonstrationDirectory).catch((error) => {
      if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
    });
}
