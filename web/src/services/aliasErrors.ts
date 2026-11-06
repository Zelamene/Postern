import { ApiError } from './apiClient'

/**
 * Maps alias API failures to copy the dashboard can show verbatim.
 * Callers keep their own 400 handling, which is endpoint-specific.
 */
export function describeAliasError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Your session has ended. Sign in again to manage aliases.'
    }

    if (error.status === 404) {
      return 'That alias no longer exists. Refresh the list and try again.'
    }
  }

  return fallback
}
