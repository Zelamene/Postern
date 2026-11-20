import { IconMoon, IconSun } from '../common/Icons'
import { EditorialLogo } from '../landing/EditorialLogo'
import { NotificationMenu } from '../common/NotificationMenu'
import type { AppView, NotificationsController, ThemeMode } from '../../types'
import { AppLink } from './AppLink'

interface AppHeaderProps {
  view: AppView
  theme: ThemeMode
  notifications: NotificationsController
  onThemeChange: (theme: ThemeMode) => void
}

const NAV_ITEMS: ReadonlyArray<{ view: AppView; label: string; to: string }> = [
  { view: 'aliases', label: 'Aliases', to: '/app' },
  { view: 'blocked', label: 'Blocked', to: '/app/blocked' },
  { view: 'account', label: 'Account', to: '/app/account' },
]

export function AppHeader({ view, theme, notifications, onThemeChange }: Readonly<AppHeaderProps>) {
  const isDark = theme === 'dark'
  const activeView = view === 'messages' ? 'aliases' : view

  return (
    <header className="ea-header">
      <div className="ea-header__inner">
        <div className="ea-header__left">
          <AppLink to="/app" className="ea-brand">
            <EditorialLogo size={22} />
            <span className="ea-brand__name">Postern</span>
          </AppLink>

          <nav aria-label="App navigation" className="ea-nav">
            {NAV_ITEMS.map((item) => {
              const isActive = item.view === activeView
              return (
                <AppLink
                  key={item.view}
                  to={item.to}
                  aria-current={isActive ? 'page' : undefined}
                  className="ea-nav__link"
                >
                  {item.label}
                </AppLink>
              )
            })}
          </nav>
        </div>

        <div className="ea-header__controls">
          <button
            type="button"
            onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
            className="ea-icon-btn"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>

          <NotificationMenu controller={notifications} />
        </div>

        <nav aria-label="Compact app navigation" className="ea-nav ea-nav--mobile">
          {NAV_ITEMS.map((item) => {
            const isActive = item.view === activeView
            return (
              <AppLink
                key={item.view}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className="ea-nav__link"
              >
                {item.label}
              </AppLink>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
