import { IconCheck } from '../common/Icons'
import { RequestInvite } from '../user/RequestInvite'
import { HeroVisual } from './HeroVisual'

const TRUST = [
  'No message bodies stored',
  'No central inbox',
  'One-click block',
] as const

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden border-b border-hairline/70 bg-[#fbf3f9] dark:bg-[#0f090d]"
    >
      <div className="shell grid items-center gap-8 pt-10 pb-10 sm:gap-10 sm:pt-12 sm:pb-12 lg:min-h-[36rem] lg:py-16">
        <div className="relative z-10 max-w-xl">
          <h1 id="hero-title" className="mt-5 text-display font-black text-text">
            Your inbox,
            <br />
            on your terms.
          </h1>

          <p className="mt-6 max-w-[46ch] text-body-lg text-text-secondary">
            Postern gives every service its own address. When one leaks your data, you know who did it — and you can cut it off.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <RequestInvite />
            <a href="#how-it-works" className="btn btn--secondary btn--lg">
              See how it works
            </a>
          </div>

          <ul className="m-0 mt-8 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-caption text-text-muted">
            {TRUST.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <IconCheck size={13} className="text-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  )
}
