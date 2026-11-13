import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUserRealtime } from '../../src/hooks/useUserRealtime'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (aliasId: string) => void>(),
  lifecycle: {
    onclose: undefined as ((error?: Error) => void) | undefined,
    onreconnected: undefined as (() => void) | undefined,
    onreconnecting: undefined as ((error?: Error) => void) | undefined,
  },
  off: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('../../src/realtime/userRealtime', () => ({
  userRealtimeEvents: {
    aliasesChanged: 'AliasesChanged',
    messageReceived: 'MessageReceived',
    blockedMessageReceived: 'BlockedMessageReceived',
    accountChanged: 'AccountChanged',
  },
  createUserRealtimeConnection: () => ({
    on: (event: string, handler: (aliasId: string) => void) =>
      mocks.handlers.set(event, handler),
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

describe('useUserRealtime', () => {
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
      useUserRealtime(false, {
        onAliasesChanged: vi.fn(),
        onMessageReceived: vi.fn(),
        onBlockedMessageReceived: vi.fn(),
        onAccountChanged: vi.fn(),
      }),
    )

    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('warns when the connection starts reconnecting with an error', () => {
    mocks.start.mockResolvedValue(undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    renderHook(() =>
      useUserRealtime(true, {
        onAliasesChanged: vi.fn(),
        onMessageReceived: vi.fn(),
        onBlockedMessageReceived: vi.fn(),
        onAccountChanged: vi.fn(),
      }),
    )

    act(() => mocks.lifecycle.onreconnecting?.(new Error('lost')))
    expect(warnSpy).toHaveBeenCalledWith(
      'User real-time connection is reconnecting',
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
      useUserRealtime(true, {
        onAliasesChanged: vi.fn(),
        onMessageReceived: vi.fn(),
        onBlockedMessageReceived: vi.fn(),
        onAccountChanged: vi.fn(),
      }),
    )

    await act(async () => undefined)
    expect(mocks.start).toHaveBeenCalledTimes(1)

    act(() => mocks.lifecycle.onclose?.(new Error('dropped')))
    expect(errorSpy).toHaveBeenCalledWith('User real-time connection closed', expect.any(Error))

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
      useUserRealtime(true, {
        onAliasesChanged: vi.fn(),
        onMessageReceived: vi.fn(),
        onBlockedMessageReceived: vi.fn(),
        onAccountChanged: vi.fn(),
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
      useUserRealtime(true, {
        onAliasesChanged: vi.fn(),
        onMessageReceived: vi.fn(),
        onBlockedMessageReceived: vi.fn(),
        onAccountChanged: vi.fn(),
      }),
    )

    await act(async () => undefined)
    expect(errorSpy).toHaveBeenCalledWith('User real-time connection failed', expect.any(Error))

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
      useUserRealtime(true, {
        onAliasesChanged: vi.fn(),
        onMessageReceived: vi.fn(),
        onBlockedMessageReceived: vi.fn(),
        onAccountChanged: vi.fn(),
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
      useUserRealtime(true, {
        onAliasesChanged: vi.fn(),
        onMessageReceived: vi.fn(),
        onBlockedMessageReceived: vi.fn(),
        onAccountChanged: vi.fn(),
      }),
    )

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    unmount()
    await act(async () => undefined)

    expect(errorSpy).toHaveBeenCalledWith(
      'User real-time connection could not be stopped cleanly',
      expect.any(Error),
    )
    errorSpy.mockRestore()
  })

  it('routes user events to the matching handlers', async () => {
    mocks.start.mockResolvedValue(undefined)
    const onAliasesChanged = vi.fn()
    const onMessageReceived = vi.fn()
    const onBlockedMessageReceived = vi.fn()
    const onAccountChanged = vi.fn()

    renderHook(() =>
      useUserRealtime(true, {
        onAliasesChanged,
        onMessageReceived,
        onBlockedMessageReceived,
        onAccountChanged,
      }),
    )

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())

    act(() => mocks.handlers.get('AliasesChanged')?.(''))
    act(() => mocks.handlers.get('MessageReceived')?.('alias-1'))
    act(() => mocks.handlers.get('BlockedMessageReceived')?.('alias-2'))
    act(() => mocks.handlers.get('AccountChanged')?.(''))

    expect(onAliasesChanged).toHaveBeenCalledOnce()
    expect(onMessageReceived).toHaveBeenCalledWith('alias-1')
    expect(onBlockedMessageReceived).toHaveBeenCalledWith('alias-2')
    expect(onAccountChanged).toHaveBeenCalledOnce()
  })

  it('refreshes aliases and the account after reconnecting', async () => {
    mocks.start.mockResolvedValue(undefined)
    const onAliasesChanged = vi.fn()
    const onMessageReceived = vi.fn()
    const onBlockedMessageReceived = vi.fn()
    const onAccountChanged = vi.fn()

    renderHook(() =>
      useUserRealtime(true, {
        onAliasesChanged,
        onMessageReceived,
        onBlockedMessageReceived,
        onAccountChanged,
      }),
    )

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    act(() => mocks.lifecycle.onreconnected?.())

    expect(onAliasesChanged).toHaveBeenCalledOnce()
    expect(onAccountChanged).toHaveBeenCalledOnce()
  })

  it('stops the connection and removes event handlers when disabled', async () => {
    mocks.start.mockResolvedValue(undefined)
    mocks.stop.mockResolvedValue(undefined)
    const handlers = {
      onAliasesChanged: vi.fn(),
      onMessageReceived: vi.fn(),
      onBlockedMessageReceived: vi.fn(),
      onAccountChanged: vi.fn(),
    }

    const { rerender } = renderHook(
      ({ enabled }) => useUserRealtime(enabled, handlers),
      { initialProps: { enabled: true } },
    )

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    rerender({ enabled: false })

    await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce())
    expect(mocks.off).toHaveBeenCalledTimes(4)
  })
})
