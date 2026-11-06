import { useEffect, useRef } from 'react'
import type { HubConnection } from '@microsoft/signalr'
import {
  createUserRealtimeConnection,
  userRealtimeEvents,
} from '../realtime/userRealtime'
import type { UserRealtimeHandlers } from '../types'

const INITIAL_RETRY_DELAY_MS = 5_000

export function useUserRealtime(enabled: boolean, handlers: UserRealtimeHandlers): void {
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const connection = createUserRealtimeConnection()
    const onAliasesChanged = () => {
      void handlersRef.current.onAliasesChanged()
    }
    const onMessageReceived = (aliasId: string) => {
      void handlersRef.current.onMessageReceived(aliasId)
    }
    const onBlockedMessageReceived = (aliasId: string) => {
      void handlersRef.current.onBlockedMessageReceived(aliasId)
    }
    const onAccountChanged = () => {
      void handlersRef.current.onAccountChanged()
    }

    connection.on(userRealtimeEvents.aliasesChanged, onAliasesChanged)
    connection.on(userRealtimeEvents.messageReceived, onMessageReceived)
    connection.on(userRealtimeEvents.blockedMessageReceived, onBlockedMessageReceived)
    connection.on(userRealtimeEvents.accountChanged, onAccountChanged)
    connection.onreconnecting((error) => {
      if (error) {
        console.warn('User real-time connection is reconnecting', error)
      }
    })
    connection.onreconnected(() => {
      if (!disposed) {
        onAliasesChanged()
        onAccountChanged()
      }
    })
    connection.onclose((error) => {
      if (disposed) {
        return
      }

      if (error) {
        console.error('User real-time connection closed', error)
      }
      retryTimer = setTimeout(() => void startConnection(), INITIAL_RETRY_DELAY_MS)
    })

    async function startConnection(): Promise<void> {
      try {
        await connection.start()
      } catch (error) {
        if (disposed) {
          return
        }

        console.error('User real-time connection failed', error)
        retryTimer = setTimeout(() => void startConnection(), INITIAL_RETRY_DELAY_MS)
      }
    }

    void startConnection()

    return () => {
      disposed = true
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer)
      }

      connection.off(userRealtimeEvents.aliasesChanged, onAliasesChanged)
      connection.off(userRealtimeEvents.messageReceived, onMessageReceived)
      connection.off(userRealtimeEvents.blockedMessageReceived, onBlockedMessageReceived)
      connection.off(userRealtimeEvents.accountChanged, onAccountChanged)
      void stopConnection(connection)
    }
  }, [enabled])
}

async function stopConnection(connection: HubConnection): Promise<void> {
  try {
    await connection.stop()
  } catch (error) {
    console.error('User real-time connection could not be stopped cleanly', error)
  }
}
