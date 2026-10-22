import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { navigate, prepare } from './fixtures';

const output = 'artifacts/refinement-creation-tests';
test('stack switching preserves manual choices through picker remounts, undo and saved settings', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testPersistPreferences = true;
  });
  await prepare(page, false, 'advanced');
  await page.getByLabel('Project name').fill('Stack switches');
  await page.getByRole('combobox', { name: 'Technologies', exact: true }).selectOption('sqlite');
  const browse = page.getByRole('button', { name: 'Browse technologies' });
  const picker = page.getByRole('dialog', { name: 'Choose technologies' });
  await browse.click();
  const stack = picker.getByRole('combobox', { name: 'Technology stack preset' });
  for (let i = 0; i < 2; i++) {
    await stack.selectOption('unity');
    await expect(picker.getByRole('button', { name: 'Remove Unity', exact: true })).toBeVisible();
    await stack.selectOption('tauri');
    await expect(picker.getByRole('button', { name: 'Remove Unity', exact: true })).toHaveCount(0);
    await expect(picker.getByRole('button', { name: 'Remove C#', exact: true })).toHaveCount(0);
    await expect(picker.getByRole('button', { name: 'Remove SQLite', exact: true })).toBeVisible();
  }
  await stack.selectOption('unity');
  await picker.getByRole('button', { name: 'Remove C#', exact: true }).click();
  await picker.getByRole('button', { name: 'C#', exact: true }).click();
  await picker.getByLabel('Custom technology').fill('Team toolkit');
  await picker.getByRole('button', { name: 'Add custom' }).click();
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  await navigate(page, 'Project Files');
  await navigate(page, 'Overview');
  await page.getByLabel('Project preset').selectOption('python');
  await page.getByRole('button', { name: 'Undo preset change' }).click();
  await browse.click();
  await stack.selectOption('tauri');
  await expect(picker.getByRole('button', { name: 'Remove C#', exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Remove Unity', exact: true })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  const expected = {
    ids: ['sqlite', 'csharp', 'typescript', 'react', 'vite', 'rust', 'tauri'],
    custom: ['Team toolkit'],
    presetIds: ['typescript', 'react', 'vite', 'rust', 'tauri'],
  };
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(sessionStorage.getItem('testPreferences')!).defaults.options.technologies,
      ),
    )
    .toEqual(expected);
  await page.reload();
  await browse.click();
  await stack.selectOption('unity');
  await expect(picker.getByRole('button', { name: 'Remove Tauri', exact: true })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'Remove Rust', exact: true })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'Remove SQLite', exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Remove C#', exact: true })).toBeVisible();
  await expect(
    picker.getByRole('button', { name: 'Remove Team toolkit', exact: true }),
  ).toBeVisible();
});

test('natural project names show the final slug and preserve the README title in creation requests', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('  My   Amazing Project  ');
  await expect(
    page.getByText('Repository name: my-amazing-project', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.context-code')).toContainText('# My Amazing Project');
  await page.getByRole('button', { name: 'Review project', exact: true }).click();
  await expect(page.locator('.project-summary')).toContainText('my-amazing-project');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  const requests = await page.evaluate(() => {
    const calls = (window as any).testCalls;
    return {
      preview: calls.filter((call: any) => call.command === 'preview_files').at(-1).payload.request,
      created: calls.find((call: any) => call.command === 'create_repository').payload.request,
    };
  });
  expect(requests.created).toMatchObject({
    name: 'my-amazing-project',
    title: 'My Amazing Project',
  });
  expect(requests.preview).toMatchObject({
    name: requests.created.name,
    title: requests.created.title,
  });
});

test('technology picker retains multi-selection, stacks, custom context and focus without growing the form', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  const main = page.getByRole('main', { name: 'Repository configuration' });
  await page.getByLabel('Project name').fill('multi-component');
  const initialHeight = await main.evaluate((element) => element.scrollHeight);
  const browse = page.getByRole('button', { name: 'Browse technologies' });
  await browse.click();
  const picker = page.getByRole('dialog', { name: 'Choose technologies' });
  await expect(picker.getByRole('searchbox', { name: 'Search technologies' })).toBeFocused();
  await expect(picker.locator('.technology-results > button')).toHaveCount(63);
  await picker.getByRole('button', { name: 'TypeScript', exact: true }).click();
  await picker.getByRole('button', { name: 'Rust', exact: true }).click();
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Rust', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await picker
    .getByRole('navigation', { name: 'Technology categories' })
    .getByRole('button', { name: /^Databases/ })
    .click();
  await expect(picker.locator('.technology-results > button')).toHaveCount(5);
  await picker.getByRole('button', { name: 'SQLite', exact: true }).click();
  await picker
    .getByRole('navigation', { name: 'Technology categories' })
    .getByRole('button', { name: /^All technologies/ })
    .click();
  await picker.getByRole('searchbox').fill('cloudflare');
  await expect(picker.locator('.technology-results > button')).toHaveCount(2);
  await picker.getByRole('button', { name: 'Cloudflare Workers', exact: true }).click();
  await picker
    .getByRole('combobox', { name: 'Technology stack preset' })
    .selectOption('react-vite');
  await picker.getByLabel('Custom technology').fill('Internal toolkit');
  await picker.getByRole('button', { name: 'Add custom' }).click();
  await expect(
    picker.getByRole('button', { name: 'Remove Internal toolkit', exact: true }),
  ).toBeVisible();
  await picker.getByRole('button', { name: /Add matching .gitignore presets/ }).click();
  await page.keyboard.press('Escape');
  await expect(picker).not.toBeVisible();
  await expect(browse).toBeFocused();
  await expect(page.getByRole('button', { name: 'Remove Rust', exact: true })).toBeVisible();
  expect(await main.evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(
    initialHeight + 40,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((call: any) => call.command === 'save_configuration')
            .at(-1)?.payload.configuration.options.technologies,
      ),
    )
    .toEqual({
      ids: ['typescript', 'rust', 'sqlite', 'cloudflare-workers', 'react', 'vite', 'node'],
      custom: ['Internal toolkit'],
      presetIds: ['react', 'vite', 'node'],
    });
  await browse.click();
  await picker.getByRole('searchbox').fill('rust');
  await expect(picker.getByRole('button', { name: 'Rust', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(page.locator('.technology-selector .technology-chip')).toHaveCount(0);
});

test('environment settings separate identity, GitHub and passive tools with keyboard navigation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testEnvironment = {
      optionalTools: [
        { id: 'claude', name: 'Claude Code', status: 'available' },
        { id: 'codex', name: 'Codex', status: 'unavailable' },
        { id: 'agy', name: 'Antigravity CLI', status: 'not-checked' },
      ],
    };
  });
  await prepare(page, false, 'simple');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  await expect(page.getByRole('tab', { name: 'Git & identity' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByLabel('Your name for this project').fill('Project author');
  await page.getByLabel('Email for this project').fill('author@example.test');
  await page.getByRole('tab', { name: 'Git & identity' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'GitHub', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Connected as octocat');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Development tools' })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Antigravity CLI');
  await expect(page.getByRole('tabpanel')).toContainText('Not checked');
  await page.getByRole('tab', { name: 'Git & identity' }).click();
  await expect(page.getByLabel('Your name for this project')).toHaveValue('Project author');
  await expect(page.getByLabel('Email for this project')).toHaveValue('author@example.test');
  const launched = await page.evaluate(() =>
    (window as any).testCalls.filter((call: any) =>
      [
        'launch_project_tool',
        'connect_github',
        'open_setup_resource',
        'run_project_command',
      ].includes(call.command),
    ),
  );
  expect(launched).toEqual([]);
});

test('creation and bounded technology picker remain readable at default minimum and wide dimensions', async ({
  page,
}, info) => {
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('field-notes');
  await page.getByLabel('What are you making?').fill('A local tool for useful project notes');
  await page
    .getByRole('combobox', { name: 'Technologies', exact: true })
    .selectOption('typescript');
  await page.getByLabel('AI coding assistant').selectOption('claude');
  await expect(page.locator('.context-code')).toContainText('# field-notes');
  mkdirSync(output, { recursive: true });
  for (const [name, width, height] of [
    ['default', 1100, 740],
    ['minimum', 820, 580],
    ['wide', 1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    const main = page.getByRole('main', { name: 'Repository configuration' });
    if (name !== 'minimum')
      expect(
        await main.evaluate((element) => element.scrollHeight - element.clientHeight),
      ).toBeLessThanOrEqual(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${output}/${info.project.name}-${name}-overview.png` });
    await page.getByRole('button', { name: 'Browse technologies' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose technologies' });
    const box = await picker.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(8);
    expect(box!.y).toBeGreaterThanOrEqual(8);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width - 8);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height - 8);
    await expect(picker.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
    expect(
      await picker
        .locator('.technology-categories')
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${output}/${info.project.name}-${name}-technology-picker.png` });
    await page.keyboard.press('Escape');
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await expect(page.getByRole('tab', { name: 'Git & identity' })).toBeInViewport();
    await page.screenshot({ path: `${output}/${info.project.name}-${name}-settings.png` });
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'New Project', exact: true })
      .click();
  }
});
