import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { prepare, navigate, fileTab, agentTab } from './fixtures';

async function contained(page: Page) {
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    height: document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
  }));
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.height).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  await expect(page.locator('.action-bar .primary')).toBeInViewport({ ratio: 1 });
}

test('file editors show exact shared previews and retain useful layouts across supported windows', async ({
  page,
}, info) => {
  await prepare(page);
  await page.getByLabel('Project name').fill('river-workbench');
  mkdirSync('artifacts/refinement-editors', { recursive: true });
  for (const [tab, file] of [
    ['README', 'README.md'],
    ['Gitignore', '.gitignore'],
    ['License', 'LICENSE'],
  ] as const) {
    await fileTab(page, tab);
    if (tab === 'License') {
      await page.getByLabel('License type', { exact: true }).selectOption('MIT');
      await page.getByLabel('Copyright holder', { exact: true }).fill('Example Author');
    }
    const preview = page.getByLabel('File contents', { exact: true });
    await expect(preview.getByLabel(`${file} preview`, { exact: true })).toBeVisible();
    const expected = await page.evaluate(async (file) => {
      const calls = (window as any).testCalls.filter(
        (entry: any) => entry.command === 'preview_files',
      );
      const request = calls.at(-1).payload.request;
      const files = await (window as any).__TAURI_INTERNALS__.invoke('preview_files', { request });
      return files.find((entry: any) => entry.path === file).content;
    }, file);
    await expect(preview.getByLabel(`${file} preview`, { exact: true })).toHaveText(expected);
    await page.screenshot({
      path: `artifacts/refinement-editors/${tab.toLowerCase()}-${info.project.name}.png`,
    });
  }
  await fileTab(page, 'Additional Files');
  await expect(page.getByLabel('File contents', { exact: true })).toBeVisible();
  await page.screenshot({
    path: `artifacts/refinement-editors/additional-${info.project.name}.png`,
  });
  await fileTab(page, 'Git Settings');
  await expect(page.getByLabel('Initial commit plan')).toContainText('Initial commit');
  await page.screenshot({ path: `artifacts/refinement-editors/git-${info.project.name}.png` });
  for (const size of [
    { width: 820, height: 580 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await fileTab(page, 'License');
    await contained(page);
    const columns = await page
      .locator('.file-editor-layout')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(size.width > 1000 ? 2 : 1);
  }
});

test('assistant formats are discoverable and instruction editing has a persistent shared preview', async ({
  page,
}, info) => {
  await prepare(page);
  await page.getByLabel('Project name').fill('river-workbench');
  await agentTab(page, 'Assistants');
  await page.getByLabel('Generate AI agent files').check();
  await page.getByRole('checkbox', { name: 'Claude Code', exact: true }).check();
  await expect(page.locator('.assistant-options')).toBeVisible();
  await page.screenshot({
    path: `artifacts/refinement-editors/assistants-${info.project.name}.png`,
  });
  await agentTab(page, 'Instructions');
  await page.getByLabel('Additional project instructions').fill('Keep the project approachable.');
  await expect(
    page
      .getByRole('region', { name: 'Shared instruction preview' })
      .getByLabel('AGENTS.md preview'),
  ).toContainText('Keep the project approachable.');
  await page.screenshot({
    path: `artifacts/refinement-editors/instructions-${info.project.name}.png`,
  });
  await navigate(page, 'Review');
  await expect(page.locator('.review-summary-card')).toContainText('river-workbench');
  await page
    .getByRole('group', { name: 'Preview file' })
    .getByRole('button', { name: 'AGENTS.md', exact: true })
    .click();
  await expect(page.getByLabel('AGENTS.md preview')).toBeVisible();
  await page.screenshot({ path: `artifacts/refinement-editors/review-${info.project.name}.png` });
  await contained(page);
});
