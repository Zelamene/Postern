import type { ReactNode } from 'react'
import {
  IconCheckCircle,
  IconEyeOff,
  IconRefresh,
  IconTrash2,
} from '../common/Icons'
import { EditorialReveal } from './EditorialReveal'

const CARDS: ReadonlyArray<{
  icon: ReactNode
  iconClass: string
  title: string
  description: string
}> = [
  {
    icon: <IconCheckCircle size={24} />,
    iconClass: 'text-success',
    title: 'Mark as expected',
    description:
      'Trust a sender and stop future warnings when an address is shared with a valid partner.',
  },
  {
    icon: <IconEyeOff size={24} />,
    iconClass: 'text-accent',
    title: 'Block sender',
    description:
      'Stop mail from that domain reaching the alias. Mail is blocked before reaching your inbox.',
  },
  {
    icon: <IconRefresh size={24} />,
    iconClass: 'text-primary',
    title: 'Replace alias',
    description:
      'Create a new address and migrate safely while keeping old mail forwarding until you update the service.',
  },
  {
    icon: <IconTrash2 size={24} />,
    iconClass: 'text-error',
    title: 'Disable or delete',
    description:
      'Pause forwarding or permanently retire the alias. Deleted addresses are never recycled.',
  },
]

export function ControlSection() {
  return (
    <section
      id="actions"
      aria-labelledby="actions-heading"
      tabIndex={-1}
      className="scroll-mt-20 bg-surface-container-low py-20 lg:py-28 focus:outline-none"
    >
      <div className="editorial-shell">
        <EditorialReveal className="mb-14 max-w-2xl">
          <span className="editorial-eyebrow mb-3">Control</span>
          <h2 id="actions-heading" className="editorial-section-title mb-4">
            Take action when something looks wrong
          </h2>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            You don&apos;t need complex email rules. Postern gives you simple, decisive options for
            each alias.
          </p>
        </EditorialReveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((card, index) => (
            <EditorialReveal key={card.title} delayMs={80 * (index + 1)}>
              <div className="editorial-action-card flex h-full cursor-default flex-col justify-between p-8">
                <div>
                  <div className={`mb-4 flex items-center ${card.iconClass}`}>
                    <span className="editorial-action-icon">{card.icon}</span>
                  </div>
                  <h3 className="mb-2 text-[15px] font-semibold leading-6 text-primary">
                    {card.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-on-surface-variant">
                    {card.description}
                  </p>
                </div>
              </div>
            </EditorialReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
