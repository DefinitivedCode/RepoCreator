import { expect } from '@playwright/test';

export const scrollSizes = [
  { width: 540, height: 780 },
  { width: 440, height: 560 },
  { width: 900, height: 620 },
  { width: 640, height: 1000 },
];

// Shared by Edge regressions and the real production WebView2 smoke test.
export async function verifyExpandedScrolling(page, resize = (size) => page.setViewportSize(size)) {
  const content = page.getByRole('main', { name: 'Repository configuration' });
  const top = () => content.evaluate((el) => el.scrollTop);
  const atBottom = () => content.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
  const home = async () => {
    await content.focus();
    await page.keyboard.press('Control+Home');
    await expect.poll(top).toBe(0);
  };
  const end = async () => {
    await content.focus();
    await page.keyboard.press('Control+End');
    await expect.poll(atBottom).toBeLessThanOrEqual(1);
    expect(
      await page.locator('.file-preview').evaluate((el) => {
        const main = document.querySelector('.content').getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        return rect.bottom <= main.bottom - 15 && rect.bottom > main.top;
      }),
    ).toBe(true);
  };
  for (const selector of ['.ignore-panel', '.agent-panel', '.advanced-panel', '.file-preview']) {
    if (!(await page.locator(selector).evaluate((el) => el.open))) {
      await page.locator(`${selector} > summary`).click();
    }
  }
  await expect(page.locator('.file-preview .preview')).toBeVisible();

  for (const size of scrollSizes) {
    await resize(size);
    await expect
      .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual(size);
    await home();
    await page.keyboard.press('PageDown');
    await expect.poll(top).toBeGreaterThan(0);

    const firstPreset = page.getByLabel('Operating system files', { exact: true });
    await firstPreset.scrollIntoViewIfNeeded();
    await firstPreset.hover();
    const beforeWheel = await top();
    await page.mouse.wheel(0, 100);
    await expect.poll(top).toBeGreaterThan(beforeWheel);
    const beforeTouchpad = await top();
    // Fractional pixel deltas exercise the same native wheel path as a touchpad.
    await page.mouse.wheel(0, 23.5);
    await expect.poll(top).toBeGreaterThan(beforeTouchpad);

    await end();
    const geometry = await page.evaluate(() => {
      const main = document.querySelector('.content');
      const footer = document.querySelector('.action-bar').getBoundingClientRect();
      const bounds = main.getBoundingClientRect();
      const nested = [...main.querySelectorAll('*')]
        .filter((el) => {
          const style = getComputedStyle(el);
          return (
            el.getClientRects().length &&
            /auto|scroll/.test(style.overflowY) &&
            el.scrollHeight > el.clientHeight + 1 &&
            !el.matches('pre,textarea')
          );
        })
        .map((el) => el.className);
      const clipped = [...main.querySelectorAll('label,button,select,textarea,input,summary,h3,p')]
        .filter((el) => el.getClientRects().length && el.checkVisibility())
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.left < bounds.left ||
            rect.right > bounds.right - (main.offsetWidth - main.clientWidth) + 1
          );
        })
        .map((el) => el.textContent || el.id);
      return {
        nested,
        clipped,
        footer: footer.bottom,
        contentBottom: bounds.bottom,
        footerTop: footer.top,
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
      };
    });
    expect(geometry.nested).toEqual([]);
    expect(geometry.clipped).toEqual([]);
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.footer).toBe(size.height);
    expect(geometry.contentBottom).toBe(geometry.footerTop);
    await expect(page.getByRole('button', { name: 'Create Repository' })).toBeInViewport({
      ratio: 1,
    });

    // Keyboard navigation must reveal the final Advanced setting above the fixed footer.
    const lastSetting = page
      .locator('.advanced-body .settings-section:last-child input:enabled')
      .last();
    await lastSetting.focus();
    await expect(lastSetting).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Tab');
    await expect(page.locator('.file-preview > summary')).toBeFocused();

    // Changing disclosure heights clamps the existing scrollbar and still permits reaching the end.
    for (const selector of ['.ignore-panel', '.agent-panel', '.advanced-panel', '.file-preview']) {
      await page.locator(`${selector} > summary`).click();
      expect(await atBottom()).toBeGreaterThanOrEqual(-1);
      await page.locator(`${selector} > summary`).click();
      await end();
    }

    // Drag the actual primary scrollbar thumb, without assigning scrollTop.
    await home();
    const bar = await content.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const arrow = el.offsetWidth - el.clientWidth;
      const track = el.clientHeight - arrow * 2;
      return {
        x: rect.right - arrow / 2,
        start: rect.top + arrow + Math.max(17, (track * el.clientHeight) / el.scrollHeight) / 2,
        end: rect.bottom - arrow - 1,
      };
    });
    await page.mouse.move(bar.x, bar.start);
    await page.mouse.down();
    await page.mouse.move(bar.x, bar.end, { steps: 12 });
    await page.mouse.up();
    await expect.poll(atBottom).toBeLessThanOrEqual(1);
  }

  // Long previews keep their own scrollbar; wheel input chains to the page at their boundary.
  await resize(scrollSizes[1]);
  await page
    .locator('.file-preview')
    .getByRole('button', { name: '.gitignore', exact: true })
    .click();
  const preview = page.locator('.file-preview .preview');
  await expect
    .poll(() => preview.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(0);
  await preview.focus();
  await page.keyboard.press('Control+Home');
  await expect.poll(() => preview.evaluate((el) => el.scrollTop)).toBe(0);
  await preview.hover();
  const outerBefore = await top();
  await page.mouse.wheel(0, 80);
  await expect.poll(() => preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await top()).toBe(outerBefore);
  await page.keyboard.press('Control+Home');
  await expect.poll(() => preview.evaluate((el) => el.scrollTop)).toBe(0);
  await preview.hover();
  const beforeChaining = await top();
  await page.mouse.wheel(0, -80);
  await expect.poll(top).toBeLessThan(beforeChaining);
  await preview.focus();
  await page.keyboard.press('Control+End');
  await expect
    .poll(() => preview.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeLessThanOrEqual(1);
  await home();
  await end();
  for (const tab of await page.locator('.file-tabs button').all()) {
    await tab.click();
    expect(await preview.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await preview.focus();
    await page.keyboard.press('Control+End');
    await expect
      .poll(() => preview.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
      .toBeLessThanOrEqual(1);
  }
  const finalFrame = await page.evaluate(() => ({
    header: document.querySelector('.app-header').getBoundingClientRect().top,
    footer: document.querySelector('.action-bar').getBoundingClientRect().bottom,
    height: innerHeight,
    scroll: [document.documentElement, document.body, document.querySelector('#root')].map(
      (el) => ({
        id: el.id || el.tagName,
        top: el.scrollTop,
        h: el.scrollHeight,
        client: el.clientHeight,
      }),
    ),
  }));
  expect(finalFrame.header, JSON.stringify(finalFrame)).toBe(0);
  expect(finalFrame.footer).toBe(finalFrame.height);
  for (const frame of finalFrame.scroll) {
    expect(frame.top).toBe(0);
    expect(frame.h).toBeLessThanOrEqual(frame.client);
  }
}
