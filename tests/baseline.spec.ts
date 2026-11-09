// Visual baseline for the redesign. Opt-in: REPO_CREATOR_BASELINE=1 npx playwright test tests/baseline.spec.ts
// Captures the current screens at three sizes in both themes into ignored
// artifacts/redesign-baseline/ (override with REPO_CREATOR_BASELINE_DIR, e.g. for
// later phases to capture "after"). Uses the browser IPC mock, fictional data and
// disabled animations; no real Git, GitHub or filesystem access.
import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prepare, navigate, fileTab, agentTab } from './fixtures';

const enabled = process.env.REPO_CREATOR_BASELINE === '1';
const output = path.resolve(process.env.REPO_CREATOR_BASELINE_DIR || 'artifacts/redesign-baseline');
const sizes = [
  { name: '820x580', width: 820, height: 580 },
  { name: '1100x740', width: 1100, height: 740 },
  { name: '1440x900', width: 1440, height: 900 },
] as const;

const project = {
  id: 'project-river',
  createdAt: 1792500000,
  lastOpenedAt: 1792600000,
  pinned: true,
  context: {
    projectName: 'river-workbench',
    description: 'A small desktop tool',
    projectType: 'Desktop',
    language: 'TypeScript',
    brief: { idea: '', audience: '', firstVersion: '', technologies: 'TypeScript', context: '' },
    localPath: 'C:\\Projects\\River Workbench',
    repositoryUrl: 'https://github.com/example/river-workbench',
    branch: 'main',
    agents: ['codex'],
    files: ['README.md'],
    presetName: 'Tauri application',
    visibility: 'private',
    status: 'created',
  },
  technologies: { ids: ['typescript', 'rust', 'tauri'], custom: ['Local fixtures'] },
  commands: [
    {
      id: 'build',
      name: 'Build application',
      category: 'build',
      mode: 'executable',
      executable: 'npm',
      args: ['run', 'build'],
      shellCommand: '',
      workingDirectory: '.',
      environment: {},
      description: 'Compile the app',
      enabled: true,
      imported: false,
    },
  ],
  launcher: { terminal: 'auto', executables: {} },
};
const check = (
  id: string,
  group: string,
  title: string,
  status: string,
  detail: string,
  fix: string | null,
) => ({
  id,
  group,
  title,
  status,
  detail,
  fix,
  inferred: false,
  network: false,
});
const readiness = {
  checks: [
    check('project-type', 'project', 'Project type', 'ready', 'Detected Node.js (npm).', null),
    check('tool-node', 'tools', 'Node.js', 'ready', 'Found at C:\\Tools\\node.exe.', null),
    check(
      'version-node',
      'requirements',
      'Node.js version',
      'attention',
      'Node.js 20 installed; project requires >=22.',
      'Install Node.js 22 or newer, then refresh.',
    ),
    check(
      'remote',
      'remote',
      'Git remote access',
      'notChecked',
      'Run a full check to contact the remote.',
      null,
    ),
  ],
};

const manifest: { captured: string[]; failed: { screen: string; error: string }[] } = {
  captured: [],
  failed: [],
};

async function mockWorkspace(page: Page, populated: boolean) {
  await page.evaluate(
    ({ project, readiness, populated }) => {
      const original = (window as any).__TAURI_INTERNALS__.invoke;
      const commands: Record<string, (payload: any) => any> = {
        list_recent_projects: () => (populated ? [structuredClone(project)] : []),
        get_project_workspace: () => ({
          project: structuredClone(project),
          exists: true,
          gitStatus: 'clean',
          platform: 'windows',
          branch: 'main',
        }),
        get_project_tools: () =>
          [
            ['folder', 'Open Folder', true],
            ['terminal', 'Open in Terminal', true],
            ['vscode', 'Open in VS Code', true],
            ['claude', 'Claude Code CLI', false],
          ].map(([id, name, available]) => ({
            id,
            name,
            available,
            path: available ? 'C:\\Tools\\tool.cmd' : null,
            documentation: '',
            platform: 'windows',
            status: available ? 'available' : 'missing',
            detail: '',
          })),
        detect_project_technologies: () => ({
          suggestions: [
            {
              id: 'react',
              name: 'React',
              evidence: [{ description: 'Declared react in dependencies.', path: 'package.json' }],
            },
          ],
          notices: [],
        }),
        suggest_project_commands: () => [],
        list_command_runs: () => [
          {
            id: 'run-1',
            projectId: project.id,
            commandId: 'build',
            name: 'Build application',
            status: 'failed',
            startedAt: 1792600000000,
            finishedAt: 1792600004000,
            exitCode: 1,
            output:
              '> river-workbench@1.0.0 build\n\u001b[31merror\u001b[0m TS2322: Type string is not assignable to number\nBuild failed.\n',
          },
        ],
        get_project_readiness: () => structuredClone(readiness),
        launch_project_tool: () => undefined,
      };
      (window as any).__TAURI_INTERNALS__.invoke = async (command: string, payload: any) =>
        command in commands ? commands[command](payload) : original(command, payload);
    },
    { project, readiness, populated },
  );
}

async function shoot(
  page: Page,
  scheme: string,
  size: string,
  screen: string,
  action?: () => Promise<void>,
) {
  const name = `${scheme}/${size}/${screen}`;
  try {
    await action?.();
    await page.waitForTimeout(120);
    const file = path.join(output, scheme, size, `${screen}.png`);
    mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, animations: 'disabled' });
    manifest.captured.push(name);
  } catch (error) {
    manifest.failed.push({ screen: name, error: String(error).split('\n')[0] });
  }
}

const main = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name, exact: true });

test.describe('redesign baseline', () => {
  test.skip(!enabled, 'Set REPO_CREATOR_BASELINE=1 to capture the baseline.');
  test.setTimeout(420_000);

  test('capture screens', async ({ page }, info) => {
    const scheme = info.project.name;
    await page.addInitScript(() => {
      (window as any).testUpdateOffer = {
        version: '9.9.0',
        notes: '# Improvements\n\n- Readable notes\n- A second item',
      };
      (window as any).testExtraFiles = 6;
    });
    await prepare(page, false, 'advanced');
    page.setDefaultTimeout(3000);
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      const at = (screen: string, action?: () => Promise<void>) =>
        shoot(page, scheme, size.name, screen, action);
      await at('new-overview', async () => {
        await main(page, 'New Project').click();
        await navigate(page, 'Overview');
      });
      await at('new-files-readme', () => fileTab(page, 'README'));
      for (const tab of ['Gitignore', 'License', 'Additional Files', 'Git Settings'])
        await at(`new-files-${tab.toLowerCase().replace(/ /g, '-')}`, () => fileTab(page, tab));
      for (const tab of ['Assistants', 'Instructions', 'Specialists & Skills', 'Advanced'])
        await at(`new-agents-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}`, () =>
          agentTab(page, tab),
        );
      await at('generated-files-dialog', async () => {
        await navigate(page, 'Overview');
        await page
          .getByRole('button', { name: /Preview files/ })
          .first()
          .click();
        await page.getByRole('dialog').waitFor();
      });
      await page.keyboard.press('Escape');
      await at('presets', async () => {
        await main(page, 'Presets').click();
      });
      await at('preset-dialog', async () => {
        await page.getByRole('button', { name: 'Manage presets' }).click();
        await page.getByRole('dialog').waitFor();
      });
      await page.keyboard.press('Escape');
      await at('projects-empty', async () => {
        await main(page, 'Projects').click();
      });
      for (const tab of ['Git & identity', 'GitHub', 'Development tools', 'Appearance', 'Updates'])
        await at(`settings-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}`, async () => {
          await main(page, 'Settings').click();
          await page.getByRole('tab', { name: tab, exact: true }).click();
        });
      await at('update-available', async () => {
        await main(page, 'New Project').click();
      });
    }

    // Populated library and workspace use a compact workspace mock.
    await mockWorkspace(page, true);
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      const at = (screen: string, action?: () => Promise<void>) =>
        shoot(page, scheme, size.name, screen, action);
      await at('projects-populated', async () => {
        await main(page, 'New Project').click();
        await main(page, 'Projects').click();
      });
      await at('workspace-overview', async () => {
        const group = page.getByRole('tablist', { name: 'Project workspace sections' });
        if (await group.count())
          await group.getByRole('button', { name: 'Overview', exact: true }).click();
        else await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      });
      for (const tab of ['Open', 'Commands', 'Readiness', 'Project Settings'])
        await at(`workspace-${tab.toLowerCase()}`, async () => {
          await page
            .getByRole('tablist', { name: 'Project workspace sections' })
            .getByRole('tab', { name: new RegExp(`^${tab}`) })
            .click();
        });
      await at('command-editor-dialog', async () => {
        await page
          .getByRole('tablist', { name: 'Project workspace sections' })
          .getByRole('tab', { name: 'Commands', exact: true })
          .click();
        await page
          .getByRole('button', { name: /Add command|New command/ })
          .first()
          .click();
        await page.getByRole('dialog').waitFor();
      });
      await page.keyboard.press('Escape');
    }
    // Success screen last: it creates through the mock only.
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await shoot(page, scheme, size.name, 'success', async () => {
        await main(page, 'New Project').click();
        await page.getByLabel('Project name').fill('river-notes');
        await page.getByRole('button', { name: 'Create project', exact: true }).click();
        await page.getByText('river-notes').first().waitFor();
      });
      break;
    }
    mkdirSync(path.join(output, scheme), { recursive: true });
    writeFileSync(path.join(output, scheme, 'manifest.json'), JSON.stringify(manifest, null, 2));
  });
});
