import {
  BEST_EFFORT_LOGGING_NOTICE,
  PROPAGATION_DELAY_NOTICE,
} from '../../services/productCopy'

/** Shared data-freshness copy for surfaces that can show stale information. */
export function StaleDataNotice() {
  return (
    <section
      aria-label="Data freshness"
      className="rounded-lg border border-hairline bg-surface px-4 py-3 text-xs text-text-muted"
    >
      <p className="font-semibold text-text-secondary">About this data</p>
      <p className="mt-1">{PROPAGATION_DELAY_NOTICE}</p>
      <p className="mt-1">{BEST_EFFORT_LOGGING_NOTICE}</p>
    </section>
  )
}
