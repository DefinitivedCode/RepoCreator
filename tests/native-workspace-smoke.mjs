// Opt-in production WebView2 integration. Only owned temporary local projects run.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

assert.equal(process.platform, 'win32');
const root = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'repo-creator-workspace-'));
const project = path.join(temporary, 'Project with spaces 日本語');
const data = path.join(temporary, 'app-data');
const artifacts = path.join(root, 'artifacts', 'native-workspace');
const executable =
  process.env.REPO_CREATOR_SMOKE_EXE ||
  path.join(root, 'src-tauri/target/x86_64-pc-windows-msvc/release/repo-creator.exe');
let application, browser, page;
const checks = [];
const pageErrors = [];
const ownedProcesses = new Set();
const invoke = (command, args = {}) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
    command,
    args,
  });
async function setTheme(appearance, section) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await page
    .getByRole('radio', { name: appearance === 'dark' ? 'Dark' : 'Light', exact: true })
    .check();
  await page.screenshot({
    path: path.join(artifacts, `appearance-${appearance}.png`),
    animations: 'disabled',
  });
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Projects', exact: true })
    .click();
  await page
    .getByRole('main', { name: 'Project workspace' })
    .getByRole('button', { name: section, exact: true })
    .click();
  if (section === 'Commands')
    await expect(page.getByLabel('long output', { exact: true })).toContainText('stream-start');
}
const command = (id, overrides = {}) => ({
  id,
  name: id,
  category: 'test',
  mode: 'executable',
  executable: process.execPath,
  args: [],
  shellCommand: '',
  workingDirectory: '.',
  environment: {},
  description: '',
  enabled: true,
  imported: false,
  ...overrides,
});
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function finish(run) {
  let result;
  await expect
    .poll(
      async () => {
        result = (await invoke('list_command_runs', { projectId: run.projectId })).find(
          (r) => r.id === run.id,
        );
        return result?.status;
      },
      { timeout: 15000 },
    )
    .not.toBe('running');
  return result;
}
async function closeApplication() {
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
    new Promise((_, reject) => setTimeout(() => reject(new Error('App close timed out')), 15000)),
  ]);
}

try {
  await mkdir(project);
  await mkdir(artifacts, { recursive: true });
  execFileSync('git', ['init', project], { windowsHide: true, stdio: 'ignore' });
  await writeFile(
    path.join(project, 'package.json'),
    JSON.stringify({
      name: 'workspace-fixture',
      scripts: {
        build: 'node -e "process.exit(0)"',
        dev: 'node -e "setInterval(()=>{},1000)"',
        setup: "node -e \"require('fs').writeFileSync('unwanted-marker','ran')\"",
      },
    }),
  );
  application = spawn(executable, [], {
    cwd: root,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      REPO_CREATOR_DATA_DIR: data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(temporary, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9225',
    },
  });
  let endpoint;
  await expect
    .poll(
      async () => {
        endpoint = await fetch('http://127.0.0.1:9225/json/version', {
          signal: AbortSignal.timeout(1000),
        })
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
        .flatMap((c) => c.pages())
        .find((p) => p.url().includes('tauri.localhost'));
      return !!page;
    })
    .toBe(true);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.getByLabel('Project name', { exact: true }).waitFor({ timeout: 30000 });
  await expect(page.locator('.app-header').getByRole('combobox')).toHaveCount(0);
  const freshPreferences = await invoke('get_preferences');
  assert.equal(freshPreferences.accent, 'teal');
  assert.equal(freshPreferences.customAccent, '#4FA69B');
  const added = await invoke('add_existing_project', { path: project });
  assert.ok(added?.id);
  const duplicate = await invoke('add_existing_project', { path: project });
  assert.equal(duplicate.id, added.id);
  assert.equal((await invoke('list_recent_projects')).length, 1);
  const workspace = await invoke('get_project_workspace', { id: added.id });
  assert.equal(workspace.exists, true);
  assert.equal(workspace.gitStatus, 'changes');
  checks.push('Existing Git import, canonical directory identity, real Git status');

  const suggestions = await invoke('suggest_project_commands', { id: added.id });
  assert.ok(suggestions.some((c) => c.name.toLowerCase().includes('build')));
  assert.ok(suggestions.every((c) => c.imported));
  await assert.rejects(readFile(path.join(project, 'unwanted-marker')));
  checks.push('Manifest discovery does not execute scripts');

  await mkdir(path.join(project, 'missing-directory'));
  const values = [
    command('literal', {
      args: [
        '-e',
        'console.log(process.cwd());console.log(process.argv[1]);console.error("stderr-visible")',
        'literal $() & ; 日本語',
      ],
    }),
    command('failure', { args: ['-e', 'console.error("expected-failure");process.exit(7)'] }),
    command('imported', { imported: true, args: ['-e', 'console.log("reviewed")'] }),
    command('long', {
      args: [
        '-e',
        'const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"});require("fs").writeFileSync("descendant.pid",String(c.pid));console.log("stream-start");setInterval(()=>console.log("tick"),100)',
      ],
    }),
    command('bad-cwd', {
      workingDirectory: 'missing-directory',
      args: ['-e', 'console.log("must-not-run")'],
    }),
  ];
  await invoke('save_project_commands', { id: added.id, commands: values });
  await rename(
    path.join(project, 'missing-directory'),
    path.join(project, 'moved-command-directory'),
  );
  const literal = await finish(
    await invoke('run_project_command', {
      projectId: added.id,
      commandId: 'literal',
      confirmed: false,
    }),
  );
  assert.equal(literal.status, 'succeeded');
  assert.equal(literal.exitCode, 0);
  assert.ok(literal.output.includes(project));
  assert.ok(literal.output.includes('literal $() & ; 日本語'));
  assert.ok(literal.output.includes('stderr-visible'));
  const failure = await finish(
    await invoke('run_project_command', {
      projectId: added.id,
      commandId: 'failure',
      confirmed: false,
    }),
  );
  assert.equal(failure.exitCode, 7);
  assert.equal(failure.status, 'failed');
  await assert.rejects(
    invoke('run_project_command', { projectId: added.id, commandId: 'imported', confirmed: false }),
  );
  assert.equal(
    (
      await finish(
        await invoke('run_project_command', {
          projectId: added.id,
          commandId: 'imported',
          confirmed: true,
        }),
      )
    ).status,
    'succeeded',
  );
  await assert.rejects(
    invoke('run_project_command', { projectId: added.id, commandId: 'bad-cwd', confirmed: true }),
  );
  checks.push(
    'Real stdout/stderr, literal arguments, Unicode cwd, exit codes, imported consent, invalid cwd',
  );

  const running = await invoke('run_project_command', {
    projectId: added.id,
    commandId: 'long',
    confirmed: true,
  });
  await assert.rejects(
    invoke('run_project_command', { projectId: added.id, commandId: 'long', confirmed: true }),
  );
  await expect
    .poll(async () => {
      const output = (await invoke('list_command_runs', { projectId: added.id })).find(
        (r) => r.id === running.id,
      )?.output;
      return output?.includes('tick');
    })
    .toBe(true);
  const descendant = Number(await readFile(path.join(project, 'descendant.pid'), 'utf8'));
  ownedProcesses.add(descendant);
  assert.ok(alive(descendant));
  await invoke('stop_project_command', { runId: running.id });
  assert.equal((await finish(running)).status, 'stopped');
  await expect.poll(() => alive(descendant)).toBe(false);
  checks.push('Long-running streaming, duplicate prevention, cancellation and child-tree cleanup');

  const settings = {
    id: added.id,
    pinned: true,
    technologies: {
      ids: ['typescript', 'react', 'vite', 'rust', 'tauri', 'sqlite', 'cloudflare-workers'],
      custom: ['Local fixture'],
    },
    launcher: { terminal: 'powershell', executables: {} },
  };
  await invoke('save_project_settings', settings);
  assert.equal((await invoke('get_project_workspace', { id: added.id })).project.pinned, true);
  const tools = await invoke('get_project_tools', { id: added.id });
  assert.ok(tools.some((t) => t.id === 'terminal' && t.available));
  checks.push(
    'Project preference persistence, multi-technology metadata, native terminal discovery',
  );

  // Verify real terminal launching with a compiled local fixture, never a real
  // assistant session. It records cwd/argv and waits for owned-process cleanup.
  const fixtureSource = path.join(temporary, 'launcher-fixture.rs');
  const fixtureExecutable = path.join(temporary, 'launcher-fixture.exe');
  await writeFile(
    fixtureSource,
    `fn main() {
    let value = format!("{}\\n{}\\n{:?}", std::env::current_dir().unwrap().display(), std::process::id(), std::env::args().skip(1).collect::<Vec<_>>());
    std::fs::write("launcher-marker.txt", value).unwrap();
    std::thread::sleep(std::time::Duration::from_secs(30));
  }`,
  );
  execFileSync(
    'rustc',
    ['--crate-name', 'launcher_fixture', fixtureSource, '-o', fixtureExecutable],
    { windowsHide: true, stdio: 'pipe' },
  );
  for (const terminal of ['powershell', 'windows-terminal']) {
    await invoke('save_project_settings', {
      ...settings,
      launcher: {
        terminal,
        executables: { claude: fixtureExecutable },
      },
    });
    const availability = await invoke('get_project_tools', { id: added.id });
    if (!availability.some((tool) => tool.id === 'terminal' && tool.available)) {
      checks.push(`${terminal}: unavailable on this test host; not launched`);
      continue;
    }
    const marker = path.join(project, 'launcher-marker.txt');
    await rm(marker, { force: true });
    await invoke('launch_project_tool', { id: added.id, tool: 'claude' });
    let recorded;
    await expect
      .poll(
        async () => {
          recorded = await readFile(marker, 'utf8').catch(() => '');
          return recorded.includes('\n');
        },
        { timeout: 15000 },
      )
      .toBe(true);
    const [recordedDirectory, fixturePid, recordedArguments] = recorded.split('\n');
    assert.equal(recordedDirectory.replace(/^\\\\\?\\/, ''), project);
    assert.equal(
      recordedArguments,
      '[]',
      'Assistant launch does not add permission or authentication flags',
    );
    const pid = Number(fixturePid);
    ownedProcesses.add(pid);
    const parent = JSON.parse(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `$entry = Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; Get-Process -Id $entry.ParentProcessId | Select-Object Id,ProcessName | ConvertTo-Json -Compress`,
        ],
        { encoding: 'utf8', windowsHide: true },
      ),
    );
    assert.ok(['pwsh', 'powershell'].includes(parent.ProcessName.toLowerCase()));
    ownedProcesses.add(parent.Id);
    process.kill(pid);
    process.kill(parent.Id);
    checks.push(
      `Actual ${terminal} assistant launcher preserves exact Unicode cwd and adds no flags`,
    );
  }
  await invoke('save_project_settings', settings);

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page
    .getByRole('button', { name: /Project with spaces/ })
    .first()
    .click();
  const workspacePage = page.getByRole('main', { name: 'Project workspace' });
  await expect(
    workspacePage.getByRole('heading', { name: added.context.projectName, exact: true }),
  ).toBeVisible();
  // Exercise the real installed IDE's passive discovery without launching it.
  const antigravityProcesses = () =>
    JSON.parse(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'ConvertTo-Json -Compress -InputObject @(Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)',
        ],
        { encoding: 'utf8', windowsHide: true },
      ),
    );
  const beforeIde = antigravityProcesses();
  const detected = await invoke('get_project_tools', { id: added.id, refresh: true });
  await workspacePage.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Refresh tool detection', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Refresh tool detection', exact: true }).click();
  assert.deepEqual(antigravityProcesses(), beforeIde);
  for (const appearance of ['light', 'dark']) {
    await setTheme(appearance, 'Open');
    await page.screenshot({
      path: path.join(artifacts, `open-${appearance}.png`),
      animations: 'disabled',
    });
  }
  checks.push(
    `Passive real-world Antigravity discovery and Open navigation create no IDE process (${detected.find((t) => t.id === 'antigravity-ide')?.status ?? 'unreported'})`,
  );

  const marker = path.join(project, 'launcher-marker.txt');
  await rm(marker, { force: true });
  await invoke('save_project_settings', {
    ...settings,
    launcher: {
      terminal: 'auto',
      executables: { 'antigravity-ide': fixtureExecutable },
    },
  });
  await invoke('get_project_tools', { id: added.id, refresh: true });
  await assert.rejects(readFile(marker));
  // The explicit action must still launch the verified fixture with folder argv.
  await invoke('launch_project_tool', { id: added.id, tool: 'antigravity-ide' });
  let ideFixture;
  await expect
    .poll(async () => {
      ideFixture = await readFile(marker, 'utf8').catch(() => '');
      return ideFixture.includes('\n');
    })
    .toBe(true);
  const [ideDirectory, idePid, ideArguments] = ideFixture.split('\n');
  assert.equal(ideDirectory.replace(/^\\\\\?\\/, ''), project);
  assert.ok(ideArguments.includes('--new-window'));
  assert.ok(ideArguments.includes('Project with spaces 日本語'));
  ownedProcesses.add(Number(idePid));
  process.kill(Number(idePid));
  await invoke('save_project_settings', settings);
  checks.push(
    'Passive executable marker stays absent; explicit IDE launch receives exact folder arguments',
  );
  await workspacePage.getByRole('button', { name: 'Overview', exact: true }).click();
  for (const appearance of ['light', 'dark']) {
    await setTheme(appearance, 'Overview');
    await page.screenshot({
      path: path.join(artifacts, `workspace-${appearance}.png`),
      animations: 'disabled',
    });
  }
  await workspacePage.getByRole('button', { name: 'Commands', exact: true }).click();
  await expect(page.getByLabel('long output', { exact: true })).toContainText('stream-start');
  for (const appearance of ['light', 'dark']) {
    await setTheme(appearance, 'Commands');
    await page.screenshot({
      path: path.join(artifacts, `commands-${appearance}.png`),
      animations: 'disabled',
    });
  }
  await workspacePage.getByRole('button', { name: 'Project Settings', exact: true }).click();
  for (const appearance of ['light', 'dark']) {
    await setTheme(appearance, 'Project Settings');
    await page.screenshot({
      path: path.join(artifacts, `settings-${appearance}.png`),
      animations: 'disabled',
    });
  }
  assert.deepEqual(pageErrors, []);
  checks.push('Production workspace rendered in dark and light modes without JavaScript errors');

  await rename(project, `${project}-moved`);
  assert.equal((await invoke('get_project_workspace', { id: added.id })).exists, false);
  await assert.rejects(invoke('launch_project_tool', { id: added.id, tool: 'folder' }));
  await rename(`${project}-moved`, project);
  checks.push('Moved directories are reported without losing local project preferences');

  const closing = await invoke('run_project_command', {
    projectId: added.id,
    commandId: 'long',
    confirmed: true,
  });
  await expect
    .poll(async () =>
      (await invoke('list_command_runs', { projectId: added.id }))
        .find((r) => r.id === closing.id)
        ?.output.includes('tick'),
    )
    .toBe(true);
  const closingDescendant = Number(await readFile(path.join(project, 'descendant.pid'), 'utf8'));
  ownedProcesses.add(closingDescendant);
  await closeApplication();
  await expect.poll(() => alive(closingDescendant)).toBe(false);
  checks.push('Application closure stops its managed child-process tree');

  const saved = JSON.parse(await readFile(path.join(data, 'history.json'), 'utf8'));
  assert.equal(saved.projects[0].pinned, true);
  assert.equal(saved.projects[0].commands.length, values.length);
  checks.push('Local preferences and commands persisted outside project source');
  const report = { version: '1.4.0', platform: 'Windows native WebView2', checks, artifacts };
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser?.close().catch(() => {});
  if (application?.pid && application.exitCode === null) {
    const exited = once(application, 'exit');
    application.kill();
    await exited;
  }
  for (const pid of ownedProcesses) if (alive(pid)) process.kill(pid);
  const resolved = path.resolve(temporary);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('repo-creator-workspace-'));
  await rm(resolved, { recursive: true, force: true, maxRetries: 25, retryDelay: 200 });
}
