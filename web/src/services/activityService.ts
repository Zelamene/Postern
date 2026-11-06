import { requestJson } from './apiClient'

export interface MailMessage {
  id: string
  aliasId: string
  fromHeader: string
  envelopeSender: string
  subject: string | null
  receivedAt: string
  authenticationResult: string
  isFlagged: boolean
  flagReason: string | null
}

export interface BlockedMessage {
  id: string
  aliasId: string
  fromHeader: string
  subject: string | null
  receivedAt: string
  reason: string
}

export interface ActivityPage<T> {
  items: T[]
  nextCursor: string | null
}

interface ActivityQuery {
  cursor?: string | null
  limit?: number
  signal?: AbortSignal
}

function toQuery({ cursor, limit }: ActivityQuery): string {
  const params = new URLSearchParams()
  if (limit !== undefined) {
    params.set('limit', String(limit))
  }

  if (cursor) {
    params.set('cursor', cursor)
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}

export function fetchAliasMessages(
  aliasId: string,
  query: ActivityQuery = {},
): Promise<ActivityPage<MailMessage>> {
  return requestJson<ActivityPage<MailMessage>>(
    `/api/aliases/${encodeURIComponent(aliasId)}/messages${toQuery(query)}`,
    { signal: query.signal },
  )
}

export function fetchBlockedMessages(
  query: ActivityQuery & { aliasId?: string | null } = {},
): Promise<ActivityPage<BlockedMessage>> {
  const params = new URLSearchParams()
  if (query.aliasId) {
    params.set('aliasId', query.aliasId)
  }

  if (query.limit !== undefined) {
    params.set('limit', String(query.limit))
  }

  if (query.cursor) {
    params.set('cursor', query.cursor)
  }

  const suffix = params.toString()
  return requestJson<ActivityPage<BlockedMessage>>(
    `/api/messages/blocked${suffix ? `?${suffix}` : ''}`,
    { signal: query.signal },
  )
}
