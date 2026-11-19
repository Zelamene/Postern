import { useState } from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconMail,
  IconRefresh,
} from '../common/Icons'
import { Reveal } from '../common/Reveal'
import { useToast } from '../common/toast'
import { copyText } from '../../services/clipboard'

interface InboundSimulation {
  recipient: string
  sender: string
  subject: string
}

type LeakActionState = 'flagged' | 'expected' | 'replaced' | 'blocked'

const CATEGORIES = ['Streaming', 'Retail', 'Financial', 'Work', 'Social', 'Other'] as const

export function InteractiveDemo() {
  const toast = useToast()
  const [label, setLabel] = useState('netflix')
  const [suffix, setSuffix] = useState('k7q2')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Streaming')
  const [copied, setCopied] = useState(false)
  const [inboundTest, setInboundTest] = useState<InboundSimulation | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [leakState, setLeakState] = useState<LeakActionState>('flagged')

  const cleanLabel = label.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'service'
  const currentAlias = `${cleanLabel}.${suffix}@3xyz.uk`

  const handleGenerateSuffix = () => {
    const randomChars = Math.random().toString(36).substring(2, 6)
    setSuffix(randomChars)
    setInboundTest(null)
  }

  const handleCopyAlias = async () => {
    if (await copyText(currentAlias)) {
      setCopied(true)
      toast.success('Address copied to clipboard.')
      setTimeout(() => setCopied(false), 2400)
      return
    }

    setCopied(false)
    toast.error('Could not copy automatically. Copy the address manually.')
  }

  const handleRunInboundTest = () => {
    setIsSimulating(true)
    setTimeout(() => {
      setInboundTest({
        recipient: currentAlias,
        sender: `${cleanLabel}.com`,
        subject: `Your receipt for ${cleanLabel} subscription`,
      })
      setIsSimulating(false)
    }, 450)
  }

  return (
    <section
      id="demo"
      aria-labelledby="demo-heading"
      className="scroll-mt-20 bg-surface py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mb-14 max-w-[42rem]">
            <span className="chip chip--primary chip--sm mb-3">Interactive demo</span>
            <h2 id="demo-heading" className="text-h2 text-text">
              Try an address of your own
            </h2>
            <p className="mt-3 text-body text-text-secondary">
              Create an address, send a test message, and see what happens when a leak shows up.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="min-w-0 bg-bg p-5 sm:p-7 lg:col-span-6">
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <div className="flex items-center gap-2" aria-hidden="true">
                <span className="size-3 bg-danger" />
                <span className="size-3 bg-warning" />
                <span className="size-3 bg-success" />
              </div>
              <span className="font-mono text-xs text-text-muted">Demo</span>
            </div>

            <h3 className="mt-5 text-h4 text-text">1. Configure your address</h3>
            <div className="mt-5 space-y-4">
              <div className="field">
                <label className="field__label" htmlFor="alias-label-input">
                  Service name <span className="field__optional">e.g. netflix, airbnb, uber</span>
                </label>
                <input
                  id="alias-label-input"
                  type="text"
                  className="input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={32}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="alias-category-select">
                  Category
                </label>
                <select
                  id="alias-category-select"
                  className="select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="generated-address-output">
                  Your single-purpose address
                </label>
                <div className="input-group">
                  <input
                    id="generated-address-output"
                    type="text"
                    readOnly
                    value={currentAlias}
                    className="input min-w-0 font-mono text-sm text-link"
                  />
                  <span className="input-group__slot">
                    <button
                      type="button"
                      onClick={handleGenerateSuffix}
                      className="btn btn--ghost btn--sm"
                    >
                      <IconRefresh size={16} />
                      New suffix
                    </button>
                  </span>
                </div>
                <p className="field__hint">
                  Postern adds the suffix so two people can use the same name.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button type="button" onClick={() => void handleCopyAlias()} className="btn btn--primary">
                  <IconCopy size={16} />
                  {copied ? 'Copied to clipboard' : 'Copy address'}
                </button>
                <button
                  type="button"
                  disabled={isSimulating}
                  onClick={handleRunInboundTest}
                  className="btn btn--secondary"
                >
                  <IconMail size={16} />
                  {isSimulating ? 'Routing via Edge…' : 'Simulate incoming email'}
                </button>
              </div>

              {copied && (
                <p
                  role="status"
                  className="mt-2 flex items-center gap-2 bg-success-surface p-3 text-sm text-success-on-surface"
                >
                  <IconCheck size={16} className="shrink-0" />
                  Address copied to clipboard. Ready to paste on {cleanLabel}.com
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0 bg-surface-sunken p-5 sm:p-7 lg:col-span-6">
            <div className="flex items-center justify-between border-b border-hairline pb-4">
              <h3 className="text-h4 text-text">2. See the route</h3>
              <span className="chip chip--info chip--sm">Demo</span>
            </div>

            {!inboundTest ? (
              <div className="empty py-14 text-center">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center bg-surface text-text-muted">
                  <IconMail size={26} />
                </div>
                <p className="empty__title">No mail received yet</p>
                <p className="empty__body mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
                  Click <strong>Simulate incoming email</strong> to see how a message reaches your
                  inbox.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="alert alert--success">
                  <IconCheck size={20} className="alert__icon" />
                  <div>
                    <p className="alert__title">Simulated: email routed successfully</p>
                    <p>Postern checked the address and sent the message to your destination.</p>
                  </div>
                </div>

                <div className="bg-surface p-4 font-mono text-xs">
                  <div className="flex justify-between gap-2 border-b border-hairline py-1.5">
                    <span className="text-text-muted">Recipient (To):</span>
                    <span className="break-all text-right text-text">{inboundTest.recipient}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-hairline py-1.5">
                    <span className="text-text-muted">Sender (From):</span>
                    <span className="text-text">{inboundTest.sender}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-hairline py-1.5">
                    <span className="text-text-muted">Subject:</span>
                    <span className="text-right text-text">{inboundTest.subject}</span>
                  </div>
                  <div className="flex justify-between gap-2 py-1.5">
                    <span className="text-text-muted">Message body:</span>
                    <span className="italic text-text-muted">Not stored</span>
                  </div>
                </div>

                <p className="text-caption text-text-muted">
                  The activity log keeps header details only. Message bodies are not stored.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 bg-bg p-5 sm:p-7 md:p-8">
          <div className="flex flex-col gap-4 border-b border-hairline pb-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="chip chip--warning chip--sm">Leak scenario</span>
                <span className="text-caption text-text-muted">
                  An unexpected sender writes to your address
                </span>
              </div>
              <h3 className="mt-2 text-h3 text-text">What if a service shares your address?</h3>
            </div>
            <div className="bg-surface-sunken px-3 py-1 font-mono text-caption text-text-muted">
              Different sender domain
            </div>
          </div>

          <div className="my-6 bg-surface-sunken p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 text-danger">
                <IconAlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">
                  Suspicious sender: promo@random-marketing-broker.com
                </p>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  This sender wrote to{' '}
                  <span className="break-all font-mono text-text">{currentAlias}</span>, but the
                  expected domain is {cleanLabel}.com. Postern flags the message so you can choose
                  what to do:
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setLeakState('expected')}
              className={`btn ${leakState === 'expected' ? 'btn--primary' : 'btn--secondary'}`}
            >
              Mark as Expected
            </button>
            <button
              type="button"
              onClick={() => setLeakState('replaced')}
              className={`btn ${leakState === 'replaced' ? 'btn--primary' : 'btn--secondary'}`}
            >
              Replace Alias
              <span className="hidden sm:inline"> (Block leak, keep service)</span>
            </button>
            <button
              type="button"
              onClick={() => setLeakState('blocked')}
              className={`btn ${leakState === 'blocked' ? 'btn--danger-solid' : 'btn--danger'}`}
            >
              Block Sender Domain
            </button>
            {leakState !== 'flagged' && (
              <button type="button" onClick={() => setLeakState('flagged')} className="btn btn--ghost btn--sm">
                Reset scenario
              </button>
            )}
          </div>

          <div className="mt-6 bg-surface-sunken p-4 text-sm">
            {leakState === 'flagged' && (
              <p className="text-text-muted">
                Choose an action above to see how Postern handles the leak.
              </p>
            )}
            {leakState === 'expected' && (
              <div className="alert alert--info">
                <p className="alert__title">Sender marked as expected</p>
                <p>Mail from this sender to this address will be forwarded without a warning.</p>
              </div>
            )}
            {leakState === 'replaced' && (
              <div className="alert alert--warning">
                <p className="alert__title">New clean alias created for {cleanLabel}</p>
                <p>The old address is retired for good. New mail to it is discarded, not bounced.</p>
              </div>
            )}
            {leakState === 'blocked' && (
              <div className="alert alert--danger">
                <p className="alert__title">Sender domain permanently blocked</p>
                <p>Mail from promo@random-marketing-broker.com is now discarded.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
