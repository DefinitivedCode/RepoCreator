import { expect, test, type Page } from '@playwright/test';
import { prepare } from './fixtures';

async function capture(page: Page, name: string) {
  if (process.env.REPO_CREATOR_BASELINE !== '1') return;
  for (const [width, height] of [
    [820, 580],
    [1100, 740],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `artifacts/redesign-group3/${test.info().project.name}/${width}-${name}.png`,
      animations: 'disabled',
    });
  }
}

test('theme applies instantly, reports a pending save and retries beside the theme control', async ({
  page,
}) => {
  await prepare(page);
  await page.evaluate(() => {
    const testWindow = window as any;
    const original = testWindow.__TAURI_INTERNALS__.invoke;
    let first = true;
    testWindow.__TAURI_INTERNALS__.invoke = async (command: string, payload: unknown) => {
      if (command === 'set_appearance' && first) {
        first = false;
        await new Promise((resolve) => {
          testWindow.finishThemeSave = resolve;
        });
        throw {
          message: 'Could not save the theme.',
          guidance: 'Check that settings can be written.',
        };
      }
      return original(command, payload);
    };
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  const theme = page.getByRole('group', { name: 'Theme', exact: true });
  const appearance = test.info().project.name;
  await theme.getByRole('radio', { name: new RegExp(`^${appearance}$`, 'i') }).check();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', appearance);
  await expect(theme.getByRole('status')).toHaveText('Saving theme…');
  await page.evaluate(() => (window as any).finishThemeSave());
  await expect(theme.getByRole('alert')).toContainText('Could not save the theme.');
  await expect(theme.getByRole('alert')).toContainText('Check that settings can be written.');
  await capture(page, 'theme-retry');
  await theme.getByRole('button', { name: 'Retry saving theme' }).click();
  await expect(theme.getByRole('alert')).toBeHidden();
  await expect(theme.getByRole('radio', { checked: true })).toHaveCount(1);
  await capture(page, 'theme');
});

test('folder selection and creation show errors next to the relevant action', async ({ page }) => {
  await prepare(page, false, 'simple');
  await page.evaluate(() => {
    const testWindow = window as any;
    const original = testWindow.__TAURI_INTERNALS__.invoke;
    let first = true;
    testWindow.__TAURI_INTERNALS__.invoke = async (command: string, payload: unknown) => {
      if (command === 'choose_parent' && first) {
        first = false;
        throw { message: 'Folder selection failed.', guidance: 'Choose a folder you can access.' };
      }
      if (command === 'create_repository')
        throw {
          message: 'Could not create the repository.',
          guidance: 'Check the folder permissions and try again.',
        };
      return original(command, payload);
    };
  });
  const location = page.locator('.overview-location');
  await location.getByRole('button', { name: 'Browse…', exact: true }).click();
  await expect(location.getByRole('alert')).toContainText('Choose a folder you can access.');
  await capture(page, 'location-error');
  await location.getByRole('button', { name: 'Choose a folder', exact: true }).click();
  await expect(location.getByRole('alert')).toBeHidden();
  await page.getByLabel('Project name').fill('fictional-folder');
  const create = page.getByRole('button', { name: 'Create project', exact: true });
  await create.click();
  const actions = page.locator('.creation-status-bar');
  await expect(actions.getByRole('alert')).toContainText('Could not create the repository.');
  await expect(actions.getByRole('alert')).toContainText('Check the folder permissions');
  await expect(create).toHaveAttribute('aria-describedby', /creation-error/);
  await capture(page, 'create-error');
});

test('the library shows a loading skeleton and places add errors at the add action', async ({
  page,
}) => {
  await prepare(page);
  await page.evaluate(() => {
    const testWindow = window as any;
    const original = testWindow.__TAURI_INTERNALS__.invoke;
    testWindow.__TAURI_INTERNALS__.invoke = async (command: string, payload: unknown) => {
      if (command === 'list_recent_projects')
        return new Promise((resolve) => {
          testWindow.finishLibraryLoad = () => resolve([]);
        });
      if (command === 'add_existing_project')
        throw { message: 'Could not add the project.', guidance: 'Choose a local Git repository.' };
      return original(command, payload);
    };
  });
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const library = page.getByRole('main', { name: 'Project library' });
  await expect(library.locator('.ui-loading-skeleton')).toBeVisible();
  await expect(library.getByRole('status')).toHaveText('Loading projects…');
  await capture(page, 'library-loading');
  await page.evaluate(() => (window as any).finishLibraryLoad());
  await expect(library.locator('.ui-loading-skeleton')).toBeHidden();
  await library.getByRole('button', { name: 'Add existing project' }).click();
  await expect(library.locator('.page-heading').getByRole('alert')).toContainText(
    'Choose a local Git repository.',
  );
  await capture(page, 'library-error');
});
