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
    vi.useRealTimers()
    mocks.handlers.clear()
    mocks.lifecycle.onclose = undefined
    mocks.lifecycle.onreconnected = undefined
    mocks.lifecycle.onreconnecting = undefined
  })

  it('does not connect while disabled', () => {
    renderHook(() =>
      useAdminRealtime(false, {
        onDashboardChanged: vi.fn(),
        onOperationsChanged: vi.fn(),
      }),
    )

    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('warns when the connection starts reconnecting with an error', () => {
    mocks.start.mockResolvedValue(undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    renderHook(() =>
      useAdminRealtime(true, {
        onDashboardChanged: vi.fn(),
        onOperationsChanged: vi.fn(),
      }),
    )

    act(() => mocks.lifecycle.onreconnecting?.(new Error('lost')))
    expect(warnSpy).toHaveBeenCalledWith(
      'Admin real-time connection is reconnecting',
      expect.any(Error),
    )

    act(() => mocks.lifecycle.onreconnecting?.())
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('retries after the connection closes and logs the error', async () => {
    vi.useFakeTimers()
    mocks.start.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    renderHook(() =>
      useAdminRealtime(true, {
        onDashboardChanged: vi.fn(),
        onOperationsChanged: vi.fn(),
      }),
    )

    await act(async () => undefined)
    expect(mocks.start).toHaveBeenCalledTimes(1)

    act(() => mocks.lifecycle.onclose?.(new Error('dropped')))
    expect(errorSpy).toHaveBeenCalledWith(
      'Admin real-time connection closed',
      expect.any(Error),
    )

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(mocks.start).toHaveBeenCalledTimes(2)
    errorSpy.mockRestore()
  })

  it('retries after a silent close without logging an error', async () => {
    vi.useFakeTimers()
    mocks.start.mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    renderHook(() =>
      useAdminRealtime(true, {
        onDashboardChanged: vi.fn(),
        onOperationsChanged: vi.fn(),
      }),
    )

    await act(async () => undefined)
    act(() => mocks.lifecycle.onclose?.())
    expect(errorSpy).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(mocks.start).toHaveBeenCalledTimes(2)
    errorSpy.mockRestore()
  })

  it('retries when starting the connection fails', async () => {
    vi.useFakeTimers()
    mocks.start.mockRejectedValueOnce(new Error('refused')).mockResolvedValue(undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    renderHook(() =>
      useAdminRealtime(true, {
        onDashboardChanged: vi.fn(),
        onOperationsChanged: vi.fn(),
      }),
    )

    await act(async () => undefined)
    expect(errorSpy).toHaveBeenCalledWith(
      'Admin real-time connection failed',
      expect.any(Error),
    )

    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })
    expect(mocks.start).toHaveBeenCalledTimes(2)
    errorSpy.mockRestore()
  })

  it('cancels a pending retry on unmount and ignores a late close', async () => {
    vi.useFakeTimers()
    mocks.start.mockResolvedValue(undefined)
    const { unmount } = renderHook(() =>
      useAdminRealtime(true, {
        onDashboardChanged: vi.fn(),
        onOperationsChanged: vi.fn(),
      }),
    )

    await act(async () => undefined)
    act(() => mocks.lifecycle.onclose?.(new Error('dropped')))
    unmount()

    act(() => mocks.lifecycle.onclose?.(new Error('late')))
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })

    expect(mocks.start).toHaveBeenCalledTimes(1)
  })

  it('logs when the connection cannot be stopped cleanly', async () => {
    mocks.start.mockResolvedValue(undefined)
    mocks.stop.mockRejectedValue(new Error('stop failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { unmount } = renderHook(() =>
      useAdminRealtime(true, {
        onDashboardChanged: vi.fn(),
        onOperationsChanged: vi.fn(),
      }),
    )

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    unmount()
    await act(async () => undefined)

    expect(errorSpy).toHaveBeenCalledWith(
      'Admin real-time connection could not be stopped cleanly',
      expect.any(Error),
    )
    errorSpy.mockRestore()
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
