// Opt-in Windows production WebView2 smoke test. No remote repositories are created.
// Uses an isolated app-data directory; user preferences/history/window are untouched.
import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, unlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { verifyExpandedScrolling, scrollSizes } from './scrolling.mjs';
import { configureNativeStudio } from './native-studio.mjs';

assert.equal(process.platform, 'win32', 'This smoke test requires Windows WebView2');
const root = path.resolve(import.meta.dirname, '..');
const temporaryRoot = path.resolve(os.tmpdir());
const temporary = await mkdtemp(path.join(temporaryRoot, 'repo-creator-v1.3-'));
const parent = path.join(temporary, 'Projects with spaces 日本語');
const settingsDirectory = path.join(temporary, 'isolated-app-data');
const executable =
  process.env.REPO_CREATOR_SMOKE_EXE ||
  path.join(root, 'src-tauri', 'target', 'release', 'repo-creator.exe');
const screenshots = path.join(root, 'artifacts', 'native-v1.3');
const names = ['preferences.json', 'preferences.json.bak', 'history.json', 'window.json'];
const backups = new Map();
let child,
  browser,
  page,
  launchError,
  settingsChanged = false;
const errors = [],
  created = [];
const check = (condition, message) => assert.ok(condition, message);
const optionalRead = (file) =>
  readFile(file).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
const invoke = (command, args = {}) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
    command,
    args,
  });
function git(values, project) {
  check(
    path.resolve(project).startsWith(path.resolve(parent) + path.sep),
    'Git checks must stay inside the owned test root',
  );
  return execFileSync('git', ['-C', project, ...values], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}
async function resize(size) {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-File',
      path.join(root, 'tests', 'resize-window.ps1'),
      '-ProcessId',
      String(child.pid),
      '-Width',
      String(size.width),
      '-Height',
      String(size.height),
    ],
    { windowsHide: true },
  );
  await expect
    .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual(size);
}
const screenshot = (name) => page.screenshot({ path: path.join(screenshots, `${name}.png`) });
async function identityIfNeeded() {
  const environment = await invoke('check_environment', { includeGithub: false });
  check(environment.gitInstalled, 'Git is required for the production smoke test');
  if (!environment.identityReady) {
    await page
      .getByRole('navigation', { name: 'Project setup' })
      .getByRole('button', { name: 'Setup & status', exact: true })
      .click();
    await page
      .getByLabel('Your name for this project', { exact: true })
      .fill('Native Smoke Author');
    await page
      .getByLabel('Email for this project', { exact: true })
      .fill('native-smoke@example.invalid');
    await page.getByRole('button', { name: 'Return to project setup', exact: true }).click();
  }
}
async function createAndVerify(details) {
  await identityIfNeeded();
  await page
    .getByRole('navigation', { name: 'Project setup' })
    .getByRole('button', { name: 'Review', exact: true })
    .click();
  const button = page.getByRole('button', { name: 'Create Project', exact: true });
  await expect(button).toBeEnabled();
  // Native configuration persistence intentionally waits for a 600ms debounce.
  await page.waitForTimeout(850);
  const preferences = await invoke('get_preferences');
  const request = {
    ...preferences.defaults,
    name: details.name,
    description: details.description,
    destination: 'local',
    visibility: 'private',
    githubOwner: '',
    topics: [],
    homepage: '',
    presetName: details.presetName,
  };
  assert.equal(preferences.destination, 'local');
  assert.deepEqual(request.options.postActions, { folder: false, vscode: false, github: false });
  const preview = await invoke('preview_files', { request });
  for (const file of preview) {
    await page
      .getByRole('group', { name: 'Preview file' })
      .getByRole('button', { name: file.path, exact: true })
      .click();
    assert.equal(
      await page.getByLabel(`${file.path} preview`, { exact: true }).textContent(),
      file.content,
      `UI preview: ${file.path}`,
    );
  }
  if (!preview.length)
    await expect(
      page.getByText('No files will be generated. Git will create an empty initial commit.', {
        exact: true,
      }),
    ).toBeVisible();
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await screenshot(`${details.name}-review`);
  await button.click();
  await page
    .getByRole('heading', { name: 'Repository created', exact: true })
    .waitFor({ timeout: 30_000 });
  const project = path.join(parent, details.name);
  assert.equal(git(['branch', '--show-current'], project), request.options.initialBranch);
  assert.equal(git(['log', '-1', '--format=%s'], project), request.options.commitMessage);
  assert.equal(git(['rev-list', '--count', 'HEAD'], project), '1');
  assert.equal(git(['status', '--porcelain'], project), '');
  assert.equal(git(['remote'], project), '', 'No remote repository may be created');
  const tracked = git(['ls-tree', '-r', '--name-only', 'HEAD'], project)
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
  assert.deepEqual(tracked, preview.map((file) => file.path).sort());
  for (const file of preview) {
    assert.equal(
      await readFile(path.join(project, file.path), 'utf8'),
      file.content,
      `Created file: ${file.path}`,
    );
    assert.equal(
      execFileSync('git', ['-C', project, 'show', `HEAD:${file.path}`], {
        encoding: 'utf8',
        windowsHide: true,
      }),
      file.content,
      `Committed file: ${file.path}`,
    );
  }
  await page.getByLabel('Prompt template', { exact: true }).selectOption('development');
  const prompt = await page.getByLabel('AI prompt', { exact: true }).inputValue();
  check(prompt.includes(details.name), 'Handoff includes confirmed project name');
  const commit = git(['rev-parse', 'HEAD'], project);
  check(prompt.includes(commit), 'Handoff includes confirmed commit');
  check(!prompt.includes('https://github.com/'), 'Local projects must not invent a repository URL');
  await screenshot(`${details.name}-success`);
  const result = {
    name: details.name,
    files: preview.map((file) => file.path),
    branch: request.options.initialBranch,
    commit,
  };
  created.push(result);
  return { result, request, preview, project };
}

try {
  assert.equal(
    await fetch('http://127.0.0.1:9224/json/version', { signal: AbortSignal.timeout(1000) })
      .then(() => true)
      .catch(() => false),
    false,
    'Owned debugging port must be unused',
  );
  await readFile(executable);
  for (const name of names)
    backups.set(name, await optionalRead(path.join(settingsDirectory, name)));
  await mkdir(parent, { recursive: true });
  await mkdir(settingsDirectory, { recursive: true });
  await mkdir(screenshots, { recursive: true });
  settingsChanged = true;
  await writeFile(
    path.join(settingsDirectory, 'preferences.json'),
    JSON.stringify({
      schemaVersion: 4,
      experienceMode: 'simple',
      parentPath: parent,
      destination: 'local',
      appearance: 'dark',
    }),
  );
  await writeFile(
    path.join(settingsDirectory, 'history.json'),
    JSON.stringify({ schemaVersion: 1, projects: [] }),
  );
  await writeFile(
    path.join(settingsDirectory, 'window.json'),
    JSON.stringify({ width: 1100, height: 740, maximized: false }),
  );
  child = spawn(executable, [], {
    cwd: root,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      REPO_CREATOR_DATA_DIR: settingsDirectory,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9224',
      WEBVIEW2_USER_DATA_FOLDER: path.join(temporary, 'webview'),
    },
  });
  child.once('error', (error) => {
    launchError = error;
  });
  let endpoint;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (launchError) throw launchError;
    endpoint = await fetch('http://127.0.0.1:9224/json/version', {
      signal: AbortSignal.timeout(1000),
    })
      .then((response) => response.json())
      .catch(() => null);
    if (endpoint?.webSocketDebuggerUrl) break;
    if (child.exitCode !== null)
      throw new Error(`Production application exited with ${child.exitCode}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  check(endpoint?.webSocketDebuggerUrl, 'Production WebView2 must start');
  browser = await chromium.connectOverCDP(endpoint.webSocketDebuggerUrl);
  for (let attempt = 0; attempt < 80; attempt++) {
    page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().includes('tauri.localhost'));
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  check(page, 'Production application page must load');
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(15_000);
  await page.getByLabel('Project name', { exact: true }).waitFor({ timeout: 30_000 });
  assert.equal((await invoke('get_preferences')).schemaVersion, 4);
  await expect(page.getByRole('button', { name: 'Simple', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Starting point', { exact: true }).selectOption('blank');
  await page.getByLabel('Project name', { exact: true }).fill('native-blank');
  await identityIfNeeded();
  await verifyExpandedScrolling(page, resize);
  for (const size of scrollSizes) {
    await resize(size);
    await page.locator('.workspace-main').focus();
    await page.keyboard.press('Control+Home');
    await screenshot(`simple-dark-${size.width}x${size.height}`);
  }
  await resize(scrollSizes[0]);
  await page.getByRole('combobox', { name: /Appearance/ }).selectOption('light');
  await screenshot('simple-light-1100x740');
  assert.equal(
    (
      await createAndVerify({
        name: 'native-blank',
        description: '',
        presetName: 'Blank repository',
      })
    ).preview.length,
    0,
  );
  await page.getByRole('button', { name: 'Create Another', exact: true }).click();
  await page.getByLabel('Starting point', { exact: true }).selectOption('experiment');
  await page.getByLabel('Project name', { exact: true }).fill('native-experiment');
  const description = 'Explore a small local idea with a realistic first version.';
  await page.getByRole('textbox', { name: 'What are you making?', exact: false }).fill(description);
  await page.getByLabel('AI coding assistant', { exact: true }).selectOption('claude');
  const experiment = await createAndVerify({
    name: 'native-experiment',
    description,
    presetName: 'Experiment',
  });
  const readme = experiment.preview.find((file) => file.path === 'README.md')?.content;
  check(
    readme?.includes(description) && readme.includes('experimental project'),
    'Experiment README renders description and guidance',
  );
  check(
    experiment.preview.some((file) => file.path === 'CLAUDE.md'),
    'Simple assistant generates instruction files',
  );
  await page.getByRole('button', { name: 'Create Another', exact: true }).click();
  const details = await configureNativeStudio({ page, invoke });
  await page.getByRole('combobox', { name: /Appearance/ }).selectOption('dark');
  await verifyExpandedScrolling(page, resize);
  await resize(scrollSizes[0]);
  await screenshot('advanced-assistants-dark');
  const advanced = await createAndVerify(details);
  const byPath = Object.fromEntries(advanced.preview.map((file) => [file.path, file.content]));
  assert.equal(byPath['CLAUDE.md'], '@AGENTS.md\n');
  assert.equal(byPath['AGENTS.md'], byPath['.github/copilot-instructions.md']);
  check(
    byPath['AGENTS.md'].includes(details.custom),
    'Advanced instructions remain exact and inert',
  );
  for (const required of [
    'LICENSE',
    '.editorconfig',
    '.gitattributes',
    '.codex/config.toml',
    '.claude/settings.json',
    '.gemini/settings.json',
    'opencode.json',
    '.codex/agents/code-reviewer.toml',
    '.claude/rules/ui-guidance.md',
    '.github/instructions/ui-guidance.instructions.md',
    '.cursor/rules/ui-guidance.mdc',
    '.agents/skills/focused-code-review/SKILL.md',
  ])
    check(byPath[required], required);
  await page.getByRole('button', { name: 'Create Another', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('native-advanced');
  await page
    .getByRole('navigation', { name: 'Project setup' })
    .getByRole('button', { name: 'Review', exact: true })
    .click();
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await page.getByText('A project with this name already exists here.', { exact: true }).waitFor();
  assert.equal(git(['rev-parse', 'HEAD'], advanced.project), advanced.result.commit);
  const history = await invoke('list_recent_projects');
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((project) => project.context.projectName).sort(),
    created.map((project) => project.name).sort(),
  );
  assert.deepEqual(errors, []);
  await unlink(path.join(screenshots, 'failure.png')).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  const report = {
    version: '1.3.0',
    checks: [
      'Production WebView2 and native IPC',
      'Simple Blank empty initial commit',
      'Simple Experiment and Claude instructions',
      'Advanced six assistants, specialist, skill, scoped rules and permission configs',
      'Modes and navigation preserve settings',
      'Exact UI previews, files and initial commit contents',
      'Unicode/spaces filesystem path',
      'Clean Git repositories without remotes',
      'Default/minimum/wide/laptop dimensions',
      'Dark/light appearance and fixed actions',
      'Confirmed development handoff',
      'Recent-project persistence',
      'Existing-directory protection',
      'No JavaScript errors',
    ],
    created,
    dimensions: scrollSizes,
    screenshots,
  };
  await writeFile(
    path.join(root, 'artifacts', 'native-smoke.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: path.join(screenshots, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser?.close().catch(() => {});
  if (child?.pid && child.exitCode === null) {
    const stopped = once(child, 'exit');
    child.kill();
    await stopped;
  }
  if (settingsChanged)
    for (const [name, bytes] of backups) {
      const file = path.join(settingsDirectory, name);
      if (bytes === null)
        await unlink(file).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      else await writeFile(file, bytes);
      assert.deepEqual(
        await optionalRead(file),
        bytes,
        `Restored ${name} matches its original bytes`,
      );
    }
  const resolved = path.resolve(temporary);
  check(
    path.dirname(resolved) === temporaryRoot &&
      path.basename(resolved).startsWith('repo-creator-v1.3-'),
    'Refusing unexpected cleanup path',
  );
  await rm(resolved, { recursive: true, force: true, maxRetries: 25, retryDelay: 200 });
}
