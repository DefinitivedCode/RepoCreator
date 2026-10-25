// Opt-in Windows/WebView2 benchmark. Uses only owned, fictional local fixtures.
// Build the selected revision first; run the same script against both executables.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

assert.equal(process.platform, 'win32');
const root = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'repo-creator-performance-'));
const data = path.join(temporary, 'data');
const executable =
  process.env.REPO_CREATOR_SMOKE_EXE ||
  path.join(root, 'src-tauri/target/x86_64-pc-windows-msvc/release/repo-creator.exe');
const output = process.env.REPO_CREATOR_PERF_OUTPUT || 'artifacts/performance/native.json';
const runs = Number(process.env.REPO_CREATOR_PERF_RUNS || 5);
assert.ok(Number.isInteger(runs) && runs >= 3 && runs <= 20);
const endpointUrl = 'http://127.0.0.1:9227/json/version';
const samples = {};
let application, browser, page;
const errors = [];
const invoke = (command, args = {}) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
    command,
    args,
  });
const nav = (name) =>
  page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name, exact: true });
const section = (name) =>
  page
    .getByRole('group', { name: 'Project workspace sections' })
    .getByRole('button', { name: name === 'Readiness' ? /^Readiness/ : name, exact: true });
async function measure(name, action) {
  const start = performance.now();
  await action();
  (samples[name] ??= []).push(performance.now() - start);
}
async function close() {
  if (!application) return;
  const exited = once(application, 'exit');
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$owned = Get-Process -Id ${application.pid}; if ($owned.ProcessName -ne 'repo-creator') { throw 'Unexpected process' }; [void]$owned.CloseMainWindow()`,
    ],
    { windowsHide: true },
  );
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Application close timed out')), 15000),
    ),
  ]);
  await browser?.close();
  application = browser = page = undefined;
}
async function launch(index) {
  const start = performance.now();
  application = spawn(executable, [], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      REPO_CREATOR_DATA_DIR: data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(temporary, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9227',
      GIT_CONFIG_GLOBAL: path.join(temporary, 'gitconfig'),
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  let launchError;
  application.on('error', (error) => {
    launchError = error;
  });
  let endpoint;
  while (performance.now() - start < 30000) {
    if (launchError) throw launchError;
    endpoint = await fetch(endpointUrl, { signal: AbortSignal.timeout(500) })
      .then((r) => r.json())
      .catch(() => null);
    if (endpoint?.webSocketDebuggerUrl) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(endpoint?.webSocketDebuggerUrl, 'WebView2 debug endpoint unavailable');
  browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);
  await expect
    .poll(() => {
      page = browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().includes('tauri.localhost'));
      return !!page;
    })
    .toBe(true);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByLabel('Project name', { exact: true }).waitFor();
  (samples[index === 0 ? 'fresh-profile launch to input' : 'warm launch to input'] ??= []).push(
    performance.now() - start,
  );
  await expect(page.locator('.creation-git-status')).toContainText('Git ready');
  (samples[index === 0 ? 'fresh-profile launch to Git ready' : 'warm launch to Git ready'] ??=
    []).push(performance.now() - start);
  const timing = await page.evaluate(() => ({
    domContentLoaded: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
  }));
  (samples['frontend DOMContentLoaded'] ??= []).push(timing.domContentLoaded);
}

try {
  assert.equal(
    await fetch(endpointUrl, { signal: AbortSignal.timeout(500) })
      .then(() => true)
      .catch(() => false),
    false,
    'Benchmark port is already in use',
  );
  await mkdir(data);
  await writeFile(
    path.join(data, 'preferences.json'),
    JSON.stringify({
      schemaVersion: 5,
      experienceMode: 'advanced',
      parentPath: temporary,
      destination: 'local',
      appearance: 'dark',
      updates: { channel: 'stable', automatic: false },
    }),
  );
  await writeFile(
    path.join(temporary, 'gitconfig'),
    '[user]\nname = Example Developer\nemail = developer@example.invalid\n',
  );
  const fixtures = [];
  for (const [name, count] of [
    ['small', 12],
    ['moderate', 1500],
  ]) {
    const directory = path.join(temporary, name);
    await mkdir(path.join(directory, 'src'), { recursive: true });
    execFileSync('git', ['init', '-b', 'main', directory], { stdio: 'ignore', windowsHide: true });
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name,
        dependencies: { react: '19' },
        devDependencies: { typescript: '7', vite: '8' },
        scripts: { test: 'node -e "process.exit(0)"' },
      }),
    );
    await writeFile(path.join(directory, 'tsconfig.json'), '{}');
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        writeFile(path.join(directory, 'src', `file-${i}.tsx`), `export const value${i} = ${i};\n`),
      ),
    );
    execFileSync('git', ['-C', directory, 'add', '.'], { stdio: 'ignore', windowsHide: true });
    execFileSync(
      'git',
      [
        '-C',
        directory,
        '-c',
        'user.name=Example Developer',
        '-c',
        'user.email=developer@example.invalid',
        'commit',
        '-qm',
        'Fixture',
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    fixtures.push(directory);
  }
  await launch(0);
  const projects = [];
  for (const directory of fixtures)
    projects.push(await invoke('add_existing_project', { path: directory }));
  const library = Array.from({ length: 100 }, (_, index) => ({
    ...projects[index % 2],
    id: `fixture-${index}`,
    context: {
      ...projects[index % 2].context,
      projectName: `Example ${String(index).padStart(3, '0')}`,
    },
  }));
  await writeFile(
    path.join(data, 'history.json'),
    JSON.stringify({ schemaVersion: 2, projects: library }),
  );
  for (let i = 0; i < runs; i++) {
    await measure('environment local IPC', () =>
      invoke('check_environment', { includeGithub: false }),
    );
    await measure('library 100 IPC', () => invoke('list_recent_projects'));
    for (const [index, name] of ['small', 'moderate'].entries()) {
      const id = `fixture-${index}`;
      await measure(`workspace ${name} IPC`, () => invoke('get_project_workspace', { id }));
      await measure(`detection ${name} IPC`, () => invoke('detect_project_technologies', { id }));
    }
    await measure('library 100 UI', async () => {
      await nav('Projects').click();
      await expect(page.locator('.project-card')).toHaveCount(100);
    });
    await measure('open workspace UI', async () => {
      await page.getByRole('button', { name: 'Example 001', exact: true }).click();
      await page.getByRole('heading', { name: 'Example 001', exact: true }).waitFor();
    });
    for (const [name, selector] of [
      ['Commands', '.command-workspace'],
      ['Readiness', '.readiness-panel'],
      ['Project Settings', '.project-settings'],
    ]) {
      await measure(`${name} UI`, async () => {
        await section(name).click();
        // Two frames include the React commit and the following paint opportunity.
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        assert.equal(await section(name).getAttribute('aria-pressed'), 'true', selector);
      });
    }
    await page.getByRole('button', { name: 'All projects', exact: true }).click();
    await expect(page.locator('.project-card')).toHaveCount(100);
    await measure('major navigation cycle UI', async () => {
      for (const name of ['Presets', 'Settings', 'New Project']) await nav(name).click();
      await page.getByLabel('Project name', { exact: true }).waitFor();
    });
    await measure('preview edit UI', async () => {
      await page.getByLabel('Project name', { exact: true }).fill(`fixture-preview-${i}`);
      await expect(page.locator('.footer-summary')).not.toContainText('Updating');
    });
    await measure('input during detection UI', async () => {
      const scan = invoke('detect_project_technologies', { id: 'fixture-1' });
      await page.getByLabel('Project name', { exact: true }).fill(`responsive-${i}`);
      await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(`responsive-${i}`);
      await scan;
    });
  }
  await close();
  for (let i = 1; i <= runs; i++) {
    await launch(i);
    await close();
  }
  assert.deepEqual(errors, []);
  const measurements = Object.fromEntries(
    Object.entries(samples).map(([name, values]) => {
      const ordered = [...values].sort((a, b) => a - b);
      const middle = Math.floor(ordered.length / 2);
      const median =
        ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
      return [
        name,
        {
          medianMs: Math.round(median * 10) / 10,
          samplesMs: values.map((v) => Math.round(v * 10) / 10),
        },
      ];
    }),
  );
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      { platform: process.platform, node: process.version, runs, measurements },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(measurements, null, 2));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await close();
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await rm(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
