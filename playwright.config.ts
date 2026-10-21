import { defineConfig } from '@playwright/test';

const port = Number(process.env.REPO_CREATOR_TEST_PORT || 1421);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL,
    viewport: { width: 1100, height: 740 },
    channel: 'msedge',
    // Keep native scrollbars available for the pointer-drag regression in headless Edge.
    launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'dark', use: { colorScheme: 'dark' } },
    { name: 'light', use: { colorScheme: 'light' } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
