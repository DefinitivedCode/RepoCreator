// Opt-in real WebView2 verification and before/after captures; isolated fictional data only.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

assert.equal(process.platform, 'win32');
const root = path.resolve(import.meta.dirname, '..');
const applicationVersion = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
).version;
const before = process.argv.includes('--before');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'repo-creator-detection-'));
const projectPath = path.join(temporary, 'field-notes');
const data = path.join(temporary, 'app-data');
const output = path.join(root, 'artifacts', 'technology-detection', 'native');
const executable =
  process.env.REPO_CREATOR_SMOKE_EXE ||
  path.join(root, 'src-tauri/target/x86_64-pc-windows-msvc/debug/repo-creator.exe');
const endpointUrl = 'http://127.0.0.1:9226/json/version';
let application, browser, page;
const errors = [];
const invoke = (command, args = {}) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
    command,
    args,
  });
const navigation = () => page.getByRole('navigation', { name: 'Main navigation' });
const section = (name) =>
  page
    .getByRole('group', { name: 'Project workspace sections' })
    .getByRole('button', { name, exact: true })
    .click();
async function capture(name) {
  const dialog = page.getByRole('dialog', { name: 'Detected technologies', exact: true });
  if (await dialog.isVisible()) {
    await dialog.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
    return;
  }
  // Mask machine-specific fixture paths; all displayed project content is fictional.
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    animations: 'disabled',
    mask: [page.locator('.path'), page.locator('.project-location-setting code')],
    maskColor: '#657873',
  });
}
try {
  assert.equal(
    await fetch(endpointUrl, { signal: AbortSignal.timeout(1000) })
      .then(() => true)
      .catch(() => false),
    false,
    'Test debug port is already in use',
  );
  await mkdir(projectPath);
  await mkdir(data);
  await mkdir(output, { recursive: true });
  execFileSync('git', ['init', projectPath], { windowsHide: true, stdio: 'ignore' });
  const packageText = JSON.stringify({
    name: 'field-notes',
    dependencies: { react: '19' },
    devDependencies: { typescript: '7', vite: '8' },
    scripts: { postinstall: 'node marker.js', start: 'node marker.js' },
  });
  await writeFile(path.join(projectPath, 'package.json'), packageText);
  await writeFile(
    path.join(projectPath, 'marker.js'),
    "require('fs').writeFileSync('unwanted-marker','ran')",
  );
  await writeFile(path.join(projectPath, 'tsconfig.json'), '{}');
  await mkdir(path.join(projectPath, 'src-tauri'));
  await writeFile(
    path.join(projectPath, 'src-tauri', 'Cargo.toml'),
    "[package]\nname='field-notes'\nversion='0.1.0'\n[dependencies]\ntauri='2'",
  );
  await writeFile(path.join(projectPath, 'src-tauri', 'tauri.conf.json'), '{}');
  const external = path.join(temporary, 'external');
  await mkdir(external);
  await writeFile(path.join(external, 'external.py'), '');
  // A real Windows junction must never add external Python evidence.
  await symlink(external, path.join(projectPath, 'linked-project'), 'junction');
  await writeFile(
    path.join(data, 'preferences.json'),
    JSON.stringify({
      schemaVersion: 5,
      experienceMode: 'simple',
      parentPath: temporary,
      destination: 'local',
      appearance: 'light',
      accent: 'teal',
      customAccent: '#4FA69B',
      updates: { channel: 'stable', automatic: false },
    }),
  );
  const gitConfig = path.join(temporary, 'gitconfig');
  await writeFile(
    gitConfig,
    '[user]\nname = Example Developer\nemail = developer@example.invalid\n',
  );
  application = spawn(executable, [], {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      REPO_CREATOR_DATA_DIR: data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(temporary, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9226',
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  let launchError, endpoint;
  application.once('error', (error) => {
    launchError = error;
  });
  await expect
    .poll(
      async () => {
        if (launchError) throw launchError;
        endpoint = await fetch(endpointUrl, { signal: AbortSignal.timeout(1000) })
          .then((r) => r.json())
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
  // The historical before capture predates detection; current captures must use
  // the manifest's actual native version rather than a stale hardcoded label.
  const expectedVersion = before ? '1.5.1' : applicationVersion;
  assert.equal((await invoke('get_update_info')).currentVersion, expectedVersion);
  await expect(page.locator('.app-header .version')).toHaveText(expectedVersion);
  assert.equal((await invoke('get_preferences')).accent, 'teal');
  const project = await invoke('add_existing_project', { path: projectPath });
  assert.deepEqual(project.technologies.ids, []);
  await navigation().getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
  await section('Project Settings');
  if (before)
    await expect(
      page.getByRole('button', { name: 'Detect technologies', exact: true }),
    ).toHaveCount(0);
  await capture(before ? 'before-light' : 'after-settings-light');
  if (!before) {
    await assert.rejects(invoke('detect_project_technologies', { id: 'unregistered-project' }));
    const historyBefore = await readFile(path.join(data, 'history.json'), 'utf8');
    const report = await invoke('detect_project_technologies', { id: project.id });
    assert.deepEqual(report.notices, []);
    assert.deepEqual(
      new Set(report.suggestions.map((item) => item.id)),
      new Set(['typescript', 'javascript', 'react', 'vite', 'node', 'rust', 'tauri']),
    );
    assert.equal(await readFile(path.join(data, 'history.json'), 'utf8'), historyBefore);
    assert.equal(await readFile(path.join(projectPath, 'package.json'), 'utf8'), packageText);
    await assert.rejects(readFile(path.join(projectPath, 'unwanted-marker')));
    await page.getByRole('button', { name: 'Detect technologies', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Detected technologies', exact: true });
    await expect(dialog.getByRole('checkbox', { name: 'React', exact: true })).toBeChecked();
    await capture('after-review-light');
    await dialog.getByRole('button', { name: 'Deselect all', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'React', exact: true }).check();
    await dialog.getByRole('checkbox', { name: 'Rust', exact: true }).check();
    await dialog.getByRole('button', { name: 'Add selected (2)', exact: true }).click();
    assert.deepEqual((await invoke('list_recent_projects'))[0].technologies.ids, []);
    await capture('after-pending-light');
    await page.getByRole('button', { name: 'Save project settings', exact: true }).click();
    await expect(page.getByText('Project preferences saved.', { exact: true })).toBeVisible();
    assert.deepEqual(
      new Set((await invoke('list_recent_projects'))[0].technologies.ids),
      new Set(['rust', 'react']),
    );
    await navigation().getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await page.getByRole('radio', { name: 'Dark', exact: true }).check();
    await navigation().getByRole('button', { name: 'Projects', exact: true }).click();
    await section('Project Settings');
    await page.getByRole('button', { name: 'Detect technologies', exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: /React/ })).toBeDisabled();
    await capture('after-review-dark');
  }
  assert.deepEqual(errors, []);
  console.log(
    before
      ? 'Captured real application baseline.'
      : 'Real native detection, junction isolation, read-only history, pending versus saved settings and both themes passed.',
  );
} finally {
  await browser?.close().catch(() => {});
  if (application && application.exitCode === null) {
    application.kill();
    await new Promise((resolve) => application.once('exit', resolve));
  }
  // The test owns this unique directory and never removes the demonstration workspace.
  assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
