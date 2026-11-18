
// Env: POSTERN_OUT (dataset manifest path, same as seed.mjs).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deterministicUuid } from './nfr-dataset.mjs'
import { dockerExecutable } from './docker-path.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(here, '..', '..')
const manifest = resolve(process.env.POSTERN_OUT ?? join(here, 'generated', 'nfr-dataset.json'))
const PAGE_SIZE = 50

function envFile(name) {
  const values = {}
  for (const line of readFileSync(join(repositoryRoot, 'env', name), 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator > 0) values[line.slice(0, separator)] = line.slice(separator + 1)
  }
  return values
}

const database = envFile('db.env')
const dataset = JSON.parse(readFileSync(manifest, 'utf8'))

// Feed SQL over stdin: Windows command-line length limits reject large -c args.
function psql(sql) {
  return execFileSync(dockerExecutable, [
    'compose', 'exec', '-T', 'db',
    'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', database.POSTGRES_USER, '-d', database.POSTGRES_DB
  ], { cwd: repositoryRoot, input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] })
}

const literal = (value) => `'${String(value).replace(/'/g, "''")}'`
const messageRows = []
const blockedRows = []

for (const account of dataset.accounts) {
  for (let sequence = 1; sequence <= PAGE_SIZE; sequence += 1) {
    const id = deterministicUuid(`message:${account.index}:${sequence}`)
    const messageId = `<nfr-read-${account.index}-${sequence}@postern.local>`
    messageRows.push(
      `(${literal(id)}, ${literal(account.aliasId)}, 'Load Sender <read-sender@example.test>', ` +
      `'read-sender@example.test', ${literal(`Read page ${account.index}-${sequence}`)}, ` +
      `'pass', false, ${literal(messageId)}, now())`
    )

    const blockedId = deterministicUuid(`blocked:${account.index}:${sequence}`)
    blockedRows.push(
      `(${literal(blockedId)}, ${literal(account.aliasId)}, 'Blocked Sender <blocked@example.test>', ` +
      `${literal(`Blocked ${account.index}-${sequence}`)}, now(), 'global_blocklist')`
    )
  }
}

console.log(`Topping up ${dataset.accounts.length} aliases to ${PAGE_SIZE}-item pages`)
psql(`
  INSERT INTO postern.messages
    (id, alias_id, from_header, envelope_sender, subject, authentication_result, is_flagged, message_id, received_at)
  VALUES
    ${messageRows.join(',\n  ')}
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO postern.blocked_messages
    (id, alias_id, from_header, subject, received_at, reason)
  VALUES
    ${blockedRows.join(',\n  ')}
  ON CONFLICT (id) DO NOTHING;
`)

console.log(`Seeded ${messageRows.length} activity rows and ${blockedRows.length} blocked rows`)
