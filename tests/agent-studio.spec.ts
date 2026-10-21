import { test, expect } from '@playwright/test';
import { prepare } from './fixtures';
import { verifyExpandedScrolling } from './scrolling.mjs';
import { mkdirSync } from 'node:fs';

async function enableStudio(page) {
  await page.locator('.agent-panel > summary').click();
  await expect(page.getByLabel('Generate AI agent files')).not.toBeChecked();
  await page.getByLabel('Generate AI agent files').check();
}

test('agent selection, rules, project presets and file tree reach the creation command', async ({
  page,
}) => {
  await prepare(page);
  await page.getByLabel('Project name').fill('agent-workspace');
  await page.getByLabel('Project preset').selectOption('tauri');
  await enableStudio(page);
  await page.getByLabel('Claude Code', { exact: true }).check();
  await page.getByLabel('GitHub Copilot', { exact: true }).check();
  await page.getByLabel('Instruction preset', { exact: true }).selectOption('strict');
  await page
    .locator('summary')
    .filter({ hasText: /^Development rules/ })
    .click();
  await page.getByLabel('Verify the build', { exact: true }).uncheck();
  await page
    .getByLabel('Additional project instructions')
    .fill('Keep café 🦀 exact.\n<script>window.injected = true</script>');
  await page.locator('.specialist-panel > summary').click();
  await page.getByLabel('Code Reviewer', { exact: true }).check();
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
  await page.locator('.file-preview > summary').click();
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
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByRole('radio', { name: 'Public', exact: true }).check();
  await page.getByRole('button', { name: 'Manage…' }).click();
  await page.getByLabel('Save current configuration as').fill('Tauri + agents');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await page.getByLabel('Project preset').selectOption('blank');
  await expect(page.getByLabel('Generate AI agent files')).not.toBeChecked();
  await page.getByRole('radio', { name: 'Private', exact: true }).check();
  await page.getByRole('button', { name: 'Local only', exact: true }).click();
  await page.getByLabel('Project preset').selectOption('custom-1');
  await expect(page.getByRole('radio', { name: 'Public', exact: true })).toBeChecked();
  await expect(page.getByLabel('Generate AI agent files')).toBeChecked();
  await expect(page.getByLabel('Claude Code', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Create Repository' }).click();
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
        agents: ['codex', 'claude', 'copilot'],
        instructions: { preset: 'strict' },
        specialists: ['code-reviewer'],
        scopedRules: [{ id: 'frontend', patterns: ['**/*.ts', '**/*.tsx'] }],
      },
    },
  });
  expect(call.payload.request.options.ai.instructions.rules).not.toContain('build');
});

test('custom instruction presets, imports and reusable specialist definitions preserve user text', async ({
  page,
}) => {
  await prepare(page);
  await page.getByLabel('Project name').fill('custom-agents');
  await enableStudio(page);
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
  await page.getByLabel('OpenAI Codex', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Create Repository' })).toBeDisabled();
  await page.getByLabel('Generate AI agent files').uncheck();
  await expect(page.getByRole('button', { name: 'Create Repository' })).toBeEnabled();
});

test('all expanded Studio panels retain scrolling and frame stability', async ({ page }, info) => {
  test.setTimeout(60_000);
  await prepare(page);
  await page.getByLabel('Project name').fill('studio-scroll');
  await page.getByLabel('Project preset').selectOption('tauri');
  await enableStudio(page);
  await page.getByLabel('Claude Code', { exact: true }).check();
  await page.getByLabel('GitHub Copilot', { exact: true }).check();
  await page
    .getByLabel('Additional project instructions')
    .fill('Verify the requested workflow.\n'.repeat(12));
  await page.evaluate(() =>
    document
      .querySelectorAll('.agent-panel details')
      .forEach((el) => ((el as HTMLDetailsElement).open = true)),
  );
  await verifyExpandedScrolling(page);
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/v1.2-studio-bottom-${info.project.name}.png` });
});
