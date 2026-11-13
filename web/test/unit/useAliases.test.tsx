import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/services/apiClient'
import { useAliases } from '../../src/hooks/useAliases'

const fetchAliases = vi.fn()
const createAlias = vi.fn()
const addExpectedSender = vi.fn()
const disableAlias = vi.fn()
const deleteAlias = vi.fn()

vi.mock('../../src/services/aliasService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/aliasService')>()
  return {
    ...actual,
    fetchAliases: (...args: unknown[]) => fetchAliases(...args),
    createAlias: (...args: unknown[]) => createAlias(...args),
    addExpectedSender: (...args: unknown[]) => addExpectedSender(...args),
    disableAlias: (...args: unknown[]) => disableAlias(...args),
    deleteAlias: (...args: unknown[]) => deleteAlias(...args),
  }
})

const ALIAS = {
  id: 'a1',
  userId: 'u1',
  label: 'shop',
  randomSuffix: 'k4m2',
  fullAddress: 'shop.k4m2@postern.local',
  purposeMetadata: null,
  category: 'shopping',
  status: 'Active' as const,
  replacedByAliasId: null,
  kvDirty: false,
  createdAt: '2026-02-01T10:00:00Z',
  deletedAt: null,
}

beforeEach(() => {
  fetchAliases.mockReset()
  createAlias.mockReset()
  addExpectedSender.mockReset()
  disableAlias.mockReset()
  deleteAlias.mockReset()
})

describe('useAliases', () => {
  it('loads aliases when enabled', async () => {
    fetchAliases.mockResolvedValue([ALIAS])
    const { result } = renderHook(() => useAliases(true))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.aliases).toEqual([ALIAS])
  })

  it('reports load errors', async () => {
    fetchAliases.mockRejectedValue(new ApiError(401))
    const { result } = renderHook(() => useAliases(true))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.loadError).toMatch(/session has ended/i)
  })

  it('creates an alias and warns when expected sender save fails', async () => {
    fetchAliases.mockResolvedValue([])
    createAlias.mockResolvedValue({ ...ALIAS, id: 'a2' })
    addExpectedSender.mockRejectedValue(new Error('nope'))
    const { result } = renderHook(() => useAliases(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    let outcome: { ok: boolean; warning: string | null } | undefined
    await act(async () => {
      outcome = await result.current.create({
        label: 'shop',
        category: 'shopping',
        expectedSender: 'shop@example.com',
      } as never)
    })

    expect(outcome).toEqual({ ok: true, warning: expect.stringMatching(/not saved/i) })
    expect(result.current.aliases[0]?.id).toBe('a2')
  })

  it('stays loading and skips the initial request while disabled', () => {
    const { result } = renderHook(() => useAliases(false))

    expect(fetchAliases).not.toHaveBeenCalled()
    expect(result.current.status).toBe('loading')
    expect(result.current.aliases).toEqual([])
  })

  it('reports a generic load error for other failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAliases.mockRejectedValue(new ApiError(500))
    const { result } = renderHook(() => useAliases(true))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.loadError).toMatch(/could not be loaded/i)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('reloads and clears the previous load error', async () => {
    fetchAliases.mockRejectedValueOnce(new ApiError(401)).mockResolvedValueOnce([])
    const { result } = renderHook(() => useAliases(true))
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.reload())
    expect(result.current.status).toBe('loading')
    expect(result.current.loadError).toBeNull()

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.aliases).toEqual([])
    expect(fetchAliases).toHaveBeenCalledTimes(2)
  })

  it('refreshes the list and keeps the current one when refreshing fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAliases.mockResolvedValueOnce([ALIAS])
    const { result } = renderHook(() => useAliases(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    fetchAliases.mockResolvedValueOnce([])
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.aliases).toEqual([])

    fetchAliases.mockResolvedValueOnce([ALIAS])
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.aliases).toEqual([ALIAS])

    fetchAliases.mockRejectedValueOnce(new Error('down'))
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.aliases).toEqual([ALIAS])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('explains a rejected label and other create failures', async () => {
    fetchAliases.mockResolvedValue([])
    const { result } = renderHook(() => useAliases(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    createAlias.mockRejectedValueOnce(new ApiError(400))
    let outcome: { ok: boolean; warning: string | null } | undefined
    await act(async () => {
      outcome = await result.current.create({ label: 'bad' } as never)
    })
    expect(outcome).toEqual({ ok: false, warning: null })
    expect(result.current.createError).toMatch(/label cannot be used/i)
    expect(result.current.isCreating).toBe(false)

    createAlias.mockRejectedValueOnce(new ApiError(401))
    await act(async () => {
      await result.current.create({ label: 'shop' } as never)
    })
    expect(result.current.createError).toMatch(/session has ended/i)

    createAlias.mockRejectedValueOnce(new ApiError(404))
    await act(async () => {
      await result.current.create({ label: 'shop' } as never)
    })
    expect(result.current.createError).toMatch(/no longer exists/i)

    createAlias.mockRejectedValueOnce(new ApiError(500))
    await act(async () => {
      await result.current.create({ label: 'shop' } as never)
    })
    expect(result.current.createError).toMatch(/could not be created/i)
  })

  it('creates an alias without an expected sender', async () => {
    fetchAliases.mockResolvedValue([])
    createAlias.mockResolvedValue({ ...ALIAS, id: 'a3' })
    const { result } = renderHook(() => useAliases(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    let outcome: { ok: boolean; warning: string | null } | undefined
    await act(async () => {
      outcome = await result.current.create({ label: 'shop', expectedSender: null } as never)
    })

    expect(outcome).toEqual({ ok: true, warning: null })
    expect(addExpectedSender).not.toHaveBeenCalled()
  })

  it('reports disable and delete failures and lets the error be dismissed', async () => {
    fetchAliases.mockResolvedValue([ALIAS])
    const { result } = renderHook(() => useAliases(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    disableAlias.mockRejectedValueOnce(new ApiError(404))
    let disabled = true
    await act(async () => {
      disabled = await result.current.disable('a1')
    })
    expect(disabled).toBe(false)
    expect(result.current.actionError).toMatch(/no longer exists/i)
    expect(result.current.pendingAliasId).toBeNull()
    expect(result.current.aliases[0]?.status).toBe('Active')

    act(() => result.current.dismissActionError())
    expect(result.current.actionError).toBeNull()

    deleteAlias.mockRejectedValueOnce(new ApiError(500))
    let removed = true
    await act(async () => {
      removed = await result.current.remove('a1')
    })
    expect(removed).toBe(false)
    expect(result.current.actionError).toMatch(/could not be deleted/i)
    expect(result.current.aliases[0]?.status).toBe('Active')
  })

  it('marks the original alias as replaced', async () => {
    fetchAliases.mockResolvedValue([ALIAS])
    const { result } = renderHook(() => useAliases(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const replacement = { ...ALIAS, id: 'a9', fullAddress: 'new@x.com' }
    act(() => {
      result.current.applyReplacement('a1', replacement)
    })

    expect(result.current.aliases).toHaveLength(2)
    expect(result.current.aliases[0]).toEqual(replacement)
    expect(result.current.aliases[1]?.status).toBe('Replaced')
    expect(result.current.aliases[1]?.replacedByAliasId).toBe('a9')
  })

  it('disables, deletes, and applies replacements', async () => {
    fetchAliases.mockResolvedValue([ALIAS])
    disableAlias.mockResolvedValue(undefined)
    deleteAlias.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAliases(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.disable('a1')
    })
    expect(result.current.aliases[0]?.status).toBe('Disabled')

    await act(async () => {
      await result.current.remove('a1')
    })
    expect(result.current.aliases[0]?.status).toBe('Deleted')

    act(() => {
      result.current.applyReplacement('a1', { ...ALIAS, id: 'a2', fullAddress: 'new@x.com' })
    })
    expect(result.current.aliases[0]?.id).toBe('a2')
  })
})
