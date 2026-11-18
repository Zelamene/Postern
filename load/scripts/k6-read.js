// QR2.2: authenticated dashboard reads on 50-item pages.
//   POSTERN_SIGNING_KEY=... k6 run load/scripts/k6-read.js


import { check } from 'k6'
import { Counter } from 'k6/metrics'
import { createHMAC } from 'k6/crypto'
import { b64encode } from 'k6/encoding'
import http from 'k6/http'

const apiUrl = (__ENV.POSTERN_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '')
const signingKey = __ENV.POSTERN_SIGNING_KEY
const issuer = __ENV.POSTERN_JWT_ISSUER ?? 'Postern'
const audience = __ENV.POSTERN_JWT_AUDIENCE ?? 'Postern.Web'
const duration = __ENV.POSTERN_DURATION ?? '5m'
const rate = Number(__ENV.POSTERN_READ_RATE ?? 25)
const runId = __ENV.RUN_ID ?? `${Date.now()}`

if (!signingKey) throw new Error('POSTERN_SIGNING_KEY is required')

const dataset = JSON.parse(open('./generated/nfr-dataset.json', 'r'))
const accounts = dataset.accounts
if (accounts.length === 0) throw new Error('Seed dataset contains no accounts')

const authFailures = new Counter('auth_failures')
const shortPages = new Counter('short_pages')
const readErrors = new Counter('read_errors')

const stripPadding = (value) => value.split('=').join('')
const base64url = (value) => stripPadding(b64encode(value, 'rawurl'))

function mintToken(account, sequence) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    sub: account.userId,
    email: account.email,
    jti: `${runId}-${__VU}-${sequence}`,
    nbf: now,
    iat: now,
    exp: now + 3600,
    iss: issuer,
    aud: audience
  }))
  const signingInput = `${header}.${payload}`
  const hasher = createHMAC('sha256', signingKey)
  hasher.update(signingInput)
  const signature = stripPadding(hasher.digest('base64url'))
  return `${signingInput}.${signature}`
}

export const options = {
  scenarios: {
    reads: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs: 25,
      maxVUs: 100,
      gracefulStop: '10s'
    }
  },
  thresholds: {
    'http_req_duration{endpoint:activity}': ['p(95)<=500'],
    'http_req_duration{endpoint:blocked}': ['p(95)<=500'],
    auth_failures: ['count==0'],
    short_pages: ['count==0'],
    read_errors: ['count==0']
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max']
}

export default function () {
  const account = accounts[(__VU - 1 + __ITER) % accounts.length]
  const token = mintToken(account, __ITER)
  const headers = {
    Cookie: `Postern.Auth=${token}`,
    Accept: 'application/json'
  }

  // Alternate between the two dashboard 50-item page endpoints.
  const endpoint = (__VU + __ITER) % 2 === 0 ? 'blocked' : 'activity'
  const path = endpoint === 'activity'
    ? `/api/aliases/${account.aliasId}/messages?limit=50`
    : `/api/messages/blocked?limit=50`

  const response = http.get(`${apiUrl}${path}`, {
    headers,
    tags: { scenario: 'reads', endpoint }
  })

  if (response.status === 401) authFailures.add(1)
  if (response.status < 200 || response.status >= 300) {
    readErrors.add(1)
    if (response.status !== 401) {
      console.error(`Read ${endpoint} returned ${response.status}: ${response.body?.slice(0, 200)}`)
    }
    return
  }

  const valid = check(response, {
    'page has 50 items': (r) => {
      try {
        const body = JSON.parse(r.body)
        return Array.isArray(body.items) && body.items.length === 50
      } catch {
        return false
      }
    }
  }, { endpoint })

  if (!valid) {
    shortPages.add(1)
    console.error(`Short ${endpoint} page for ${account.email}: ${response.body?.slice(0, 200)}`)
  }
}
