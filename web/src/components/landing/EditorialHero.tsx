import { SectionLink } from '../common/SectionLink'
import { RequestInvite } from '../user/RequestInvite'

export function EditorialHero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="overflow-hidden bg-bg pt-16 pb-20 lg:pt-24 lg:pb-32"
    >
      <div className="editorial-shell">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <h1
              id="hero-title"
              className="editorial-hero-title mb-8 text-balance text-primary"
            >
              Your inbox,
              <br />
              on your terms.
            </h1>

            <p className="mb-10 max-w-xl text-[18px] leading-[30px] text-on-surface-variant text-pretty">
              Give every service its own email address. Messages still arrive in your normal inbox,
              but now you’ll know exactly who is using each address and can shut it down whenever
              you want.
            </p>

            <div className="flex flex-wrap items-center gap-5">
              <RequestInvite className="editorial-button editorial-button--primary !px-8 !py-4" />
              <SectionLink
                sectionId="why-postern"
                className="editorial-button editorial-button--secondary !px-8 !py-4"
              >
                See how it works
              </SectionLink>
            </div>

            <div className="mt-10 flex items-center gap-3 border-t border-hairline pt-6 text-xs text-on-surface-variant">
              <span className="font-semibold text-primary">Note:</span>
              <span>
                Postern forwards incoming mail to your normal inbox; replies from your inbox use
                your real address.
              </span>
            </div>
          </div>

          <div className="relative hidden lg:col-span-5 lg:block">
            <div className="overflow-hidden border border-hairline bg-surface-container-lowest p-8 shadow-[0_20px_50px_rgba(27,27,27,0.06)] lg:p-10">
              <div className="mb-6 flex items-center justify-between border-b border-hairline pb-5">
                <div className="flex items-center gap-2.5">
                  <span className="size-2 bg-accent" aria-hidden="true" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                    New alert
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-on-surface-variant">
                    Example
                  </span>
                  <span className="text-outline-variant" aria-hidden="true">
                    •
                  </span>
                  <span className="font-mono text-xs text-primary">No message contents</span>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                    From
                  </div>
                  <div className="font-mono text-sm font-semibold text-primary">
                    offers@shopfly.example
                  </div>
                </div>

                <div className="border border-hairline bg-surface-container-low p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                      Alias Target
                    </span>
                    <span className="text-[10px] text-on-surface-variant">Intended for: Netflix</span>
                  </div>
                  <div className="select-all font-mono text-sm font-medium text-primary">
                    netflix.k7q2@3xyz.uk
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                    Status
                  </div>
                  <div className="inline-flex items-center gap-2 bg-accent-container px-3 py-1.5 text-xs font-semibold text-on-accent-container">
                    <span className="size-1.5 bg-accent" aria-hidden="true" />
                    Unexpected sender
                  </div>
                  <p className="mt-1.5 text-xs leading-snug text-on-surface-variant">
                    This alias was created for Netflix, but received email from Shopfly.
                  </p>
                </div>

                <div className="border-t border-hairline pt-4">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                    Recommended Action
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <SectionLink
                      sectionId="actions"
                      className="editorial-button editorial-button--secondary !min-h-0 !px-3 !py-2.5 !text-xs"
                    >
                      Review sender
                    </SectionLink>
                    <SectionLink
                      sectionId="actions"
                      className="editorial-button editorial-button--accent !min-h-0 !px-3 !py-2.5 !text-xs"
                    >
                      Block domain
                    </SectionLink>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 text-xs text-on-surface-variant">
                  <span>Forwarded to:</span>
                  <span className="font-mono font-medium text-primary">
                    you@example.com
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
