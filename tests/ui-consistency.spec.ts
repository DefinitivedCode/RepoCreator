import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { prepare } from './fixtures';

test('creation status bar contains and aligns Git readiness, summary, validation and action', async ({
  page,
}, info) => {
  mkdirSync('artifacts/footer-review', { recursive: true });
  await prepare(page, false, 'simple');
  const footer = page.locator('.creation-status-bar');
  const action = footer.locator('.create-button');
  await expect(footer.getByRole('button', { name: 'Git ready', exact: true })).toHaveCount(1);
  await expect(
    page
      .getByRole('navigation', { name: 'Project setup' })
      .getByRole('button', { name: 'Git ready', exact: true }),
  ).toHaveCount(0);
  await expect(footer.getByRole('status')).toHaveText('Enter a project name.');
  await page.getByLabel('Project name', { exact: true }).fill('field-notes');
  await page.getByRole('button', { name: 'Computer and GitHub', exact: true }).click();
  await expect(footer.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  await expect(footer).toContainText('Private GitHub repository');
  for (const size of [
    { width: 820, height: 580 },
    { width: 1100, height: 740 },
    { width: 1500, height: 900 },
  ]) {
    await page.setViewportSize(size);
    const geometry = await footer.evaluate((element) => {
      const rects = [
        '.creation-git-status',
        '.footer-summary',
        '.creation-validation',
        '.create-button',
      ].map((selector) => element.querySelector(selector)!.getBoundingClientRect());
      return {
        center: rects.map((rect) => rect.y + rect.height / 2),
        ordered: rects.every((rect, index) => index === 0 || rects[index - 1].right < rect.left),
        gitLeft: rects[0].left,
        gitRight: rects[0].right,
        bottom: element.getBoundingClientRect().bottom,
      };
    });
    expect(geometry.ordered).toBe(true);
    expect(Math.max(...geometry.center) - Math.min(...geometry.center)).toBeLessThanOrEqual(1);
    expect(geometry.bottom).toBe(size.height);
    const rail = await page.getByRole('navigation', { name: 'Project setup' }).boundingBox();
    expect(geometry.gitLeft).toBeGreaterThanOrEqual(rail!.x);
    expect(geometry.gitRight).toBeLessThanOrEqual(rail!.x + rail!.width);
    await expect(footer.getByRole('button', { name: 'Git ready', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(action).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: `artifacts/footer-review/${info.project.name}-${size.width}.png`,
      animations: 'disabled',
    });
  }
  await footer.getByRole('button', { name: 'Git ready', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(action).toBeFocused();
  await action.click();
  await expect(action).toHaveText('Create Project');
  await expect(footer.getByRole('button', { name: 'Git ready', exact: true })).toHaveCount(1);
  await page
    .getByRole('navigation', { name: 'Project setup' })
    .getByRole('button', { name: 'Overview', exact: true })
    .click();
  await page.getByLabel('Project name', { exact: true }).fill('');
  await expect(footer.getByRole('status')).toHaveText('Enter a project name.');
  await expect(action).toBeDisabled();
});

test('Git readiness uses success colour and setup failures remain neutral', async ({ page }) => {
  await prepare(page, false, 'simple');
  const success = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--success)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  await expect(page.locator('.creation-git-status .status-dot')).toHaveCSS(
    'background-color',
    success,
  );
  await page.getByRole('button', { name: 'Git ready', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.settings-page .git-readiness .status-dot')).toHaveCSS(
    'background-color',
    success,
  );
  expect(
    await page
      .locator('.setup-status[data-ready="true"]')
      .first()
      .evaluate((el) => getComputedStyle(el, '::before').color),
  ).toBe(success);
  await page.evaluate(() => {
    (window as any).testEnvironment = { gitInstalled: false, identityReady: false };
  });
  await page.getByRole('button', { name: 'Recheck', exact: true }).click();
  await expect(page.locator('.settings-page .git-readiness')).toHaveAttribute(
    'data-ready',
    'false',
  );
  await expect(page.locator('.settings-page .git-readiness .status-dot')).not.toHaveCSS(
    'background-color',
    success,
  );
});

test('Settings shares library gutters and keeps fields bounded', async ({ page }) => {
  await prepare(page, false, 'simple');
  for (const size of [
    { width: 820, height: 580 },
    { width: 1100, height: 740 },
    { width: 1500, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Presets', exact: true })
      .click();
    const library = await page.locator('.page-heading').boundingBox();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    const settings = await page.locator('.page-heading').boundingBox();
    expect(settings!.x).toBe(library!.x);
    expect(settings!.width).toBe(library!.width);
    const tabs = await page.getByRole('tablist', { name: 'Settings sections' }).boundingBox();
    expect(tabs!.x).toBe(settings!.x);
    expect(tabs!.width).toBe(settings!.width);
    expect(
      await page
        .getByLabel('Your name for this project')
        .evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(400);
    expect(
      await page.getByRole('main').evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(0);
    await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Muted Teal', exact: true })).toBeChecked();
  }
});
