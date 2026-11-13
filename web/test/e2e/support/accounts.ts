import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export async function createVerifiedAccount(
  page: Page,
  registrationMode: 'browser' | 'api' = 'browser',
) {
  const apiUrl = process.env.POSTERN_E2E_API_URL
  if (!apiUrl) {
    throw new Error('The E2E API URL was not configured by the test runner.')
  }

  const email = `e2e-${randomUUID()}@example.test`
  const password = randomBytes(32).toString('base64url')
  const inviteResponse = await page.request.post(`${apiUrl}/api/dev/invites`, {
    data: { email },
  })
  expect(inviteResponse.status()).toBe(201)
  const invite = (await inviteResponse.json()) as { code: string }

  if (registrationMode === 'browser') {
    await page.goto(`/invite/${invite.code}`)
    await expect(page.getByRole('heading', { name: 'Create your Postern account' })).toBeVisible()
    await page.getByLabel('Password').fill(password)
    const registrationResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/auth/register') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Accept invitation' }).click()
    const response = await registrationResponse
    if (response.status() !== 202) {
      throw new Error(
        `The API rejected registration with ${response.status()}: ${await response.text()}`,
      )
    }
    await expect(page.getByRole('status')).toContainText('Your account is ready')
  } else {
    const response = await page.request.post(`${apiUrl}/api/auth/register`, {
      data: { inviteCode: invite.code, password },
    })
    expect(response.status()).toBe(202)
  }

  if (registrationMode === 'api') {
    const verificationResponse = await page.request.post(
      `${apiUrl}/api/dev/destinations/${encodeURIComponent(email)}/verify`,
    )
    expect(verificationResponse.status()).toBe(204)
  }

  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  if (registrationMode === 'browser') {
    await expect(page.getByRole('alert')).toContainText('destination verification')

    const verificationResponse = await page.request.post(
      `${apiUrl}/api/dev/destinations/${encodeURIComponent(email)}/verify`,
    )
    expect(verificationResponse.status()).toBe(204)

    await page.getByRole('button', { name: 'Sign in' }).click()
  }
  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Start with one address' })).toBeVisible()
  await expect(page.getByText('No aliases yet')).toBeVisible()
  return { email, password }
}

const DOCKER_CANDIDATES: Record<string, string[]> = {
  win32: [
    join(
      process.env['ProgramFiles'] ?? 'C:\\Program Files',
      'Docker',
      'Docker',
      'resources',
      'bin',
      'docker.exe',
    ),
    join(
      process.env['LOCALAPPDATA'] ?? '',
      'Programs',
      'DockerDesktop',
      'resources',
      'bin',
      'docker.exe',
    ),
  ],
  darwin: [
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker',
  ],
  linux: ['/usr/bin/docker', '/usr/local/bin/docker', '/snap/bin/docker'],
}

function dockerBinary(): string {
  const candidates = DOCKER_CANDIDATES[process.platform] ?? DOCKER_CANDIDATES.linux
  const found = candidates.find((candidate) => candidate.length > 0 && existsSync(candidate))
  if (!found) {
    throw new Error(
      'The Docker CLI was not found in a standard install location; install Docker or run the E2E suite where it is available.',
    )
  }
  return found
}

export function promoteAccountToAdmin(email: string) {
  if (!/^e2e-[a-f0-9-]+@example\.test$/.test(email)) {
    throw new Error('Refusing to promote an account outside the isolated E2E database.')
  }

  const projectName = process.env.POSTERN_E2E_COMPOSE_PROJECT
  if (!projectName) {
    throw new Error('The E2E Compose project was not configured by the test runner.')
  }

  const [localPart, domain] = email.split('@')
  const normalizedEmail = `${localPart.toUpperCase()}@${domain}`
  const sql = [
    'DO $$ BEGIN',
    `UPDATE postern.users SET is_admin = TRUE WHERE normalized_email = '${normalizedEmail}' AND status = 'active';`,
    'IF NOT FOUND THEN RAISE EXCEPTION \'No active E2E account found for admin setup.\'; END IF;',
    'END $$;',
  ].join(' ')

  execFileSync(
    dockerBinary(),
    [
      'compose',
      '--project-name',
      projectName,
      'exec',
      '-T',
      'db',
      'psql',
      '--username',
      'postern',
      '--dbname',
      'postern_e2e',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      sql,
    ],
    { stdio: 'pipe' },
  )
}

const TOTP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function decodeBase32(secret: string): Buffer {
  let buffer = 0
  let bits = 0
  const bytes: number[] = []
  for (const character of secret) {
    buffer = (buffer << 5) | TOTP_ALPHABET.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function currentTotp(secret: string): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const value =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(value % 1_000_000).padStart(6, '0')
}

export async function signInAsAdmin(
  page: Page,
  email: string,
  password: string,
  existingTotpSecret?: string,
): Promise<string> {
  await page.goto('/admin')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(
    page.getByRole('heading', { name: /Set up two-factor sign-in|Verify it’s you/ }),
  ).toBeVisible()

  const setupRequired = await page
    .getByRole('heading', { name: 'Set up two-factor sign-in' })
    .isVisible()
  let totpSecret = existingTotpSecret
  if (setupRequired) {
    totpSecret = await page.getByText(/^[A-Z2-7]{32}$/).innerText()
    await page.getByLabel('Authenticator code').fill(currentTotp(totpSecret))
    await page.getByRole('button', { name: 'Enable and continue' }).click()
  } else {
    if (!totpSecret) {
      throw new Error('An enrolled admin needs its test authenticator secret to sign in again.')
    }
    await page.getByLabel('Authenticator code').fill(currentTotp(totpSecret))
    await page.getByRole('button', { name: 'Verify and sign in' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
  if (!totpSecret) {
    throw new Error('Administrator MFA completed without a test authenticator secret.')
  }
  return totpSecret
}

export async function createAdminAccount(page: Page) {
  const account = await createVerifiedAccount(page, 'api')
  promoteAccountToAdmin(account.email)
  await page.request.post('/api/auth/logout')
  const totpSecret = await signInAsAdmin(page, account.email, account.password)
  return { ...account, totpSecret }
}
