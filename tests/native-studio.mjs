import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyExpandedScrolling, scrollSizes } from './scrolling.mjs';

// Real UI, Rust generation, preferences and Git. No agent model or remote service is invoked.
export async function verifyNativeStudio({ page, invoke, git, parent, root, resize }) {
  await page.getByRole('button', { name: 'Create Another' }).click();
  await page.getByLabel('Project name').fill('native-ai-studio');
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Production Agent Studio verification.');
  await page.getByLabel('Project preset').selectOption('tauri');
  await page.locator('.agent-panel > summary').click();
  await expect(page.getByLabel('Generate AI agent files')).not.toBeChecked();
  await page.getByLabel('Generate AI agent files').check();
  for (const name of ['Claude Code', 'GitHub Copilot', 'Cursor', 'Gemini CLI', 'OpenCode']) {
    await page.getByLabel(name, { exact: true }).check();
  }
  await page.getByLabel('Instruction preset', { exact: true }).selectOption('autonomous');
  await page
    .locator('summary')
    .filter({ hasText: /^Development rules/ })
    .click();
  await page.getByLabel('Prefer minimal changes', { exact: true }).uncheck();
  const custom =
    'Preserve project contracts, café and 日本語 🦀.\n<script>window.injected = true</script>\n';
  await page.getByLabel('Additional project instructions').fill(custom);
  await page.locator('.studio-advanced > summary').click();
  await page.getByLabel('Development rule to edit').selectOption('inspect');
  await page
    .getByLabel('Rule wording', { exact: true })
    .fill('Read the affected code before editing.');
  await page
    .getByLabel('Intended stack')
    .fill('Intended Tauri, React and Rust; implementation has not been scaffolded.');
  await page.getByLabel('Technology guidance to edit').selectOption('tauri');
  await page
    .getByLabel('Technology wording', { exact: true })
    .fill('Keep user-defined native command contracts validated.');
  for (const name of [
    'Codex project configuration',
    'Claude project permission mode',
    'Gemini reads AGENTS.md directly',
    'OpenCode asks before editing or running shell commands',
  ]) {
    await page.getByLabel(name).check();
  }
  await page.getByLabel('Scoped rule file ID').fill('ui-guidance');
  await page.getByLabel('Scoped rule name').fill('UI contracts');
  await page.getByLabel('File patterns', { exact: true }).fill('**/*.tsx, **/*.ts');
  await page
    .getByLabel('Scoped rule instructions')
    .fill('Preserve component accessibility and existing public contracts.');
  await page.getByRole('button', { name: 'Add scoped rule', exact: true }).click();
  await page.locator('.specialist-panel > summary').click();
  await page.getByLabel('Code Reviewer', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Edit Documentation Writer specialist', exact: true })
    .click();
  await page.getByLabel('Specialist name', { exact: true }).fill('Native Docs');
  await page.getByRole('button', { name: 'Save specialist', exact: true }).click();
  await expect(page.getByLabel('Native Docs', { exact: true })).toBeChecked();
  await page
    .locator('summary')
    .filter({ hasText: /^Agent skills/ })
    .click();
  for (const name of [
    'Focused Code Review',
    'Debugging Workflow',
    'Documentation Maintenance',
    'Release Verification',
  ]) {
    await page.getByLabel(name, { exact: true }).check();
  }
  await page.getByLabel('Save instructions as').fill('Native team rules');
  await page.getByRole('button', { name: 'Save instructions', exact: true }).click();
  let preferences = await invoke('get_preferences');
  assert.equal(preferences.instructionPresets.length, 1);
  assert.equal(preferences.instructionPresets[0].profile.customText, custom);
  assert.equal(preferences.specialistLibrary.length, 1);
  await page.getByRole('button', { name: 'Manage…' }).click();
  await page.getByLabel('Save current configuration as').fill('Native AI workspace');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  preferences = await invoke('get_preferences');
  const preset = preferences.customPresets.find((p) => p.name === 'Native AI workspace');
  assert.ok(preset);
  assert.equal(preset.configuration.destination, 'local');
  assert.equal(preset.configuration.visibility, 'private');
  const ai = preset.configuration.options.ai;
  assert.equal(ai.agents.length, 6);
  assert.equal(ai.customSpecialists.length, 1);
  assert.equal(ai.specialists.length, 2);
  assert.ok(!ai.instructions.rules.includes('minimal'));

  const request = {
    name: 'native-ai-studio',
    description: 'Production Agent Studio verification.',
    ...preset.configuration,
    githubOwner: '',
    topics: [],
    homepage: '',
  };
  const preview = await invoke('preview_files', { request });
  const byPath = Object.fromEntries(preview.map((f) => [f.path, f.content]));
  assert.equal(byPath['CLAUDE.md'], '@AGENTS.md\n');
  assert.equal(byPath['AGENTS.md'], byPath['.github/copilot-instructions.md']);
  assert.ok(byPath['AGENTS.md'].includes(custom));
  assert.ok(byPath['AGENTS.md'].includes('Read the affected code before editing.'));
  assert.ok(byPath['AGENTS.md'].includes('Keep user-defined native command contracts validated.'));
  assert.equal(byPath['GEMINI.md'], undefined);
  assert.deepEqual(JSON.parse(byPath['.gemini/settings.json']).context.fileName, ['AGENTS.md']);
  for (const required of [
    '.codex/agents/code-reviewer.toml',
    '.claude/agents/custom-documentation-writer.md',
    '.github/agents/code-reviewer.agent.md',
    '.opencode/agents/code-reviewer.md',
    '.claude/rules/ui-guidance.md',
    '.github/instructions/ui-guidance.instructions.md',
    '.cursor/rules/ui-guidance.mdc',
    '.agents/skills/focused-code-review/SKILL.md',
  ])
    assert.ok(byPath[required], required);
  await page.evaluate(() =>
    document.querySelectorAll('.agent-panel details').forEach((el) => (el.open = true)),
  );
  await verifyExpandedScrolling(page, resize);
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-v1.2-studio-bottom.png') });
  for (const file of [
    'AGENTS.md',
    '.codex/config.toml',
    '.claude/settings.json',
    '.github/agents/code-reviewer.agent.md',
    '.cursor/rules/project.mdc',
    'opencode.json',
    '.agents/skills/focused-code-review/SKILL.md',
  ]) {
    await page
      .getByRole('group', { name: 'Preview file' })
      .getByRole('button', { name: file, exact: true })
      .click();
    assert.equal(
      await page.getByLabel(`${file} preview`, { exact: true }).textContent(),
      byPath[file],
    );
  }
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await resize(scrollSizes[0]);
  await page.getByLabel('OpenAI Codex', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-v1.2-studio.png') });
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await page.getByRole('heading', { name: 'Repository created' }).waitFor();
  const project = path.join(parent, 'native-ai-studio');
  for (const file of preview) {
    assert.equal(await readFile(path.join(project, file.path), 'utf8'), file.content, file.path);
  }
  const tracked = git(['ls-tree', '-r', '--name-only', 'HEAD'], project).split(/\r?\n/).sort();
  assert.deepEqual(tracked, preview.map((f) => f.path).sort());
  assert.equal(git(['status', '--porcelain'], project), '');
  assert.equal(git(['remote'], project), '');
  preferences = await invoke('get_preferences');
  assert.equal(preferences.schemaVersion, 3);
  assert.equal(preferences.defaults.options.ai.enabled, true);
  assert.equal(preferences.instructionPresets[0].profile.customText, custom);
  await page.screenshot({ path: path.join(root, 'artifacts', 'native-v1.2-studio-success.png') });
  return { files: preview.length, commit: git(['rev-parse', 'HEAD'], project) };
}
