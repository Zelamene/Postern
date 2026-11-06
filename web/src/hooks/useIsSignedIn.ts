import { useEffect, useState } from 'react'
import { fetchCurrentAccount } from '../services/accountService'

export function useIsSignedIn(): boolean {
  const [isSignedIn, setIsSignedIn] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    fetchCurrentAccount(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) {
          setIsSignedIn(true)
        }
      })
      .catch(() => {
        // Anonymous visitors and unreachable APIs both keep the public sign-in link.
      })

    return () => controller.abort()
  }, [])

  return isSignedIn
}
