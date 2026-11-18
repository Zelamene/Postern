// Resolve an absolute Docker executable path so local seed scripts never rely
// on an attacker-writable entry in PATH (SonarJS S4036). Override with
// POSTERN_DOCKER_PATH if Docker lives somewhere else.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

const candidates = [
  process.env.POSTERN_DOCKER_PATH,
  join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
  join('C:', 'Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
  '/usr/bin/docker',
  '/usr/local/bin/docker'
].filter(Boolean)

export const dockerExecutable = candidates.find((candidate) => existsSync(candidate))

if (!dockerExecutable) {
  throw new Error('Docker executable not found; set POSTERN_DOCKER_PATH to its absolute path')
}
