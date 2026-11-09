import { expect, test } from '@playwright/test';
import { agentTab, fileTab, prepare, resultPreview } from './fixtures';

test('Save as preset saves the current configuration and handles duplicate names', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('Fictional workbench');
  const pane = await resultPreview(page, 'README.md');
  const preview = pane.getByLabel('README.md preview', { exact: true });
  await expect(preview).toHaveText('# Fictional workbench');
  const originalPreview = await preview.textContent();
  const trigger = page.getByRole('button', { name: 'Save as preset' });
  const dialog = page.getByRole('dialog', { name: 'Save as preset' });
  await trigger.click();
  const name = dialog.getByRole('textbox', { name: 'Preset name' });
  await expect(name).toBeFocused();
  await name.fill('My workbench');
  await name.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('option', { name: 'My workbench' })).toBeAttached();
  await expect(page.getByLabel('Starting point')).toHaveValue('');

  await trigger.click();
  await name.fill('my workbench');
  await dialog.getByRole('button', { name: 'Save preset' }).click();
  await expect(dialog.getByRole('alert')).toContainText('already exists');
  await expect(name).toHaveValue('my workbench');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(preview).toHaveText(originalPreview!);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  const requests = await page.evaluate(() => {
    const calls = (window as any).testCalls;
    return {
      preview: calls.findLast((call: any) => call.command === 'preview_files').payload.request,
      create: calls.findLast((call: any) => call.command === 'create_repository').payload.request,
      saved: calls.find((call: any) => call.command === 'save_custom_preset').payload.configuration,
    };
  });
  expect(requests.create).toEqual(
    expect.objectContaining({
      readme: requests.preview.readme,
      options: requests.preview.options,
    }),
  );
  expect(requests.saved).toEqual(
    expect.objectContaining({
      readme: requests.preview.readme,
      options: requests.preview.options,
    }),
  );
});

for (const [width, height] of [
  [820, 580],
  [1100, 740],
  [1440, 900],
]) {
  test(`result tree supports keyboard use and path search at ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      (window as any).testExtraFiles = 2;
    });
    await prepare(page, false, 'simple');
    const pane = await resultPreview(page, 'README.md');
    const tree = pane.getByRole('list', { name: 'Planned generated files' });
    const nested = tree.locator('details details');
    const file = nested.getByRole('button', { name: 'generated/nested/file-1.md' });
    const summary = nested.locator('summary');
    await expect(pane.locator('.context-count')).toHaveText('4');
    await expect(summary).toHaveText('nested/');
    await summary.focus();
    await summary.press('Space');
    await expect(file).toBeHidden();
    await summary.press('Enter');
    await summary.press('Tab');
    await expect(nested.getByRole('button', { name: 'generated/nested/file-0.md' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(file).toBeFocused();
    await file.press('Enter');
    await expect(file).toHaveAttribute('aria-pressed', 'true');
    await expect(pane.getByLabel('generated/nested/file-1.md preview')).toHaveText(
      'Generated preview 1',
    );

    const search = pane.getByRole('searchbox', { name: 'Find generated files' });
    await search.fill('NESTED/file-1');
    await search.press('Enter');
    await expect(tree.getByRole('button')).toHaveCount(1);
    await expect(file).toBeVisible();
    await expect(pane.locator('.context-count')).toHaveText('4');
    if (process.env.REPO_CREATOR_BASELINE === '1')
      await page.screenshot({
        path: `artifacts/redesign-group1/${test.info().project.name}/${width}-result.png`,
        animations: 'disabled',
      });
    await pane.getByRole('button', { name: 'Expand preview' }).click();
    const expanded = page.getByRole('dialog', { name: 'Generated files' });
    await expect(expanded.getByRole('searchbox', { name: 'Find generated files' })).toBeVisible();
    await expect(expanded.getByLabel('generated/nested/file-1.md preview')).toHaveText(
      'Generated preview 1',
    );
  });

  test(`Customize opens the appropriate editor at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepare(page, false, 'simple');
    const main = page.getByRole('main', { name: 'Repository configuration' });
    const back = main.getByRole('button', { name: 'Back', exact: true });
    const filesTrigger = main.getByRole('button', { name: /^Customize files/ });
    const agentsTrigger = main.getByRole('button', { name: /^Customize AI agents/ });
    const focused = width <= 1100;
    const capture = async (view: string) => {
      if (process.env.REPO_CREATOR_BASELINE === '1')
        await page.screenshot({
          path: `artifacts/redesign-group1/${test.info().project.name}/${width}-${view}.png`,
          animations: 'disabled',
        });
    };

    await main.getByRole('button', { name: 'Save as preset' }).click();
    const save = page.getByRole('dialog', { name: 'Save as preset' });
    await expect(save).toBeVisible();
    await capture('preset');
    await save.getByRole('button', { name: 'Cancel' }).click();

    await fileTab(page, 'Git Settings');
    const branch = main.getByLabel('Initial branch', { exact: true });
    await branch.fill('integration');
    if (focused) {
      await expect(main.getByRole('heading', { name: 'Project Files', level: 1 })).toBeVisible();
      await expect(main.getByRole('heading', { name: 'Overview' })).toBeHidden();
      await capture('files');
      await back.click();
      await expect(filesTrigger).toBeFocused();
      await filesTrigger.press('Enter');
      await expect(back).toBeFocused();
      await expect(branch).toHaveValue('integration');
    } else {
      await expect(back).toHaveCount(0);
      await expect(filesTrigger).toHaveAttribute('aria-expanded', 'true');
      await expect(main.getByRole('heading', { name: 'Overview' })).toBeAttached();
      await capture('files');
    }

    await agentTab(page, 'Assistants');
    await main.getByLabel('Generate AI agent files').check();
    await agentTab(page, 'Instructions');
    const instructions = main.getByLabel('Additional project instructions');
    await instructions.fill('Preserve this project instruction.');
    await capture('agents');
    if (focused) {
      await expect(main.getByRole('heading', { name: 'AI Agents', level: 1 })).toBeVisible();
      await back.click();
      await expect(agentsTrigger).toBeFocused();
      await agentsTrigger.press('Space');
      await expect(back).toBeFocused();
      await expect(instructions).toHaveValue('Preserve this project instruction.');
    } else {
      await expect(back).toHaveCount(0);
      await expect(agentsTrigger).toHaveAttribute('aria-expanded', 'true');
    }
  });
}
