import { useEffect, useState } from 'react'
import { fetchCurrentAccount, type CurrentAccount } from '../services/accountService'
import { ApiError } from '../services/apiClient'

export type AccountSession =
  | { status: 'checking' }
  | { status: 'ready'; account: CurrentAccount }
  | { status: 'anonymous' }
  | { status: 'unavailable' }

export function useAccountSession(): AccountSession {
  const [session, setSession] = useState<AccountSession>({ status: 'checking' })

  useEffect(() => {
    const controller = new AbortController()

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

        console.error('Unable to load the signed-in account', error)
        setSession({ status: 'unavailable' })
      })

    return () => controller.abort()
  }, [])

  return session
}
