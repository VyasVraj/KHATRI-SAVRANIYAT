import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Configuration for Community Roots
 *
 * Requirements:
 * - Deterministic execution in headless and CI modes
 * - Configurable baseURL via PLAYWRIGHT_BASE_URL (defaults to http://localhost:5173)
 * - Auto-spawns Vite dev server if no server is running
 * - Never includes production credentials or secrets
 */

const PORT = process.env.PORT || 5173
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e/specs',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 5173',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
})
