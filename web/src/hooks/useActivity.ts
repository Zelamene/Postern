import { useCallback, useEffect, useState } from 'react'
import { fetchAliasMessages, fetchBlockedMessages } from '../services/activityService'
import { ApiError } from '../services/apiClient'
import type {
  ActivityFeed,
  BlockedMessage,
  FeedStatus,
  MailMessage,
  PageLoader,
} from '../types'

function describeFeedError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Your session has ended. Sign in again to view activity.'
    }

    if (error.status === 404) {
      return 'That alias could not be found.'
    }
  }

  return 'Activity could not be loaded. Please try again.'
}

function useActivityFeed<T>(loader: PageLoader<T> | null): ActivityFeed<T> {
  const [activeLoader, setActiveLoader] = useState<PageLoader<T> | null>(() => loader)
  const [items, setItems] = useState<T[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<FeedStatus>(loader === null ? 'idle' : 'loading')
  const [error, setError] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  if (activeLoader !== loader) {
    setActiveLoader(() => loader)
    setItems([])
    setNextCursor(null)
    setError(null)
    setIsLoadingMore(false)
    setStatus(loader === null ? 'idle' : 'loading')
  }

  useEffect(() => {
    if (loader === null) {
      return
    }

    let active = true
    const controller = new AbortController()

    loader(null, controller.signal)
      .then((page) => {
        if (!active) {
          return
        }

        setItems(page.items)
        setNextCursor(page.nextCursor)
        setStatus('ready')
      })
      .catch((loadError: unknown) => {
        if (!active) {
          return
        }

        console.error('Unable to load activity', loadError)
        setError(describeFeedError(loadError))
        setStatus('error')
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [loader])

  const loadMore = useCallback(async () => {
    if (loader === null || nextCursor === null || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)

    try {
      const page = await loader(nextCursor, new AbortController().signal)
      setItems((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (loadError) {
      console.error('Unable to load more activity', loadError)
      setError(describeFeedError(loadError))
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, loader, nextCursor])

  const refresh = useCallback(async () => {
    if (loader === null) {
      return
    }

    try {
      const page = await loader(null, new AbortController().signal)
      setItems(page.items)
      setNextCursor(page.nextCursor)
      setError(null)
      setStatus('ready')
    } catch (loadError) {
      console.error('Unable to refresh activity', loadError)
    }
  }, [loader])

  return {
    items,
    status,
    error,
    hasMore: nextCursor !== null,
    isLoadingMore,
    loadMore,
    refresh,
  }
}

export function useAliasMessages(aliasId: string | null): ActivityFeed<MailMessage> {
  const loader = useCallback<PageLoader<MailMessage>>(
    (cursor, signal) =>
      aliasId === null
        ? Promise.resolve({ items: [], nextCursor: null })
        : fetchAliasMessages(aliasId, { cursor, limit: 25, signal }),
    [aliasId],
  )

  return useActivityFeed(aliasId === null ? null : loader)
}

export function useBlockedMessages(enabled: boolean): ActivityFeed<BlockedMessage> {
  const loader = useCallback<PageLoader<BlockedMessage>>(
    (cursor, signal) => fetchBlockedMessages({ cursor, limit: 25, signal }),
    [],
  )

  return useActivityFeed(enabled ? loader : null)
}
