import { useState } from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconMail,
  IconRefresh,
} from '../common/Icons'
import { Reveal } from '../common/Reveal'

interface InboundSimulation {
  recipient: string
  sender: string
  subject: string
  timestamp: string
  status: string
  deliveryTimeMs: number
}

type LeakActionState = 'flagged' | 'expected' | 'replaced' | 'blocked'

const CATEGORIES = ['Streaming', 'Retail', 'Financial', 'Work', 'Social', 'Other'] as const

export function InteractiveDemo() {
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
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(currentAlias)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch {
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    }
  }

  const handleRunInboundTest = () => {
    setIsSimulating(true)
    setTimeout(() => {
      setInboundTest({
        recipient: currentAlias,
        sender: `${cleanLabel}.com`,
        subject: `Your receipt for ${cleanLabel} subscription`,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        status: 'Forwarded via KV (SPF/DKIM pass)',
        deliveryTimeMs: 14,
      })
      setIsSimulating(false)
    }, 450)
  }

  return (
    <section id="demo" aria-labelledby="demo-heading" className="scroll-mt-20 border-b border-hairline/70 bg-surface py-14 sm:py-16 lg:py-20">
      <div className="shell">
        <Reveal>
          <div className="mb-14 max-w-[42rem]">
            <span className="chip chip--primary chip--sm mb-3">Live Interactive Console</span>
            <h2 id="demo-heading" className="text-h2 font-bold tracking-tight text-text">
              Try creating an alias right now
            </h2>
            <p className="mt-3 text-body text-text-secondary">
              Experience how fast and effortless alias generation is. Test edge forwarding and see how Postern reacts when an
              unauthorized third party attempts to send you marketing spam.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="rounded-2xl border border-hairline/80 bg-surface p-7 shadow-xs lg:col-span-6">
            <div className="flex items-center justify-between border-b border-hairline/60 pb-4">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-danger/40" />
                <span className="size-3 rounded-full bg-warning/40" />
                <span className="size-3 rounded-full bg-success/40" />
              </div>
              <span className="font-mono text-xs text-text-muted">console.postern.sh</span>
            </div>

            <h3 className="mt-5 text-h4 font-bold text-text">1. Configure your alias</h3>
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
                    className="input font-mono text-sm font-bold text-link"
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
                  Server-assigned 4-character suffix prevents namespace collisions and stops automated dictionary attacks.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button type="button" onClick={handleCopyAlias} className="btn btn--primary shadow-xs">
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
                <div className="toast mt-2" role="status">
                  <IconCheck size={18} className="toast__icon" />
                  Address copied to clipboard. Ready to paste on {cleanLabel}.com
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-hairline/80 bg-surface-sunken/60 p-7 shadow-xs lg:col-span-6">
            <div className="flex items-center justify-between border-b border-hairline/60 pb-4">
              <h3 className="text-h4 font-bold text-text">2. Edge router &amp; ledger verification</h3>
              <span className="chip chip--info chip--sm">Edge Router</span>
            </div>

            {!inboundTest ? (
              <div className="empty py-14 text-center">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-hairline/80 bg-surface text-text-muted shadow-2xs">
                  <IconMail size={26} />
                </div>
                <p className="empty__title text-h4 font-bold">No mail received yet</p>
                <p className="empty__body mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
                  Click <strong>Simulate incoming email</strong> to see how Postern delivers mail directly to your primary
                  inbox in milliseconds with zero body retention.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="alert alert--success">
                  <IconCheck size={20} className="alert__icon" />
                  <div>
                    <p className="alert__title">Email routed successfully in {inboundTest.deliveryTimeMs}ms</p>
                    <p>
                      Postern edge worker resolved policy and forwarded to your primary destination instantly.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-hairline/80 bg-surface p-4 text-xs font-mono shadow-2xs">
                  <div className="flex justify-between py-1.5 border-b border-hairline/60">
                    <span className="text-text-muted">Recipient (To):</span>
                    <span className="font-semibold text-text">{inboundTest.recipient}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-hairline/60">
                    <span className="text-text-muted">Sender (From):</span>
                    <span className="text-text">{inboundTest.sender}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-hairline/60">
                    <span className="text-text-muted">Authentication:</span>
                    <span className="text-success font-semibold">SPF=pass · DKIM=pass</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-hairline/60">
                    <span className="text-text-muted">Subject:</span>
                    <span className="text-text">{inboundTest.subject}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-text-muted">Message body:</span>
                    <span className="text-text-muted italic">[Discarded at Edge — 0 bytes stored]</span>
                  </div>
                </div>

                <p className="text-caption text-text-muted">
                  Audit ledger stores header metadata only to verify delivery. Body content is never retained.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-hairline/80 bg-surface p-7 shadow-xs md:p-8">
          <div className="flex flex-col gap-4 border-b border-hairline/60 pb-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="chip chip--warning chip--sm">Threat Model Demo</span>
                <span className="text-caption text-text-muted">Scenario: Unexpected sender writes to your alias</span>
              </div>
              <h3 className="mt-2 text-h3 font-bold text-text">What happens when a service leaks your email?</h3>
            </div>
            <div className="rounded-full border border-hairline/80 bg-surface-sunken px-3 py-1 text-caption font-mono text-text-muted">
              Domain mismatch detected
            </div>
          </div>

          <div className="my-6 rounded-xl border border-border/80 bg-surface-sunken/60 p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-danger shrink-0">
                <IconAlertTriangle size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-text">Suspicious sender: promo@random-marketing-broker.com</p>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  This sender sent mail to <span className="font-mono font-semibold text-text">{currentAlias}</span>, but does
                  not match the authorized service domain ({cleanLabel}.com). Postern flags the leak and allows you to choose
                  your response:
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
              <span className="hidden sm:inline">(Block leak, keep service)</span>
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

          <div className="mt-6 rounded-xl border border-hairline/80 bg-surface-sunken/60 p-4 text-sm">
            {leakState === 'flagged' && (
              <p className="text-text-muted">
                Choose an action above to see how Postern isolates the issue and restores your inbox tranquility.
              </p>
            )}
            {leakState === 'expected' && (
              <div className="alert alert--info">
                <p className="alert__title">Sender marked as expected</p>
                <p>Future notifications from this sender to this alias will be forwarded without warnings.</p>
              </div>
            )}
            {leakState === 'replaced' && (
              <div className="alert alert--warning">
                <p className="alert__title">New clean alias created for {cleanLabel}</p>
                <p>
                  The previous address has been permanently retired. Any further spam hitting the old address will be dropped
                  at the edge with zero backscatter.
                </p>
              </div>
            )}
            {leakState === 'blocked' && (
              <div className="alert alert--danger">
                <p className="alert__title">Sender domain permanently blocked</p>
                <p>Messages from promo@random-marketing-broker.com are now rejected immediately at the edge.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
