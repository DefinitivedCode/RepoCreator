import { test, expect } from '@playwright/test';
import { prepare } from './fixtures';

async function updates(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Updates', exact: true }).click();
}
test('startup checks run in the background and update preferences persist', async ({ page }) => {
  await page.addInitScript('window.testPersistPreferences=true;');
  await prepare(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls.filter((call: any) => call.command === 'check_for_updates')
            .length,
      ),
    )
    .toBe(1);
  await updates(page);
  await expect(page.getByText('Installed version: 1.4.1')).toBeVisible();
  await expect(page.getByText('No newer eligible update is available on Stable.')).toBeVisible();
  await page.getByLabel('Update channel').selectOption('beta');
  await page.getByLabel('Automatically check for updates at startup').uncheck();
  await page.reload();
  await updates(page);
  await expect(page.getByLabel('Update channel')).toHaveValue('beta');
  await expect(page.getByLabel('Automatically check for updates at startup')).not.toBeChecked();
  expect(
    await page.evaluate(
      () =>
        (window as any).testCalls.filter((call: any) => call.command === 'check_for_updates')
          .length,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Check for Updates', exact: true }).click();
  await expect(page.getByText('No newer eligible update is available on Beta.')).toBeVisible();
});
test('offers show release notes, progress and require explicit installation approval', async ({
  page,
}) => {
  await page.addInitScript(
    `window.testUpdateOffer={version:'1.4.2',notes:'Fixes and improvements. <script>plain text</script>'}; window.testDownloadWait=true;`,
  );
  await prepare(page);
  await expect(page.getByRole('complementary', { name: 'Software update' })).toBeVisible();
  await page.getByRole('button', { name: 'Review update', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Updates', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Fixes and improvements. <script>plain text</script>')).toBeVisible();
  await page.getByRole('button', { name: 'Download update', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Update download' })).toHaveAttribute(
    'value',
    '50',
  );
  await expect(page.getByRole('button', { name: 'Check for Updates', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel download', exact: true }).click();
  await expect(page.getByText('Download cancelled. You can retry later.')).toBeVisible();
  await page.evaluate(() => {
    (window as any).testDownloadWait = false;
  });
  await page.getByRole('button', { name: 'Download update', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update and Restart', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).testCalls.some((call: any) => call.command === 'install_update'),
    ),
  ).toBe(false);
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(
    page.getByText('Update postponed. Return to Updates when you are ready.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Update and Restart', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).testCalls.filter((call: any) => call.command === 'install_update').length,
      ),
    )
    .toBe(1);
});
test('offline, failed downloads and signature errors are recoverable', async ({ page }) => {
  await page.addInitScript(`window.testUpdateError='Update service unavailable while offline.';`);
  await prepare(page);
  await updates(page);
  await expect(page.getByRole('alert').filter({ hasText: 'offline' })).toBeVisible();
  await page.evaluate(() => {
    (window as any).testUpdateError = '';
    (window as any).testUpdateOffer = { version: '1.4.2', notes: 'Release notes' };
    (window as any).testDownloadError =
      'Update signature verification failed. The update was not installed.';
  });
  await page.getByRole('button', { name: 'Check for Updates', exact: true }).click();
  await page.getByRole('button', { name: 'Download update', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'signature verification failed' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update and Restart', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Download update', exact: true })).toBeEnabled();
  await page.getByLabel('Update channel').selectOption('beta');
  await expect(page.getByRole('region', { name: 'Available update' })).toHaveCount(0);
});
