import { useToast } from '../common/toast'
import { EditorialReveal } from './EditorialReveal'

export function ActivitySection() {
  const toast = useToast()

  return (
    <section
      id="activity"
      aria-labelledby="activity-heading"
      tabIndex={-1}
      className="scroll-mt-20 bg-bg py-20 lg:py-28 focus:outline-none"
    >
      <div className="editorial-shell">
        <EditorialReveal className="mb-12 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-xl">
            <h2 id="activity-heading" className="editorial-section-title mb-3">
              See exactly who’s using each alias
            </h2>
            <p className="text-sm leading-relaxed text-on-surface-variant">
              Postern records sender activity without storing email bodies or attachments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toast.success('Activity exported (example).')}
            className="editorial-button editorial-button--secondary !px-5 !py-2.5 !text-[11px]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 2v8m0 0l3-3M8 10L5 7M2.5 11.5v1a1 1 0 001 1h9a1 1 0 001-1v-1"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
            Export activity (CSV)
          </button>
        </EditorialReveal>

        <EditorialReveal className="overflow-hidden bg-surface-container-lowest shadow-[0_20px_50px_rgba(27,27,27,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-low px-8 py-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold uppercase tracking-wider text-on-surface-variant">
                Active Alias:
              </span>
              <span className="font-mono text-sm font-medium text-primary">
                netflix.k7q2@3xyz.uk
              </span>
              <span className="bg-bg px-2 py-0.5 font-medium text-on-surface-variant">Entertainment</span>
            </div>
            <div>
              <span className="text-on-surface-variant">Expected sender: </span>
              <strong className="font-mono text-primary">info@netflix.example</strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-hairline text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  <th scope="col" className="px-8 py-4">
                    Received
                  </th>
                  <th scope="col" className="px-8 py-4">
                    Sender
                  </th>
                  <th scope="col" className="px-8 py-4">
                    Subject
                  </th>
                  <th scope="col" className="px-8 py-4">
                    Status
                  </th>
                  <th scope="col" className="px-8 py-4 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                <tr className="transition-colors hover:bg-surface-container-low/50">
                  <td className="px-8 py-5 font-mono tabular-nums text-on-surface-variant">Example 01</td>
                  <td className="px-8 py-5">
                    <span className="block font-mono text-xs font-semibold text-primary">
                      info@netflix.example
                    </span>
                    <span className="text-xs text-on-surface-variant">Matches expected sender</span>
                  </td>
                  <td className="px-8 py-5 text-on-surface">New arrivals this week on Netflix</td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                      <span aria-hidden="true">✓</span>
                      Expected sender
                    </span>
                    <span className="mt-1 block text-[11px] text-on-surface-variant">
                      Forwarded to you@example.com
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right text-xs text-on-surface-variant">Normal delivery</td>
                </tr>

                <tr className="bg-accent-container/20 transition-colors hover:bg-accent-container/30">
                  <td className="px-8 py-5 font-mono tabular-nums text-on-surface-variant">Example 02</td>
                  <td className="px-8 py-5">
                    <span className="block font-mono text-xs font-semibold text-accent">
                      offers@shopfly.example
                    </span>
                    <span className="text-[11px] font-semibold text-accent">
                      Domain not on expected list
                    </span>
                  </td>
                  <td className="px-8 py-5 text-on-surface">
                    Exclusive 30% discount on streaming gear...
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
                      <span aria-hidden="true">!</span>
                      Unexpected sender
                    </span>
                    <span className="mt-1 block text-[11px] text-on-surface-variant">
                      Forwarded, flagged for review
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="inline-flex items-center gap-3">
                      <a href="/login" className="editorial-table-link !text-xs">
                        Mark as expected
                      </a>
                      <span className="text-outline-variant" aria-hidden="true">
                        •
                      </span>
                      <a href="/login" className="editorial-table-link editorial-table-link--accent !text-xs">
                        Block sender
                      </a>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-hairline bg-surface-container-low px-8 py-3.5 text-xs text-on-surface-variant">
            <span>Postern stores sender metadata only. Your email contents are never saved.</span>
            <span className="font-medium text-primary">Forwarded safely to your inbox</span>
          </div>
        </EditorialReveal>
      </div>
    </section>
  )
}
