// QR3.3: mixed, peak and saturation k6 profiles.
//
//   POSTERN_PROFILE=mixed|peak|saturation k6 run load/scripts/k6-mixed.js
//
// mixed      - 20 rps ingest + 25 authenticated read sessions; >=95% of
//              core-task steps within target, <1% errors.
// peak       - same at 28 rps ingest (peak interpretation of the requirement).
// saturation - excess on the rate-limited login path must be throttled as 429
//              (never 5xx) while the ingest/mail-ingress path stays healthy.

import { Counter, Rate } from 'k6/metrics'
import { createHMAC } from 'k6/crypto'
import { b64encode } from 'k6/encoding'
import http from 'k6/http'

const apiUrl = (__ENV.POSTERN_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '')
const signingKey = __ENV.POSTERN_SIGNING_KEY
const ingestSecret = __ENV.POSTERN_INGEST_SECRET
const profile = __ENV.POSTERN_PROFILE ?? 'mixed'
const duration = __ENV.POSTERN_DURATION ?? { mixed: '3m', peak: '3m', saturation: '1m' }[profile]
const runId = __ENV.RUN_ID ?? `${Date.now()}`

if (!signingKey) throw new Error('POSTERN_SIGNING_KEY is required')
if (!ingestSecret) throw new Error('POSTERN_INGEST_SECRET is required')
if (!['mixed', 'peak', 'saturation'].includes(profile)) throw new Error(`Unknown profile: ${profile}`)

const dataset = JSON.parse(open('./generated/nfr-dataset.json', 'r'))
const accounts = dataset.accounts
if (accounts.length === 0) throw new Error('Seed dataset contains no accounts')

const ingestWithin = new Rate('ingest_within_target')
const readWithin = new Rate('read_within_target')
const errorRate = new Rate('error_rate')
const serverErrors = new Counter('server_errors')
const throttled429 = new Counter('throttled_429')
const mailPathOk = new Rate('mail_path_ok')

const stripPadding = (value) => value.split('=').join('')
const base64url = (value) => stripPadding(b64encode(value, 'rawurl'))

function mintToken(account, sequence) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    sub: account.userId,
    email: account.email,
    jti: `${runId}-sat-${__VU}-${sequence}`,
    nbf: now, iat: now, exp: now + 3600,
    iss: __ENV.POSTERN_JWT_ISSUER ?? 'Postern',
    aud: __ENV.POSTERN_JWT_AUDIENCE ?? 'Postern.Web'
  }))
  const input = `${header}.${payload}`
  const hasher = createHMAC('sha256', signingKey)
  hasher.update(input)
  return `${input}.${stripPadding(hasher.digest('base64url'))}`
}

function record(status, durationMs) {
  if (status >= 500) serverErrors.add(1)
  errorRate.add(status < 200 || status >= 400)
}

function buildScenario(name, exec, rate, vus) {
  return {
    executor: 'constant-arrival-rate',
    rate,
    timeUnit: '1s',
    duration,
    preAllocatedVUs: vus,
    maxVUs: vus * 4,
    gracefulStop: '10s',
    exec,
    tags: { scenario: name }
  }
}

function buildOptions() {
  if (profile === 'saturation') {
    return {
      scenarios: {
        throttle: buildScenario('throttle', 'throttleFn', 100, 50),
        ingest: buildScenario('ingest', 'ingestFn', 20, 20)
      },
      thresholds: {
        server_errors: ['count==0'],
        mail_path_ok: ['rate==1'],
        throttled_429: ['count>0']
      },
      summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max']
    }
  }

  const ingestRate = profile === 'peak' ? 28 : 20
  return {
    scenarios: {
      ingest: buildScenario('ingest', 'ingestFn', ingestRate, 20),
      reads: buildScenario('reads', 'readFn', 25, 25)
    },
    thresholds: {
      ingest_within_target: ['rate>=0.95'],
      read_within_target: ['rate>=0.95'],
      error_rate: ['rate<0.01'],
      server_errors: ['count==0']
    },
    summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max']
  }
}

export const options = buildOptions()

export function ingestFn() {
  const sequence = `${runId}-${__VU}-${__ITER}`
  const account = accounts[(__VU + __ITER) % accounts.length]
  const response = http.post(`${apiUrl}/api/ingest`, JSON.stringify({
    recipientAddress: account.aliasAddress,
    envelopeSender: 'load-sender@example.test',
    fromHeader: 'Postern Load <load-sender@example.test>',
    subject: `NFR mixed ${sequence}`,
    authenticationResult: 'pass',
    messageId: `<nfr-mixed-${sequence}@postern.local>`
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Postern-Ingest-Secret': ingestSecret
    },
    tags: { scenario: 'ingest' }
  })

  record(response.status, response.timings.duration)
  ingestWithin.add(response.timings.duration <= 300)
  if (profile === 'saturation') {
    mailPathOk.add(response.status === 202 || response.status === 200)
  }
}

export function readFn() {
  const account = accounts[(__VU - 1 + __ITER) % accounts.length]
  const token = mintToken(account, __ITER)
  const endpoint = (__VU + __ITER) % 2 === 0 ? 'blocked' : 'activity'
  const path = endpoint === 'activity'
    ? `/api/aliases/${account.aliasId}/messages?limit=50`
    : `/api/messages/blocked?limit=50`

  const response = http.get(`${apiUrl}${path}`, {
    headers: { Cookie: `Postern.Auth=${token}`, Accept: 'application/json' },
    tags: { scenario: 'reads', endpoint }
  })

  record(response.status, response.timings.duration)
  readWithin.add(response.timings.duration <= 500)
}

export function throttleFn() {
  const response = http.post(`${apiUrl}/api/auth/login`, JSON.stringify({
    email: 'nfr-saturation-nonexistent@example.test',
    password: 'x'.repeat(20)
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { scenario: 'throttle' }
  })

  record(response.status, response.timings.duration)
  if (response.status === 429) throttled429.add(1)
}
