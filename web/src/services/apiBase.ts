let base = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
while (base.endsWith('/')) {
  base = base.slice(0, -1)
}

export const API_BASE_URL = base

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath
}