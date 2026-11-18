import path from 'node:path'
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises'
import {
  createProjectName,
  defaultDirectory,
  repositoryRoot,
  run,
  runDisposable,
  webDirectory,
} from './e2e-runtime.mjs'

const workDirectory = path.resolve(
  process.env.POSTERN_DAST_WORK_DIR || defaultDirectory(createProjectName('postern-dast-work')),
)
const zapImage =
  process.env.POSTERN_ZAP_IMAGE ||
  'ghcr.io/zaproxy/zaproxy:stable@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af'
const scanTimeouts = {
  admin: 15 * 60_000,
  user: 20 * 60_000,
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
  // -m bounds the traditional spider and -T bounds startup/passive waiting;
  // timeoutMs is the only bound on the full scan for this role.
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
    '5',
    '-T',
    '10',
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
    [
      '-silent',
      '-config globalexcludeurl.url_list(0).value=.*/api/auth/logout.*',
      '-config globalexcludeurl.url_list(1).value=.*/logout.*',
      '-config globalexcludeurl.url_list(2).value=.*/node_modules/.*',
      '-config globalexcludeurl.url_list(3).value=.*/@vite/.*',
    ].join(' '),
  ]
  await run('docker', args, { cwd: repositoryRoot, timeoutMs: scanTimeouts[role] })
  reports.push({ role, json: reportFile, html: htmlFile, target: targetHost })
}

await runDisposable({
  name: 'DAST',
  prefix: 'postern-dast',
  authDirectory: path.join(workDirectory, 'auth'),
  extraCleanupFiles: ['admin', 'user'].map((role) =>
    path.join(workDirectory, `zap-${role}-session.json`),
  ),
  task: async ({ stack, webPort, webEnvironment }) => {
    await mkdir(workDirectory, { recursive: true })
    if (process.platform !== 'win32') await chmod(workDirectory, 0o777)
    await mkdir(stack.authDirectory, { recursive: true })
    await copyFile(
      path.join(webDirectory, 'scripts', 'zap-auth-hook.py'),
      path.join(workDirectory, 'zap-auth-hook.py'),
    )
    await copyFile(
      path.join(webDirectory, 'zap', 'rules.tsv'),
      path.join(workDirectory, 'zap-rules.tsv'),
    )

    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: webDirectory,
    })
    await stack.startWebServer(webPort, webEnvironment, 'preview')
    await stack.runPlaywright('playwright.dast-seed.config.ts', webEnvironment)

    await copyFile(
      path.join(stack.authDirectory, 'user.json'),
      path.join(workDirectory, 'zap-user-session.json'),
    )
    await copyFile(
      path.join(stack.authDirectory, 'admin.json'),
      path.join(workDirectory, 'zap-admin-session.json'),
    )

    const targetHost = process.platform === 'win32' ? 'host.docker.internal' : '127.0.0.1'
    const target = zapTarget(targetHost, webPort)
    const reports = []
    // The admin JWT is intentionally short-lived (15 minutes), so scan it first
    // and fail immediately if it cannot complete.
    for (const role of ['admin', 'user']) {
      await runZapScan({ role, target, targetHost, reports })
    }

    await writeFile(
      path.join(workDirectory, 'dast-scan.json'),
      `${JSON.stringify(
        {
          scannedAt: new Date().toISOString(),
          target,
          zapImage,
          sessions: ['admin', 'user'],
          reports,
        },
        null,
        2,
      )}\n`,
    )
  },
})
