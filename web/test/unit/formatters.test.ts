import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from '../../src/services/formatters'

describe('formatters', () => {
  it('formats valid dates', () => {
    expect(formatDate('2026-02-01T10:00:00Z')).not.toBe('Unknown')
    expect(formatDateTime('2026-02-01T10:00:00Z')).not.toBe('Unknown')
  })

  it('returns Unknown for null or invalid values', () => {
    expect(formatDate(null)).toBe('Unknown')
    expect(formatDate('not-a-date')).toBe('Unknown')
    expect(formatDateTime(null)).toBe('Unknown')
    expect(formatDateTime('bad')).toBe('Unknown')
  })
})
