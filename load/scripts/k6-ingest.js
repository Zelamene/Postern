// Item 19 / QR2.1: sustained ingest at 20 rps for 5 minutes.
//
//   POSTERN_INGEST_SECRET=... k6 run load/scripts/k6-ingest.js
//
// Thresholds are the quantified requirement: p95 <= 300 ms and zero
// unexpected 5xx or unknown-alias responses. No target is adjusted to pass.

import { check } from 'k6'
import { Counter } from 'k6/metrics'
import http from 'k6/http'

const apiUrl = (__ENV.POSTERN_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '')
const ingestSecret = __ENV.POSTERN_INGEST_SECRET
const runId = __ENV.RUN_ID ?? `${Date.now()}`
const duration = __ENV.POSTERN_DURATION ?? '5m'
const rate = Number(__ENV.POSTERN_RATE ?? 20)

if (!ingestSecret) throw new Error('POSTERN_INGEST_SECRET is required')

const dataset = JSON.parse(open('./generated/nfr-dataset.json', 'r'))
const addresses = dataset.accounts.map((account) => account.aliasAddress)
if (addresses.length === 0) throw new Error('Seed dataset contains no aliases')

const unexpected5xx = new Counter('unexpected_5xx')
const unknownAlias = new Counter('unknown_alias')

export const options = {
  scenarios: {
    ingest: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs: 20,
      maxVUs: 200,
      gracefulStop: '10s'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<=300'],
    http_req_failed: ['rate==0'],
    unexpected_5xx: ['count==0'],
    unknown_alias: ['count==0']
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max']
}

export default function () {
  // Unique by construction: run id + VU + iteration. One request per iteration.
  const sequence = `${runId}-${__VU}-${__ITER}`
  const recipient = addresses[(__VU + __ITER) % addresses.length]
  const payload = {
    recipientAddress: recipient,
    envelopeSender: 'load-sender@example.test',
    fromHeader: 'Postern Load <load-sender@example.test>',
    subject: `NFR ingest ${sequence}`,
    authenticationResult: 'pass',
    messageId: `<nfr-load-${sequence}@postern.local>`
  }

  const response = http.post(`${apiUrl}/api/ingest`, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'X-Postern-Ingest-Secret': ingestSecret
    },
    tags: { scenario: 'ingest' }
  })

  const accepted = check(response, {
    'status is accepted or duplicate': (r) => r.status === 202 || r.status === 200
  }, { scenario: 'ingest' })

  if (response.status >= 500) unexpected5xx.add(1)
  if (response.status === 404) unknownAlias.add(1)
  if (!accepted && response.status < 500 && response.status !== 404) {
    console.error(`Unexpected ingest response ${response.status}: ${response.body?.slice(0, 200)}`)
  }

  // constant-arrival-rate paces iterations; no explicit sleep is needed.
}
