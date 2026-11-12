const configured = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

export const API_BASE_URL = configured.replace(/\/+$/, '')

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) {
    return path
  }

  return API_BASE_URL ? `${API_BASE_URL}${path}` : path
}
