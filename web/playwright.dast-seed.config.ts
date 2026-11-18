import { defineConfig, devices } from '@playwright/test'

const port = process.env.POSTERN_E2E_WEB_PORT
const authDirectory = process.env.POSTERN_E2E_AUTH_DIR
if (!port || !process.env.POSTERN_E2E_API_URL || !authDirectory) {
  throw new Error('Run DAST session seeding with npm run test:dast.')
}

export default defineConfig({
  testDir: './scripts',
  globalSetup: './scripts/e2e-global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [
    {
      name: 'dast-seed',
      testMatch: 'dast-seed.spec.ts',
    },
  ],
})
