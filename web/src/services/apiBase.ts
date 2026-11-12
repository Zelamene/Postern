const configured = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
export const API_BASE_URL = configured.replace(/\/+$/, '')

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath
}