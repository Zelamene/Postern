import { useEffect, useState } from 'react'
import { IconCheck } from './Icons'

interface RecoveryKeyNoticeProps {
  recoveryKey: string
  onDismiss?: () => void
  className?: string
}

export function RecoveryKeyNotice({
  recoveryKey,
  onDismiss,
  className = '',
}: Readonly<RecoveryKeyNoticeProps>) {
  const [copyConfirmed, setCopyConfirmed] = useState(false)
  const [copyError, setCopyError] = useState(false)

  useEffect(() => {
    if (!copyConfirmed) {
      return
    }

    const timer = window.setTimeout(() => setCopyConfirmed(false), 3_000)
    return () => window.clearTimeout(timer)
  }, [copyConfirmed])

  async function copyRecoveryKey() {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(recoveryKey)
      setCopyConfirmed(true)
    } catch (error) {
      console.error('Recovery key could not be copied', error)
      setCopyError(true)
    }
  }

  return (
    <>
      <section
        className={`rounded-xl border border-warning/40 bg-warning-surface p-4 ${className}`}
        aria-labelledby="recovery-key-heading"
      >
        <h2 id="recovery-key-heading" className="text-sm font-bold text-warning-on-surface">
          Save your recovery key
        </h2>
        <p className="mt-1 text-sm text-warning-on-surface">
          Use this key to reset your password if you forget it. Each successful reset replaces the
          key. Postern stores only a hash and cannot show it again.
        </p>
        <p className="mt-2 text-sm font-semibold text-warning-on-surface">
          If you lose this key and forget your password, you may lose access to your account.
          Store it somewhere secure, such as a password manager.
        </p>
        <code className="mt-3 block break-all rounded-lg bg-surface px-3 py-2 text-sm text-text">
          {recoveryKey}
        </code>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => void copyRecoveryKey()}>
            Copy recovery key
          </button>
          {onDismiss && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onDismiss}>
              I’ve saved it
            </button>
          )}
        </div>
        {copyError && (
          <p role="alert" className="mt-2 text-sm text-danger-on-surface">
            Could not copy the key. Select and copy it manually.
          </p>
        )}
      </section>
      {copyConfirmed && (
        <div className="fixed bottom-6 right-6 z-[var(--z-toast)]" role="status" aria-live="polite">
          <p className="toast toast--success">
            <IconCheck className="toast__icon" />
            <span>Recovery key copied to clipboard.</span>
          </p>
        </div>
      )}
    </>
  )
}
