import { useEffect, useRef } from 'react'
import type { HubConnection } from '@microsoft/signalr'
import {
  adminRealtimeEvents,
  createAdminRealtimeConnection,
} from '../realtime/adminRealtime'
import type { AdminRealtimeHandlers } from '../types'

const INITIAL_RETRY_DELAY_MS = 5_000

export function useAdminRealtime(enabled: boolean, handlers: AdminRealtimeHandlers): void {
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
    const connection = createAdminRealtimeConnection()
    const refreshDashboard = () => {
      void handlersRef.current.onDashboardChanged()
    }
    const refreshOperations = () => {
      void handlersRef.current.onOperationsChanged()
    }
    const refreshInvites = () => {
      refreshDashboard()
      refreshOperations()
    }

    connection.on(adminRealtimeEvents.inviteRequestReceived, refreshInvites)
    connection.on(adminRealtimeEvents.invitationAccepted, refreshInvites)
    connection.on(adminRealtimeEvents.invitesChanged, refreshInvites)
    connection.on(adminRealtimeEvents.operationsChanged, refreshOperations)
    connection.onreconnecting((error) => {
      if (error) {
        console.warn('Admin real-time connection is reconnecting', error)
      }
    })
    connection.onreconnected(() => {
      if (!disposed) {
        refreshInvites()
      }
    })
    connection.onclose((error) => {
      if (disposed) {
        return
      }

      if (error) {
        console.error('Admin real-time connection closed', error)
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

        console.error('Admin real-time connection failed', error)
        retryTimer = setTimeout(() => void startConnection(), INITIAL_RETRY_DELAY_MS)
      }
    }

    void startConnection()

    return () => {
      disposed = true
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer)
      }

      connection.off(adminRealtimeEvents.inviteRequestReceived, refreshInvites)
      connection.off(adminRealtimeEvents.invitationAccepted, refreshInvites)
      connection.off(adminRealtimeEvents.invitesChanged, refreshInvites)
      connection.off(adminRealtimeEvents.operationsChanged, refreshOperations)
      void stopConnection(connection)
    }
  }, [enabled])
}

async function stopConnection(connection: HubConnection): Promise<void> {
  try {
    await connection.stop()
  } catch (error) {
    console.error('Admin real-time connection could not be stopped cleanly', error)
  }
}
