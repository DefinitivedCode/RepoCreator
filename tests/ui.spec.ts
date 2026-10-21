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
  await prepare(page, false, 'simple');
  await page.getByLabel('Project name').fill('prompt-project');
  await page.getByLabel('What are you making?').fill('A private learning experiment');
  await navigate(page, 'AI Handoff');
  const prompt = page.getByLabel('AI prompt');
  for (const template of ['discovery', 'architecture', 'development']) {
    await page.getByLabel('Prompt template').selectOption(template);
    await expect(prompt).toHaveValue(/prompt-project/);
    await expect(prompt).not.toHaveValue(/\{\{PROJECT_NAME\}\}/);
  }
  await page.getByLabel('Prompt style').selectOption('rapid');
  await prompt.fill('My reviewed prompt text.');
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
