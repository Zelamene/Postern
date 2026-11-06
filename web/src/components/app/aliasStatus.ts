import type { AliasStatus } from '../../types'

export const ALIAS_STATUS_CLASSES: Record<AliasStatus, string> = {
  Active: 'bg-success-surface text-success-on-surface',
  Disabled: 'bg-warning-surface text-warning-on-surface',
  Replaced: 'bg-info-surface text-info-on-surface',
  Deleted: 'bg-surface-sunken text-text-muted',
}
