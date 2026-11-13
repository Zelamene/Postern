import type { Alias, AliasStatus, CreateAliasInput } from '../types'
import { requestEmpty, requestJson } from './apiClient'

interface AliasResponse {
  id: string
  userId: string | null
  label: string | null
  randomSuffix: string | null
  fullAddress: string | null
  purposeMetadata: string | null
  category: string | null
  status: AliasStatus | number
  replacedByAliasId: string | null
  kvDirty: boolean
  createdAt: string
  deletedAt: string | null
}

const STATUS_BY_ORDINAL: Record<number, AliasStatus> = {
  0: 'Active',
  1: 'Disabled',
  2: 'Replaced',
  3: 'Deleted',
}

const ADDRESS_SEPARATOR = '@'

export function normalizeStatus(status: AliasStatus | number): AliasStatus {
  if (typeof status === 'number') {
    return STATUS_BY_ORDINAL[status] ?? 'Deleted'
  }

  return status
}

function toAlias(response: AliasResponse): Alias {
  return { ...response, status: normalizeStatus(response.status) }
}

function aliasPath(aliasId: string, suffix = ''): string {
  return `/api/aliases/${encodeURIComponent(aliasId)}${suffix}`
}

function postSenderAction(
  action: string,
  aliasId: string,
  senderEtld1: string,
  senderAddress?: string | null,
): Promise<void> {
  return requestEmpty(aliasPath(aliasId, `/${action}`), {
    method: 'POST',
    body: senderAddress ? { senderEtld1, senderAddress } : { senderEtld1 },
  })
}

export function addressDomain(alias: Alias): string | null {
  const address = alias.fullAddress
  if (!address) {
    return null
  }

  const separator = address.lastIndexOf(ADDRESS_SEPARATOR)
  if (separator < 0 || separator === address.length - 1) {
    return null
  }

  return address.slice(separator + 1).toLowerCase()
}

export async function fetchAliases(signal?: AbortSignal): Promise<Alias[]> {
  const aliases = await requestJson<AliasResponse[]>('/api/aliases', { signal })
  return aliases.map(toAlias)
}

export async function createAlias(input: CreateAliasInput): Promise<Alias> {
  const alias = await requestJson<AliasResponse>('/api/aliases', {
    method: 'POST',
    body: { label: input.label, category: input.category },
  })
  return toAlias(alias)
}

export function addExpectedSender(aliasId: string, senderEtld1: string): Promise<void> {
  return postSenderAction('expected-senders', aliasId, senderEtld1)
}

export function markExpectedSender(
  aliasId: string,
  senderEtld1: string,
  senderAddress?: string | null,
): Promise<void> {
  return postSenderAction('mark-expected', aliasId, senderEtld1, senderAddress)
}

export function blockSender(aliasId: string, senderEtld1: string): Promise<void> {
  return postSenderAction('block-sender', aliasId, senderEtld1)
}

export function linkReplacement(aliasId: string, replacementAliasId: string): Promise<void> {
  return requestEmpty(
    aliasPath(aliasId, `/replace/${encodeURIComponent(replacementAliasId)}`),
    { method: 'PATCH' },
  )
}

export function disableAlias(aliasId: string): Promise<void> {
  return requestEmpty(aliasPath(aliasId, '/disable'), { method: 'PATCH' })
}

export function deleteAlias(aliasId: string): Promise<void> {
  return requestEmpty(aliasPath(aliasId), { method: 'DELETE' })
}
