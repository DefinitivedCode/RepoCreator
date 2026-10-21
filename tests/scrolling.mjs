import { expect } from '@playwright/test';

export const scrollSizes = [
  { width: 1100, height: 740 },
  { width: 820, height: 580 },
  { width: 1440, height: 900 },
  { width: 1024, height: 680 },
];

// Shared by Edge regressions and the production WebView2 smoke test.
export async function verifyExpandedScrolling(page, resize = (size) => page.setViewportSize(size)) {
  const content = page.getByRole('main', { name: 'Repository configuration' });
  for (const size of scrollSizes) {
    await resize(size);
    await expect
      .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual(size);
    await content.focus();
    await page.keyboard.press('Control+Home');
    await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBe(0);
    const overflow = await content.evaluate((el) => el.scrollHeight - el.clientHeight);
    if (overflow > 1) {
      await content.hover({ position: { x: 8, y: 80 } });
      await page.mouse.wheel(0, 80);
      await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      await content.focus();
      await page.keyboard.press('Control+Home');
      await page.keyboard.press('PageDown');
      await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      await content.focus();
      await page.keyboard.press('Control+End');
      await expect
        .poll(() => content.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
        .toBeLessThanOrEqual(1);
    }
    const geometry = await page.evaluate(() => {
      const main = document.querySelector('.workspace-main');
      const footer = document.querySelector('.action-bar').getBoundingClientRect();
      const bounds = main.getBoundingClientRect();
      const nested = [...main.querySelectorAll('*')]
        .filter((el) => {
          const style = getComputedStyle(el);
          return (
            el.getClientRects().length &&
            el.checkVisibility() &&
            /auto|scroll/.test(style.overflowY) &&
            el.scrollHeight > el.clientHeight + 1 &&
            !el.matches('pre,textarea,.preview,.file-tree')
          );
        })
        .map((el) => el.className);
      const clipped = [...main.querySelectorAll('label,button,select,textarea,input,summary,h3,p')]
        .filter((el) => el.getClientRects().length && el.checkVisibility())
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < bounds.left - 1 || r.right > bounds.right + 1;
        })
        .map((el) => (el.textContent || el.id).slice(0, 100));
      return {
        nested,
        clipped,
        footer: footer.bottom,
        footerTop: footer.top,
        mainBottom: bounds.bottom,
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
        pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      };
    });
    expect(geometry.nested, JSON.stringify(geometry)).toEqual([]);
    expect(geometry.clipped, JSON.stringify(geometry)).toEqual([]);
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.pageScroll).toBeLessThanOrEqual(1);
    expect(geometry.footer).toBe(size.height);
    expect(geometry.mainBottom).toBeLessThanOrEqual(geometry.footerTop);
    await expect(page.locator('.action-bar .primary')).toBeInViewport({ ratio: 1 });
  }
}
