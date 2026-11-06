export function escapeCsvCell(value: string): string {
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value)
  const safeValue = needsFormulaGuard ? `'${value}` : value

  if (/[",\n\r]/.test(safeValue) || needsFormulaGuard) {
    return `"${safeValue.replaceAll('"', '""')}"`
  }

  return safeValue
}

export function serializeCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 48)

  return sanitized || 'alias'
}

function toFileDate(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString().slice(0, 10)
}

export function formatExportDateRange(receivedAtValues: string[]): string {
  const dates = receivedAtValues.map(toFileDate).filter((value): value is string => value !== null)
  if (dates.length === 0) {
    return 'no-messages'
  }

  dates.sort()
  const start = dates[0]
  const end = dates[dates.length - 1]
  return start === end ? start : `${start}-to-${end}`
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
