import { IconMoon, IconSun } from '../common/Icons'
import { EditorialLogo } from '../landing/EditorialLogo'
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
    <header className="ea-header ea-admin-header">
      <div className="ea-header__inner">
        <div className="ea-header__left">
          <a href="/" className="ea-brand">
            <EditorialLogo size={28} />
            <span className="ea-brand__name">Postern</span>
          </a>
          <span className="ea-admin-tag">Admin</span>
        </div>

        <div className="ea-header__right">
          {isSignedIn && (
            <button type="button" className="ea-signout" onClick={onSignOut}>
              Sign out
            </button>
          )}
          {isSignedIn && <NotificationMenu controller={notifications} />}
          <button
            type="button"
            onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
            className="ea-icon-btn"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>
      </div>
    </header>
  )
}
