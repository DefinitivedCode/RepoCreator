import { setMode } from './mode.mjs';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Configure the production UI; generation and creation remain in native Rust.
export async function configureNativeStudio({ page, invoke, verifyOverview }) {
  await setMode(page, 'advanced');
  await page.getByLabel('Starting point', { exact: true }).selectOption('tauri');
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('native-advanced');
  const description = 'Production workspace verification with six optional assistants.';
  await page.getByRole('textbox', { name: 'Description', exact: false }).fill(description);
  await verifyOverview?.('advanced');
  const nav = page.getByRole('navigation', { name: 'Project setup' });
  const fileTabs = page.getByRole('tablist', { name: 'Project file settings' });
  await nav.getByRole('button', { name: 'Project Files', exact: true }).click();
  await page.getByRole('combobox', { name: /^README/ }).selectOption('custom');
  await page
    .getByLabel('Overview content', { exact: true })
    .fill('Keep the native contracts intact.');
  await fileTabs.getByRole('tab', { name: 'License', exact: true }).click();
  await page.getByLabel('License type', { exact: true }).selectOption('MIT');
  await page.getByLabel('Copyright holder', { exact: true }).fill('Native Smoke Author');
  await fileTabs.getByRole('tab', { name: 'Git Settings', exact: true }).click();
  await page.getByLabel('Initial branch', { exact: true }).fill('work/start');
  await page.getByLabel('Initial commit message', { exact: true }).fill('Start verified workspace');
  await fileTabs.getByRole('tab', { name: 'Gitignore', exact: true }).click();
  for (const pattern of ['scratch/*', '!scratch/keep.txt', 'AGENTS.md']) {
    await page.getByLabel('Custom patterns', { exact: true }).fill(pattern);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await nav.getByRole('button', { name: 'AI Agents', exact: true }).click();
  await page.getByLabel('Generate AI agent files', { exact: true }).check();
  const { studio: catalog } = await invoke('get_catalog');
  const assistants = catalog.agents.map((agent) => agent.name);
  assert.equal(assistants.length, 6);
  for (const name of assistants) await page.getByRole('checkbox', { name, exact: true }).check();
  const tabs = page.getByRole('tablist', { name: 'AI agent settings' });
  await tabs.getByRole('tab', { name: 'Instructions', exact: true }).click();
  await page.getByLabel('Instruction preset', { exact: true }).selectOption('autonomous');
  const custom = 'Preserve café and 日本語 🦀.\n<script>window.injected = true</script>\n';
  await page.getByLabel('Additional project instructions', { exact: false }).fill(custom);
  await page.getByLabel('Save instructions as', { exact: true }).fill('Native team rules');
  await page.getByRole('button', { name: 'Save instructions', exact: true }).click();
  await expect
    .poll(async () => (await invoke('get_preferences')).instructionPresets.length)
    .toBe(1);
  await tabs.getByRole('tab', { name: 'Specialists & Skills', exact: true }).click();
  await page.locator('.specialist-panel > summary').click();
  for (const { name } of [...catalog.specialists, ...catalog.skills]) {
    await page.getByRole('checkbox', { name, exact: true }).check();
  }
  await tabs.getByRole('tab', { name: 'Advanced', exact: true }).click();
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
  await setMode(page, 'simple');
  // The old switch also returned to Overview; do that explicitly.
  await nav.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue(
    'native-advanced',
  );
  await setMode(page, 'advanced');
  await nav.getByRole('button', { name: 'AI Agents', exact: true }).click();
  // Assistants are the section's always-visible content now; no tab to click.
  for (const name of assistants)
    await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
  await expect
    .poll(async () => (await invoke('get_preferences')).defaults.options.ai.agents.length)
    .toBe(6);
  assert.equal((await invoke('get_preferences')).instructionPresets[0].profile.customText, custom);
  return {
    name: 'native-advanced',
    description,
    presetName: 'Tauri application',
    custom,
    specialists: catalog.specialists.map((role) => role.id),
    skills: catalog.skills.map((skill) => skill.id),
  };
}
