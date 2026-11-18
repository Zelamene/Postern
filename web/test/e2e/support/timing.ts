import { appendFileSync } from 'node:fs'
import { expect } from '@playwright/test'

/** QR6.2 budget: a core task must complete within two minutes. */
export const MAX_TASK_MS = 120_000

interface TimingRecord {
  run: string
  task: string
  durationMs: number
}

/**
 * Runs one named core task, asserts its wall-clock budget and, when the harness
 * supplies an output path, records the measurement for the median report.
 */
export async function timedTask<T>(task: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now()
  const result = await run()
  const durationMs = Date.now() - startedAt

  expect(durationMs, `${task} took ${durationMs} ms`).toBeLessThanOrEqual(MAX_TASK_MS)

  const output = process.env.POSTERN_E2E_TIMING_OUT
  if (output) {
    const record: TimingRecord = {
      run: process.env.POSTERN_E2E_TIMING_RUN ?? 'local',
      task,
      durationMs,
    }
    appendFileSync(output, `${JSON.stringify(record)}\n`)
  }

  return result
}
