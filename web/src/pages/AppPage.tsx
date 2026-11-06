import { useEffect, useState } from 'react'
import type { ThemeMode } from '../components/common/Navbar'
import { RecoveryKeyNotice } from '../components/common/RecoveryKeyNotice'
import { AppHeader } from '../components/app/AppHeader'
import { AliasActivity } from '../components/app/AliasActivity'
import { AliasComposer } from '../components/app/AliasComposer'
import { AliasList } from '../components/app/AliasList'
import { BlockedActivity } from '../components/app/BlockedActivity'
import { AccountSettings } from '../components/app/AccountSettings'
import { useAccountSession } from '../hooks/useAccountSession'
import { useAliasMessages, useBlockedMessages } from '../hooks/useActivity'
import { useAliases } from '../hooks/useAliases'
import { signOut } from '../services/accountService'
import { addressDomain } from '../services/aliasService'
import { REPLY_WARNING } from '../services/productCopy'
import { navigate, readAppRoute } from '../services/navigation'
import { takeRecoveryKey } from '../services/pendingRecoveryKey'
import { AppLink } from '../components/app/AppLink'

interface AppPageProps {
  pathname: string
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function AppPage({ pathname, theme, onThemeChange }: Readonly<AppPageProps>) {
  const session = useAccountSession()
  const route = readAppRoute(pathname)
  const isSignedIn = session.status === 'ready'
  const aliases = useAliases(isSignedIn)
  const messages = useAliasMessages(isSignedIn ? route.aliasId : null)
  const blocked = useBlockedMessages(isSignedIn && route.view === 'blocked')
  const [recoveryKey, setRecoveryKey] = useState<string | null>(() => takeRecoveryKey())
  const [forwardingAddress, setForwardingAddress] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  useEffect(() => {
    if (session.status === 'anonymous') {
      navigate('/login', { replace: true })
    }
  }, [session.status])

  async function handleSignOut() {
    if (isSigningOut) {
      return
    }

    setIsSigningOut(true)
    setSignOutError(null)

    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      console.error('Sign out failed', error)
      setSignOutError('Sign out failed. Please try again.')
      setIsSigningOut(false)
    }
  }

  if (session.status === 'checking' || session.status === 'anonymous') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-4 text-text">
        <div className="flex items-center gap-3 text-sm text-text-muted" role="status">
          <span className="spinner" aria-hidden="true" />
          {session.status === 'anonymous' ? 'Taking you to sign in' : 'Checking your session'}
        </div>
      </main>
    )
  }

  if (session.status === 'unavailable') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12 text-text">
        <section className="w-full max-w-md rounded-2xl border border-hairline bg-surface p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Connection</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Postern is unreachable</h1>
          <p className="mt-3 text-sm text-text-muted">
            We could not confirm your session. Check the API connection and try again.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
            <AppLink to="/login" className="btn btn--secondary">
              Go to sign in
            </AppLink>
          </div>
        </section>
      </main>
    )
  }

  const account = session.account
  const destination = forwardingAddress ?? account.forwardingAddress
  const selectedAlias = aliases.aliases.find((alias) => alias.id === route.aliasId) ?? null
  const isFirstRun = aliases.status === 'ready' && aliases.aliases.length === 0
  const existingDomain =
    aliases.aliases.map(addressDomain).find((domain) => domain !== null) ?? null

  return (
    <div className="min-h-screen bg-bg text-text antialiased">
      <a
        href="#app-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-on-inverse focus:shadow-md"
      >
        Skip to main content
      </a>

      <AppHeader
        email={account.email}
        view={route.view}
        theme={theme}
        isSigningOut={isSigningOut}
        onThemeChange={onThemeChange}
        onSignOut={() => void handleSignOut()}
      />

      <main id="app-main" className="shell space-y-6 py-8 md:py-12">
        {recoveryKey && (
          <RecoveryKeyNotice recoveryKey={recoveryKey} onDismiss={() => setRecoveryKey(null)} />
        )}

        {signOutError && (
          <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm text-danger-on-surface">
            {signOutError}
          </p>
        )}

        {route.view === 'aliases' && (
          <>
            {isFirstRun ? (
              <section className="rounded-2xl border border-primary-border bg-surface-tint p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                  First alias
                </p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
                  Start with one address
                </h1>
                <p className="mt-2 max-w-prose text-sm text-text-secondary">
                  Pick one service — a newsletter, a shop, or a trial signup. Hand out the alias
                  instead of your real address, and everything it receives still lands in{' '}
                  <span className="font-semibold text-text">{destination}</span>.
                </p>
                <p className="mt-2 max-w-prose text-sm text-text-secondary">{REPLY_WARNING}</p>
              </section>
            ) : (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                  Alias management
                </p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Your aliases
                </h1>
                <p className="mt-2 text-sm text-text-muted">
                  Every alias forwards to{' '}
                  <span className="font-semibold text-text-secondary">{destination}</span>.
                </p>
              </div>
            )}

            <AliasComposer
              isCreating={aliases.isCreating}
              error={aliases.createError}
              existingDomain={existingDomain}
              onCreate={aliases.create}
            />

            <AliasList
              aliases={aliases.aliases}
              status={aliases.status}
              loadError={aliases.loadError}
              actionError={aliases.actionError}
              pendingAliasId={aliases.pendingAliasId}
              onReload={aliases.reload}
              onDisable={aliases.disable}
              onDelete={aliases.remove}
              onDismissError={aliases.dismissActionError}
            />
          </>
        )}

        {route.view === 'messages' &&
          (aliases.status === 'ready' && selectedAlias === null ? (
            <section className="mx-auto max-w-lg rounded-2xl border border-hairline bg-surface p-6 text-center shadow-sm sm:p-8">
              <h1 className="text-2xl font-extrabold tracking-tight">Alias not found</h1>
              <p className="mt-2 text-sm text-text-muted">
                This alias may have been deleted, or it belongs to another account.
              </p>
              <AppLink to="/app" className="btn btn--primary mt-5">
                Back to aliases
              </AppLink>
            </section>
          ) : (
            <AliasActivity
              alias={selectedAlias}
              feed={messages}
              onAliasReplaced={aliases.applyReplacement}
            />
          ))}

        {route.view === 'blocked' && (
          <BlockedActivity aliases={aliases.aliases} feed={blocked} />
        )}

        {route.view === 'account' && (
          <AccountSettings
            account={{ ...account, forwardingAddress: destination }}
            onForwardingAddressChange={setForwardingAddress}
            onAccountDeleted={() => navigate('/login', { replace: true })}
          />
        )}
      </main>
    </div>
  )
}
