import { fetchAliasMessages, type MailMessage } from './activityService'
import { downloadCsv, formatExportDateRange, sanitizeFilenamePart, serializeCsv } from './csvExport'

export const EXPORT_ROW_LIMIT = 5_000
export const EXPORT_PAGE_LIMIT = 100

const HEADERS = ['sender', 'subject', 'received-at', 'authentication result', 'flagged']

export interface AliasActivityExportResult {
  rowCount: number
  limited: boolean
}

function senderValue(message: MailMessage): string {
  return message.fromHeader?.trim() || message.envelopeSender?.trim() || ''
}

function toRow(message: MailMessage): string[] {
  return [
    senderValue(message),
    message.subject ?? '',
    message.receivedAt ?? '',
    message.authenticationResult ?? '',
    message.isFlagged ? 'yes' : 'no',
  ]
}

export async function exportAliasActivityCsv(
  aliasId: string,
  aliasLabel: string,
  signal?: AbortSignal,
): Promise<AliasActivityExportResult> {
  const items: MailMessage[] = []
  let cursor: string | null = null
  let limited = false

  for (;;) {
    const page = await fetchAliasMessages(aliasId, {
      cursor,
      limit: EXPORT_PAGE_LIMIT,
      signal,
    })
    const remaining = EXPORT_ROW_LIMIT - items.length
    if (remaining <= 0) {
      limited = page.items.length > 0 || page.nextCursor !== null
      break
    }

    if (page.items.length > remaining) {
      items.push(...page.items.slice(0, remaining))
      limited = true
      break
    }

    items.push(...page.items)

    if (items.length >= EXPORT_ROW_LIMIT) {
      limited = page.nextCursor !== null
      break
    }

    if (page.nextCursor === null) {
      break
    }

    cursor = page.nextCursor
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const filename = `postern-${sanitizeFilenamePart(aliasLabel)}-${formatExportDateRange(
    items.map((item) => item.receivedAt),
  )}.csv`
  const csv = serializeCsv(HEADERS, items.map(toRow))
  downloadCsv(filename, csv)

  return { rowCount: items.length, limited }
}
