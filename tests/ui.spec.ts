import { expect, test, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { verifyExpandedScrolling } from './scrolling.mjs';

const mockSource = readFileSync('node_modules/@tauri-apps/api/mocks.js', 'utf8').replace(
  /^export \{[^\n]*\};\s*$/m,
  '',
);
const ignores = JSON.parse(readFileSync('src-tauri/resources/ignore-presets.json', 'utf8'));

test('expanded settings retain one page scroller and a fixed action bar', async ({ page }) => {
  test.setTimeout(60_000);
  await prepare(page);
  await page.getByLabel('Project name').fill('scroll-check');
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByLabel('Project preset').selectOption('tauri');
  await page.getByLabel('README', { exact: true }).selectOption('custom');
  await page.locator('.advanced-panel > summary').click();
  for (const name of ['Features', 'Installation', 'Contributing']) {
    await page.getByRole('checkbox', { name, exact: true }).check();
  }
  await page.getByLabel('License type').selectOption('Apache-2.0');
  await verifyExpandedScrolling(page);
});

async function prepare(page: Page, failPublish = false) {
  await page.addInitScript({
    content: `${mockSource}
    window.isTauri = true;
    window.testCalls = [];
    const ignores = ${JSON.stringify(ignores)};
    const options = { readmeSections: ['overview', 'usage', 'development', 'license'], sectionContent: {}, ignorePresets: ['os', 'secrets'], customPatterns: [], license: 'none', copyrightName: '', copyrightYear: '2026', initialBranch: 'main', commitMessage: 'Initial commit', editorconfig: false, gitattributes: false, postActions: { folder: false, vscode: false, github: false } };
    const configuration = { readme: 'general', options };
    const builtIns = [ ['default', 'Default', ['os','secrets']], ['blank', 'Blank repository', []], ['tauri', 'Tauri application', ['os','secrets','node','vite','typescript','rust','tauri']], ['python', 'Python project', ['os','secrets','python']] ].map(([id,name,ids]) => ({id,name,configuration:{readme:id==='blank'?'none':'general',options:{...structuredClone(options),ignorePresets:ids}}}));
    const preferences = { schemaVersion: 2, parentPath: 'C:\\\\Projects', destination: 'local', appearance: 'system', defaults: configuration, customPresets: [], recentLocations: [] };
    let attempts = 0;
    let lastRequest;
    function preview(request) {
      const files = [];
      if(request.readme !== 'none') files.push({path:'README.md',content:'# '+request.name+'\\n'});
      if(request.options.ignorePresets.length || request.options.customPatterns.length) files.push({path:'.gitignore',content:request.options.ignorePresets.flatMap(id=>ignores.find(p=>p.id===id).patterns).concat(request.options.customPatterns).join('\\n')+'\\n'});
      if(request.options.license !== 'none') files.push({path:'LICENSE',content:request.options.license+' '+request.options.copyrightName});
      return files;
    }
    mockIPC(async (command, payload) => {
      window.testCalls.push({ command, payload });
      if (command === 'get_catalog') return {ignorePresets: ignores,builtInPresets: builtIns,defaultConfiguration: configuration};
      if (command === 'get_preferences') return structuredClone(preferences);
      if (command === 'check_environment') return { gitInstalled:true,identityReady:true,ghInstalled:true,githubUser:'octocat',githubOwners:['octocat','sample-org'],identityName:'Test Author',vscodeAvailable:false };
      if (command === 'choose_parent') return null;
      if (command === 'preview_files') return preview(payload.request);
      if (command === 'save_configuration') preferences.defaults = payload.configuration;
      if (command === 'save_custom_preset') { preferences.customPresets.push({id:'custom-'+(preferences.customPresets.length+1),name:payload.name,configuration:payload.configuration}); return structuredClone(preferences.customPresets); }
      if (command === 'rename_custom_preset') { preferences.customPresets.find(p=>p.id===payload.id).name=payload.name; return structuredClone(preferences.customPresets); }
      if (command === 'delete_custom_preset') { preferences.customPresets=preferences.customPresets.filter(p=>p.id!==payload.id); return structuredClone(preferences.customPresets); }
      if (command === 'create_repository' || command === 'retry_publish') {
        attempts++; lastRequest=payload?.request || lastRequest;
        await new Promise(resolve => setTimeout(resolve, 240));
        if (${failPublish} && attempts === 1) throw { message:'The GitHub repository exists, but the initial commit could not be pushed.',guidance:'Your local repository and commit are safe. Check your connection, then retry publishing.',localPath:'C:\\\\Projects\\\\fresh-start',localReady:true,canRetry:true,githubUrl:'https://github.com/octocat/fresh-start' };
        return { name:lastRequest.name,path:'C:\\\\Projects\\\\fresh-start',githubUrl:lastRequest.destination==='github'?'https://github.com/octocat/fresh-start':null,commit:'a'.repeat(40),branch:lastRequest.options.initialBranch,commitMessage:lastRequest.options.commitMessage,files:preview(lastRequest).map(f=>f.path),warnings:[] };
      }
    }, { shouldMockEvents: true });`,
  });
  await page.goto('/');
  await expect(page.getByText('Git ready', { exact: true })).toBeVisible();
}

test('compact workflow validates inline and keeps the footer accessible on resize', async ({
  page,
}, info) => {
  await prepare(page);
  const create = page.getByRole('button', { name: 'Create Repository' });
  await expect(create).toBeDisabled();
  await page.getByLabel('Project name').fill('../escape');
  await expect(page.locator('#name-error')).toBeVisible();
  await expect(create).toBeDisabled();
  await page.getByLabel('Project name').fill('inventory-tools');
  await page.getByRole('button', { name: 'Browse…' }).click();
  await expect(page.getByText('C:\\Projects', { exact: true })).toBeVisible();
  await expect(create).toBeEnabled();
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/v1.1-${info.project.name}.png` });
  await page.setViewportSize({ width: 440, height: 560 });
  await page.locator('.advanced-panel > summary').click();
  await page.locator('.ignore-panel > summary').click();
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    footer: document.querySelector('.action-bar').getBoundingClientRect().bottom,
    height: innerHeight,
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(layout.footer).toBeLessThanOrEqual(layout.height);
  await expect(create).toBeInViewport();
});

test('ignore selection, custom rules, license and Git options reach one real command', async ({
  page,
}) => {
  await prepare(page);
  await page.getByLabel('Project name').fill('fresh-start');
  await page.getByLabel('Project preset').selectOption('tauri');
  await page.locator('.ignore-panel > summary').click();
  await page.getByLabel('Search ignore presets').fill('rust');
  await expect(page.getByLabel('Rust', { exact: true })).toBeChecked();
  await page.getByLabel('Custom patterns').fill('/scratch/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('.gitignore live preview')).toContainText('/scratch/');
  await page.locator('.advanced-panel > summary').click();
  await page.getByLabel('License type').selectOption('MIT');
  await page.getByLabel('Copyright holder').fill('Alex Example');
  await page.getByLabel('Initial branch').fill('feature/start');
  await page.getByLabel('Initial commit message').fill('Begin work');
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await expect(page.getByRole('heading', { name: 'Creating repository' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  await expect(page.getByText('feature/start', { exact: true })).toBeVisible();
  const calls = await page.evaluate(() =>
    (window as any).testCalls.filter((c: any) => c.command === 'create_repository'),
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].payload.request.options).toMatchObject({
    license: 'MIT',
    initialBranch: 'feature/start',
    commitMessage: 'Begin work',
    customPatterns: ['/scratch/'],
  });
  await page.getByRole('button', { name: 'Create Another' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('');
});

test('custom presets save, load, rename and require confirmation before deletion', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page);
  await page.locator('.ignore-panel > summary').click();
  const osJunk = page.getByLabel('Operating system files', { exact: true });
  const secrets = page.getByLabel('Environment & local secrets', { exact: true });
  await expect(osJunk).toBeChecked();
  await expect(secrets).toBeChecked();
  await osJunk.uncheck();
  await secrets.uncheck();
  await page.getByRole('button', { name: 'Manage…' }).click();
  await page.getByLabel('Save current configuration as').fill('My tools');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await expect(page.getByLabel('Project preset')).toHaveValue('custom-1');
  await page.getByLabel('Project preset').selectOption('tauri');
  await expect(osJunk).toBeChecked();
  await expect(secrets).toBeChecked();
  await page.getByLabel('Project preset').selectOption('custom-1');
  await expect(osJunk).not.toBeChecked();
  await expect(secrets).not.toBeChecked();
  await page.getByRole('button', { name: 'Manage…' }).click();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Rename preset').fill('Team tools');
  await page.getByRole('button', { name: 'Rename', exact: true }).first().click();
  await expect(page.getByRole('dialog').getByText('Team tools', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(
    page.getByText('Delete “Team tools”? Your current configuration will be kept.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Team tools', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete preset', exact: true }).click();
  await expect(page.getByText('No custom presets saved.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('appearance override works and failed publication reuses the local repository', async ({
  page,
}) => {
  await prepare(page, true);
  await page.getByLabel('Appearance').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await page.getByLabel('Appearance').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await page.getByLabel('Project name').fill('fresh-start');
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Private', exact: true })).toBeChecked();
  await page.getByLabel('Owner', { exact: true }).selectOption('sample-org');
  await page.locator('.advanced-panel > summary').click();
  await page.getByLabel('Homepage').fill('invalid-url');
  await expect(page.getByRole('button', { name: 'Create Repository' })).toBeDisabled();
  await page.getByRole('button', { name: 'Local only', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create Repository' })).toBeEnabled();
  await page.getByRole('button', { name: 'GitHub', exact: true }).click();
  await page.getByLabel('Homepage').fill('');
  await expect(page.getByLabel('Owner', { exact: true })).toHaveValue('sample-org');
  await page.getByRole('button', { name: 'Create Repository' }).click();
  await expect(page.getByRole('heading', { name: 'Publishing incomplete' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Repository created' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Retry publishing' }).click();
  await expect(page.getByRole('heading', { name: 'Repository created' })).toBeVisible();
  const commands = await page.evaluate(() => (window as any).testCalls.map((c: any) => c.command));
  expect(commands.filter((c: string) => c === 'create_repository')).toHaveLength(1);
  expect(commands.filter((c: string) => c === 'retry_publish')).toHaveLength(1);
});
