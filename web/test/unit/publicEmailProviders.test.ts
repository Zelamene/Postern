import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PUBLIC_EMAIL_PROVIDERS,
  isPublicEmailProvider,
} from '../../src/services/publicEmailProviders'

const shared = JSON.parse(
  readFileSync(resolve(process.cwd(), '../shared/public-email-domains.json'), 'utf8'),
) as { domains: string[] }

describe('public email providers', () => {
  it('matches the shared contract used by the ingest policy', () => {
    expect([...PUBLIC_EMAIL_PROVIDERS].sort()).toEqual([...shared.domains].sort())
  })

  it('recognises shared mailbox domains but not corporate domains', () => {
    expect(isPublicEmailProvider(' GMAIL.COM ')).toBe(true)
    expect(isPublicEmailProvider('yahoo.co.uk')).toBe(true)
    expect(isPublicEmailProvider('netflix.com')).toBe(false)
    expect(isPublicEmailProvider('github.com')).toBe(false)
    expect(isPublicEmailProvider(null)).toBe(false)
  })
})
