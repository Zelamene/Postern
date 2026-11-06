import { describe, expect, it, vi } from 'vitest'
import { adminRealtimeEvents, createAdminRealtimeConnection } from '../../src/realtime/adminRealtime'

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

describe('adminRealtime', () => {
  it('exposes events and builds the admin connection', () => {
    expect(adminRealtimeEvents.inviteRequestReceived).toBe('InviteRequestReceived')
    const connection = createAdminRealtimeConnection()

    expect(withUrl).toHaveBeenCalledWith('/api/admin/events', { withCredentials: true })
    expect(withAutomaticReconnect).toHaveBeenCalled()
    expect(connection).toEqual({ kind: 'connection' })
  })
})
