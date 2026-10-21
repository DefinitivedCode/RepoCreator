import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 20_000,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    viewport: { width: 540, height: 780 },
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
    command: 'npm run dev',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: !process.env.CI,
  },
});
