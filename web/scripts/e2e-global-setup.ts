import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type FullConfig } from '@playwright/test'
import {
  createAdminAccount,
  createVerifiedAccount,
} from '../test/e2e/support/accounts'

export default async function globalSetup(_config: FullConfig) {
  const authDirectory = process.env.POSTERN_E2E_AUTH_DIR
  const webPort = process.env.POSTERN_E2E_WEB_PORT
  if (!authDirectory || !webPort) {
    throw new Error('The E2E auth directory and web port must be set by the test runner.')
  }

  await mkdir(authDirectory, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    baseURL: `http://127.0.0.1:${webPort}`,
  })

  try {
    const page = await context.newPage()
    const user = await createVerifiedAccount(page, 'api')
    await context.storageState({ path: path.join(authDirectory, 'user.json') })
    await context.storageState({ path: path.join(authDirectory, 'account-deletion.json') })
    await writeFile(
      path.join(authDirectory, 'account-deletion-credentials.json'),
      JSON.stringify(user),
      { mode: 0o600 },
    )

    const admin = await createAdminAccount(page)
    await context.storageState({ path: path.join(authDirectory, 'admin.json') })
    await writeFile(
      path.join(authDirectory, 'admin-credentials.json'),
      JSON.stringify(admin),
      { mode: 0o600 },
    )
  } finally {
    await context.close()
    await browser.close()
  }
}
