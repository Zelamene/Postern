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

export type FeedStatus = 'idle' | 'loading' | 'ready' | 'error'

export type PageLoader<T> = (
  cursor: string | null,
  signal: AbortSignal,
) => Promise<ActivityPage<T>>

export interface ActivityFeed<T> {
  items: T[]
  status: FeedStatus
  error: string | null
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
}

export interface AliasActivityExportResult {
  rowCount: number
  limited: boolean
}
