import { IconMoon, IconPosternLogo, IconSun } from '../common/Icons'
import { NotificationMenu } from '../common/NotificationMenu'
import type { AppView, NotificationsController, ThemeMode } from '../../types'
import { AppLink } from './AppLink'

interface AppHeaderProps {
  email: string
  view: AppView
  theme: ThemeMode
  notifications: NotificationsController
  isSigningOut: boolean
  onThemeChange: (theme: ThemeMode) => void
  onSignOut: () => void
}

const NAV_ITEMS: ReadonlyArray<{ view: AppView; label: string; to: string }> = [
  { view: 'aliases', label: 'Aliases', to: '/app' },
  { view: 'blocked', label: 'Blocked', to: '/app/blocked' },
  { view: 'account', label: 'Account', to: '/app/account' },
]

export function AppHeader({
  email,
  view,
  theme,
  notifications,
  isSigningOut,
  onThemeChange,
  onSignOut,
}: Readonly<AppHeaderProps>) {
  const isDark = theme === 'dark'
  const activeView = view === 'messages' ? 'aliases' : view

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] bg-bg/95 backdrop-blur-sm">
      <div className="shell flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <AppLink
            to="/app"
            className="group flex items-center gap-3 text-text no-underline"
          >
            <span className="flex size-9 items-center justify-center bg-surface-container-lowest text-primary">
              <IconPosternLogo size={20} />
            </span>
            <span className="font-[family-name:var(--font-display)] text-xl tracking-tight">Postern</span>
          </AppLink>

          <div className="flex items-center gap-2 sm:hidden">
            <NotificationMenu controller={notifications} />
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

        <nav
          aria-label="App navigation"
          className="order-3 flex items-center gap-5 self-start border-b border-hairline pb-1 sm:order-none sm:border-b-0 sm:pb-0"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = item.view === activeView
            return (
              <AppLink
                key={item.view}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={`pb-2 text-sm font-medium no-underline transition-colors duration-150 sm:pb-0 ${
                  isActive
                    ? 'text-text'
                    : 'text-text-secondary hover:text-text'
                }`}
              >
                {item.label}
              </AppLink>
            )
          })}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="max-w-[14rem] truncate text-xs text-text-muted" title={email}>
            {email}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
          <NotificationMenu controller={notifications} />
          <button
            type="button"
            onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
            className="flex size-9 items-center justify-center bg-transparent text-text-secondary transition-colors duration-150 hover:bg-surface-sunken hover:text-text"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 sm:hidden">
          <span className="min-w-0 truncate text-xs text-text-muted">{email}</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  )
}
