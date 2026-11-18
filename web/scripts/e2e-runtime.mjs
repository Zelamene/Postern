import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const repositoryRoot = path.resolve(webDirectory, '..')

const composeFile = path.join(repositoryRoot, 'docker-compose.e2e.yml')
const infrastructureProject = path.join(repositoryRoot, 'backend', 'src', 'Postern.Infrastructure')
const apiProject = path.join(repositoryRoot, 'backend', 'src', 'Postern.Api')

export function createProjectName(prefix) {
  return `${prefix}-${randomUUID().replaceAll('-', '')}`
}

export function defaultDirectory(projectName) {
  return path.join(tmpdir(), projectName)
}

export function createSecrets() {
  return {
    databaseBootstrapPassword: randomBytes(32).toString('base64url'),
    migratorPassword: randomBytes(32).toString('base64url'),
    appPassword: randomBytes(32).toString('base64url'),
    signingKey: randomBytes(48).toString('base64url'),
    ingestSecret: randomBytes(32).toString('base64url'),
  }
}

export function createComposeEnvironment(secrets, dbPort, apiPort) {
  return {
    ...process.env,
    POSTERN_E2E_DB_PORT: String(dbPort),
    POSTERN_E2E_API_PORT: String(apiPort),
    POSTGRES_PASSWORD: secrets.databaseBootstrapPassword,
    POSTERN_MIGRATOR_PASSWORD: secrets.migratorPassword,
    POSTERN_APP_PASSWORD: secrets.appPassword,
    ConnectionStrings__Postgres:
      `Host=db;Port=5432;Database=postern_e2e;Username=postern_app;` +
      `Password=${secrets.appPassword};Search Path=postern`,
    Authentication__SigningKey: secrets.signingKey,
    Ingest__SharedSecret: secrets.ingestSecret,
  }
}

export async function availablePort() {
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

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
    })
    let settled = false
    let timer

    const settle = (error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }

    if (options.timeoutMs) {
      timer = setTimeout(() => {
        child.kill('SIGTERM')
        settle(new Error(`${command} exceeded the ${options.timeoutMs} ms timeout.`))
      }, options.timeoutMs)
    }

    child.once('error', settle)
    child.once('close', (code, signal) => {
      if (code === 0) {
        settle()
      } else {
        settle(new Error(`${command} exited with ${signal ?? `code ${code}`}.`))
      }
    })
  })
}

export async function waitForHttp(url, timeoutMs, label) {
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

export class DisposableStack {
  constructor({ name, projectName, secrets, authDirectory, extraCleanupFiles = [] }) {
    this.name = name
    this.projectName = projectName
    this.secrets = secrets
    this.authDirectory = authDirectory
    this.extraCleanupFiles = extraCleanupFiles
    this.composeStarted = false
    this.webProcess = undefined
    this.stoppingWeb = false
  }

  composeArgs(...args) {
    return [
      'compose',
      '--project-name',
      this.projectName,
      '--project-directory',
      repositoryRoot,
      '--file',
      composeFile,
      ...args,
    ]
  }

  teardownEnvironment() {
    return createComposeEnvironment(this.secrets, 5432, 8080)
  }

  async allocatePorts() {
    return {
      dbPort: await availablePort(),
      apiPort: await availablePort(),
      webPort: await availablePort(),
    }
  }

  async startDatabase(dbPort, apiPort) {
    const composeEnvironment = createComposeEnvironment(this.secrets, dbPort, apiPort)
    this.composeStarted = true
    await run('docker', this.composeArgs('up', '--detach', '--wait', '--wait-timeout', '90', 'db'), {
      env: composeEnvironment,
    })

    const migrationEnvironment = {
      ...process.env,
      POSTERN_MIGRATOR_CONNECTION_STRING:
        `Host=127.0.0.1;Port=${dbPort};Database=postern_e2e;` +
        `Username=postern_migrator;Password=${this.secrets.migratorPassword};Search Path=postern`,
    }
    await run('dotnet', ['tool', 'restore'], { env: migrationEnvironment })
    await run('dotnet', ['restore', path.join(repositoryRoot, 'backend', 'Postern.slnx')], {
      env: migrationEnvironment,
    })
    await run(
      'dotnet',
      [
        'ef',
        'database',
        'update',
        '--project',
        infrastructureProject,
        '--startup-project',
        apiProject,
      ],
      { env: migrationEnvironment },
    )
  }

  async startApi(dbPort, apiPort) {
    const composeEnvironment = createComposeEnvironment(this.secrets, dbPort, apiPort)
    await run('docker', this.composeArgs('up', '--detach', '--wait', '--wait-timeout', '120', 'api'), {
      env: composeEnvironment,
    })
    const apiUrl = `http://127.0.0.1:${apiPort}`
    await waitForHttp(`${apiUrl}/api/dev/invites`, 90_000, `${this.name} API`)
    return apiUrl
  }

  webEnvironment(apiUrl, webPort) {
    return {
      ...process.env,
      POSTERN_E2E_API_URL: apiUrl,
      POSTERN_E2E_COMPOSE_PROJECT: this.projectName,
      POSTERN_E2E_AUTH_DIR: this.authDirectory,
      POSTERN_E2E_INGEST_SECRET: this.secrets.ingestSecret,
      POSTERN_E2E_WEB_PORT: String(webPort),
      VITE_API_PROXY_TARGET: apiUrl,
    }
  }

  async runPlaywright(configFile, environment, extraArgs = []) {
    await run(
      process.execPath,
      [
        path.join(webDirectory, 'node_modules', '@playwright', 'test', 'cli.js'),
        'test',
        '--config',
        path.join(webDirectory, configFile),
        ...extraArgs,
      ],
      { cwd: webDirectory, env: environment },
    )
  }

  async startWebServer(port, environment, mode = 'development') {
    const viteEntry = path.join(webDirectory, 'node_modules', 'vite', 'bin', 'vite.js')
    const viteArgs =
      mode === 'preview'
        ? [viteEntry, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
        : [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort']
    const label = mode === 'preview' ? 'Vite preview' : 'Vite'
    this.webProcess = spawn(process.execPath, viteArgs, {
      cwd: webDirectory,
      env: environment,
      stdio: 'inherit',
    })
    const unexpectedExit = new Promise((_, reject) => {
      this.webProcess.once('exit', (code, signal) => {
        if (!this.stoppingWeb) {
          reject(new Error(`${label} exited before ${this.name} completed (${signal ?? code}).`))
        }
      })
    })
    await Promise.race([
      waitForHttp(`http://127.0.0.1:${port}`, 30_000, label),
      unexpectedExit,
    ])
  }

  async stopWebServer() {
    if (!this.webProcess || this.webProcess.exitCode !== null) return
    this.stoppingWeb = true
    await new Promise((resolve) => {
      this.webProcess.once('exit', resolve)
      this.webProcess.kill()
    })
  }

  async printApiLogs() {
    if (!this.composeStarted) return
    try {
      await run('docker', this.composeArgs('logs', '--tail', '100', 'api'), {
        env: this.teardownEnvironment(),
      })
    } catch (error) {
      console.error(`Reading the ${this.name} API logs failed:`, error)
    }
  }

  async stop() {
    const errors = []
    try {
      await this.stopWebServer()
    } catch (error) {
      console.error(`Stopping the ${this.name} web server failed:`, error)
      errors.push(error)
    }

    try {
      await rm(this.authDirectory, { recursive: true, force: true })
      for (const file of this.extraCleanupFiles) {
        await rm(file, { force: true })
      }
    } catch (error) {
      console.error(`Removing ${this.name} session state failed:`, error)
      errors.push(error)
    }

    if (this.composeStarted) {
      try {
        await run('docker', this.composeArgs('down', '--volumes', '--remove-orphans'), {
          env: this.teardownEnvironment(),
        })
      } catch (error) {
        console.error(`Removing the isolated ${this.name} database failed:`, error)
        errors.push(error)
      }
    }

    if (errors.length) {
      throw new AggregateError(errors, `${this.name} cleanup failed.`)
    }
  }
}

export async function runDisposable({ name, prefix, authDirectory, extraCleanupFiles, task }) {
  const projectName = createProjectName(prefix)
  const stack = new DisposableStack({
    name,
    projectName,
    secrets: createSecrets(),
    authDirectory: authDirectory ?? defaultDirectory(projectName),
    extraCleanupFiles,
  })

  let failure
  try {
    const { dbPort, apiPort, webPort } = await stack.allocatePorts()
    await stack.startDatabase(dbPort, apiPort)
    const apiUrl = await stack.startApi(dbPort, apiPort)
    const webEnvironment = stack.webEnvironment(apiUrl, webPort)
    await task({ projectName, stack, apiUrl, webPort, webEnvironment })
  } catch (error) {
    failure = error
    console.error(error)
    await stack.printApiLogs()
  } finally {
    try {
      await stack.stop()
    } catch (error) {
      console.error(`${name} cleanup failed:`, error)
      failure ??= error
    }
  }

  if (failure) process.exitCode = 1
}
