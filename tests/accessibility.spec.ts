import { expect, test, type Page } from '@playwright/test';
import { prepare } from './fixtures';

/**
 * DOM-based accessibility checks (axe is not a dependency; see docs/redesign-baseline.md).
 * Each screen is visited at three window sizes in both themes (the Playwright projects).
 */
const sizes = [
  { width: 820, height: 580 },
  { width: 1100, height: 740 },
  { width: 1440, height: 900 },
];

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });

const screens: Array<[string, (page: Page) => Promise<void>]> = [
  ['New Project', (page) => sidebar(page).getByRole('button', { name: 'New Project' }).click()],
  ['Projects', (page) => sidebar(page).getByRole('button', { name: 'Projects' }).click()],
  ['Presets', (page) => sidebar(page).getByRole('button', { name: 'Presets' }).click()],
  ...['Git & identity', 'GitHub', 'Appearance', 'Updates', 'Setup', 'General'].map(
    (tab): [string, (page: Page) => Promise<void>] => [
      `Settings / ${tab}`,
      async (page) => {
        await sidebar(page).getByRole('button', { name: 'Settings' }).click();
        await page.getByRole('tab', { name: tab, exact: true }).click();
      },
    ],
  ),
];

/** Collects structural problems in the current DOM. Runs in the page. */
function audit() {
  const problems: string[] = [];
  const visible = (element: Element) => {
    const html = element as HTMLElement;
    const style = getComputedStyle(html);
    return (
      style.display !== 'none' && style.visibility !== 'hidden' && html.getClientRects().length
    );
  };
  const describe = (element: Element) =>
    `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${String(
      (element as HTMLElement).className,
    ).slice(0, 40)}`;
  const nameOf = (element: Element): string => {
    const labelledby = element.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      if (text) return text;
    }
    const label = element.getAttribute('aria-label')?.trim();
    if (label) return label;
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const labels = [...(element.labels ?? [])]
        .map((l) => l.textContent?.trim())
        .join(' ')
        .trim();
      if (labels) return labels;
    }
    const title = element.getAttribute('title')?.trim();
    const text = element.textContent?.trim();
    return text || title || element.querySelector('img[alt]')?.getAttribute('alt') || '';
  };

  // Duplicate ids.
  const seen = new Map<string, number>();
  for (const element of document.querySelectorAll('[id]'))
    seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
  for (const [id, count] of seen) if (count > 1) problems.push(`duplicate id "${id}" ×${count}`);

  // Accessible names for interactive elements.
  for (const element of document.querySelectorAll(
    'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=button], [role=checkbox], [role=radio]',
  )) {
    if (!visible(element) && !(element instanceof HTMLInputElement)) continue;
    if (element.closest('[inert], [hidden]')) continue;
    if (!nameOf(element)) problems.push(`no accessible name: ${describe(element)}`);
  }

  // Targets of aria-controls / aria-describedby / aria-labelledby exist (controls may be unmounted tab panels).
  for (const attribute of ['aria-describedby', 'aria-labelledby']) {
    for (const element of document.querySelectorAll(`[${attribute}]`))
      for (const id of element.getAttribute(attribute)!.split(/\s+/))
        if (id && !document.getElementById(id))
          problems.push(`${attribute} target "${id}" missing on ${describe(element)}`);
  }

  // Tab semantics: tabs live in a tablist; the selected tab has a panel that is labelled by it.
  for (const list of document.querySelectorAll('[role=tablist]')) {
    const tabs = [...list.querySelectorAll('[role=tab]')];
    if (!tabs.length) problems.push(`empty tablist ${describe(list)}`);
    if (!list.getAttribute('aria-label') && !list.getAttribute('aria-labelledby'))
      problems.push(`tablist without a name ${describe(list)}`);
    const selected = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true');
    if (selected.length !== 1) problems.push(`tablist has ${selected.length} selected tabs`);
    for (const tab of selected) {
      const panelId = tab.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) problems.push(`selected tab ${describe(tab)} has no panel`);
      else if (panel.getAttribute('role') !== 'tabpanel')
        problems.push(`panel ${panelId} is not a tabpanel`);
    }
    if (tabs.filter((tab) => tab.getAttribute('tabindex') === '0').length > 1)
      problems.push(`tablist has several tab stops ${describe(list)}`);
  }
  for (const tab of document.querySelectorAll('[role=tab]'))
    if (!tab.closest('[role=tablist]')) problems.push(`tab outside tablist ${describe(tab)}`);

  // Landmarks and headings.
  const mains = [...document.querySelectorAll('main, [role=main]')].filter(visible);
  if (mains.length !== 1) problems.push(`${mains.length} main landmarks`);
  const navs = [...document.querySelectorAll('nav, [role=navigation]')].filter(visible);
  const names = navs.map((nav) => nav.getAttribute('aria-label') ?? '');
  if (names.some((name) => !name)) problems.push('navigation landmark without a name');
  if (new Set(names).size !== names.length) problems.push('navigation landmarks share a name');
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(visible);
  let previous = 0;
  for (const heading of headings) {
    const level = Number(heading.tagName[1]);
    if (previous && level > previous + 1)
      problems.push(
        `heading jumps h${previous} → h${level}: "${heading.textContent?.trim().slice(0, 30)}"`,
      );
    previous = level;
  }
  if (!headings.length) problems.push('no headings');

  // Images need alt text or to be hidden.
  for (const image of document.querySelectorAll('img'))
    if (!image.hasAttribute('alt') && image.getAttribute('aria-hidden') !== 'true')
      problems.push(`img without alt ${describe(image)}`);

  // No horizontal page scroll.
  if (document.documentElement.scrollWidth > window.innerWidth + 1)
    problems.push(
      `horizontal page scroll ${document.documentElement.scrollWidth} > ${window.innerWidth}`,
    );
  return problems;
}

for (const [name, open] of screens) {
  test(`structure and layout: ${name}`, async ({ page }) => {
    await prepare(page, false, 'simple');
    for (const size of sizes) {
      await page.setViewportSize(size);
      await open(page);
      await page.waitForTimeout(150);
      const problems = await page.evaluate(audit);
      expect(problems, `${name} at ${size.width}×${size.height}`).toEqual([]);
    }
  });
}

test('every focusable control shows a focus ring of at least 2px on the main screens', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  for (const [name, open] of screens.slice(0, 3)) {
    await open(page);
    await page.waitForTimeout(100);
    const failures: string[] = [];
    const count = Math.min(
      40,
      await page.evaluate(
        () =>
          document.querySelectorAll(
            'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ).length,
      ),
    );
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let index = 0; index < count; index++) {
      await page.keyboard.press('Tab');
      const result = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body) return null;
        if (!element.matches(':focus-visible')) return `${element.tagName} not :focus-visible`;
        const style = getComputedStyle(element);
        const ring =
          (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2) ||
          /\d+px/.test(style.boxShadow.replace(/rgba?\([^)]*\)/g, ''));
        return ring ? null : `${element.tagName}.${element.className} has no ring`;
      });
      if (result) failures.push(result);
    }
    expect(failures, name).toEqual([]);
  }
});

test('forced-colors keeps controls and focus visible', async ({ page }) => {
  await prepare(page, false, 'simple');
  await page.emulateMedia({ forcedColors: 'active' });
  await sidebar(page).getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  const unbordered = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'main button, main input, main select, main textarea',
      ),
    ]
      .filter(
        (element) =>
          element.offsetParent &&
          !(element as HTMLInputElement).type?.match(/checkbox|radio|color/),
      )
      .filter((element) => {
        const style = getComputedStyle(element);
        return parseFloat(style.borderTopWidth) === 0 && style.outlineStyle === 'none';
      })
      .map((element) => `${element.tagName}.${element.className}`),
  );
  expect(unbordered).toEqual([]);
});

test('selected items stay distinguishable in forced-colors mode', async ({ page }) => {
  await prepare(page, false, 'simple');
  await page.emulateMedia({ forcedColors: 'active' });
  const current = sidebar(page).locator('[aria-current="page"]');
  await expect(current).toHaveCSS('outline-style', 'solid');
  await expect(current).toHaveCSS('outline-width', '2px');
});

test('reduced motion removes transitions and animations', async ({ page }) => {
  await prepare(page, false, 'simple');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const moving = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => element.offsetParent)
      .filter((element) => {
        const style = getComputedStyle(element);
        const transition = style.transitionDuration.split(',').some((d) => parseFloat(d) > 0.001);
        const animation =
          style.animationName !== 'none' &&
          style.animationDuration.split(',').some((d) => parseFloat(d) > 0.001);
        return transition || animation;
      })
      .map((element) => `${element.tagName}.${element.className}`),
  );
  expect(moving).toEqual([]);
});
