import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { prepare } from './fixtures';

async function openAppearance(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  return page.getByRole('tabpanel', { name: 'Appearance', exact: true });
}
const accentCalls = (page: Page) =>
  page.evaluate(() =>
    (window as any).testCalls.filter((call: any) => call.command === 'set_accent'),
  );

test('appearance themes and accent presets apply live through native preferences', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  const panel = await openAppearance(page);
  await expect(panel.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await expect(panel.getByRole('radio', { name: 'Muted Teal', exact: true })).toBeChecked();
  for (const [name, theme] of [
    ['Dark', 'dark'],
    ['Light', 'light'],
    ['System', 'system'],
  ] as const) {
    await panel.getByRole('radio', { name, exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-appearance', theme);
  }
  for (const [name, id] of [
    ['Slate', 'slate'],
    ['Muted Gold', 'gold'],
    ['Copper', 'copper'],
    ['Monochrome', 'monochrome'],
    ['Muted Teal', 'teal'],
  ] as const) {
    await panel.getByRole('radio', { name, exact: true }).check();
    await expect(panel.getByRole('radio', { name, exact: true })).toBeChecked();
    await expect.poll(async () => (await accentCalls(page)).at(-1)?.payload.accent).toBe(id);
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const preview = getComputedStyle(document.querySelector('.appearance-preview')!);
      return {
        actual: root.getPropertyValue('--primary'),
        preview: preview.getPropertyValue('--primary'),
      };
    });
    expect(colors.preview).toBe(colors.actual);
  }
  await page.getByRole('tab', { name: 'Appearance', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Git & identity' })).toBeFocused();
});

test('System follows OS appearance changes while explicit themes stay fixed and the header has no theme controls', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  const header = page.locator('.app-header');
  await expect(header.getByRole('combobox')).toHaveCount(0);
  await expect(header.getByRole('radio')).toHaveCount(0);
  const panel = await openAppearance(page);
  const token = () =>
    page
      .locator('html')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('--accent'));
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await token();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(token).not.toBe(light);
  const dark = await token();
  await expect(panel.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await panel.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect.poll(token).toBe(light);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(token).toBe(light);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(token).toBe(light);
  await panel.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect.poll(token).toBe(dark);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(token).toBe(dark);
  await expect(header.getByRole('combobox')).toHaveCount(0);
  await expect(header.getByRole('radio')).toHaveCount(0);
});

test('invalid custom drafts leave saved colors unchanged; valid picker changes persist and reset restores defaults', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testPersistPreferences = true;
  });
  await prepare(page, false, 'simple');
  let panel = await openAppearance(page);
  const prior = await page
    .locator('html')
    .evaluate((element) => getComputedStyle(element).getPropertyValue('--accent'));
  const before = (await accentCalls(page)).length;
  for (const draft of ['#ZZZZZZ', '#12', '#123', 'invalid']) {
    await panel.getByLabel('Hex color', { exact: true }).fill(draft);
    await expect(panel.getByRole('alert')).toContainText('six-digit hex color');
    expect((await accentCalls(page)).length).toBe(before);
    expect(
      await page
        .locator('html')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--accent')),
    ).toBe(prior);
    await expect(panel.getByRole('radio', { name: 'Muted Teal', exact: true })).toBeChecked();
  }
  await panel.getByLabel('Hex color', { exact: true }).fill('#436F7A');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByRole('radio', { name: 'Custom', exact: true })).toBeChecked();
  await expect
    .poll(async () => (await accentCalls(page)).at(-1)?.payload)
    .toMatchObject({ accent: 'custom', customAccent: '#436F7A' });
  await panel.getByLabel('Custom accent color', { exact: true }).fill('#B29A57');
  await expect(panel.getByLabel('Hex color', { exact: true })).toHaveValue('#B29A57');
  await panel.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.reload();
  panel = await openAppearance(page);
  await expect(panel.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(panel.getByRole('radio', { name: 'Custom', exact: true })).toBeChecked();
  await expect(panel.getByLabel('Hex color', { exact: true })).toHaveValue('#B29A57');
  await panel.getByRole('button', { name: 'Reset to default', exact: true }).click();
  await expect(panel.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await expect(panel.getByRole('radio', { name: 'Muted Teal', exact: true })).toBeChecked();
  await expect(panel.getByLabel('Hex color', { exact: true })).toHaveValue('#4FA69B');
  await expect
    .poll(async () => (await accentCalls(page)).at(-1)?.payload)
    .toMatchObject({ accent: 'teal', customAccent: '#4FA69B' });
});

test('appearance controls remain reachable with a bounded preview at supported dimensions', async ({
  page,
}, info) => {
  await prepare(page, false, 'simple');
  const panel = await openAppearance(page);
  const output = 'artifacts/refinement-appearance-tests';
  mkdirSync(output, { recursive: true });
  for (const [name, width, height] of [
    ['default', 1100, 740],
    ['minimum', 820, 580],
    ['wide', 1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(panel.getByRole('radio', { name: 'Custom', exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Reset to default' }).scrollIntoViewIfNeeded();
    await expect(panel.getByRole('button', { name: 'Reset to default' })).toBeInViewport();
    if (name === 'minimum')
      await page.screenshot({
        path: `${output}/${info.project.name}-minimum-appearance-controls.png`,
      });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
    await page
      .getByRole('main', { name: 'Application settings' })
      .evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${info.project.name}-${name}-appearance.png` });
  }
});
