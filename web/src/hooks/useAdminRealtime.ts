import { useEffect } from 'react'
import type { HubConnection } from '@microsoft/signalr'
import {
  adminRealtimeEvents,
  createAdminRealtimeConnection,
} from '../realtime/adminRealtime'

const INITIAL_RETRY_DELAY_MS = 5_000

export function useAdminRealtime(
  enabled: boolean,
  onDashboardChanged: () => Promise<void>,
): void {
  useEffect(() => {
    if (!enabled) {
      return
    }

    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const connection = createAdminRealtimeConnection()
    const refreshDashboard = () => {
      void onDashboardChanged()
    }

    connection.on(adminRealtimeEvents.inviteRequestReceived, refreshDashboard)
    connection.on(adminRealtimeEvents.invitationAccepted, refreshDashboard)
    connection.onreconnecting((error) => {
      if (error) {
        console.warn('Admin real-time connection is reconnecting', error)
      }
    })
    connection.onreconnected(() => {
      if (!disposed) {
        refreshDashboard()
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

      connection.off(adminRealtimeEvents.inviteRequestReceived, refreshDashboard)
      connection.off(adminRealtimeEvents.invitationAccepted, refreshDashboard)
      void stopConnection(connection)
    }
  }, [enabled, onDashboardChanged])
}

async function stopConnection(connection: HubConnection): Promise<void> {
  try {
    await connection.stop()
  } catch (error) {
    console.error('Admin real-time connection could not be stopped cleanly', error)
  }
}
