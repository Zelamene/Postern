

import { createHash, randomUUID } from 'node:crypto'

export const ACCOUNT_COUNT = 199
export const ACCOUNT_EMAIL_DOMAIN = 'example.test'
export const ALIAS_DOMAIN = 'postern.local'

// Ephemeral throwaway-account password. Generated per run so no credential is
// committed; seed.mjs records the value used in the gitignored manifest.
export const DEV_PASSWORD = randomUUID()

const pad3 = (value) => String(value).padStart(3, '0')

export function accountFor(index) {
  const id = pad3(index)
  return {
    index,
    email: `nfr-user-${id}@${ACCOUNT_EMAIL_DOMAIN}`,
    label: `nfr-${id}`,
    suffix: `n${id}`,
    aliasAddress: `nfr-${id}-n${id}@${ALIAS_DOMAIN}`
  }
}

export function allAccounts(count = ACCOUNT_COUNT) {
  return Array.from({ length: count }, (_, offset) => accountFor(offset + 1))
}

// Mirrors AliasService.HashAddress: Convert.ToHexString(SHA256(...)) is upper case.
export function aliasHash(address) {
  return createHash('sha256').update(address, 'utf8').digest('hex').toUpperCase()
}

// Stable UUID v5-shaped value derived from a label; only determinism matters here.
export function deterministicUuid(label) {
  const bytes = Buffer.from(createHash('sha256').update(`postern-nfr:${label}`).digest().subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Mirrors EmailAddressNormalizer.NormalizeIdentity: upper-case local part,
// lower-case ASCII domain.
export function normalizedEmail(email) {
  const separator = email.lastIndexOf('@')
  return `${email.slice(0, separator).toUpperCase()}@${email.slice(separator + 1).toLowerCase()}`
}

export function messageId(runId, vu, iteration, sequence) {
  return `<nfr-load-${runId}-${vu}-${iteration}-${sequence}@${ALIAS_DOMAIN}>`
}
