import { expect, test, type Page } from '@playwright/test';

// Component-level checks of the primitives in src/ui, using the development-only
// kitchen-sink page. No IPC mock is needed: the primitives do not call the backend.
async function open(page: Page) {
  await page.goto('/?kitchen-sink');
  const heading = page.getByRole('heading', { name: 'Primitives', level: 1 });
  try {
    await expect(heading).toBeVisible({ timeout: 10_000 });
  } catch {
    // The dev server can occasionally leave a first load without its modules; reload once.
    await page.reload();
    await expect(heading).toBeVisible({ timeout: 20_000 });
  }
}

test('the kitchen sink renders every primitive without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await open(page);
  for (const heading of ['Buttons', 'Fields', 'Tabs', 'Status rows', 'Disclosure', 'Icons'])
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an unavailable button stays focusable, does nothing, and explains why', async ({ page }) => {
  await open(page);
  const button = page.getByRole('button', { name: 'Unavailable with reason' });
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(button).not.toHaveAttribute('disabled', '');
  await button.focus();
  await expect(button).toBeFocused();
  const reasonId = await button.getAttribute('aria-describedby');
  expect(reasonId).toBeTruthy();
  await expect(page.locator(`[id="${reasonId}"]`)).toHaveText('Add a project name first.');
  await expect(button).toHaveAccessibleDescription('Add a project name first.');
});

test('tabs follow the ARIA pattern with roving tabindex and arrow, Home and End keys', async ({
  page,
}) => {
  await open(page);
  const tabs = page.getByRole('tablist', { name: 'Example sections' }).getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(0)).toHaveAttribute('tabindex', '0');
  await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Panel for two.');
  await expect(page.getByRole('tabpanel')).toHaveAccessibleName(/Readiness/);
  await page.keyboard.press('End');
  await expect(tabs.nth(2)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(2)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  // The count badge is announced as text, not just shown.
  await expect(tabs.nth(1)).toHaveAccessibleName('Readiness 2 need attention');
});

test('a disclosure toggles aria-expanded and hides its content', async ({ page }) => {
  await open(page);
  const trigger = page.getByRole('button', { name: /Customize/ });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Advanced settings appear here.')).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Advanced settings appear here.')).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('fields wire labels, helper and error text, and state optional in words', async ({ page }) => {
  await open(page);
  const name = page.getByLabel('Project name');
  await expect(name).toHaveAccessibleDescription('Letters, numbers and hyphens.');
  const email = page.getByLabel('Email');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAccessibleDescription('Enter an email like name@example.com');
  await expect(page.getByText('(Optional)')).toBeVisible();
});

test('status rows and banners state their meaning in text and use the right live role', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByText('Git is installed: Ready')).toBeAttached();
  await expect(page.getByText('Commit identity: Needs attention')).toBeAttached();
  await expect(page.getByText('GitHub: Not set up')).toBeAttached();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.getByRole('status').filter({ hasText: 'Heads up' })).toBeVisible();
});

test('a dialog traps focus, closes with Escape and returns focus', async ({ page }) => {
  await open(page);
  const trigger = page.getByRole('button', { name: 'Open dialog' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Remove from history?' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  // The platform keeps focus inside a modal dialog: Tab may reach browser chrome
  // (the body) but never an element behind the dialog.
  for (let press = 0; press < 6; press++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate(
        (element) =>
          element.contains(document.activeElement) ||
          !document.activeElement ||
          document.activeElement === document.body,
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('toasts are announced in a persistent status region and can be dismissed', async ({
  page,
}) => {
  await open(page);
  const region = page.locator('.ui-toast-region');
  await expect(region).toHaveAttribute('role', 'status');
  await expect(region).toHaveAttribute('aria-live', 'polite');
  await page.getByRole('button', { name: 'Show toast' }).click();
  await expect(region).toContainText('Preset saved.');
  await region.getByRole('button', { name: 'Dismiss' }).click();
  await expect(region).not.toContainText('Preset saved.');
});

test('tokens: scale, minimum text size, radii and reduced motion', async ({ page }) => {
  await open(page);
  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => style.getPropertyValue(name).trim();
    return {
      control: read('--control-default'),
      radiusControl: read('--radius-control'),
      radiusPanel: read('--radius-panel'),
      body: read('--fs-body'),
      caption: read('--fs-caption'),
    };
  });
  expect(tokens).toMatchObject({
    control: '32px',
    radiusControl: '6px',
    radiusPanel: '8px',
    body: '14px',
    caption: '12px',
  });
  // Nothing rendered by a primitive is smaller than 12px.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter(
        (element) =>
          element.childNodes.length &&
          [...element.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()),
      )
      .map((element) => ({
        text: element.textContent?.slice(0, 30),
        size: parseFloat(getComputedStyle(element).fontSize),
      }))
      .filter((item) => item.size < 12),
  );
  expect(small).toEqual([]);
  // Motion is short, and removed entirely when the system asks for reduced motion.
  const duration = () =>
    page
      .locator('.ui-button')
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(await duration()).toBe('0.16s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await duration()).toBe('0s');
});

test('every accent keeps a readable primary button in both themes', async ({ page }) => {
  await open(page);
  // Read settled colours, not a mid-transition frame.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const accents = ['slate', 'teal', 'gold', 'copper', 'monochrome', 'custom'];
  for (const theme of ['Light', 'Dark'])
    for (const accent of accents) {
      await page.getByRole('button', { name: theme, exact: true }).click();
      await page.getByRole('button', { name: accent, exact: true }).click();
      const ratio = await page.evaluate(() => {
        const primary = document.querySelector('.ui-button[data-variant="primary"]')!;
        const style = getComputedStyle(primary);
        const channels = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const luminance = (rgb: number[]) => {
          const [r, g, b] = rgb.map((c) => {
            const v = c / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const a = luminance(channels(style.backgroundColor));
        const b = luminance(channels(style.color));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio, `${accent} ${theme}`).toBeGreaterThanOrEqual(4.5);
    }
});

test('keyboard focus is visible on every primitive', async ({ page }) => {
  await open(page);
  for (const target of [
    page.getByRole('button', { name: 'Primary', exact: true }),
    page.getByRole('tab', { name: 'Overview' }),
    page.getByRole('button', { name: /Customize/ }),
  ]) {
    await target.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await target.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  }
});
