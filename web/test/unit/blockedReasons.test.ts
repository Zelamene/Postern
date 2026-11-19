import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blockedReasonLabel } from '../../src/services/blockedReasons'

const shared = JSON.parse(
  readFileSync(resolve(process.cwd(), '../shared/blocked-reasons.json'), 'utf8'),
) as { reasons: string[] }

describe('blockedReasonLabel', () => {
  it('maps every reason code from the shared contract to readable text', () => {
    for (const reason of shared.reasons) {
      const label = blockedReasonLabel(reason)
      expect(label).not.toContain('_')
      expect(label[0]).toBe(label[0]?.toUpperCase())
    }

    expect(blockedReasonLabel('blocked_sender')).toBe('Blocked sender')
    expect(blockedReasonLabel('disabled_or_replaced')).toBe('Alias disabled or replaced')
  })

  it('humanizes an unexpected code instead of showing the raw value', () => {
    expect(blockedReasonLabel('future_reason_code')).toBe('Future reason code')
  })
})
