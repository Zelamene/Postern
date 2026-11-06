import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const server = setupServer(
  http.get('*/health', () => HttpResponse.json({ status: 'ok' })),
  http.get('*/api/auth/me', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
)
