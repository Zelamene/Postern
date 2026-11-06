export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Request failed with status ${status}.`)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

async function send(path: string, options: ApiRequestOptions): Promise<Response> {
  const { method = 'GET', body, signal } = options
  const response = await fetch(path, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new ApiError(response.status)
  }

  return response
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
