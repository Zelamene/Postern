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
