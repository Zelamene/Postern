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
    mocks.handlers.clear()
    mocks.lifecycle.onclose = undefined
    mocks.lifecycle.onreconnected = undefined
    mocks.lifecycle.onreconnecting = undefined
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
