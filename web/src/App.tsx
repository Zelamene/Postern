import { useEffect, useState } from 'react'
import './App.css'

type ApiStatus = 'checking' | 'available' | 'unavailable'

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    let active = true

    fetch(new URL('/health', window.location.origin))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Health check failed with status ${response.status}`)
        }

        return response.json() as Promise<{ status: string }>
      })
      .then(({ status }) => {
        if (active) {
          setApiStatus(status === 'ok' ? 'available' : 'unavailable')
        }
      })
      .catch(() => {
        if (active) {
          setApiStatus('unavailable')
        }
      })

    return () => {
      active = false
    }
  }, [])

  const statusText = {
    checking: 'Checking API connection…',
    available: 'API is available',
    unavailable: 'API is unavailable',
  }[apiStatus]

  return (
    <main className="app-shell">
      <header className="brand">
        <img src="/postern.svg" alt="" width="44" height="44" />
        <span>Postern</span>
      </header>
      <section className="welcome" aria-labelledby="welcome-heading">
        <p className="eyebrow">Private email aliases</p>
        <h1 id="welcome-heading">Your inbox, on your terms.</h1>
        <p className="intro">
          The local development environment is ready for the Postern application.
        </p>
        <output className={`api-status api-status--${apiStatus}`}>
          <span className="status-indicator" aria-hidden="true" />
          {statusText}
        </output>
      </section>
    </main>
  )
}

export default App
