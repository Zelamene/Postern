import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(webDirectory, '..')
const projectName = `postern-e2e-${randomUUID().replaceAll('-', '')}`
const authDirectory = path.join(tmpdir(), projectName)
const e2eSecrets = {
  databaseBootstrapPassword: randomBytes(32).toString('base64url'),
  migratorPassword: randomBytes(32).toString('base64url'),
  appPassword: randomBytes(32).toString('base64url'),
  signingKey: randomBytes(48).toString('base64url'),
  ingestSecret: randomBytes(32).toString('base64url'),
}
let composeStarted = false

function createComposeEnvironment(dbPort, apiPort) {
  return {
    ...process.env,
    POSTERN_E2E_DB_PORT: String(dbPort),
    POSTERN_E2E_API_PORT: String(apiPort),
    POSTGRES_PASSWORD: e2eSecrets.databaseBootstrapPassword,
    POSTERN_MIGRATOR_PASSWORD: e2eSecrets.migratorPassword,
    POSTERN_APP_PASSWORD: e2eSecrets.appPassword,
    ConnectionStrings__Postgres:
      `Host=db;Port=5432;Database=postern_e2e;Username=postern_app;` +
      `Password=${e2eSecrets.appPassword};Search Path=postern`,
    Authentication__SigningKey: e2eSecrets.signingKey,
    Ingest__SharedSecret: e2eSecrets.ingestSecret,
  }
}

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  return port
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} exited with ${signal ?? `code ${code}`}.`))
      }
    })
  })
}

async function waitForApi(apiUrl) {
  const deadline = Date.now() + 90_000
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiUrl}/api/dev/invites`)
      if (response.ok) {
        return
      }
      lastError = new Error(`API readiness endpoint returned ${response.status}.`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  throw new Error(
    `The API did not become ready: ${lastError?.message ?? 'startup timed out'}.`,
  )
}

async function main() {
  const dbPort = await availablePort()
  const apiPort = await availablePort()
  const webPort = await availablePort()
  const compose = [
    'compose',
    '--project-name',
    projectName,
    '--project-directory',
    repositoryRoot,
    '--file',
    path.join(repositoryRoot, 'docker-compose.e2e.yml'),
  ]
  const composeEnvironment = createComposeEnvironment(dbPort, apiPort)

  composeStarted = true
  await run('docker', [...compose, 'up', '--detach', '--wait', '--wait-timeout', '90', 'db'], {
    env: composeEnvironment,
  })

  const database = {
    host: '127.0.0.1',
    port: dbPort,
    name: 'postern_e2e',
    migrator: 'postern_migrator',
    app: 'postern_app',
  }
  const migrationEnvironment = {
    ...process.env,
    POSTERN_MIGRATOR_CONNECTION_STRING:
      `Host=${database.host};Port=${database.port};Database=${database.name};` +
      `Username=${database.migrator};Password=${e2eSecrets.migratorPassword};Search Path=postern`,
  }
  await run('dotnet', ['tool', 'restore'], { env: migrationEnvironment })
  await run(
    'dotnet',
    [
      'ef',
      'database',
      'update',
      '--project',
      path.join(repositoryRoot, 'backend', 'src', 'Postern.Infrastructure'),
      '--startup-project',
      path.join(repositoryRoot, 'backend', 'src', 'Postern.Api'),
    ],
    { env: migrationEnvironment },
  )

  const apiUrl = `http://127.0.0.1:${apiPort}`
  await run('docker', [...compose, 'up', '--detach', '--wait', '--wait-timeout', '120', 'api'], {
    env: composeEnvironment,
  })
  await waitForApi(apiUrl)

  const webEnvironment = {
    ...process.env,
    POSTERN_E2E_API_URL: apiUrl,
    POSTERN_E2E_COMPOSE_PROJECT: projectName,
    POSTERN_E2E_AUTH_DIR: authDirectory,
    POSTERN_E2E_INGEST_SECRET: e2eSecrets.ingestSecret,
    POSTERN_E2E_WEB_PORT: String(webPort),
    VITE_API_PROXY_TARGET: apiUrl,
  }
  await run(
    process.execPath,
    [
      path.join(webDirectory, 'node_modules', '@playwright', 'test', 'cli.js'),
      'test',
      '--config',
      path.join(webDirectory, 'playwright.config.ts'),
      ...process.argv.slice(2),
    ],
    { cwd: webDirectory, env: webEnvironment },
  )
}

let failure
try {
  await main()
} catch (error) {
  failure = error
  console.error(error)
  if (composeStarted) {
    try {
      await run(
        'docker',
        [
          'compose',
          '--project-name',
          projectName,
          '--project-directory',
          repositoryRoot,
          '--file',
          path.join(repositoryRoot, 'docker-compose.e2e.yml'),
          'logs',
          '--tail',
          '100',
          'api',
        ],
        { env: createComposeEnvironment(5432, 8080) },
      )
    } catch (logError) {
      console.error('Reading the E2E API logs failed:', logError)
    }
  }
} finally {
  try {
    await rm(authDirectory, { recursive: true, force: true })
  } catch (error) {
    console.error('Removing the isolated E2E authentication state failed:', error)
    failure ??= error
  }

  if (composeStarted) {
    try {
      await run(
        'docker',
        [
          'compose',
          '--project-name',
          projectName,
          '--project-directory',
          repositoryRoot,
          '--file',
          path.join(repositoryRoot, 'docker-compose.e2e.yml'),
          'down',
          '--volumes',
          '--remove-orphans',
        ],
        { env: createComposeEnvironment(5432, 8080) },
      )
    } catch (error) {
      console.error('Removing the isolated E2E database failed:', error)
      failure ??= error
    }
  }
}

if (failure) {
  process.exitCode = 1
}
