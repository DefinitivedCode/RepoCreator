import { prepare, navigate, fileTab, createProject } from './fixtures';
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { verifyExpandedScrolling } from './scrolling.mjs';

test('Simple mode reviews an Experiment and preserves settings across mode and section changes', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await expect(page.getByRole('button', { name: 'Simple', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'Project Files' }),
  ).toHaveCount(0);
  await page.getByLabel('Project name').fill('learning-lab');
  await page.getByLabel('What are you making?').fill('Try a useful local tool');
  await page.getByLabel('Starting point').selectOption('experiment');
  await page.getByLabel('Language or technology').selectOption('Python');
  await page.getByLabel('AI coding assistant').selectOption('claude');
  await page.locator('.brief-details > summary').click();
  await page.getByLabel('What are you building?').fill('é'.repeat(2100));
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeDisabled();
  // Changing a file-generating field while the brief is invalid must not poison
  // the cached preview; correcting metadata should make creation available again.
  await page.getByLabel('Project name').fill('learning-lab-draft');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls.filter((call: any) => call.command === 'preview_files').at(-1)
            ?.payload.request.name,
      ),
    )
    .toBe('learning-lab-draft');
  await page.getByLabel('What are you building?').fill('A small local learning tool');
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  await page.getByLabel('Starting point').selectOption('website');
  await expect(page.getByLabel('What are you building?')).toHaveValue(
    'A small local learning tool',
  );
  await expect(page.getByLabel('Language or technology')).toHaveValue('Python');
  await page.getByRole('button', { name: 'Undo preset change' }).click();
  await page.getByLabel('Project name').fill('learning-lab');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await fileTab(page, 'Git Settings');
  await page.getByLabel('Initial branch').fill('experiment/start');
  await navigate(page, 'Overview');
  await expect(page.getByLabel('Project name')).toHaveValue('learning-lab');
  await expect(page.getByLabel('Description')).toHaveValue('Try a useful local tool');
  await page.getByRole('button', { name: 'Simple', exact: true }).click();
  await expect(page.getByLabel('Language or technology')).toHaveValue('Python');
  await expect(page.getByLabel('AI coding assistant')).toHaveValue('claude');
  await page.getByRole('button', { name: 'Review project', exact: true }).click();
  await expect(page.locator('.project-summary')).toContainText('learning-lab');
  await expect(page.locator('.project-summary')).toContainText('On this computer');
  await expect(page.locator('.project-summary')).toContainText('Experiment');
  await expect(page.locator('.project-summary')).toContainText('experiment/start');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  await page.locator('.completion-handoff > summary').click();
  await expect(page.getByLabel('AI prompt')).toHaveValue(/learning-lab/);
  const call = await page.evaluate(() =>
    (window as any).testCalls.find((c: any) => c.command === 'create_repository'),
  );
  expect(call.payload.request.options.ai).toMatchObject({ enabled: true, agents: ['claude'] });
  expect(call.payload.request.options.initialBranch).toBe('experiment/start');
  expect(call.payload.request.brief.technologies).toBe('Python');
});

test('workspace uses available width and retains one pane scroller at supported window sizes', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await prepare(page);
  await page.getByLabel('Project name').fill('workspace-layout');
  await page.getByLabel('Project preset').selectOption('tauri');
  await fileTab(page, 'README');
  await page.getByRole('combobox', { name: 'README', exact: true }).selectOption('custom');
  for (const name of ['Features', 'Installation', 'Contributing'])
    await page.getByRole('checkbox', { name, exact: true }).check();
  await verifyExpandedScrolling(page);
  mkdirSync('artifacts', { recursive: true });
  for (const section of [
    'Overview',
    'Project Files',
    'AI Agents',
    'Review',
    'AI Handoff',
    'Recent Projects',
    'Setup & status',
  ]) {
    await navigate(page, section);
    await verifyExpandedScrolling(page);
    await page.setViewportSize({ width: 1100, height: 740 });
    await page
      .getByRole('main', { name: 'Repository configuration' })
      .evaluate((el) => el.scrollTo(0, 0));
    await page.screenshot({
      path: `artifacts/v1.3-${section.toLowerCase().replace(/[^a-z]+/g, '-')}-${info.project.name}.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await navigate(page, 'Overview');
  const panes = await page.evaluate(() => ({
    main: document.querySelector('.workspace-main')!.getBoundingClientRect().width,
    context: document.querySelector('.context-panel')!.getBoundingClientRect().width,
  }));
  expect(panes.main).toBeGreaterThan(550);
  expect(panes.context).toBeGreaterThan(200);
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/v1.3-overview-${info.project.name}-wide.png` });
  await page.getByRole('button', { name: 'Simple', exact: true }).click();
  await page.setViewportSize({ width: 820, height: 580 });
  await page.screenshot({ path: `artifacts/v1.3-simple-${info.project.name}-minimum.png` });
  await expect(page.locator('.action-bar .primary')).toBeInViewport({ ratio: 1 });
});

test('validation blocks unsafe names and keeps review action accessible', async ({ page }) => {
  await prepare(page);
  const review = page.getByRole('button', { name: 'Review project', exact: true });
  await expect(review).toBeDisabled();
  await page.getByLabel('Project name').fill('../escape');
  await expect(
    page
      .getByRole('main', { name: 'Repository configuration' })
      .getByText('Start with a letter or number. Use letters, numbers, . _ or -.'),
  ).toBeVisible();
  await expect(review).toBeDisabled();
  await page.getByLabel('Project name').fill('inventory-tools');
  await page.getByRole('button', { name: 'Browse…' }).click();
  await expect(review).toBeEnabled();
  await page.setViewportSize({ width: 820, height: 580 });
  await expect(review).toBeInViewport({ ratio: 1 });
  await review.click();
  await expect(page.getByRole('button', { name: 'Create Project', exact: true })).toBeEnabled();
});

test('ignore rules, license, extra files and Git options reach one creation command', async ({
  page,
}) => {
  await prepare(page);
  await page.getByLabel('Project name').fill('fresh-start');
  await page.getByLabel('Project preset').selectOption('tauri');
  await fileTab(page, 'Gitignore');
  await page.getByLabel('Search ignore presets').fill('rust');
  await expect(page.getByLabel('Rust', { exact: true })).toBeChecked();
  await page.getByLabel('Custom patterns').fill('/scratch/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('.gitignore live preview')).toContainText('/scratch/');
  await fileTab(page, 'License');
  await page.getByLabel('License type').selectOption('MIT');
  await page.getByLabel('Copyright holder').fill('Alex Example');
  await fileTab(page, 'Additional Files');
  await page.getByRole('checkbox', { name: '.editorconfig' }).check();
  await fileTab(page, 'Git Settings');
  await page.getByLabel('Initial branch').fill('feature/start');
  await page.getByLabel('Initial commit message').fill('Begin work');
  await createProject(page);
  await expect(page.getByRole('heading', { name: 'Creating repository' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  const calls = await page.evaluate(() =>
    (window as any).testCalls.filter((c: any) => c.command === 'create_repository'),
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].payload.request.options).toMatchObject({
    license: 'MIT',
    initialBranch: 'feature/start',
    commitMessage: 'Begin work',
    customPatterns: ['/scratch/'],
    editorconfig: true,
  });
  await page.getByRole('button', { name: 'Create Another' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('');
});

test('Preset Studio saves, edits, duplicates, previews imports, rejects malformed data and confirms deletion', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await prepare(page);
  await fileTab(page, 'Gitignore');
  await page.getByLabel('Operating system files', { exact: true }).uncheck();
  await page.getByLabel('Environment & local secrets', { exact: true }).uncheck();
  await navigate(page, 'Overview');
  await page.getByRole('button', { name: 'Manage…' }).click();
  const dialog = page.getByRole('dialog');
  await page.getByLabel('Save a new custom preset').fill('My tools');
  await page.getByLabel('Description', { exact: true }).fill('Team workflow');
  await dialog.getByRole('button', { name: 'Save preset', exact: true }).click();
  await expect(dialog.getByText('Saved “My tools”.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit / rename', exact: true }).click();
  await page.getByLabel('Edit custom preset').fill('Team tools');
  await dialog.getByRole('button', { name: 'Save changes to preset' }).click();
  const custom = dialog
    .locator('li')
    .filter({ has: page.getByText('Team tools', { exact: true }) });
  await expect(custom).toContainText('Team workflow');
  await custom.getByRole('button', { name: 'Export…', exact: true }).click();
  await expect(dialog.getByText(/Exported portable JSON/)).toBeVisible();
  const blank = dialog
    .locator('li')
    .filter({ has: page.getByText('Blank repository', { exact: true }) });
  await blank.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByLabel('Save a new custom preset').fill('Blank copy');
  await dialog.getByRole('button', { name: 'Save preset', exact: true }).click();
  await dialog.getByRole('button', { name: 'Import JSON…' }).click();
  await expect(dialog.getByRole('region', { name: 'Import preview' })).toContainText(
    'A portable workflow',
  );
  await expect(dialog.getByText('Imported workflow', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm import' }).click();
  await expect(dialog.getByText('Saved “Imported workflow”.')).toBeVisible();
  await page.evaluate(() => ((window as any).testPresetImportError = true));
  await dialog.getByRole('button', { name: 'Import JSON…' }).click();
  await expect(dialog.getByRole('alert')).toContainText('invalid or unsupported fields');
  await expect(dialog.locator('.saved-presets').first().locator(':scope > li')).toHaveCount(3);
  await custom.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(
    dialog.getByText('Delete “Team tools”? Your project settings will be kept.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(custom).toBeVisible();
  await custom.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Project preset')).toHaveValue('custom-1');
  await fileTab(page, 'Gitignore');
  await expect(page.getByLabel('Operating system files', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Environment & local secrets', { exact: true })).not.toBeChecked();
  await navigate(page, 'Overview');
  await page.getByLabel('Project preset').selectOption('tauri');
  await page.getByRole('button', { name: 'Undo preset change' }).click();
  await expect(page.getByLabel('Project preset')).toHaveValue('custom-1');
  await page.getByRole('button', { name: 'Manage…' }).click();
  await custom.getByRole('button', { name: 'Delete', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete preset', exact: true }).click();
  await expect(custom).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('appearance and partial publication retain the local repository and metadata for retry', async ({
  page,
}) => {
  await prepare(page, true);
  await page.getByLabel('Appearance').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await page.getByLabel('Appearance').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await page.getByLabel('Project name').fill('fresh-start');
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Private/ })).toBeChecked();
  await page.getByRole('combobox', { name: 'Owner', exact: true }).selectOption('sample-org');
  await fileTab(page, 'Git Settings');
  await page.getByLabel('Homepage').fill('invalid-url');
  await expect(page.getByRole('button', { name: 'Review project' })).toBeDisabled();
  await navigate(page, 'Overview');
  await page.getByRole('button', { name: 'Local only', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review project' })).toBeEnabled();
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Owner', exact: true })).toHaveValue(
    'sample-org',
  );
  await fileTab(page, 'Git Settings');
  await page.getByLabel('Homepage').fill('');
  await createProject(page);
  await expect(page.getByRole('heading', { name: 'Publishing incomplete' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry publishing' }).click();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  const commands = await page.evaluate(() => (window as any).testCalls.map((c: any) => c.command));
  expect(commands.filter((c: string) => c === 'create_repository')).toHaveLength(1);
  expect(commands.filter((c: string) => c === 'retry_publish')).toHaveLength(1);
});

test('optional tools and disconnected GitHub never block a local project or handoff', async ({
  page,
}) => {
  await prepare(page, false, 'simple');
  await page.evaluate(
    () =>
      ((window as any).testEnvironment = {
        ghInstalled: false,
        githubUser: null,
        githubOwners: [],
        optionalTools: [{ id: 'claude', name: 'Claude Code', status: 'unavailable' }],
      }),
  );
  await page.getByLabel('Project name').fill('offline-project');
  await navigate(page, 'Setup & status');
  await page.getByRole('button', { name: 'Recheck', exact: true }).click();
  await expect(page.getByText('Claude Code', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  await navigate(page, 'AI Handoff');
  await expect(page.getByLabel('AI prompt')).toHaveValue(/offline-project/);
  await navigate(page, 'Overview');
  await page.getByRole('button', { name: 'Computer and GitHub', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'On this computer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
});

test('local handoff templates render, preserve prompt edits, copy and persist custom text', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testPreferredTemplate = 'missing-template';
  });
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('prompt-project');
  await page.getByLabel('What are you making?').fill('A private learning experiment');
  await navigate(page, 'AI Handoff');
  const prompt = page.getByLabel('AI prompt');
  await expect(page.getByText(/Recommended template.*is unavailable/)).toBeVisible();
  await page.getByRole('button', { name: 'Custom templates', exact: true }).click();
  await page.getByLabel('Template name').fill('Recovered template');
  await page.getByLabel('Template text').fill('Plan {{PROJECT_NAME}}.');
  await page.getByRole('button', { name: 'Save as custom', exact: true }).click();
  await expect(page.getByText(/Recommended template.*is unavailable/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Custom templates', exact: true }).click();
  for (const template of ['discovery', 'architecture', 'development']) {
    await page.getByLabel('Prompt template').selectOption(template);
    await expect(prompt).toHaveValue(/prompt-project/);
    await expect(prompt).not.toHaveValue(/\{\{PROJECT_NAME\}\}/);
  }
  await page.getByLabel('Prompt style').selectOption('rapid');
  await prompt.fill('My reviewed prompt text.');
  await page.getByLabel('Prompt template').selectOption('discovery');
  await expect(prompt).toHaveValue('My reviewed prompt text.');
  await expect(
    page.getByText(/^Project Discovery selected\. Your edited prompt is kept/),
  ).toBeVisible();
  await navigate(page, 'Overview');
  await page.getByLabel('Starting point').selectOption('website');
  await navigate(page, 'AI Handoff');
  await expect(page.getByLabel('Prompt template')).toHaveValue('architecture');
  await expect(prompt).toHaveValue('My reviewed prompt text.');
  await page.getByRole('button', { name: 'Copy AI Prompt', exact: true }).click();
  expect(await page.evaluate(() => (window as any).testCopied)).toBe('My reviewed prompt text.');
  await page.getByRole('button', { name: 'Save Markdown' }).click();
  const exported = await page.evaluate(() =>
    (window as any).testCalls.filter((c: any) => c.command === 'export_handoff_text').at(-1),
  );
  expect(exported.payload).toMatchObject({ content: 'My reviewed prompt text.', kind: 'markdown' });
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect(prompt).toHaveValue(/prompt-project/);
  await page.getByRole('button', { name: 'Custom templates', exact: true }).click();
  await page.getByLabel('Template name').fill('Focused task');
  await page.getByLabel('Template text').fill('Build {{PROJECT_NAME}}. Work on branch {{BRANCH}}.');
  await page.getByRole('button', { name: 'Save as custom', exact: true }).click();
  await expect(prompt).toHaveValue(/Build.*prompt-project/);
  await expect(page.getByLabel('Prompt template').locator('option:checked')).toHaveText(
    'Focused task',
  );
  await page.getByRole('button', { name: 'Import template', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Prompt template').locator('option:checked')).toHaveText(
    'Focused task',
  );
  await page.reload();
  await navigate(page, 'AI Handoff');
  await expect(
    page.getByLabel('Prompt template').locator('option').filter({ hasText: 'Focused task' }),
  ).toHaveCount(1);
});

test('ordinary Overview fits the default window across display ratios and enlarged text remains reachable', async ({
  browser,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  for (const scale of [1, 1.25, 1.5]) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1100, height: 740 },
      deviceScaleFactor: scale,
      colorScheme: info.project.name === 'light' ? 'light' : 'dark',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      (window as any).testRecentLocations = ['C:\\Projects', 'C:\\Repositories'];
    });
    await prepare(page, false, 'simple');
    await page.getByLabel('Project name').fill('comfortable-overview');
    await page.getByLabel('Starting point').selectOption('experiment');
    await page.getByLabel('AI coding assistant').selectOption('claude');
    for (const mode of ['simple', 'advanced']) {
      await page
        .getByRole('button', { name: mode === 'simple' ? 'Simple' : 'Advanced', exact: true })
        .click();
      for (const destination of ['local', 'github']) {
        const name =
          destination === 'local'
            ? mode === 'simple'
              ? 'On this computer'
              : 'Local only'
            : mode === 'simple'
              ? 'Computer and GitHub'
              : 'GitHub';
        await page.getByRole('button', { name, exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Review project', exact: true }),
        ).toBeEnabled();
        const overflow = await page
          .locator('.workspace-main')
          .evaluate((el) => el.scrollHeight - el.clientHeight);
        expect(overflow, `${mode}/${destination} at DPR ${scale}`).toBeLessThanOrEqual(1);
      }
    }
    if (scale === 1) {
      mkdirSync('artifacts', { recursive: true });
      await page.screenshot({ path: `artifacts/v1.3.1-zero-scroll-${info.project.name}.png` });
    } else {
      // This emulates increased text size; it does not change the host OS display setting.
      await page.evaluate(
        (size) => (document.documentElement.style.fontSize = `${size}px`),
        scale * 16,
      );
      const description = page.locator('.short-description');
      await description.fill('A small project');
      expect(
        await description.evaluate((el) => el.scrollHeight - el.clientHeight),
        'A single description line must fit with enlarged text',
      ).toBeLessThanOrEqual(1);
      await page.locator('.brief-details > summary').focus();
      await expect(page.locator('.brief-details > summary')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.action-bar .primary')).toBeInViewport({ ratio: 1 });
      const geometry = await page.evaluate(() => {
        const main = document.querySelector('.workspace-main')!.getBoundingClientRect();
        const nav = document.querySelector('.navigation-rail')!;
        const clipped = [
          ...document.querySelectorAll(
            '.overview-layout input,.overview-layout select,.overview-layout button',
          ),
        ]
          .filter((el) => el.checkVisibility())
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.left < main.left - 1 || rect.right > main.right + 1;
          })
          .map((el) => el.textContent || el.id);
        const clippedNavigation = [...nav.querySelectorAll('button')]
          .filter(
            (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
          )
          .map((el) => el.textContent);
        return {
          clipped,
          clippedNavigation,
          navOverflow: nav.scrollWidth - nav.clientWidth,
          width: document.documentElement.scrollWidth,
          viewport: innerWidth,
        };
      });
      expect(geometry.clipped).toEqual([]);
      expect(geometry.clippedNavigation).toEqual([]);
      expect(geometry.navOverflow).toBeLessThanOrEqual(1);
      expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
      await page.screenshot({
        path: `artifacts/v1.3.1-text-${scale * 100}-${info.project.name}.png`,
      });
      if (scale === 1.5) {
        await page.setViewportSize({ width: 820, height: 580 });
        for (const mode of ['simple', 'advanced']) {
          await page
            .getByRole('button', { name: mode === 'simple' ? 'Simple' : 'Advanced', exact: true })
            .click();
          await description.focus();
          expect(
            await description.evaluate((el) => el.scrollHeight - el.clientHeight),
          ).toBeLessThanOrEqual(1);
          await page.locator('.brief-details > summary').focus();
          await expect(page.locator('.brief-details > summary')).toBeInViewport({ ratio: 1 });
          await expect(page.locator('.action-bar .primary')).toBeInViewport({ ratio: 1 });
          expect(
            await page
              .locator('.navigation-rail')
              .evaluate((el) => el.scrollWidth - el.clientWidth),
          ).toBeLessThanOrEqual(1);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
          ).toBeLessThanOrEqual(0);
          await page.screenshot({
            path: `artifacts/v1.3.1-text-150-minimum-${mode}-${info.project.name}.png`,
          });
        }
      }
    }
    await context.close();
  }
});

test('operational settings persist without redundant previews and stale checks cannot overwrite the latest connection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).testPersistPreferences = true;
  });
  await prepare(page);
  await page.getByLabel('Project name').fill('persistent-workflow');
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  const count = await page.evaluate(
    () => (window as any).testCalls.filter((call: any) => call.command === 'preview_files').length,
  );
  await fileTab(page, 'Git Settings');
  await page.getByLabel('Initial branch').fill('feature/context');
  await page.getByLabel('Initial commit message').fill('Begin a focused workflow');
  await page.getByRole('checkbox', { name: 'Open project folder', exact: true }).check();
  await navigate(page, 'Overview');
  await page.evaluate(
    () =>
      ((window as any).testEnvironmentQueue = [
        { delay: 300, environment: { githubUser: null, githubOwners: [] } },
        { delay: 0, environment: { githubUser: null, githubOwners: [] } },
        {
          delay: 0,
          environment: { githubUser: 'octocat', githubOwners: ['octocat', 'sample-org'] },
        },
      ]),
  );
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByRole('button', { name: 'Local only', exact: true }).click();
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByRole('radio', { name: 'Public', exact: true }).check();
  await page.getByRole('combobox', { name: 'Owner', exact: true }).selectOption('sample-org');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls
            .filter((call: any) => call.command === 'save_configuration')
            .at(-1)?.payload.configuration.visibility,
      ),
    )
    .toBe('public');
  await expect(page.getByRole('button', { name: 'Review project', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Owner', exact: true })).toHaveValue(
    'sample-org',
  );
  expect(
    await page.evaluate(
      () =>
        (window as any).testCalls.filter((call: any) => call.command === 'preview_files').length,
    ),
  ).toBe(count);
  await page.getByRole('button', { name: 'Simple', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Simple', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('radio', { name: 'Public', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await fileTab(page, 'Git Settings');
  await expect(page.getByLabel('Initial branch')).toHaveValue('feature/context');
  await expect(page.getByLabel('Initial commit message')).toHaveValue('Begin a focused workflow');
  await expect(
    page.getByRole('checkbox', { name: 'Open project folder', exact: true }),
  ).toBeChecked();
});

test('first-run prerequisite and settings failures provide working retry actions', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.addInitScript(() => {
    (window as any).testEnvironmentError = true;
  });
  await prepare(page, false, 'simple', false);
  await navigate(page, 'Setup & status');
  await expect(page.getByText('Could not inspect local tools.', { exact: true })).toBeVisible();
  await page.evaluate(() => ((window as any).testEnvironmentError = false));
  await page.getByRole('button', { name: 'Recheck', exact: true }).click();
  await expect(page.getByText('Git ready', { exact: true })).toBeVisible();
  await expect(page.getByText('Could not inspect local tools.', { exact: true })).toHaveCount(0);
  const context = await browser.newContext({ baseURL });
  const startup = await context.newPage();
  await startup.addInitScript(() => {
    if (!sessionStorage.getItem('bootstrapAttempted')) {
      sessionStorage.setItem('bootstrapAttempted', 'true');
      sessionStorage.setItem('failBootstrap', 'true');
    }
  });
  await prepare(startup, false, 'simple', false);
  await expect(startup.getByText('Could not load saved settings.', { exact: true })).toBeVisible();
  await startup.evaluate(() => sessionStorage.removeItem('failBootstrap'));
  await startup.getByRole('button', { name: 'Retry loading settings' }).click();
  await expect(startup.getByLabel('Project name')).toBeVisible();
  await expect(startup.getByText('Git ready', { exact: true })).toBeVisible();
  await context.close();
});

test('success keeps confirmed facts and actions visible with a hundred generated files', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    (window as any).testExtraFiles = 96;
  });
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('hundred-files');
  await page.getByLabel('AI coding assistant').selectOption('claude');
  await createProject(page);
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  await expect(page.locator('.result-files .file-count')).toHaveText('100');
  expect(
    await page.locator('.result-files').evaluate((el) => (el as HTMLDetailsElement).open),
  ).toBe(false);
  expect(
    await page.locator('.completion-handoff').evaluate((el) => (el as HTMLDetailsElement).open),
  ).toBe(false);
  await expect(page.getByRole('button', { name: 'Open Folder', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(page.locator('.result-details')).toContainText('Initial commit');
  await expect(page.getByRole('button', { name: 'Create Another' })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `artifacts/v1.3.1-success-100-${info.project.name}.png` });
  await page.locator('.result-files > summary').click();
  expect(
    await page
      .locator('.result-files .file-tree')
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(182);
  await page.getByLabel('Find generated files').fill('file-95.md');
  await page.getByRole('button', { name: 'generated/nested/file-95.md', exact: true }).click();
  await expect(
    page.getByLabel('generated/nested/file-95.md preview', { exact: true }),
  ).toContainText('Generated preview 95');
  await page.locator('.result-files > summary').click();
  await page.locator('.completion-handoff > summary').click();
  await expect(page.getByLabel('AI prompt')).toHaveValue(/hundred-files/);
  await expect(page.getByLabel('AI prompt')).toHaveValue(/created|initialised/i);
});
