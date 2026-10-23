import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { prepare, createProject } from './fixtures';
import type { RecentProject, ProjectCommand } from '../src/workspaceTypes';
import type { ReadinessReport } from '../src/readinessModel';

const project: RecentProject = {
  id: 'project-river',
  createdAt: 1792500000,
  lastOpenedAt: 1792600000,
  pinned: false,
  context: {
    projectName: 'river-workbench',
    description: 'A small desktop tool',
    projectType: 'Desktop',
    language: 'TypeScript',
    brief: { idea: '', audience: '', firstVersion: '', technologies: 'TypeScript', context: '' },
    localPath: '\\\\?\\C:\\Projects\\River Workbench',
    repositoryUrl: 'https://github.com/example/river-workbench',
    branch: 'main',
    agents: ['codex'],
    files: ['README.md'],
    presetName: 'Tauri application',
    visibility: 'private',
    status: 'created',
  },
  technologies: { ids: ['typescript', 'rust', 'tauri', 'sqlite'], custom: ['Local fixtures'] },
  commands: [],
  launcher: { terminal: 'auto', executables: {} },
};
const importedCommand: ProjectCommand = {
  id: 'suggest-build',
  name: 'Build application',
  category: 'build',
  mode: 'executable',
  executable: 'npm',
  args: ['run', 'build'],
  shellCommand: '',
  workingDirectory: '.',
  environment: {},
  description: 'From package.json',
  enabled: true,
  imported: true,
};

const readinessReport: ReadinessReport = {
  checks: [
    {
      id: 'project-type',
      group: 'project',
      title: 'Project type',
      status: 'ready',
      detail: 'Detected Node.js (npm).',
      fix: null,
      inferred: false,
      network: false,
    },
    {
      id: 'tool-node',
      group: 'tools',
      title: 'Node.js',
      status: 'ready',
      detail: 'Found at C:\\Tools\\node.exe.',
      fix: null,
      inferred: false,
      network: false,
    },
    {
      id: 'version-node',
      group: 'requirements',
      title: 'Node.js version',
      status: 'notChecked',
      detail: 'Requires Node.js >=22 (package.json engines). Run a full check to compare it.',
      fix: null,
      inferred: false,
      network: false,
    },
    {
      id: 'env',
      group: 'configuration',
      title: 'Local environment file',
      status: 'attention',
      detail: '.env.example exists but .env does not.',
      fix: 'Copy-Item .env.example .env',
      inferred: true,
      network: false,
    },
    {
      id: 'dependencies-node',
      group: 'dependencies',
      title: 'Node.js dependencies',
      status: 'attention',
      detail: "Dependencies don't appear to be installed.",
      fix: 'npm install',
      inferred: true,
      network: false,
    },
    {
      id: 'file-pyproject.toml',
      group: 'project',
      title: 'Read pyproject.toml',
      status: 'couldNotCheck',
      detail: 'pyproject.toml could not be read or parsed.',
      fix: null,
      inferred: false,
      network: false,
    },
  ],
  probes: [
    { id: 'node', label: 'node --version', network: false },
    { id: 'remote', label: 'git ls-remote <remote> HEAD from a neutral folder', network: true },
  ],
};

async function workspaceFixture(page: Page, missing = false) {
  await prepare(page, false, 'simple');
  await page.evaluate(
    ({ project, importedCommand, missing, readinessReport }) => {
      const state = { projects: [structuredClone(project)], exists: !missing, runs: [] as any[] };
      (window as any).workspaceState = state;
      const original = (window as any).__TAURI_INTERNALS__.invoke;
      const workspaceCommands = [
        'list_recent_projects',
        'get_project_workspace',
        'save_project_settings',
        'add_existing_project',
        'remove_recent_project',
        'relocate_project',
        'get_project_tools',
        'launch_project_tool',
        'save_project_commands',
        'suggest_project_commands',
        'run_project_command',
        'list_command_runs',
        'stop_project_command',
        'get_project_readiness',
        'run_readiness_check',
        'cancel_readiness_check',
      ];
      (window as any).__TAURI_INTERNALS__.invoke = async (command: string, payload: any) => {
        if (!workspaceCommands.includes(command)) return original(command, payload);
        (window as any).testCalls.push({ command, payload });
        const current =
          state.projects.find((item) => item.id === (payload?.id ?? payload?.projectId)) ??
          state.projects[0];
        if (command === 'list_recent_projects') return structuredClone(state.projects);
        if (command === 'get_project_workspace')
          return {
            project: structuredClone(current),
            exists: state.exists,
            gitStatus: 'clean',
            platform: (window as any).workspacePlatform ?? 'windows',
            branch: 'main',
          };
        if (command === 'save_project_settings') {
          Object.assign(current, {
            pinned: payload.pinned,
            technologies: payload.technologies,
            launcher: payload.launcher,
          });
          return structuredClone(current);
        }
        if (command === 'remove_recent_project') {
          state.projects = state.projects.filter((item) => item.id !== payload.id);
          return structuredClone(state.projects);
        }
        if (command === 'add_existing_project') {
          const added = {
            ...structuredClone(project),
            id: 'added-project',
            context: { ...structuredClone(project.context), projectName: 'added-repository' },
          };
          state.projects.push(added);
          return added;
        }
        if (command === 'relocate_project') {
          state.exists = true;
          current.context.localPath = 'C:\\Projects\\Moved River';
          return structuredClone(current);
        }
        if (command === 'get_project_tools')
          return [
            { id: 'folder', name: 'Open Folder', available: true, path: null, documentation: '' },
            {
              id: 'terminal',
              name: 'Open in Terminal',
              available: true,
              path: null,
              documentation: '',
            },
            {
              id: 'vscode',
              name: 'Open in VS Code',
              available: true,
              path: 'C:\\Tools\\code.cmd',
              documentation: 'https://code.visualstudio.com/docs',
            },
            {
              id: 'claude',
              name: 'Claude Code CLI',
              available: false,
              path: null,
              documentation: 'https://code.claude.com/docs/en/setup',
            },
            {
              id: 'codex',
              name: 'Codex CLI',
              available: true,
              path: 'C:\\Tools\\codex.cmd',
              documentation: 'https://developers.openai.com/codex/cli',
            },
            {
              id: 'agy',
              name: 'Antigravity CLI',
              available: false,
              path: null,
              documentation: 'https://antigravity.google/docs',
            },
            {
              id: 'antigravity-ide',
              name: 'Antigravity IDE',
              available: false,
              path: null,
              documentation: 'https://antigravity.google/docs',
            },
          ].map((tool) => ({
            ...tool,
            platform: (window as any).workspacePlatform ?? 'windows',
            status: tool.available
              ? 'available'
              : tool.id === 'agy'
                ? 'unknown'
                : tool.id === 'antigravity-ide'
                  ? 'invalid'
                  : 'missing',
            detail:
              tool.id === 'agy'
                ? 'Could not confirm a CLI installation.'
                : tool.id === 'antigravity-ide'
                  ? 'The configured executable is not accessible.'
                  : '',
          }));
        if (command === 'launch_project_tool') return;
        if (command === 'save_project_commands') {
          current.commands = structuredClone(payload.commands);
          return structuredClone(current);
        }
        if (command === 'suggest_project_commands') return [structuredClone(importedCommand)];
        if (command === 'run_project_command') {
          const saved = current.commands.find((item) => item.id === payload.commandId)!;
          if (saved.imported && !payload.confirmed)
            throw { message: 'Review required', guidance: 'Confirm the command and directory.' };
          saved.imported = false;
          const run = {
            id: `run-${state.runs.length}`,
            projectId: current.id,
            commandId: saved.id,
            name: saved.name,
            status: 'running',
            startedAt: Date.now(),
            finishedAt: null,
            exitCode: null,
            output: 'Starting build…\n',
          };
          state.runs.unshift(run);
          return structuredClone(run);
        }
        if (command === 'list_command_runs') return structuredClone(state.runs);
        if (command === 'get_project_readiness') return structuredClone(readinessReport);
        if (command === 'run_readiness_check') {
          if ((window as any).holdFullCheck)
            await new Promise((resolve) => ((window as any).finishFullCheck = resolve));
          return {
            cancelled: !!(window as any).fullCheckCancelled,
            checks: [
              {
                id: 'version-node',
                group: 'requirements',
                title: 'Node.js version',
                status: 'attention',
                detail: 'Node.js 20.11.1 is installed, but this project requires >=22.',
                fix: 'Install a Node.js version matching >=22, then select Refresh.',
                inferred: false,
                network: false,
              },
              {
                id: 'remote',
                group: 'remote',
                title: 'Git remote access',
                status: 'ready',
                detail: 'Reached github.com/example/river-workbench (origin).',
                fix: null,
                inferred: false,
                network: true,
              },
            ],
          };
        }
        if (command === 'cancel_readiness_check') {
          (window as any).fullCheckCancelled = true;
          (window as any).finishFullCheck?.();
          return;
        }
        if (command === 'stop_project_command') {
          Object.assign(
            state.runs.find((run) => run.id === payload.runId),
            { status: 'stopped', finishedAt: Date.now() },
          );
        }
      };
    },
    { project, importedCommand, missing, readinessReport },
  );
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Projects', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'river-workbench', exact: true })).toBeVisible();
}
async function openWorkspace(page: Page) {
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
  await expect(page.getByRole('main', { name: 'Project workspace' })).toBeVisible();
}
async function section(page: Page, name: string) {
  await page
    .getByRole('group', { name: 'Project workspace sections' })
    .getByRole('button', { name, exact: true })
    .click();
}

test('project library searches, pins, imports, removes history and locates missing repositories', async ({
  page,
}) => {
  await workspaceFixture(page, true);
  await page.getByLabel('Search projects').fill('sqlite');
  await expect(page.locator('.project-card')).toHaveCount(1);
  await page.getByLabel('Search projects').fill('not-present');
  await expect(page.getByText('No matching projects')).toBeVisible();
  await page.getByLabel('Search projects').fill('');
  await page.getByRole('button', { name: 'Pin river-workbench', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Unpin river-workbench', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await openWorkspace(page);
  await expect(page.getByText('Project folder is missing', { exact: true })).toBeVisible();
  await section(page, 'Open');
  await expect(page.getByRole('button', { name: /Open in VS Code/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Locate folder', exact: true }).click();
  await expect(page.getByText('C:\\Projects\\Moved River', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open in VS Code/ })).toBeEnabled();
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await page.getByRole('button', { name: 'Add existing project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'added-repository', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All projects', exact: true }).click();
  await page
    .locator('.project-card')
    .filter({ hasText: 'added-repository' })
    .getByRole('button', { name: 'Remove from history' })
    .click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  const calls = await page.evaluate(() => (window as any).testCalls);
  expect(calls.some((call: any) => /delete.*project|remove.*folder/.test(call.command))).toBe(
    false,
  );
  expect(calls.some((call: any) => call.command === 'run_project_command')).toBe(false);
});

test('tool launcher honors unavailable tools and persists project preferences', async ({
  page,
}) => {
  await workspaceFixture(page);
  await openWorkspace(page);
  await section(page, 'Open');
  await expect(page.locator('.other-tools')).not.toHaveAttribute('open');
  await expect(page.getByRole('button', { name: /Claude Code CLI/ })).toHaveCount(0);
  await page.locator('.other-tools > summary').click();
  await expect(page.locator('.other-tool').filter({ hasText: 'Claude Code CLI' })).toContainText(
    'Not installed',
  );
  await expect(page.locator('.other-tool').filter({ hasText: 'Antigravity CLI' })).toContainText(
    'Not confirmed',
  );
  await expect(page.locator('.other-tool').filter({ hasText: 'Antigravity IDE' })).toContainText(
    'Configured path invalid',
  );
  await expect(
    page.locator('.tool-item').filter({ hasText: 'Claude Code CLI' }).getByRole('link'),
  ).toHaveAttribute('href', 'https://code.claude.com/docs/en/setup');
  expect(
    await page.evaluate(() =>
      (window as any).testCalls.filter((call: any) => call.command === 'launch_project_tool'),
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Refresh tool detection', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((call: any) => call.command === 'get_project_tools')
            .at(-1)?.payload.refresh,
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: /Codex CLI/ }).click();
  await section(page, 'Project Settings');
  await expect(
    page
      .getByLabel('Preferred terminal')
      .getByRole('option', { name: 'macOS Terminal', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Codex CLI executable')).not.toBeVisible();
  await page.locator('.advanced-executables > summary').click();
  await page.getByLabel('Preferred terminal').selectOption('powershell');
  await page.getByLabel('Codex CLI executable').fill('C:\\Tools with spaces\\codex.cmd');
  await page.getByRole('button', { name: 'Save project settings', exact: true }).click();
  await expect(page.getByText('Project preferences saved.', { exact: true })).toBeVisible();
  await section(page, 'Overview');
  await section(page, 'Project Settings');
  await page.locator('.advanced-executables > summary').click();
  await expect(page.getByLabel('Preferred terminal')).toHaveValue('powershell');
  await expect(page.getByLabel('Codex CLI executable')).toHaveValue(
    'C:\\Tools with spaces\\codex.cmd',
  );
  const calls = await page.evaluate(() => (window as any).testCalls);
  expect(calls.find((call: any) => call.command === 'launch_project_tool').payload).toEqual({
    id: project.id,
    tool: 'codex',
  });
  expect(calls.some((call: any) => call.command === 'run_project_command')).toBe(false);
});

test('workspace presents canonical paths conventionally and keeps terminal preferences platform specific', async ({
  page,
}) => {
  await workspaceFixture(page);
  await expect(page.locator('.project-card .path')).toHaveText('C:\\Projects\\River Workbench');
  await page.evaluate(() => {
    (window as any).workspacePlatform = 'macos';
    (window as any).workspaceState.projects[0].launcher.executables.codex =
      '\\\\?\\C:\\Tool Folder\\codex.cmd';
  });
  await openWorkspace(page);
  await expect(page.locator('.project-workspace-heading .path')).toHaveText(
    'C:\\Projects\\River Workbench',
  );
  await expect(page.getByText('Working tree clean', { exact: true }).first()).toBeVisible();
  await section(page, 'Project Settings');
  await expect(
    page
      .getByLabel('Preferred terminal')
      .getByRole('option', { name: 'macOS Terminal', exact: true }),
  ).toHaveCount(1);
  await expect(
    page
      .getByLabel('Preferred terminal')
      .getByRole('option', { name: 'Windows Terminal', exact: true }),
  ).toHaveCount(0);
  await page.locator('.advanced-executables > summary').click();
  await expect(page.getByLabel('Codex CLI executable')).toHaveValue('C:\\Tool Folder\\codex.cmd');
  await expect(page.getByLabel('Windows Terminal executable')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save project settings', exact: true }).click();
  await expect(page.getByText('Project preferences saved.', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).workspaceState.projects[0].launcher.executables.codex,
    ),
  ).toBe('\\\\?\\C:\\Tool Folder\\codex.cmd');
  expect(
    await page.evaluate(() =>
      (window as any).testCalls.filter((call: any) => call.command === 'launch_project_tool'),
    ),
  ).toHaveLength(0);
});

test('discovery requires command and directory review, streams output and stops an active run', async ({
  page,
}, testInfo) => {
  await workspaceFixture(page);
  await openWorkspace(page);
  await section(page, 'Commands');
  await page.getByRole('button', { name: 'Discover commands', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review suggested commands' })).toContainText(
    'npm run build',
  );
  await expect(page.getByRole('dialog')).toContainText('C:\\Projects\\River Workbench');
  await page.getByRole('button', { name: 'Import selected commands', exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as any).testCalls.filter((call: any) => call.command === 'run_project_command'),
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review imported command' })).toContainText(
    'npm run build',
  );
  await expect(page.getByRole('dialog')).toContainText('C:\\Projects\\River Workbench');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as any).testCalls.filter((call: any) => call.command === 'run_project_command'),
    ),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Run reviewed command', exact: true }).click();
  await expect(page.getByLabel('Build application output')).toContainText('Starting build…');
  await page.evaluate(() => {
    (window as any).workspaceState.runs[0].output += 'Compiled successfully\n';
  });
  await expect(page.getByLabel('Build application output')).toContainText('Compiled successfully');
  await page.getByRole('button', { name: 'Copy output', exact: true }).click();
  expect(await page.evaluate(() => (window as any).testCopied)).toContain('Compiled successfully');
  await page.getByRole('button', { name: 'Clear output', exact: true }).click();
  await expect(page.getByLabel('Build application output')).not.toContainText(
    'Compiled successfully',
  );
  await page.evaluate(() => {
    (window as any).workspaceState.runs[0].output = 'Newest retained output after truncation\n';
  });
  await expect(page.getByLabel('Build application output')).toContainText('Newest retained output');
  await page.getByRole('button', { name: 'Stop process', exact: true }).click();
  await expect(page.locator('.run-status')).toHaveText('stopped');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review imported command' })).toHaveCount(0);
  await page.evaluate(() => {
    Object.assign((window as any).workspaceState.runs[0], {
      status: 'failed',
      exitCode: 2,
      finishedAt: Date.now(),
      output: 'Compilation failed\n',
    });
  });
  await expect(page.locator('.run-status')).toHaveText('failed');
  await expect(page.locator('.run-summary')).toContainText('exit 2');
  await expect(page.getByLabel('Build application output')).toContainText('Compilation failed');
  mkdirSync('artifacts/workspace-ui', { recursive: true });
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/commands-${testInfo.project.name}.png`,
  });
  const calls = await page.evaluate(() => (window as any).testCalls);
  expect(calls.filter((call: any) => call.command === 'run_project_command')).toHaveLength(2);
  expect(calls.find((call: any) => call.command === 'run_project_command').payload.confirmed).toBe(
    true,
  );
});

test('command editor preserves structured arguments and shell mode, reorder and saved state', async ({
  page,
}, info) => {
  await workspaceFixture(page);
  await openWorkspace(page);
  await section(page, 'Commands');
  await page.getByRole('button', { name: 'Add command', exact: true }).click();
  await page.getByLabel('Display name').fill('Unit tests');
  await page.getByLabel('Executable', { exact: true }).fill('node');
  await page
    .getByLabel('Arguments · one per line', { exact: true })
    .fill('--test\nfolder with spaces/test.js');
  await page.getByLabel('Working directory', { exact: true }).fill('frontend');
  await page.getByLabel('Environment overrides · non-secret values only').fill('NODE_ENV=test');
  mkdirSync('artifacts/workspace-ui', { recursive: true });
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/command-editor-${info.project.name}.png`,
  });
  await page.setViewportSize({ width: 820, height: 580 });
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Save command', exact: true }).scrollIntoViewIfNeeded();
  expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Save command', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/command-editor-minimum-${info.project.name}.png`,
  });
  await page.setViewportSize({ width: 1100, height: 740 });
  await page.getByRole('button', { name: 'Save command', exact: true }).click();
  await expect(page.locator('.command-card')).toContainText('folder with spaces/test.js');
  await page.getByRole('button', { name: 'Add command', exact: true }).click();
  await page.getByLabel('Display name').fill('Shell task');
  await page.getByRole('button', { name: 'Shell command', exact: true }).click();
  await page.getByLabel('Shell command', { exact: true }).fill('echo ready');
  await page.getByRole('button', { name: 'Save command', exact: true }).click();
  await page.getByRole('button', { name: 'Move Shell task up' }).click();
  await expect(page.locator('.command-card').first()).toContainText('Shell task');
  await section(page, 'Overview');
  await section(page, 'Commands');
  await page
    .locator('.command-card')
    .filter({ hasText: 'Unit tests' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  await expect(page.getByLabel('Arguments · one per line')).toHaveValue(
    '--test\nfolder with spaces/test.js',
  );
  await expect(page.getByLabel('Environment overrides · non-secret values only')).toHaveValue(
    'NODE_ENV=test',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const commands = await page.evaluate(() => (window as any).workspaceState.projects[0].commands);
  expect(commands[0]).toMatchObject({
    name: 'Shell task',
    mode: 'shell',
    shellCommand: 'echo ready',
  });
  expect(commands[1]).toMatchObject({
    mode: 'executable',
    executable: 'node',
    args: ['--test', 'folder with spaces/test.js'],
    workingDirectory: 'frontend',
    environment: { NODE_ENV: 'test' },
  });
  await page.getByRole('button', { name: 'Save commands as preset', exact: true }).click();
  await page.getByLabel('Save a new custom preset').fill('River commands');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await expect(page.getByText('Saved “River commands”.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close presets', exact: true }).click();
  await page.getByLabel('Command preset', { exact: true }).selectOption('custom-1');
  await page.getByRole('button', { name: 'Review preset commands', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Import selected commands', exact: true }),
  ).toBeDisabled();
  await page.getByRole('dialog').getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: 'Import selected commands', exact: true }).click();
  const imported = await page.evaluate(() =>
    (window as any).workspaceState.projects[0].commands.at(-1),
  );
  expect(imported).toMatchObject({ name: 'Unit tests', imported: true, environment: {} });
  expect(
    await page.evaluate(() =>
      (window as any).testCalls.filter((call: any) => call.command === 'run_project_command'),
    ),
  ).toHaveLength(0);
});

test('success launcher keeps base actions unique and handoff fully visible at the default size', async ({
  page,
}, testInfo) => {
  await workspaceFixture(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'New Project', exact: true })
    .click();
  await page.getByLabel('Project name').fill('river-workbench');
  await page.getByLabel('AI coding assistant').selectOption('claude');
  await createProject(page);
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  await expect(page.locator('.completion-launcher .available-tool')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Open Folder', exact: true })).toHaveCount(1);
  await expect(
    page
      .locator('.completion-launcher')
      .getByRole('button', { name: /Open Folder|Open in VS Code/ }),
  ).toHaveCount(0);
  await expect(
    page.locator('.completion-launcher').getByRole('button', { name: /Open in Terminal/ }),
  ).toBeEnabled();
  await expect(
    page.locator('.completion-launcher').getByRole('button', { name: /Codex CLI/ }),
  ).toBeEnabled();
  await expect(page.locator('.completion-launcher .other-tools')).not.toHaveAttribute('open');
  await expect(
    page.locator('.completion-launcher').getByText('Claude Code CLI', { exact: true }),
  ).not.toBeVisible();
  await expect(page.locator('.completion-handoff > summary')).toBeInViewport({ ratio: 1 });
  expect(
    await page
      .locator('.completion-content')
      .evaluate((element) => element.scrollHeight - element.clientHeight),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/success-${testInfo.project.name}.png`,
  });
});

test('workspace layout keeps the default Simple creation screen contained and fits the minimum window', async ({
  page,
}, testInfo) => {
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('river-workbench');
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  expect(
    await page
      .locator('.workspace-main')
      .evaluate((element) => element.scrollHeight - element.clientHeight),
  ).toBeLessThanOrEqual(1);
  mkdirSync('artifacts/workspace-ui', { recursive: true });
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/new-${testInfo.project.name}.png`,
  });
  await workspaceFixture(page);
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/library-${testInfo.project.name}.png`,
  });
  await openWorkspace(page);
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/overview-${testInfo.project.name}.png`,
  });
  await section(page, 'Open');
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/tools-${testInfo.project.name}.png`,
  });
  await page.setViewportSize({ width: 820, height: 580 });
  await section(page, 'Commands');
  await expect(page.getByRole('button', { name: 'Add command', exact: true })).toBeVisible();
  expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBe(820);
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/minimum-${testInfo.project.name}.png`,
  });
});

test('refined workspace screens remain readable at default, minimum and wide dimensions', async ({
  page,
}, testInfo) => {
  mkdirSync('artifacts/refinement-workspace', { recursive: true });
  await workspaceFixture(page);
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/refinement-workspace/library-${testInfo.project.name}.png`,
  });
  await openWorkspace(page);
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/refinement-workspace/overview-${testInfo.project.name}.png`,
  });
  await section(page, 'Open');
  await expect(page.locator('.available-tool')).toHaveCount(4);
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/refinement-workspace/open-${testInfo.project.name}.png`,
  });
  await section(page, 'Commands');
  await page.getByRole('button', { name: 'Discover commands', exact: true }).click();
  await page.getByRole('button', { name: 'Import selected commands', exact: true }).click();
  await expect(page.locator('.command-working-directory')).toContainText(
    'C:\\Projects\\River Workbench',
  );
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/refinement-workspace/commands-${testInfo.project.name}.png`,
  });
  await section(page, 'Project Settings');
  await expect(page.locator('.advanced-executables > summary')).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/refinement-workspace/settings-${testInfo.project.name}.png`,
  });
  await page.locator('.advanced-executables > summary').click();
  await page.getByLabel('VS Code executable').scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/refinement-workspace/advanced-${testInfo.project.name}.png`,
  });
  for (const size of [
    { width: 820, height: 580 },
    { width: 1500, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await section(page, 'Commands');
    await expect(page.getByRole('button', { name: 'Add command', exact: true })).toBeInViewport({
      ratio: 1,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
    expect(
      await page
        .getByRole('main', { name: 'Project workspace' })
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(0);
    await section(page, 'Project Settings');
    await expect(
      page.getByRole('button', { name: 'Save project settings', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
    expect(
      await page
        .getByRole('main', { name: 'Project workspace' })
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1100, height: 740 });
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'New Project', exact: true })
    .click();
  await page.getByLabel('Project name').fill('river-workbench');
  await createProject(page);
  await expect(
    page.getByRole('button', { name: 'Open project workspace', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/refinement-workspace/success-${testInfo.project.name}.png`,
  });
});

function calls(page: Page, command: string) {
  return page.evaluate(
    (command) => (window as any).testCalls.filter((call: any) => call.command === command),
    command,
  );
}
const savedCommands: ProjectCommand[] = [
  { ...importedCommand, id: 'reviewed-build', imported: false },
  { ...importedCommand, id: 'unreviewed-test', name: 'Test suite', category: 'test' },
  {
    ...importedCommand,
    id: 'dev-server',
    name: 'Development server',
    category: 'development',
    imported: false,
    args: ['run', 'dev'],
  },
];

test('readiness inspects automatically, separates states and copies suggested fixes', async ({
  page,
}, testInfo) => {
  await workspaceFixture(page);
  await openWorkspace(page);
  const tab = page
    .getByRole('group', { name: 'Project workspace sections' })
    .getByRole('button', { name: 'Readiness, 2 need attention', exact: true });
  await expect(tab).toBeVisible();
  expect(await calls(page, 'get_project_readiness')).toHaveLength(1);
  await tab.focus();
  await page.keyboard.press('Enter');
  await expect(tab).toHaveAttribute('aria-pressed', 'true');
  const view = page.locator('.rc-readiness');
  await expect(view.getByRole('heading', { name: 'Project readiness' })).toBeVisible();
  await expect(view.getByRole('status').first()).toContainText('2 need attention');
  await expect(view.getByRole('status').first()).toContainText('1 could not check');
  await expect(view.getByRole('status').first()).toContainText('1 not checked');
  for (const heading of ['Project', 'Development tools', 'Configuration files', 'Git'])
    await expect(view.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  const env = view.locator('.readiness-check').filter({ hasText: 'Local environment file' });
  await expect(env).toContainText('Needs attention');
  await expect(env).toContainText('Inferred');
  await expect(view.locator('.readiness-check').filter({ hasText: 'Working tree' })).toContainText(
    'Working tree clean on main',
  );
  await page
    .getByRole('button', { name: 'Copy suggested fix for Local environment file', exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).testCopied)).toBe('Copy-Item .env.example .env');
  await view.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'get_project_readiness')).length).toBe(2);
  expect(await calls(page, 'run_readiness_check')).toHaveLength(0);
  expect(await calls(page, 'run_project_command')).toHaveLength(0);
  mkdirSync('artifacts/workspace-ui', { recursive: true });
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/readiness-${testInfo.project.name}.png`,
  });
});

test('full check lists programs, never preselects commands and confirms project code', async ({
  page,
}, testInfo) => {
  await workspaceFixture(page);
  await page.evaluate((commands) => {
    (window as any).workspaceState.projects[0].commands = commands;
  }, savedCommands);
  await openWorkspace(page);
  await section(page, 'Readiness, 2 need attention');
  await page.getByRole('button', { name: 'Run full check', exact: true }).click();
  const plan = page.getByRole('dialog', { name: 'Run full check' });
  await expect(plan).toContainText('node --version');
  await expect(plan.locator('li').filter({ hasText: 'git ls-remote' })).toContainText(
    'Contacts the network',
  );
  const build = plan.getByRole('checkbox', { name: /Build application/ });
  await expect(build).not.toBeChecked();
  await expect(plan.getByRole('checkbox', { name: /Test suite/ })).toBeDisabled();
  await expect(plan.getByRole('checkbox', { name: /Development server/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(plan).toHaveCount(0);

  await page.getByRole('button', { name: 'Run full check', exact: true }).click();
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  const node = page.locator('.readiness-check').filter({ hasText: 'Node.js version' });
  await expect(node).toContainText('Node.js 20.11.1 is installed');
  await expect(node).toContainText('Full check');
  await expect(
    page.locator('.readiness-check').filter({ hasText: 'Git remote access' }),
  ).toContainText('Network');
  expect(await calls(page, 'run_project_command')).toHaveLength(0);

  await page.getByRole('button', { name: 'Run full check', exact: true }).click();
  await expect(build).not.toBeChecked();
  await build.check();
  await page.getByRole('button', { name: 'Review 1 command', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Run project commands?' });
  await expect(confirm).toContainText("These commands run this project's own code");
  await expect(confirm).toContainText('npm run build');
  await expect(confirm).toContainText('C:\\Projects\\River Workbench');
  await page.screenshot({
    animations: 'disabled',
    path: `artifacts/workspace-ui/readiness-confirm-${testInfo.project.name}.png`,
  });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Review 1 command', exact: true }).click();
  expect(await calls(page, 'run_project_command')).toHaveLength(0);
  await page.getByRole('button', { name: 'Run 1 command', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'run_project_command')).length).toBe(1);
  const [started] = await calls(page, 'run_project_command');
  expect(started.payload).toMatchObject({ commandId: 'reviewed-build', confirmed: false });
  await page.evaluate(() => {
    Object.assign((window as any).workspaceState.runs[0], {
      status: 'succeeded',
      exitCode: 0,
      finishedAt: Date.now(),
    });
  });
  await expect(
    page.locator('.readiness-check').filter({ hasText: 'Build application · run' }),
  ).toContainText('Finished successfully');
  await expect(page.getByRole('status').first()).toContainText('Full check finished');
});

test('full check can be cancelled and stays usable at minimum and wide sizes', async ({ page }) => {
  await workspaceFixture(page);
  await page.evaluate(() => ((window as any).holdFullCheck = true));
  await openWorkspace(page);
  await section(page, 'Readiness, 2 need attention');
  await page.getByRole('button', { name: 'Run full check', exact: true }).click();
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  const progress = page.locator('.readiness-progress');
  await expect(progress).toContainText('Running full check');
  await expect(page.getByRole('button', { name: 'Run full check', exact: true })).toBeDisabled();
  await progress.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(progress).toHaveCount(0);
  await expect(page.getByRole('status').first()).toContainText('Full check cancelled');
  expect(await calls(page, 'cancel_readiness_check')).not.toHaveLength(0);
  for (const size of [
    { width: 820, height: 580 },
    { width: 1500, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await expect(page.getByRole('button', { name: 'Run full check', exact: true })).toBeVisible();
    expect(
      await page
        .getByRole('main', { name: 'Project workspace' })
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
  }
});

test('readiness waits for a missing project folder', async ({ page }) => {
  await workspaceFixture(page, true);
  await openWorkspace(page);
  await section(page, 'Readiness');
  await expect(page.getByText('Readiness needs the project folder')).toBeVisible();
  expect(await calls(page, 'get_project_readiness')).toHaveLength(0);
});
