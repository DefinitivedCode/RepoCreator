import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { prepare, navigate, fileTab, agentTab, createProject } from './fixtures';

// The same fixture and viewports produce comparable audit captures before/after changes.
test('visual audit of creation, settings and dialogs', async ({ page }, info) => {
  test.setTimeout(90_000);
  const directory = `artifacts/ui-polish/${process.env.UI_AUDIT_STAGE || 'after'}/${info.project.name}`;
  mkdirSync(directory, { recursive: true });
  const capture = async (name: string) => {
    await page.evaluate(async () => {
      // Native details transitions start on the next rendered frame. Wait for finite
      // transitions so screenshots show the completed UI, including pseudo-elements.
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled' });
  };
  await prepare(page);
  await page.getByLabel('Project name').fill('river-workbench');
  await page.getByLabel('Description').fill('A small desktop tool for local projects');
  await page.getByLabel('Project preset').selectOption('tauri');
  await page.getByLabel('AI coding assistant').selectOption('codex');
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture('overview-wide');
  await page.setViewportSize({ width: 1100, height: 740 });
  await capture('overview-default');
  await page.locator('.brief-details > summary').click();
  await capture('brief-expanded');
  await page.locator('.brief-details > summary').click();
  await page.getByRole('button', { name: 'Browse technologies' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capture('technology-dialog');
  await page.keyboard.press('Escape');
  await fileTab(page, 'README');
  await capture('files-default');
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture('files-wide');
  await agentTab(page, 'Assistants');
  await capture('assistants');
  await agentTab(page, 'Instructions');
  await capture('instructions');
  await agentTab(page, 'Specialists & Skills');
  await capture('specialists');
  await agentTab(page, 'Advanced');
  await page.getByText('Advanced AI configuration', { exact: true }).click();
  await capture('advanced');
  await navigate(page, 'AI Handoff');
  await capture('handoff');
  await navigate(page, 'Review');
  await capture('review');
  await page.getByRole('button', { name: 'Presets', exact: true }).click();
  await capture('presets');
  await page.getByRole('button', { name: 'Manage presets', exact: true }).click();
  await capture('preset-dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const tab of ['Git & identity', 'GitHub', 'Development tools', 'Appearance', 'Updates']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await capture(`settings-${tab.replaceAll(/[^a-z]/gi, '-').toLowerCase()}`);
  }
  await page.evaluate(() => {
    (window as any).testUpdateOffer = {
      version: '1.5.0',
      notes:
        '## Improvements\n\n- Clearer **file previews** and keyboard focus.\n- Consistent navigation and controls.\n\n### Verification\n\nRun `npm test` before creating a project.\n\n```sh\nnpm run build\n```\n\n[Project guide](https://github.com/DefinitivedCode/RepoCreator)',
    };
  });
  await page.getByRole('button', { name: 'Check for Updates', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Release notes' })).toBeVisible();
  await capture('settings-release-notes');
  await page.setViewportSize({ width: 820, height: 580 });
  await navigate(page, 'Overview');
  await capture('overview-minimum');
  await page.getByRole('button', { name: 'Browse technologies' }).click();
  await capture('technology-minimum');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1100, height: 740 });
  await createProject(page);
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  await capture('success');
});

test('disclosures, enlarged previews and accents remain accessible at desktop widths', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const directory = `artifacts/ui-polish/after/${info.project.name}`;
  mkdirSync(directory, { recursive: true });
  await prepare(page);
  await page
    .getByRole('textbox', { name: 'Project name', exact: true })
    .fill('accessible-workbench');
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  const details = page.locator('.brief-details');
  const summary = details.locator('summary');
  await summary.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(summary).toBeFocused();
  expect(await summary.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await summary.hover();
  await page.screenshot({
    path: `${directory}/disclosure-hover-focus.png`,
    animations: 'disabled',
  });
  await page.keyboard.press('Enter');
  await expect(details).toHaveJSProperty('open', true);
  await page.getByLabel('Who is it for?').fill('A local development team');
  await summary.press('Enter');
  await expect(details).toHaveJSProperty('open', false);

  // Sample rendered height in both directions, rather than assuming a CSS rule animates.
  if (await page.evaluate(() => CSS.supports('interpolate-size', 'allow-keywords'))) {
    for (const open of [true, false]) {
      const heights = await details.evaluate(async (el, open) => {
        const samples = [el.getBoundingClientRect().height];
        (el as HTMLDetailsElement).open = open;
        for (let frame = 0; frame < 16; frame++) {
          await new Promise(requestAnimationFrame);
          samples.push(el.getBoundingClientRect().height);
        }
        return samples;
      }, open);
      const lower = Math.min(heights[0], heights.at(-1)!);
      const upper = Math.max(heights[0], heights.at(-1)!);
      expect(heights.some((height) => height > lower + 1 && height < upper - 1)).toBe(true);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await summary.press('Enter');
  await expect(details).toHaveJSProperty('open', true);
  await expect(page.getByLabel('Who is it for?')).toHaveValue('A local development team');
  expect(await summary.evaluate((el) => getComputedStyle(el, '::before').transitionDuration)).toBe(
    '0s',
  );
  await summary.press('Enter');

  const context = page.getByRole('complementary', { name: 'Project context' });
  await context.getByRole('button', { name: '.gitignore', exact: true }).click();
  const raw = await context.getByLabel('.gitignore preview', { exact: true }).textContent();
  const expand = page.getByRole('button', { name: 'Expand preview' });
  await expand.click();
  const dialog = page.getByRole('dialog', { name: 'Generated files', exact: true });
  await expect(dialog.getByLabel('.gitignore preview', { exact: true })).toHaveText(raw!);
  await page.screenshot({ path: `${directory}/expanded-preview.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();

  for (const accent of ['Slate', 'Muted Gold', 'Copper']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await page.getByRole('radio', { name: accent, exact: true }).check();
    await navigate(page, 'Overview');
    for (const width of [1440, 820]) {
      await page.setViewportSize({ width, height: width === 820 ? 580 : 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(0);
      await expect(page.locator('.action-bar .primary')).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: `${directory}/accent-${accent.replaceAll(' ', '-')}-${width}.png`,
        animations: 'disabled',
      });
      if (width === 820) {
        const preview = page.getByRole('button', { name: 'Preview files', exact: true });
        await preview.click();
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(preview).toBeFocused();
      }
    }
  }
});
