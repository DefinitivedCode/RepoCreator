// The Simple/Advanced switch is gone; the preference lives in Settings → General.
export async function setMode(page, mode) {
  const main = page.getByRole('navigation', { name: 'Main navigation' });
  await main.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Show advanced options by default' })
    .setChecked(mode === 'advanced');
  await main.getByRole('button', { name: 'New Project', exact: true }).click();
}
