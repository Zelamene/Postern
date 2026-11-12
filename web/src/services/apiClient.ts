import type { ApiRequestOptions } from '../types'
import { apiUrl } from './apiBase'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Request failed with status ${status}.`)
    this.name = 'ApiError'
    this.status = status
  }
}

export class ApiTimeoutError extends Error {
  constructor() {
    super('Request timed out.')
    this.name = 'ApiTimeoutError'
  }
}

const REQUEST_TIMEOUT_MS = 15_000
const GET_RETRY_DELAYS_MS = [2_000, 5_000]
const RETRYABLE_STATUSES = new Set([502, 503, 504])

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isCallerAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function mergeSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; didTimeout: () => boolean; cleanup: () => void } {
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort(signal?.reason)

  const timer = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('Timed out', 'TimeoutError'))
  }, timeoutMs)

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason)
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      globalThis.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

async function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (isCallerAborted(signal)) {
    throw new DOMException('Aborted', 'AbortError')
  }

  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      globalThis.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }

      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

async function fetchOnce(
  path: string,
  options: ApiRequestOptions,
): Promise<Response> {
  const { method = 'GET', body, signal } = options
  const merged = mergeSignal(signal, REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(apiUrl(path), {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: merged.signal,
    })

    if (!response.ok) {
      throw new ApiError(response.status)
    }

    return response
  } catch (error) {
    if (merged.didTimeout() && !isCallerAborted(signal)) {
      throw new ApiTimeoutError()
    }

    throw error
  } finally {
    merged.cleanup()
  }
}

function isRetryableGetError(error: unknown, signal: AbortSignal | undefined): boolean {
  if (isCallerAborted(signal) || isAbortError(error)) {
    return false
  }

  if (error instanceof ApiTimeoutError) {
    return true
  }

  if (error instanceof ApiError) {
    return RETRYABLE_STATUSES.has(error.status)
  }

  return error instanceof TypeError
}

async function send(path: string, options: ApiRequestOptions): Promise<Response> {
  const method = options.method ?? 'GET'
  const canRetry = method === 'GET'
  let attempt = 0

  for (;;) {
    try {
      return await fetchOnce(path, options)
    } catch (error) {
      const delay = canRetry ? GET_RETRY_DELAYS_MS[attempt] : undefined
      if (delay === undefined || !isRetryableGetError(error, options.signal)) {
        throw error
      }

      attempt += 1
      await wait(delay, options.signal)
    }
  }
}

export async function requestJson<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const response = await send(path, options)
  return (await response.json()) as T
}

export async function requestEmpty(
  path: string,
  options: ApiRequestOptions = {},
): Promise<void> {
  await send(path, options)
}
