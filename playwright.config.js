// End-to-end tests: the built app in a real browser, against a throwaway
// database. Run with `npm run test:e2e` (first time: `npx playwright install chromium`).
const { defineConfig, devices } = require('@playwright/test');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.E2E_PORT || 3610);
// One data directory per run, created by the process that starts the server.
const DATA = process.env.E2E_DATA_DIR || (process.env.E2E_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'raptortracker-e2e-')));

module.exports = defineConfig({
  testDir: './e2e',
  // The tests share one install and build on each other, like an owner would.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build as owners get it (NODE_ENV=test below would otherwise give Vite a dev build).
    command: 'NODE_ENV=production npm run build --silent && node server.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      DATA_DIR: DATA,
      UPLOAD_DIR: path.join(DATA, 'uploads'),
      NODE_ENV: 'test',
      ADMIN_USERNAME: 'owner',
      ADMIN_PASSWORD: 'e2e-password-long-enough',
      SESSION_SECRET: 'e2e-session-secret-'.padEnd(48, 'x'),
      UPDATE_CHECK: 'false',
    },
  },
});
