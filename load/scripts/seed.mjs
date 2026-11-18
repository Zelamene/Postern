
// Env: POSTERN_API_URL, POSTERN_COUNT, POSTERN_OUT 

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ACCOUNT_COUNT, DEV_PASSWORD, aliasHash, allAccounts, deterministicUuid, normalizedEmail
} from './nfr-dataset.mjs'
import { dockerExecutable } from './docker-path.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(here, '..', '..')

const apiUrl = (process.env.POSTERN_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '')
const count = Number(process.env.POSTERN_COUNT ?? ACCOUNT_COUNT)
const output = resolve(process.env.POSTERN_OUT ?? join(here, 'generated', 'nfr-dataset.json'))

if (!Number.isInteger(count) || count < 1) throw new Error('POSTERN_COUNT must be a positive integer')

function envFile(name) {
  const values = {}
  for (const line of readFileSync(join(repositoryRoot, 'env', name), 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator > 0) values[line.slice(0, separator)] = line.slice(separator + 1)
  }
  return values
}

const database = envFile('db.env')

async function waitForApi() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/health/ready`)
      if (response.ok) return
    } catch { /* still starting */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
  }
  throw new Error(`${apiUrl}/health/ready did not become healthy within 90 s`)
}

async function request(path, { method = 'GET', body, cookie, expected } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (cookie) headers.Cookie = cookie

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual'
  })
  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      if (expected?.includes(response.status)) throw new Error(`${method} ${path}: non-JSON response: ${text.slice(0, 200)}`)
    }
  }
  const authCookie = (response.headers.getSetCookie?.() ?? [])
    .map((value) => value.split(';', 1)[0])
    .find((value) => value.startsWith('Postern.Auth='))

  if (expected && !expected.includes(response.status)) {
    throw new Error(`${method} ${path}: expected ${expected.join('/')} but got ${response.status} ${text}`)
  }
  return { status: response.status, payload, authCookie }
}

// The API is used only to mint a real password hash and to prove the stack is
// live. Three logins stay well inside the development login rate limit.
async function obtainPasswordHash(email) {
  const existing = queryScalar(
    "select password_hash from postern.users where email like 'nfr-user-%@example.test' limit 1"
  )
  if (existing) return existing

  const invite = await request('/api/dev/invites', {
    method: 'POST', body: { email }, expected: [201]
  })
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password: DEV_PASSWORD, inviteCode: invite.payload.code },
    expected: [202, 409]
  })
  if (registered.status !== 202) throw new Error(`Throwaway registration failed: ${JSON.stringify(registered.payload)}`)

  await request(`/api/dev/destinations/${encodeURIComponent(email)}/verify`, { method: 'POST', expected: [204] })
  const login = await request('/api/auth/login', {
    method: 'POST', body: { email, password: DEV_PASSWORD }, expected: [200, 403]
  })
  if (login.status === 403) {
    await request(`/api/dev/destinations/${encodeURIComponent(email)}/verify`, { method: 'POST', expected: [204] })
  }
  const retry = await request('/api/auth/login', {
    method: 'POST', body: { email, password: DEV_PASSWORD }, expected: [200]
  })
  if (!retry.authCookie) throw new Error('Throwaway login did not return an auth cookie')

  return queryScalar(
    `select password_hash from postern.users where normalized_email = '${normalizedEmail(email)}'`
  )
}

// Long INSERTs exceed the Windows command-line limit as an argument, so feed
// SQL to psql over stdin instead.
function queryScalar(sql) {
  return execFileSync(dockerExecutable, [
    'compose', 'exec', '-T', 'db',
    'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', database.POSTGRES_USER, '-d', database.POSTGRES_DB, '-tAc', sql
  ], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
}

function psql(sql) {
  return execFileSync(dockerExecutable, [
    'compose', 'exec', '-T', 'db',
    'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', database.POSTGRES_USER, '-d', database.POSTGRES_DB
  ], { cwd: repositoryRoot, input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] })
}

function writeDataset(accounts, passwordHash) {
  const literal = (value) => `'${String(value).replace(/'/g, "''")}'`

  const userRows = accounts.map((account) => {
    const id = deterministicUuid(`user:${account.index}`)
    Object.assign(account, { userId: id, aliasId: deterministicUuid(`alias:${account.index}`) })
    return `(${literal(id)}, ${literal(account.email)}, ${literal(normalizedEmail(account.email))}, ` +
      `${literal(passwordHash)}, false, 'active', ${literal(account.email)}, now())`
  }).join(',\n  ')

  const aliasRows = accounts.map((account) =>
    `(${literal(account.aliasId)}, ${literal(account.userId)}, ${literal(account.label)}, ` +
    `${literal(account.suffix)}, ${literal(account.aliasAddress)}, ${literal(aliasHash(account.aliasAddress))}, ` +
    `'other', 'active', true, now())`
  ).join(',\n  ')

  psql(`
    DELETE FROM postern.aliases
     WHERE user_id IN (SELECT id FROM postern.users WHERE email LIKE 'nfr-user-%@example.test');
    DELETE FROM postern.users
     WHERE email LIKE 'nfr-user-%@example.test' OR email LIKE 'nfr-throwaway-%@example.test';

    INSERT INTO postern.users
      (id, email, normalized_email, password_hash, is_admin, status, forwarding_address, created_at)
    VALUES
      ${userRows};

    INSERT INTO postern.aliases
      (id, user_id, label, random_suffix, full_address, full_address_hash, category, status, kv_dirty, created_at)
    VALUES
      ${aliasRows};
  `)
}

await waitForApi()
const accounts = allAccounts(count)
console.log(`Seeding ${count} deterministic accounts via ${apiUrl}`)
const throwawayEmail = `nfr-throwaway-${Date.now()}@example.test`
const passwordHash = await obtainPasswordHash(throwawayEmail)
writeDataset(accounts, passwordHash)
psql(`DELETE FROM postern.users WHERE email = '${throwawayEmail}';`)

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify({
  generatedAt: new Date().toISOString(),
  apiUrl,
  count,
  password: DEV_PASSWORD,
  accountEmailDomain: 'example.test',
  aliasDomain: 'postern.local',
  accounts: accounts.map(({ index, email, password: _ignored, userId, aliasId, aliasAddress }) => ({
    index, email, userId, aliasId, aliasAddress
  }))
}, null, 2) + '\n')

console.log(`Seeded ${accounts.length} accounts; deterministic aliases nfr-001-n001@postern.local ...`)
console.log(`Dataset written to ${output}`)
