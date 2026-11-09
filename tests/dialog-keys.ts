import { expect, test, type Locator, type Page } from '@playwright/test';

export async function expectDialogKeys(
  page: Page,
  dialog: Locator,
  trigger: Locator,
  initial?: Locator,
) {
  await expect(dialog).toBeVisible();
  if (initial) await expect(initial).toBeFocused();
  const isInside = () => dialog.evaluate((element) => element.contains(document.activeElement));
  await expect.poll(isInside, 'opening focus is inside the dialog').toBe(true);
  const count = await dialog.evaluate(
    (element) =>
      [
        ...element.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, a[href], summary, [tabindex]',
        ),
      ].filter(
        (item) => item.tabIndex >= 0 && !item.matches(':disabled') && item.getClientRects().length,
      ).length,
  );
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let press = 0; press <= count; press++) {
      await page.keyboard.press(key);
      expect(await isInside(), `${key} ${press + 1} stays inside the dialog`).toBe(true);
    }
  }
  expect(
    await dialog.locator('button[data-variant="primary"]:visible').count(),
  ).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

export async function captureFocus(page: Page, view: string) {
  if (process.env.REPO_CREATOR_BASELINE !== '1') return;
  const original = page.viewportSize()!;
  for (const [width, height] of [
    [820, 580],
    [1100, 740],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `artifacts/redesign-group4/${test.info().project.name}/${width}-${view}.png`,
      animations: 'disabled',
    });
  }
  await page.setViewportSize(original);
}
