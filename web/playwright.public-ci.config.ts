import { defineConfig, devices } from '@playwright/test'

// Lightweight public-page a11y gate for PR CI (QR6.1). Runs the existing brand
// axe scan against a built preview server without the full E2E stack.
export default defineConfig({
  testDir: './test/e2e/public',
  testMatch: 'brand-guide.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/brand/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
