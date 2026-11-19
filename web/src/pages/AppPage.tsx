import { useEffect, useState } from 'react'
import type { ThemeMode } from '../types'
import { RecoveryKeyNotice } from '../components/common/RecoveryKeyNotice'
import { AppFooter } from '../components/app/AppFooter'
import { AppHeader } from '../components/app/AppHeader'
import { AliasActivity } from '../components/app/AliasActivity'
import { CreateAliasDialog } from '../components/app/CreateAliasDialog'
import { AliasList } from '../components/app/AliasList'
import { BlockedActivity } from '../components/app/BlockedActivity'
import { AccountSettings } from '../components/app/AccountSettings'
import { useAccountSession } from '../hooks/useAccountSession'
import { useAliasMessages, useBlockedMessages } from '../hooks/useActivity'
import { useAliases } from '../hooks/useAliases'
import { useNotifications } from '../hooks/useNotifications'
import { useUserRealtime } from '../hooks/useUserRealtime'
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
  const { session, retry, refresh: refreshAccount } = useAccountSession()
  const route = readAppRoute(pathname)
  const isSignedIn = session.status === 'ready'
  const aliases = useAliases(isSignedIn)
  const messages = useAliasMessages(isSignedIn ? route.aliasId : null)
  const blocked = useBlockedMessages(isSignedIn && route.view === 'blocked')
  const notifications = useNotifications(isSignedIn, 'user')

  useUserRealtime(isSignedIn, {
    onAliasesChanged: async () => {
      await aliases.refresh()
      await notifications.refresh()
    },
    onMessageReceived: async (aliasId) => {
      if (route.aliasId === aliasId) {
        await messages.refresh()
      }
      await notifications.refresh()
    },
    onBlockedMessageReceived: async () => {
      if (route.view === 'blocked') {
        await blocked.refresh()
      }
      await notifications.refresh()
    },
    onAccountChanged: async () => {
      await refreshAccount()
      await notifications.refresh()
    },
  })

  const [recoveryKey, setRecoveryKey] = useState<string | null>(() => takeRecoveryKey())
  const [forwardingAddress, setForwardingAddress] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
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
    } catch {
      setSignOutError('Sign out failed. Please try again.')
      setIsSigningOut(false)
    }
  }

  async function handleCreateAlias(input: Parameters<typeof aliases.create>[0]) {
    const outcome = await aliases.create(input)
    if (outcome.ok && !outcome.warning) {
      setIsCreateOpen(false)
    }
    return outcome
  }

  if (session.status === 'checking' || session.status === 'slow' || session.status === 'anonymous') {
    const message =
      session.status === 'anonymous'
        ? 'Taking you to sign in'
        : session.status === 'slow'
          ? 'Getting things ready. This can take a moment.'
          : 'Loading your account'

    return (
      <div className="ea-root">
        <main className="ea-state-main">
          <div
            className="ea-card ea-card__pad flex w-full max-w-sm flex-col items-center gap-3 text-center"
            role="status"
            aria-live="polite"
          >
            <span className="spinner" aria-hidden="true" />
            <p className="ea-hint">{message}</p>
          </div>
        </main>
        <AppFooter />
      </div>
    )
  }

  if (session.status === 'unavailable') {
    return (
      <div className="ea-root">
        <main className="ea-state-main">
          <section className="ea-card ea-card__pad w-full max-w-md">
            <h1 className="ea-title ea-title--sm">We couldn’t connect right now</h1>
            <p className="ea-lede">Check your connection, then try again.</p>
            <div className="ea-card__foot">
              <button type="button" className="btn btn--primary" onClick={retry}>
                Try again
              </button>
              <AppLink to="/login" className="btn btn--secondary">
                Go to sign in
              </AppLink>
            </div>
          </section>
        </main>
        <AppFooter />
      </div>
    )
  }

  const account = session.account
  const destination = forwardingAddress ?? account.forwardingAddress
  const selectedAlias = aliases.aliases.find((alias) => alias.id === route.aliasId) ?? null
  const isFirstRun = aliases.status === 'ready' && aliases.aliases.length === 0
  const existingDomain =
    aliases.aliases.map(addressDomain).find((domain) => domain !== null) ?? null

  return (
    <div className="ea-root">
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
        notifications={notifications}
        isSigningOut={isSigningOut}
        onThemeChange={onThemeChange}
        onSignOut={() => void handleSignOut()}
      />

      <main id="app-main" className="ea-main" data-view={route.view}>
        {recoveryKey && (
          <RecoveryKeyNotice recoveryKey={recoveryKey} onDismiss={() => setRecoveryKey(null)} />
        )}

        {signOutError && (
          <p role="alert" className="ea-notice ea-notice--error">
            {signOutError}
          </p>
        )}

        {route.view === 'aliases' && (
          <>
            <div className="ea-hero">
              <div>
                {isFirstRun ? (
                  <>
                    <h1 className="ea-title">Start with one address</h1>
                    <p className="ea-lede">
                      Pick one service — a newsletter, a shop, or a trial signup. Hand out the alias
                      instead of your real address, and everything it receives still lands in{' '}
                      <span className="ea-mono">{destination}</span>.
                    </p>
                    <p className="ea-lede">{REPLY_WARNING}</p>
                  </>
                ) : (
                  <>
                    <h1 className="ea-title">Your aliases</h1>
                    <p className="ea-lede">
                      Every alias forwards to <span className="ea-mono">{destination}</span>. Your
                      primary address stays hidden.
                    </p>
                  </>
                )}
              </div>
              <div className="ea-hero__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setIsCreateOpen(true)}
                >
                  Create an alias
                </button>
              </div>
            </div>

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
            <section className="ea-card ea-card__pad mx-auto max-w-lg text-center">
              <h1 className="ea-title ea-title--sm">Alias not found</h1>
              <p className="ea-lede">
                This alias may have been deleted, or it belongs to another account.
              </p>
              <div className="ea-card__foot">
                <AppLink to="/app" className="btn btn--primary">
                  Back to aliases
                </AppLink>
              </div>
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

      <AppFooter />

      <CreateAliasDialog
        open={isCreateOpen}
        isCreating={aliases.isCreating}
        error={aliases.createError}
        existingDomain={existingDomain}
        onCreate={handleCreateAlias}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  )
}
