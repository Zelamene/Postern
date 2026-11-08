import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const port = process.env.POSTERN_E2E_WEB_PORT
const authDirectory = process.env.POSTERN_E2E_AUTH_DIR
if (
  !port ||
  !process.env.POSTERN_E2E_API_URL ||
  !process.env.VITE_API_PROXY_TARGET ||
  !authDirectory
) {
  throw new Error('Run browser E2E tests with npm run test:e2e.')
}

const baseURL = `http://127.0.0.1:${port}`
const authState = (name: string) => path.join(authDirectory, `${name}.json`)

export default defineConfig({
  testDir: './test/e2e',
  globalSetup: './scripts/e2e-global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'public',
      testMatch: '**/public/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'user',
      testMatch: '**/user/**/*.spec.ts',
      testIgnore: '**/user/account-deletion.spec.ts',
      use: { ...devices['Desktop Chrome'], storageState: authState('user') },
    },
    {
      name: 'user-account-deletion',
      testMatch: '**/user/account-deletion.spec.ts',
      use: { ...devices['Desktop Chrome'], storageState: authState('account-deletion') },
    },
    {
      name: 'admin',
      testMatch: '**/admin/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], storageState: authState('admin') },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
