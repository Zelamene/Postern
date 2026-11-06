import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAdminRealtime } from '../../src/hooks/useAdminRealtime'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  lifecycle: {
    onclose: undefined as ((error?: Error) => void) | undefined,
    onreconnected: undefined as (() => void) | undefined,
    onreconnecting: undefined as ((error?: Error) => void) | undefined,
  },
  off: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('../../src/realtime/adminRealtime', () => ({
  adminRealtimeEvents: {
    inviteRequestReceived: 'InviteRequestReceived',
    invitationAccepted: 'InvitationAccepted',
    invitesChanged: 'InvitesChanged',
    operationsChanged: 'OperationsChanged',
  },
  createAdminRealtimeConnection: () => ({
    on: (event: string, handler: () => void) => mocks.handlers.set(event, handler),
    off: mocks.off,
    onclose: (handler: (error?: Error) => void) => {
      mocks.lifecycle.onclose = handler
    },
    onreconnected: (handler: () => void) => {
      mocks.lifecycle.onreconnected = handler
    },
    onreconnecting: (handler: (error?: Error) => void) => {
      mocks.lifecycle.onreconnecting = handler
    },
    start: mocks.start,
    stop: mocks.stop,
  }),
}))

describe('useAdminRealtime', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.lifecycle.onclose = undefined
    mocks.lifecycle.onreconnected = undefined
    mocks.lifecycle.onreconnecting = undefined
  })

  it('refreshes the dashboard and operations when invite state changes', async () => {
    mocks.start.mockResolvedValue(undefined)
    const refreshDashboard = vi.fn().mockResolvedValue(undefined)
    const refreshOperations = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      useAdminRealtime(true, {
        onDashboardChanged: refreshDashboard,
        onOperationsChanged: refreshOperations,
      }),
    )

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())

    act(() => mocks.handlers.get('InviteRequestReceived')?.())
    act(() => mocks.handlers.get('InvitationAccepted')?.())
    act(() => mocks.handlers.get('InvitesChanged')?.())

    expect(refreshDashboard).toHaveBeenCalledTimes(3)
    expect(refreshOperations).toHaveBeenCalledTimes(3)
  })

  it('refreshes operations without reloading invites when operations change', async () => {
    mocks.start.mockResolvedValue(undefined)
    const refreshDashboard = vi.fn().mockResolvedValue(undefined)
    const refreshOperations = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      useAdminRealtime(true, {
        onDashboardChanged: refreshDashboard,
        onOperationsChanged: refreshOperations,
      }),
    )

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())

    act(() => mocks.handlers.get('OperationsChanged')?.())
    expect(refreshOperations).toHaveBeenCalledOnce()
    expect(refreshDashboard).not.toHaveBeenCalled()
  })

  it('refreshes both dashboards after the connection is restored', async () => {
    mocks.start.mockResolvedValue(undefined)
    const refreshDashboard = vi.fn().mockResolvedValue(undefined)
    const refreshOperations = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      useAdminRealtime(true, {
        onDashboardChanged: refreshDashboard,
        onOperationsChanged: refreshOperations,
      }),
    )

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())

    act(() => mocks.lifecycle.onreconnected?.())
    expect(refreshDashboard).toHaveBeenCalledOnce()
    expect(refreshOperations).toHaveBeenCalledOnce()
  })

  it('stops the connection and removes event handlers when disabled', async () => {
    mocks.start.mockResolvedValue(undefined)
    mocks.stop.mockResolvedValue(undefined)
    const refreshDashboard = vi.fn().mockResolvedValue(undefined)
    const refreshOperations = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ enabled }) =>
        useAdminRealtime(enabled, {
          onDashboardChanged: refreshDashboard,
          onOperationsChanged: refreshOperations,
        }),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    rerender({ enabled: false })

    await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce())
    expect(mocks.off).toHaveBeenCalledTimes(4)
  })
})
