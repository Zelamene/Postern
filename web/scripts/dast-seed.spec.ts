import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

test('the DAST auth directory contains user and admin sessions', () => {
  const authDirectory = process.env.POSTERN_E2E_AUTH_DIR
  if (!authDirectory) throw new Error('POSTERN_E2E_AUTH_DIR is not set')

  for (const name of ['user.json', 'admin.json']) {
    expect(existsSync(path.join(authDirectory, name)), `${name} was seeded`).toBe(true)
  }
})
