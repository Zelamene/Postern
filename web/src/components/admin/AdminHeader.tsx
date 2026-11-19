import { IconMoon, IconPosternLogo, IconSun } from '../common/Icons'
import { NotificationMenu } from '../common/NotificationMenu'
import type { NotificationsController, ThemeMode } from '../../types'

interface AdminHeaderProps {
  theme: ThemeMode
  isSignedIn: boolean
  notifications: NotificationsController
  onThemeChange: (theme: ThemeMode) => void
  onSignOut: () => void
}

export function AdminHeader({
  theme,
  isSignedIn,
  notifications,
  onThemeChange,
  onSignOut,
}: Readonly<AdminHeaderProps>) {
  const isDark = theme === 'dark'

  return (
    <header className="bg-bg">
      <div className="shell flex min-h-16 items-center justify-between gap-4 py-4">
        <a href="/" className="flex items-center gap-3 text-text no-underline">
          <span className="flex size-9 items-center justify-center bg-surface-container-lowest text-primary">
            <IconPosternLogo size={20} />
          </span>
          <span className="font-[family-name:var(--font-display)] text-xl tracking-tight">Postern</span>
          <span className="hidden border-l border-hairline pl-3 text-xs font-medium uppercase tracking-[0.08em] text-text-muted sm:inline">
            Admin
          </span>
        </a>
        <div className="flex items-center gap-2">
          {isSignedIn && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onSignOut}>
              Sign out
            </button>
          )}
          {isSignedIn && <NotificationMenu controller={notifications} />}
          <button
            type="button"
            onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
            className="flex size-9 items-center justify-center bg-transparent text-text-secondary transition-colors duration-150 hover:bg-surface-sunken hover:text-text"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>
      </div>
    </header>
  )
}
