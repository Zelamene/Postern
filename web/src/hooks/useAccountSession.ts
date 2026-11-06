import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCurrentAccount, type CurrentAccount } from '../services/accountService'
import { ApiError } from '../services/apiClient'

export type AccountSession =
  | { status: 'checking' }
  | { status: 'slow' }
  | { status: 'ready'; account: CurrentAccount }
  | { status: 'anonymous' }
  | { status: 'unavailable' }

export interface AccountSessionState {
  session: AccountSession
  retry: () => void
  refresh: () => Promise<void>
}

const SLOW_AFTER_MS = 3_000

export function useAccountSession(): AccountSessionState {
  const [session, setSession] = useState<AccountSession>({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)
  const attemptRef = useRef(attempt)

  useEffect(() => {
    attemptRef.current = attempt
  }, [attempt])

  const retry = useCallback(() => {
    setSession({ status: 'checking' })
    setAttempt((current) => current + 1)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const account = await fetchCurrentAccount()
      setSession({ status: 'ready', account })
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setSession({ status: 'anonymous' })
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const activeAttempt = attempt

    const slowTimer = globalThis.setTimeout(() => {
      if (!controller.signal.aborted && attemptRef.current === activeAttempt) {
        setSession((current) => (current.status === 'checking' ? { status: 'slow' } : current))
      }
    }, SLOW_AFTER_MS)

    fetchCurrentAccount(controller.signal)
      .then((account) => {
        if (controller.signal.aborted) {
          return
        }

        setSession({ status: 'ready', account })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setSession({ status: 'anonymous' })
          return
        }

        setSession({ status: 'unavailable' })
      })
      .finally(() => {
        globalThis.clearTimeout(slowTimer)
      })

    return () => {
      controller.abort()
      globalThis.clearTimeout(slowTimer)
    }
  }, [attempt])

  return { session, retry, refresh }
}
