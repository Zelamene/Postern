import { RequestInvite } from '../user/RequestInvite'
import { EditorialReveal } from './EditorialReveal'

export function InviteSection() {
  return (
    <section
      id="request-invite"
      aria-labelledby="request-invite-heading"
      tabIndex={-1}
      className="scroll-mt-20 bg-bg py-20 lg:py-32 focus:outline-none"
    >
      <EditorialReveal className="editorial-shell max-w-2xl text-center">
        <h2 id="request-invite-heading" className="editorial-section-title mb-4">
          Request an invitation
        </h2>
        <p className="mx-auto mb-14 max-w-prose text-sm leading-relaxed text-on-surface-variant">
          Postern is currently invite-only. Submit your email address and we&apos;ll review your
          request. If approved, you&apos;ll receive an invitation to create your account.
        </p>

        <div className="bg-surface-container-lowest p-8 text-left shadow-[0_30px_60px_rgba(27,27,27,0.04)] lg:p-12">
          <RequestInvite variant="inline" />
        </div>
      </EditorialReveal>
    </section>
  )
}
