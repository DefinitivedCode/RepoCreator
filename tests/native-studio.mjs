import { expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Configure the production UI; generation and creation remain in native Rust.
export async function configureNativeStudio({ page, invoke }) {
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByLabel('Project preset', { exact: true }).selectOption('tauri');
  await page.getByLabel('Project name', { exact: true }).fill('native-advanced');
  const description = 'Production workspace verification with six optional assistants.';
  await page.getByRole('textbox', { name: 'Description', exact: false }).fill(description);
  const nav = page.getByRole('navigation', { name: 'Project setup' });
  const fileTabs = page.getByRole('group', { name: 'Project file settings' });
  await nav.getByRole('button', { name: 'Project Files', exact: true }).click();
  await page.getByRole('combobox', { name: /^README/ }).selectOption('custom');
  await page
    .getByLabel('Overview content', { exact: true })
    .fill('Keep the native contracts intact.');
  await fileTabs.getByRole('button', { name: 'License', exact: true }).click();
  await page.getByLabel('License type', { exact: true }).selectOption('MIT');
  await page.getByLabel('Copyright holder', { exact: true }).fill('Native Smoke Author');
  await fileTabs.getByRole('button', { name: 'Git Settings', exact: true }).click();
  await page.getByLabel('Initial branch', { exact: true }).fill('work/start');
  await page.getByLabel('Initial commit message', { exact: true }).fill('Start verified workspace');
  await fileTabs.getByRole('button', { name: 'Gitignore', exact: true }).click();
  for (const pattern of ['scratch/*', '!scratch/keep.txt', 'AGENTS.md']) {
    await page.getByLabel('Custom patterns', { exact: true }).fill(pattern);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await nav.getByRole('button', { name: 'AI Agents', exact: true }).click();
  await page.getByLabel('Generate AI agent files', { exact: true }).check();
  const assistants = (await invoke('get_catalog')).studio.agents.map((agent) => agent.name);
  assert.equal(assistants.length, 6);
  for (const name of assistants) await page.getByRole('checkbox', { name, exact: true }).check();
  const tabs = page.getByRole('group', { name: 'AI agent settings' });
  await tabs.getByRole('button', { name: 'Instructions', exact: true }).click();
  await page.getByLabel('Instruction preset', { exact: true }).selectOption('autonomous');
  const custom = 'Preserve café and 日本語 🦀.\n<script>window.injected = true</script>\n';
  await page.getByLabel('Additional project instructions', { exact: false }).fill(custom);
  await page.getByLabel('Save instructions as', { exact: true }).fill('Native team rules');
  await page.getByRole('button', { name: 'Save instructions', exact: true }).click();
  await expect
    .poll(async () => (await invoke('get_preferences')).instructionPresets.length)
    .toBe(1);
  await tabs.getByRole('button', { name: 'Specialists & Skills', exact: true }).click();
  await page.locator('.specialist-panel > summary').click();
  await page.getByRole('checkbox', { name: 'Code Reviewer', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Focused Code Review', exact: true }).check();
  await tabs.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.locator('.studio-advanced > summary').click();
  await page
    .getByLabel('Intended stack', { exact: true })
    .fill('Intended Tauri, React and Rust; no scaffold exists yet.');
  for (const name of [
    'Codex project configuration',
    'Claude project permission mode',
    'Gemini reads AGENTS.md directly',
    'OpenCode asks before editing or running shell commands',
  ]) {
    await page.getByRole('checkbox', { name, exact: false }).check();
  }
  await page.getByLabel('Scoped rule file ID', { exact: true }).fill('ui-guidance');
  await page.getByLabel('Scoped rule name', { exact: true }).fill('UI contracts');
  await page.getByLabel('File patterns', { exact: true }).fill('**/*.tsx, **/*.ts');
  await page
    .getByLabel('Scoped rule instructions', { exact: true })
    .fill('Preserve keyboard navigation and public component contracts.');
  await page.getByRole('button', { name: 'Add scoped rule', exact: true }).click();
  await page.getByRole('button', { name: 'Simple', exact: true }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('native-advanced');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await nav.getByRole('button', { name: 'AI Agents', exact: true }).click();
  await tabs.getByRole('button', { name: 'Assistants', exact: true }).click();
  for (const name of assistants)
    await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
  await expect
    .poll(async () => (await invoke('get_preferences')).defaults.options.ai.agents.length)
    .toBe(6);
  assert.equal((await invoke('get_preferences')).instructionPresets[0].profile.customText, custom);
  return { name: 'native-advanced', description, presetName: 'Tauri application', custom };
}
