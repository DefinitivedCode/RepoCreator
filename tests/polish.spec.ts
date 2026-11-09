import { expect, test, type Page } from '@playwright/test';
import { navigate, prepare } from './fixtures';

const main = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });

/** Computed side stripes: an inset box-shadow with a horizontal offset, or a visible left border. */
async function sideStripe(locator: ReturnType<Page['locator']>) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const shadow = style.boxShadow.split(/,(?![^(]*\))/).some((part) => {
      const tokens = part
        .replace(/\([^)]*\)/g, '()')
        .trim()
        .split(/\s+/);
      const first = tokens.find((token) => /^-?[\d.]+(px)?$/.test(token));
      return tokens.includes('inset') && !!first && parseFloat(first) !== 0;
    });
    return {
      shadow,
      // A stripe is a left edge that differs from the right edge, not an even outline.
      stripe:
        parseFloat(style.borderLeftWidth) > parseFloat(style.borderRightWidth) ||
        (parseFloat(style.borderLeftWidth) > 0 && style.borderLeftColor !== style.borderRightColor),
    };
  });
}

test('selected sidebar items and rail items carry no side stripe', async ({ page }) => {
  await prepare(page, false, 'simple');
  for (const name of ['New Project', 'Projects', 'Presets', 'Settings']) {
    await main(page).getByRole('button', { name, exact: true }).click();
    const current = main(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    const stripe = await sideStripe(current);
    expect(stripe.shadow, `${name} shadow`).toBe(false);
    expect(stripe.stripe, `${name} border`).toBe(false);
    await expect(current).toHaveCSS('font-weight', '600');
  }
  await main(page).getByRole('button', { name: 'New Project', exact: true }).click();
  const rail = page
    .getByRole('navigation', { name: 'Project setup' })
    .locator('.nav-item.active, [aria-current="page"], [aria-current="step"]');
  await expect(rail.first()).toBeVisible();
  const stripe = await sideStripe(rail.first());
  expect(stripe.shadow).toBe(false);
  expect(stripe.stripe).toBe(false);
});

test('settings use one 720px measure and state readiness once', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page, false, 'simple');
  await navigate(page, 'Setup & status');
  for (const tab of ['General', 'Appearance', 'Updates']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel).toBeVisible();
    const width = (await panel.boundingBox())!.width;
    expect(width, `${tab} panel width`).toBeLessThanOrEqual(720.5);
  }
  await page.getByRole('tab', { name: 'Setup', exact: true }).click();
  await expect(page.getByText('Git ready', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Ready for local projects')).toHaveCount(0);
  // No horizontal page scroll at the minimum window.
  await page.setViewportSize({ width: 820, height: 580 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('no visible text is smaller than 12px or all caps', async ({ page }) => {
  await prepare(page, false, 'simple');
  for (const name of ['New Project', 'Projects', 'Presets', 'Settings']) {
    await main(page).getByRole('button', { name, exact: true }).click();
    const offenders = await page.evaluate(() => {
      const bad: string[] = [];
      for (const element of document.querySelectorAll<HTMLElement>('body *')) {
        if (!element.childNodes.length || !element.offsetParent) continue;
        const hasText = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (!hasText) continue;
        const style = getComputedStyle(element);
        if (parseFloat(style.fontSize) < 12)
          bad.push(`${element.className} font ${style.fontSize}`);
        if (style.textTransform === 'uppercase') bad.push(`${element.className} uppercase`);
      }
      return bad;
    });
    expect(offenders, name).toEqual([]);
  }
});
