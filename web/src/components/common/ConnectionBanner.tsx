import { IconAlertTriangle } from './Icons'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export function ConnectionBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) {
    return null
  }

  return (
    <div
      className="border-b border-hairline bg-warning-surface px-4 py-2 text-sm text-warning-on-surface"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2">
        <IconAlertTriangle size={16} className="shrink-0" />
        <p>You’re offline. Check your internet connection. Some features may not work.</p>
      </div>
    </div>
  )
}
