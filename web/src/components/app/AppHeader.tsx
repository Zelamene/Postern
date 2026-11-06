import { IconMoon, IconPosternLogo, IconSun } from '../common/Icons'
import { NotificationMenu } from '../common/NotificationMenu'
import type { ThemeMode } from '../common/Navbar'
import type { NotificationsController } from '../../hooks/useNotifications'
import type { AppView } from '../../services/navigation'
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
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-hairline/70 bg-bg/85 backdrop-blur-md">
      <div className="shell flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <AppLink
            to="/app"
            className="group flex items-center gap-2.5 text-text no-underline"
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-on-inverse transition-transform duration-200 group-hover:scale-105">
              <IconPosternLogo size={20} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Postern</span>
          </AppLink>

          <div className="flex items-center gap-2 sm:hidden">
            <NotificationMenu controller={notifications} />
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

        <nav
          aria-label="App navigation"
          className="order-3 flex items-center gap-0.5 self-start rounded-full border border-hairline/60 bg-surface-sunken/70 p-1 sm:order-none"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = item.view === activeView
            return (
              <AppLink
                key={item.view}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold no-underline transition-colors ${
                  isActive
                    ? 'bg-surface text-text shadow-xs'
                    : 'text-text-secondary hover:bg-surface hover:text-text'
                }`}
              >
                {item.label}
              </AppLink>
            )
          })}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="max-w-[14rem] truncate text-xs font-medium text-text-muted" title={email}>
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
            className="flex size-9 items-center justify-center rounded-full border border-hairline/80 bg-surface-sunken/60 text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 sm:hidden">
          <span className="min-w-0 truncate text-xs font-medium text-text-muted">{email}</span>
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
