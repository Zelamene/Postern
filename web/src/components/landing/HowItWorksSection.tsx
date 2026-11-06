import { Reveal } from '../common/Reveal'

interface StepCardProps {
  step: string
  title: string
  description: string
}

function StepCard({ step, title, description }: Readonly<StepCardProps>) {
  return (
    <div className="group relative rounded-2xl border border-hairline/80 bg-surface p-7 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-md">
      <span className="mb-5 block font-mono text-4xl font-black tracking-tight text-primary/30 transition-colors group-hover:text-primary/50">
        {step}
      </span>
      <h3 className="text-h4 font-bold text-text transition-colors group-hover:text-primary">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
    </div>
  )
}

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="steps-heading"
      className="scroll-mt-20 border-b border-hairline/70 bg-surface-sunken/40 py-14 sm:py-16 lg:py-20"
    >
      <div className="shell">
        <Reveal>
          <div className="mx-auto mb-8 max-w-[38rem] sm:mb-10 text-center">
            <span className="chip chip--info chip--sm mb-3">Simple Process</span>
            <h2 id="steps-heading" className="text-h2 font-bold tracking-tight text-text">
              How Postern works in 4 easy steps
            </h2>
            <p className="mt-4 text-body text-text-secondary">
              No complicated apps to check or new inboxes to manage. Postern works seamlessly with
              your existing email client.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          <Reveal delayMs={80}>
            <StepCard
              step="01"
              title="Generate your alias"
              description="Type a service label such as netflix or booking. Postern generates a disposable address with a unique random suffix."
            />
          </Reveal>
          <Reveal delayMs={160}>
            <StepCard
              step="02"
              title="Sign up with the service"
              description="Paste the generated address into the registration or checkout form. Your real address remains completely secret."
            />
          </Reveal>
          <Reveal delayMs={240}>
            <StepCard
              step="03"
              title="Read in your normal inbox"
              description="Legitimate verification codes, order receipts, and notices arrive in your Gmail or Proton within milliseconds."
            />
          </Reveal>
          <Reveal delayMs={320}>
            <StepCard
              step="04"
              title="Shut down unwanted noise"
              description="When a service begins sending spam or suffers a leak, turn off the alias with one click. Spam stops immediately."
            />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
