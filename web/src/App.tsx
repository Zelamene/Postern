import { useEffect, useState } from 'react'
import type { ThemeMode } from './types'
import { ConnectionBanner } from './components/common/ConnectionBanner'
import { AdminPage } from './pages/AdminPage'
import { AppPage } from './pages/AppPage'
import { HomePage } from './pages/HomePage'
import { InviteRegistrationPage } from './pages/InviteRegistrationPage'
import { LoginPage } from './pages/LoginPage'

const STORAGE_KEY = 'postern-theme'

function preferredTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches

  return prefersDark ? 'dark' : 'light'
}

function App() {
  const [theme, setTheme] = useState<ThemeMode>(preferredTheme)
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#151110' : '#fbf8f4')
  }, [theme])

  useEffect(() => {
    const syncPathname = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', syncPathname)
    return () => window.removeEventListener('popstate', syncPathname)
  }, [])

  let page = <HomePage theme={theme} onThemeChange={setTheme} />
  const inviteMatch = pathname.match(/^\/invite\/([^/]+)\/?$/)

  if (inviteMatch) {
    page = <InviteRegistrationPage inviteCode={decodeURIComponent(inviteMatch[1])} />
  } else if (/^\/app(\/|$)/.test(pathname)) {
    page = <AppPage pathname={pathname} theme={theme} onThemeChange={setTheme} />
  } else if (/^\/admin\/?$/.test(pathname)) {
    page = <AdminPage theme={theme} onThemeChange={setTheme} />
  } else if (/^\/login\/?$/.test(pathname)) {
    page = <LoginPage />
  }

  return (
    <>
      <ConnectionBanner />
      {page}
    </>
  )
}

export default App
