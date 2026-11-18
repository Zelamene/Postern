import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(webDirectory, '..')
const projectName = `postern-dast-${randomUUID().replaceAll('-', '')}`
const workDirectory = path.resolve(process.env.POSTERN_DAST_WORK_DIR || path.join(tmpdir(), projectName))
const authDirectory = path.join(workDirectory, 'auth')
const zapImage =
  process.env.POSTERN_ZAP_IMAGE ||
  'ghcr.io/zaproxy/zaproxy:stable@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af'
const e2eSecrets = {
  databaseBootstrapPassword: randomBytes(32).toString('base64url'),
  migratorPassword: randomBytes(32).toString('base64url'),
  appPassword: randomBytes(32).toString('base64url'),
  signingKey: randomBytes(48).toString('base64url'),
  ingestSecret: randomBytes(32).toString('base64url'),
}
let composeStarted = false
let webProcess
let stoppingWeb = false

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

async function waitForHttp(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`${label} returned ${response.status}.`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  throw new Error(`${label} did not become ready: ${lastError?.message ?? 'startup timed out'}.`)
}

function startWebServer(port, environment) {
  const viteEntry = path.join(webDirectory, 'node_modules', 'vite', 'bin', 'vite.js')
  webProcess = spawn(
    process.execPath,
    [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: webDirectory, env: environment, stdio: 'inherit' },
  )
  const unexpectedExit = new Promise((_, reject) => {
    webProcess.once('exit', (code, signal) => {
      if (!stoppingWeb) reject(new Error(`Vite exited before DAST completed (${signal ?? code}).`))
    })
  })
  return Promise.race([
    waitForHttp(`http://127.0.0.1:${port}`, 30_000, 'Vite'),
    unexpectedExit,
  ])
}

function stopWebServer() {
  if (!webProcess || webProcess.exitCode !== null) return Promise.resolve()
  stoppingWeb = true
  return new Promise((resolve) => {
    webProcess.once('exit', resolve)
    webProcess.kill()
  })
}

function mountPath(fileSystemPath) {
  if (process.platform !== 'win32') return fileSystemPath
  return fileSystemPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1')
}

function zapNetworkArguments() {
  return process.platform === 'win32'
    ? ['--add-host=host.docker.internal:host-gateway']
    : ['--network', 'host']
}

function zapTarget(host, port) {
  return `http://${host}:${port}`
}

async function runZapScan({ role, target, targetHost, reports }) {
  const sessionFile = `zap-${role}-session.json`
  const reportFile = `zap-${role}-report.json`
  const htmlFile = `zap-${role}-report.html`
  const args = [
    'run',
    '--rm',
    ...zapNetworkArguments(),
    '-v',
    `${mountPath(workDirectory)}:/zap/wrk:rw`,
    '-e',
    'ZAP_WORK_DIR=/zap/wrk',
    '-e',
    `ZAP_SESSION_FILE=${sessionFile}`,
    '-e',
    `ZAP_SESSION_ROLE=${role}`,
    '-e',
    'ZAP_SESSION_HOST=127.0.0.1',
    zapImage,
    'zap-full-scan.py',
    '-t',
    target,
    '-I',
    '-j',
    '--ajax-spider',
    '-m',
    '20',
    '-T',
    '30',
    '-l',
    'WARN',
    '-c',
    'zap-rules.tsv',
    '-J',
    reportFile,
    '-r',
    htmlFile,
    '--hook',
    '/zap/wrk/zap-auth-hook.py',
    '-z',
    '-config globalexcludeurl.url_list(0).value=.*/api/auth/logout.* -config globalexcludeurl.url_list(1).value=.*/logout.*',
  ]
  await run('docker', args, { cwd: repositoryRoot })
  reports.push({ role, json: reportFile, html: htmlFile, target: targetHost })
}

async function main() {
  await mkdir(workDirectory, { recursive: true })
  await mkdir(authDirectory, { recursive: true })
  await copyFile(
    path.join(webDirectory, 'scripts', 'zap-auth-hook.py'),
    path.join(workDirectory, 'zap-auth-hook.py'),
  )
  await copyFile(
    path.join(webDirectory, 'zap', 'rules.tsv'),
    path.join(workDirectory, 'zap-rules.tsv'),
  )

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
  await waitForHttp(`${apiUrl}/api/dev/invites`, 90_000, 'E2E API')

  const webEnvironment = {
    ...process.env,
    POSTERN_E2E_API_URL: apiUrl,
    POSTERN_E2E_COMPOSE_PROJECT: projectName,
    POSTERN_E2E_AUTH_DIR: authDirectory,
    POSTERN_E2E_INGEST_SECRET: e2eSecrets.ingestSecret,
    POSTERN_E2E_WEB_PORT: String(webPort),
    VITE_API_PROXY_TARGET: apiUrl,
  }
  await startWebServer(webPort, webEnvironment)

  await run(
    process.execPath,
    [
      path.join(webDirectory, 'node_modules', '@playwright', 'test', 'cli.js'),
      'test',
      '--config',
      path.join(webDirectory, 'playwright.dast-seed.config.ts'),
    ],
    { cwd: webDirectory, env: webEnvironment },
  )

  await copyFile(
    path.join(authDirectory, 'user.json'),
    path.join(workDirectory, 'zap-user-session.json'),
  )
  await copyFile(
    path.join(authDirectory, 'admin.json'),
    path.join(workDirectory, 'zap-admin-session.json'),
  )

  const targetHost = process.platform === 'win32' ? 'host.docker.internal' : '127.0.0.1'
  const target = zapTarget(targetHost, webPort)
  const reports = []
  const scanErrors = []
  // The admin JWT is intentionally short-lived (15 minutes), so scan it first.
  for (const role of ['admin', 'user']) {
    try {
      await runZapScan({ role, target, targetHost, reports })
    } catch (error) {
      scanErrors.push(error)
      console.error(`ZAP ${role} scan failed:`, error)
    }
  }

  await writeFile(
    path.join(workDirectory, 'dast-scan.json'),
    `${JSON.stringify(
      {
        scannedAt: new Date().toISOString(),
        target,
        zapImage,
        sessions: ['user', 'admin'],
        reports,
      },
      null,
      2,
    )}\n`,
  )

  if (scanErrors.length) {
    throw new AggregateError(scanErrors, `${scanErrors.length} ZAP scan(s) failed.`)
  }
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
      console.error('Reading the DAST API logs failed:', logError)
    }
  }
} finally {
  try {
    await stopWebServer()
  } catch (error) {
    console.error('Stopping the DAST web server failed:', error)
    failure ??= error
  }

  try {
    await rm(authDirectory, { recursive: true, force: true })
    for (const role of ['admin', 'user']) {
      await rm(path.join(workDirectory, `zap-${role}-session.json`), { force: true })
    }
  } catch (error) {
    console.error('Removing DAST session state failed:', error)
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
      console.error('Removing the isolated DAST database failed:', error)
      failure ??= error
    }
  }
}

if (failure) {
  process.exitCode = 1
}
