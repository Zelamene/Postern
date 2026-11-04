import { useEffect, useState } from 'react'
import type { ThemeMode } from './components/common/Navbar'
import { HomePage } from './pages/HomePage'
import { InviteRegistrationPage } from './pages/InviteRegistrationPage'

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#151110' : '#fbf8f4')
  }, [theme])

  const inviteMatch = window.location.pathname.match(/^\/invite\/([^/]+)\/?$/)
  if (inviteMatch) {
    return <InviteRegistrationPage inviteCode={decodeURIComponent(inviteMatch[1])} />
  }

  return <HomePage theme={theme} onThemeChange={setTheme} />
}

export default App
