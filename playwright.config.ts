import { defineConfig, devices } from '@playwright/test';

// The offline spike (e2e/offline): a minimal page with the step 5 setup, against a stub API that the tests control. Chromium only
// (the design says WebKit "where the API allows"; it is not installed here).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure' },
  // PLAYWRIGHT_CHROMIUM_EXECUTABLE points at a Chromium already on the machine; CI installs the browser with `playwright install`.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} } }],
  webServer: {
    command: 'yarn vite --config e2e/offline/vite.config.ts',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
