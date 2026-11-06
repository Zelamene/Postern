import { describe, expect, it } from 'vitest'
import {
  escapeCsvCell,
  formatExportDateRange,
  sanitizeFilenamePart,
  serializeCsv,
} from '../../src/services/csvExport'

describe('csvExport', () => {
  it('escapes commas, quotes, and newlines', () => {
    expect(escapeCsvCell('hello, world')).toBe('"hello, world"')
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('guards formula-risk values without corrupting normal data', () => {
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe("\"'=SUM(A1:A2)\"")
    expect(escapeCsvCell('+cmd')).toBe("\"'+cmd\"")
    expect(escapeCsvCell('normal@example.com')).toBe('normal@example.com')
  })

  it('serializes rows with a header and UTF-8 BOM', () => {
    const csv = serializeCsv(['a', 'b'], [['1', '2,3']])
    expect(csv).toBe('\uFEFFa,b\r\n1,"2,3"\r\n')
  })

  it('builds safe filenames and date ranges', () => {
    expect(sanitizeFilenamePart('My Shop / Orders!')).toBe('my-shop-orders')
    expect(sanitizeFilenamePart('***')).toBe('alias')
    expect(formatExportDateRange(['2026-02-01T10:00:00Z', '2026-02-03T10:00:00Z'])).toBe(
      '2026-02-01-to-2026-02-03',
    )
    expect(formatExportDateRange(['2026-02-01T10:00:00Z'])).toBe('2026-02-01')
    expect(formatExportDateRange([])).toBe('no-messages')
  })
})
