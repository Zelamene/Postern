
const BLOCKED_REASON_LABELS: Readonly<Record<string, string>> = {
  disabled_or_replaced: 'Alias disabled or replaced',
  rate_limited: 'Rate limit reached',
  global_blocklist: 'Blocked domain',
  blocked_sender: 'Blocked sender',
  suspended_user: 'Account suspended',
}

export function blockedReasonLabel(reason: string): string {
  return (
    BLOCKED_REASON_LABELS[reason] ??
    reason.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase())
  )
}
