import { test, expect, type Page } from '@playwright/test';
import { prepare, navigate, agentTab, createProject } from './fixtures';
import { verifyExpandedScrolling } from './scrolling.mjs';
import { mkdirSync } from 'node:fs';

async function enableStudio(page: Page) {
  await agentTab(page, 'Assistants');
  await expect(page.getByLabel('Generate AI agent files')).not.toBeChecked();
  await page.getByLabel('Generate AI agent files').check();
}

test('agent selection, rules, specialists, scoped configuration and previews reach creation', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await prepare(page);
  await page.getByLabel('Project name').fill('agent-workspace');
  await page.getByLabel('Project preset').selectOption('tauri');
  await enableStudio(page);
  await page.getByLabel('Claude Code', { exact: true }).check();
  await page.getByLabel('GitHub Copilot', { exact: true }).check();
  for (const name of ['Cursor', 'Gemini CLI', 'OpenCode'])
    await page.getByLabel(name, { exact: true }).check();
  await agentTab(page, 'Instructions');
  await page.getByLabel('Instruction preset', { exact: true }).selectOption('strict');
  await page.getByLabel('Verify the build', { exact: true }).uncheck();
  await page
    .getByLabel('Additional project instructions')
    .fill('Keep café 🦀 exact.\n<script>window.injected = true</script>');
  await agentTab(page, 'Specialists & Skills');
  await page.locator('.specialist-panel > summary').click();
  const specialistRoles = page.locator('.studio-role-list').getByRole('checkbox');
  // all() does not wait for the opening disclosure to expose its controls.
  await expect(specialistRoles).toHaveCount(7);
  for (const role of await specialistRoles.all()) await role.check();
  await agentTab(page, 'Advanced');
  await page.getByText('Advanced AI configuration', { exact: true }).click();
  await page.getByLabel('Codex project configuration', { exact: true }).check();
  await page.getByLabel('Claude project permission mode', { exact: true }).check();
  await page.getByLabel('Scoped rule file ID').fill('frontend');
  await page.getByLabel('Scoped rule name').fill('Frontend contracts');
  await page.getByLabel('File patterns', { exact: true }).fill('**/*.ts, **/*.tsx');
  await page
    .getByLabel('Scoped rule instructions')
    .fill('Preserve established component contracts.');
  await page.getByRole('button', { name: 'Add scoped rule', exact: true }).click();
  await navigate(page, 'Review');
  await page
    .getByRole('group', { name: 'Preview file' })
    .getByRole('button', { name: 'AGENTS.md', exact: true })
    .click();
  await expect(page.getByLabel('AGENTS.md preview', { exact: true })).toContainText(
    'Keep café 🦀 exact.',
  );
  await expect(page.getByLabel('AGENTS.md preview', { exact: true }).locator('script')).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  await page.getByLabel('Find generated files').fill('agents/code-reviewer');
  await expect(
    page.getByRole('button', { name: '.codex/agents/code-reviewer.toml', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Find generated files').fill('');
  await navigate(page, 'Overview');
  const assistant = page.getByLabel('AI coding assistant');
  await expect(assistant).toHaveValue('multiple');
  await assistant.selectOption('');
  await expect(assistant.locator('option[value="multiple"]')).toBeDisabled();
  await expect(assistant).toHaveValue('');
  await agentTab(page, 'Assistants');
  await expect(page.getByLabel('Generate AI agent files')).not.toBeChecked();
  await page.getByLabel('Generate AI agent files').check();
  await expect(page.getByLabel('Claude Code', { exact: true })).toBeChecked();
  await page.getByLabel('GitHub Copilot', { exact: true }).uncheck();
  await page.getByLabel('GitHub Copilot', { exact: true }).check();
  await navigate(page, 'Overview');
  await expect(assistant).toHaveValue('multiple');
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByRole('radio', { name: /^Public/ }).check();
  await page.getByRole('button', { name: 'Manage…' }).click();
  await page.getByLabel('Save a new custom preset').fill('Tauri + agents');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await expect(page.getByText('Saved “Tauri + agents”.')).toBeVisible();
  await page.getByRole('button', { name: 'Close presets' }).click();
  await page.getByLabel('Project preset').selectOption('blank');
  await page.getByRole('button', { name: 'Local only', exact: true }).click();
  await agentTab(page, 'Assistants');
  await expect(page.getByLabel('Generate AI agent files')).not.toBeChecked();
  await navigate(page, 'Overview');
  await page.getByLabel('Project preset').selectOption('custom-1');
  await expect(page.getByRole('radio', { name: /^Public/ })).toBeChecked();
  await agentTab(page, 'Assistants');
  await expect(page.getByLabel('Generate AI agent files')).toBeChecked();
  await expect(page.getByLabel('Claude Code', { exact: true })).toBeChecked();
  await createProject(page);
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  const call = await page.evaluate(() =>
    (window as any).testCalls.find((c: any) => c.command === 'create_repository'),
  );
  expect(call.payload.request).toMatchObject({
    destination: 'github',
    visibility: 'public',
    options: {
      ai: {
        enabled: true,
        agents: expect.arrayContaining([
          'codex',
          'claude',
          'copilot',
          'cursor',
          'gemini',
          'opencode',
        ]),
        instructions: { preset: 'strict' },
        specialists: expect.arrayContaining(['code-reviewer']),
        scopedRules: [{ id: 'frontend', patterns: ['**/*.ts', '**/*.tsx'] }],
      },
    },
  });
  expect(call.payload.request.options.ai.instructions.rules).not.toContain('build');
  expect(call.payload.request.options.ai.agents).toHaveLength(6);
  expect(call.payload.request.options.ai.specialists).toHaveLength(7);
});

test('instruction presets, Markdown imports and reusable specialist definitions preserve user text', async ({
  page,
}) => {
  await prepare(page);
  await page.getByLabel('Project name').fill('custom-agents');
  await enableStudio(page);
  await agentTab(page, 'Instructions');
  const text = page.getByLabel('Additional project instructions');
  await text.fill('Original team instructions 🦀.');
  await page.getByLabel('Save instructions as').fill('Team workflow');
  await page.getByRole('button', { name: 'Save instructions', exact: true }).click();
  await expect(page.getByLabel('Instruction preset', { exact: true })).toHaveValue(
    'instructions-1',
  );
  await text.fill('Temporary draft.');
  await page.getByLabel('Instruction preset', { exact: true }).selectOption('minimal');
  await expect(text).toHaveValue('Temporary draft.');
  await page.getByLabel('Instruction preset', { exact: true }).selectOption('instructions-1');
  await expect(text).toHaveValue('Original team instructions 🦀.');
  await page.getByRole('button', { name: 'Export preset…' }).click();
  await expect(page.getByText('Instruction preset exported.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import Markdown…' }).click();
  await expect(text).toHaveValue('Original team instructions 🦀.');
  await page.getByRole('button', { name: 'Append imported text' }).click();
  await expect(text).toHaveValue('Original team instructions 🦀.\n\nImported instructions 🦀.\n');
  await page.getByRole('button', { name: 'Reset preset rules' }).click();
  await expect(text).toHaveValue('Original team instructions 🦀.\n\nImported instructions 🦀.\n');
  await page.getByRole('button', { name: 'Delete saved preset', exact: true }).click();
  await page.getByRole('button', { name: 'Delete instruction preset', exact: true }).click();
  await expect(text).toHaveValue('Original team instructions 🦀.\n\nImported instructions 🦀.\n');
  await page.getByRole('button', { name: 'Import preset…' }).click();
  await expect(text).toHaveValue('Imported preset text.');
  await agentTab(page, 'Specialists & Skills');
  await page.locator('.specialist-panel > summary').click();
  await page.getByText('Custom specialist editor', { exact: true }).click();
  await page.getByLabel('Start from a role').selectOption('code-reviewer');
  await page.getByLabel('Specialist name', { exact: true }).fill('Team Reviewer');
  await page.getByRole('button', { name: 'Save specialist', exact: true }).click();
  await expect(page.getByLabel('Team Reviewer', { exact: true })).toBeChecked();
  await page.getByLabel('Saved specialist', { exact: true }).selectOption('custom-code-reviewer');
  await page.getByRole('button', { name: 'Use saved specialist' }).click();
  await page.getByRole('button', { name: 'Delete library entry' }).click();
  await page.getByRole('button', { name: 'Delete saved specialist', exact: true }).click();
  await expect(page.getByLabel('Team Reviewer', { exact: true })).toBeChecked();
  await agentTab(page, 'Assistants');
  await page.getByLabel('OpenAI Codex', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Review project' })).toBeDisabled();
  await page.getByLabel('Generate AI agent files').uncheck();
  await expect(page.getByRole('button', { name: 'Review project' })).toBeEnabled();
});

test('complex Studio subsections keep controls and footer inside supported frames', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await prepare(page);
  await page.getByLabel('Project name').fill('studio-scroll');
  await page.getByLabel('Project preset').selectOption('tauri');
  await enableStudio(page);
  await page.getByLabel('Claude Code', { exact: true }).check();
  await page.getByLabel('GitHub Copilot', { exact: true }).check();
  await agentTab(page, 'Instructions');
  await page
    .getByLabel('Additional project instructions')
    .fill('Verify the requested workflow.\n'.repeat(12));
  await verifyExpandedScrolling(page);
  await agentTab(page, 'Specialists & Skills');
  await page.locator('.specialist-panel > summary').click();
  await page.getByText('Custom specialist editor', { exact: true }).click();
  await verifyExpandedScrolling(page);
  await agentTab(page, 'Advanced');
  await page.getByText('Advanced AI configuration', { exact: true }).click();
  await verifyExpandedScrolling(page);
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/v1.3-studio-${info.project.name}.png` });
});
