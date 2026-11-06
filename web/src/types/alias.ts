export type { AliasCategory } from '../constants/aliases'

export type AliasStatus = 'Active' | 'Disabled' | 'Replaced' | 'Deleted'

export interface Alias {
  id: string
  userId: string | null
  label: string | null
  randomSuffix: string | null
  fullAddress: string | null
  purposeMetadata: string | null
  category: string | null
  status: AliasStatus
  replacedByAliasId: string | null
  kvDirty: boolean
  createdAt: string
  deletedAt: string | null
}

export interface CreateAliasInput {
  label: string
  category: string | null
  expectedSender: string | null
}

export interface CreateAliasOutcome {
  ok: boolean
  /** Set when the alias exists but its expected sender could not be saved. */
  warning: string | null
}

export type AliasLoadStatus = 'loading' | 'ready' | 'error'

export interface AliasesController {
  aliases: Alias[]
  status: AliasLoadStatus
  loadError: string | null
  createError: string | null
  actionError: string | null
  pendingAliasId: string | null
  isCreating: boolean
  reload: () => void
  refresh: () => Promise<void>
  create: (input: CreateAliasInput) => Promise<CreateAliasOutcome>
  disable: (aliasId: string) => Promise<boolean>
  remove: (aliasId: string) => Promise<boolean>
  applyReplacement: (aliasId: string, replacement: Alias) => void
  dismissActionError: () => void
}
