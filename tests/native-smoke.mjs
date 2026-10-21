// Opt-in Windows smoke test. Runs the production executable; never contacts a remote repository.
// The app's harmless location preference is backed up and restored after the test.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const parent = path.join(root, 'artifacts', `native-smoke-${Date.now()}`);
const config = path.join(process.env.APPDATA, 'com.definitivedcode.repocreator', 'preferences.json');
const backup = await readFile(config).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
let child;
let browser;

try {
  await mkdir(parent, { recursive: true });
  await mkdir(path.dirname(config), { recursive: true });
  await writeFile(config, JSON.stringify({ parentPath: parent, destination: 'local' }));
  child = spawn(path.join(root, 'src-tauri', 'target', 'release', 'repo-creator.exe'), [], {
    cwd: root, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9223', WEBVIEW2_USER_DATA_FOLDER: path.join(parent, 'webview') },
  });
  let endpoint;
  for (let attempt = 0; attempt < 100; attempt++) {
    endpoint = await fetch('http://127.0.0.1:9223/json/version').then(response => response.json()).catch(() => null);
    if (endpoint?.webSocketDebuggerUrl) break;
    if (child.exitCode !== null) throw new Error(`Application exited with ${child.exitCode}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(endpoint?.webSocketDebuggerUrl, 'WebView2 debugging endpoint should be available');
  browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);
  let page;
  for (let attempt = 0; attempt < 50; attempt++) {
    page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().includes('tauri.localhost'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(page, 'The production Tauri page should load');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByText('Git is ready', { exact: true }).waitFor({ timeout: 30_000 });
  const preferences = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_preferences'));
  assert.equal(preferences.parentPath.replace(/^\\\\\?\\/, ''), parent);
  await page.getByLabel('Project name').fill('native-smoke');
  await page.getByLabel('Description optional').fill('Verified through the production Windows application.');
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await page.getByRole('heading', { name: 'Repository created' }).waitFor();
  const project = path.join(parent, 'native-smoke');
  const git = (values, cwd = project) => execFileSync('git', ['-C', cwd, ...values], { encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(git(['branch', '--show-current']), 'main');
  assert.equal(git(['log', '-1', '--format=%s']), 'Initial commit');
  assert.equal(git(['status', '--porcelain']), '');
  assert.equal(git(['remote']), '');
  const commit = git(['rev-parse', 'HEAD']);
  assert.match(await readFile(path.join(project, 'README.md'), 'utf8'), /Verified through the production Windows application/);
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-success.png') });

  await page.getByRole('button', { name: 'Create Another' }).click();
  assert.equal(await page.getByLabel('Project name').inputValue(), '');
  await page.getByLabel('Project name').fill('native-smoke');
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await page.getByText('A project with this name already exists here.').waitFor();
  assert.equal(git(['rev-parse', 'HEAD']), commit);

  await page.getByLabel('Project name').fill('native-empty');
  await page.getByLabel('README template').selectOption('none');
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await page.getByRole('heading', { name: 'Repository created' }).waitFor();
  const emptyProject = path.join(parent, 'native-empty');
  assert.equal(git(['ls-tree', '--name-only', 'HEAD'], emptyProject), '');
  assert.equal(git(['rev-list', '--count', 'HEAD'], emptyProject), '1');
  assert.equal(git(['branch', '--show-current'], emptyProject), 'main');
  assert.deepEqual(errors, []);
  const report = { executable: path.join(root, 'src-tauri', 'target', 'release', 'repo-creator.exe'), parent,
    checks: ['Production WebView loaded', 'Real React → Rust IPC', 'Local README and initial commit', 'Main branch and clean working tree', 'Existing folder preserved', 'Create Another reset', 'Empty initial commit', 'No JavaScript errors'], commit };
  await writeFile(path.join(root, 'artifacts', 'native-smoke.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close().catch(() => {});
  child?.kill();
  if (backup !== null) await writeFile(config, backup);
  else await unlink(config).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
