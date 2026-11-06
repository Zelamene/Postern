import type { ThemeMode } from '../common/Navbar'
import { IconMoon, IconPosternLogo, IconSun } from '../common/Icons'
import { NotificationMenu } from '../common/NotificationMenu'
import type { NotificationsController } from '../../hooks/useNotifications'

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
    <header className="border-b border-hairline/70 bg-surface">
      <div className="shell flex min-h-16 items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2.5 text-text no-underline">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-on-inverse">
            <IconPosternLogo size={20} />
          </span>
          <span className="text-lg font-extrabold tracking-tight">Postern</span>
          <span className="hidden border-l border-hairline pl-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted sm:inline">
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
            className="flex size-9 items-center justify-center rounded-full border border-hairline/80 bg-surface-sunken/60 text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>
      </div>
    </header>
  )
}
