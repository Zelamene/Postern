import { useRef } from 'react'
import { RECOVERY_KEY_WARNING } from '../../services/productCopy'
import { copyText, selectText } from '../../services/clipboard'
import { useToast } from './toast'

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
  const toast = useToast()
  const keyRef = useRef<HTMLElement>(null)

  async function copyRecoveryKey() {
    if (await copyText(recoveryKey)) {
      toast.success('Recovery key copied to clipboard.')
      return
    }

    selectText(keyRef.current)
    toast.error('Could not copy automatically. The recovery key is selected for manual copy.')
  }

  return (
    <section
      className={`rounded-xl border border-warning/40 bg-warning-surface p-4 ${className}`}
      aria-labelledby="recovery-key-heading"
    >
      <h2 id="recovery-key-heading" className="text-sm font-bold text-warning-on-surface">
        Save your recovery key
      </h2>
      <p className="mt-1 text-sm text-warning-on-surface">{RECOVERY_KEY_WARNING}</p>
      <p className="mt-2 text-sm font-semibold text-warning-on-surface">
        Store it somewhere secure, such as a password manager. Postern stores only a hash and
        cannot show it again.
      </p>
      <code
        ref={keyRef}
        className="mt-3 block break-all rounded-lg bg-surface px-3 py-2 text-sm text-text"
      >
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
    </section>
  )
}
