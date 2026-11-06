import { useCallback, useEffect, useState } from 'react'
import {
  addExpectedSender as addExpectedSenderRequest,
  createAlias as createAliasRequest,
  deleteAlias as deleteAliasRequest,
  disableAlias as disableAliasRequest,
  fetchAliases,
} from '../services/aliasService'
import { ApiError } from '../services/apiClient'
import { describeAliasError } from '../services/aliasErrors'
import type {
  Alias,
  AliasLoadStatus,
  AliasesController,
  AliasStatus,
  CreateAliasInput,
  CreateAliasOutcome,
} from '../types'

async function addExpectedSenderOrWarn(
  aliasId: string,
  sender: string | null,
): Promise<string | null> {
  if (!sender) {
    return null
  }

  try {
    await addExpectedSenderRequest(aliasId, sender)
    return null
  } catch {
    return `Alias created, but ${sender} was not saved as an expected sender. You can add it from the alias page.`
  }
}

function markReplaced(alias: Alias, replacementId: string): Alias {
  const status: AliasStatus = 'Replaced'
  return { ...alias, status, replacedByAliasId: replacementId }
}

export function useAliases(enabled: boolean): AliasesController {
  const [aliases, setAliases] = useState<Alias[]>([])
  const [status, setStatus] = useState<AliasLoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingAliasId, setPendingAliasId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [loadCount, setLoadCount] = useState(0)

  useEffect(() => {
    if (!enabled) {
      return
    }

    let active = true

    fetchAliases()
      .then((list) => {
        if (!active) {
          return
        }

        setAliases(list)
        setLoadError(null)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (!active) {
          return
        }

        if (error instanceof ApiError && error.status === 401) {
          setLoadError('Your session has ended. Sign in again to manage aliases.')
        } else {
          console.error('Unable to load aliases', error)
          setLoadError('Your aliases could not be loaded. Please try again.')
        }

        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [enabled, loadCount])

  const reload = useCallback(() => {
    setStatus('loading')
    setLoadError(null)
    setLoadCount((current) => current + 1)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const list = await fetchAliases()
      setAliases(list)
      setLoadError(null)
      setStatus('ready')
    } catch (error) {
      console.error('Unable to refresh aliases', error)
    }
  }, [])

  const create = useCallback(
    async (input: CreateAliasInput): Promise<CreateAliasOutcome> => {
      setIsCreating(true)
      setCreateError(null)

      try {
        const created = await createAliasRequest(input)
        setAliases((current) => [created, ...current])
        setStatus('ready')
        return {
          ok: true,
          warning: await addExpectedSenderOrWarn(created.id, input.expectedSender),
        }
      } catch (error) {
        setCreateError(
          error instanceof ApiError && error.status === 400
            ? 'That label cannot be used. Choose a different name for this alias.'
            : describeAliasError(
                error,
                'The alias could not be created. Check your connection and try again.',
              ),
        )
        return { ok: false, warning: null }
      } finally {
        setIsCreating(false)
      }
    },
    [],
  )

  const disable = useCallback(async (aliasId: string): Promise<boolean> => {
    setPendingAliasId(aliasId)
    setActionError(null)

    try {
      await disableAliasRequest(aliasId)
      setAliases((current) =>
        current.map((alias) =>
          alias.id === aliasId ? { ...alias, status: 'Disabled' } : alias,
        ),
      )
      return true
    } catch (error) {
      setActionError(
        describeAliasError(
          error,
          'The alias could not be disabled. Check your connection and try again.',
        ),
      )
      return false
    } finally {
      setPendingAliasId(null)
    }
  }, [])

  const remove = useCallback(async (aliasId: string): Promise<boolean> => {
    setPendingAliasId(aliasId)
    setActionError(null)

    try {
      await deleteAliasRequest(aliasId)
      setAliases((current) =>
        current.map((alias) =>
          alias.id === aliasId
            ? { ...alias, status: 'Deleted', deletedAt: new Date().toISOString() }
            : alias,
        ),
      )
      return true
    } catch (error) {
      setActionError(
        describeAliasError(
          error,
          'The alias could not be deleted. Check your connection and try again.',
        ),
      )
      return false
    } finally {
      setPendingAliasId(null)
    }
  }, [])

  const applyReplacement = useCallback((aliasId: string, replacement: Alias) => {
    setAliases((current) => [
      replacement,
      ...current.map((alias) =>
        alias.id === aliasId ? markReplaced(alias, replacement.id) : alias,
      ),
    ])
  }, [])

  const dismissActionError = useCallback(() => setActionError(null), [])

  return {
    aliases,
    status,
    loadError,
    createError,
    actionError,
    pendingAliasId,
    isCreating,
    reload,
    refresh,
    create,
    disable,
    remove,
    applyReplacement,
    dismissActionError,
  }
}
