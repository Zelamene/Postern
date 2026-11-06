import { describe, expect, it, vi } from 'vitest'
import { createUserRealtimeConnection, userRealtimeEvents } from '../../src/realtime/userRealtime'

const build = vi.fn(() => ({ kind: 'connection' }))
const configureLogging = vi.fn(() => ({ build }))
const withAutomaticReconnect = vi.fn(() => ({ configureLogging }))
const withUrl = vi.fn(() => ({ withAutomaticReconnect }))

vi.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: class {
    withUrl = withUrl
  },
  LogLevel: { Warning: 3 },
}))

describe('userRealtime', () => {
  it('exposes events and builds the user connection', () => {
    expect(userRealtimeEvents.aliasesChanged).toBe('AliasesChanged')
    expect(userRealtimeEvents.messageReceived).toBe('MessageReceived')
    expect(userRealtimeEvents.blockedMessageReceived).toBe('BlockedMessageReceived')
    expect(userRealtimeEvents.accountChanged).toBe('AccountChanged')

    const connection = createUserRealtimeConnection()

    expect(withUrl).toHaveBeenCalledWith('/api/user/events', { withCredentials: true })
    expect(withAutomaticReconnect).toHaveBeenCalled()
    expect(connection).toEqual({ kind: 'connection' })
  })
})
