import type { Page, Response } from '@playwright/test'
import { expect } from '@playwright/test'

export const MAX_STEP_MS = 2_000
export const MAX_TASK_MS = 5_000

export interface StepMeasurement {
  step: string
  durationMs: number
  serverTiming?: string | null
  serverAppDurMs?: number | null
}

export function createServerTimingCollector(page: Page) {
  const recent: Array<{ url: string; serverTiming: string | null; appDurMs: number | null }> = []
  page.on('response', (response: Response) => {
    const serverTiming = response.headers()['server-timing'] ?? null
    const match = serverTiming?.match(/app;dur=([0-9.]+)/)
    recent.push({
      url: response.url(),
      serverTiming,
      appDurMs: match ? Number(match[1]) : null,
    })
    if (recent.length > 200) recent.splice(0, recent.length - 200)
  })

  return {
    latestMatching(predicate: (url: string) => boolean) {
      for (let index = recent.length - 1; index >= 0; index -= 1) {
        if (predicate(recent[index].url)) return recent[index]
      }
      return undefined
    },
  }
}

export async function timedStep<T>(
  step: string,
  run: () => Promise<T>,
  options: { serverTiming?: () => { serverTiming: string | null; appDurMs: number | null } | undefined } = {},
): Promise<{ result: T; measurement: StepMeasurement }> {
  const startedAt = Date.now()
  const result = await run()
  const durationMs = Date.now() - startedAt
  const server = options.serverTiming?.()
  const measurement: StepMeasurement = {
    step,
    durationMs,
    serverTiming: server?.serverTiming ?? null,
    serverAppDurMs: server?.appDurMs ?? null,
  }
  expect(durationMs, `${step} took ${durationMs} ms`).toBeLessThanOrEqual(MAX_STEP_MS)
  return { result, measurement }
}

export async function timedCoreTask<T>(
  task: string,
  run: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const startedAt = Date.now()
  const result = await run()
  const durationMs = Date.now() - startedAt
  expect(durationMs, `${task} took ${durationMs} ms`).toBeLessThanOrEqual(MAX_TASK_MS)
  return { result, durationMs }
}
