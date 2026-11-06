import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ApiTimeoutError, requestEmpty, requestJson } from '../../src/services/apiClient'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function jsonResponse(status = 200, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('apiClient', () => {
  it('retries idempotent GETs on transient failures with bounded delays', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = requestJson<{ ok: boolean }>('/api/health')
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(promise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-GET requests', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = requestEmpty('/api/aliases', { method: 'POST', body: { label: 'x' } })
    const assertion = expect(promise).rejects.toBeInstanceOf(ApiError)
    await vi.runAllTimersAsync()

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry when the caller aborts', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_, init) => {
      controller.abort()
      return Promise.reject(init?.signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = requestJson('/api/auth/me', { signal: controller.signal })
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    await vi.runAllTimersAsync()

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('times out requests and surfaces a timeout error after GET retries are exhausted', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const promise = requestJson('/api/auth/me')
    const assertion = expect(promise).rejects.toBeInstanceOf(ApiTimeoutError)

    await vi.advanceTimersByTimeAsync(15_000)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(15_000)
    await vi.advanceTimersByTimeAsync(5_000)
    await vi.advanceTimersByTimeAsync(15_000)

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
