import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { server } from '../server'

function renderAt(pathname: string) {
  window.history.pushState({}, '', pathname)
  return render(<App />)
}

afterEach(() => {
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  localStorage.removeItem('postern-theme')
})

describe('Alias dashboard flow', () => {
  it('loads the authenticated alias dashboard', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          userId: '00000000-0000-0000-0000-000000000001',
          email: 'person@example.test',
          forwardingAddress: 'forward@example.test',
        }),
      ),
      http.get('*/api/aliases', () =>
        HttpResponse.json([
          {
            id: '00000000-0000-0000-0000-000000000101',
            userId: '00000000-0000-0000-0000-000000000001',
            label: 'Shop',
            randomSuffix: 'abc12345',
            fullAddress: 'shop-abc12345@alias.postern.test',
            purposeMetadata: null,
            category: 'shopping',
            status: 'Active',
            replacedByAliasId: null,
            kvDirty: false,
            createdAt: '2026-11-01T10:00:00Z',
            deletedAt: null,
          },
        ]),
      ),
    )

    renderAt('/app')

    expect(await screen.findByRole('heading', { name: 'Your aliases' })).toBeDefined()
    expect(await screen.findByText(/shop-abc12345@alias\.postern\.test/)).toBeDefined()
    expect(screen.getByText(/forward@example\.test/)).toBeDefined()
  })

  it('creates an alias and displays the new address', async () => {
    const user = userEvent.setup()
    let created: Record<string, unknown> | undefined
    let aliases: unknown[] = []
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          userId: '00000000-0000-0000-0000-000000000001',
          email: 'person@example.test',
          forwardingAddress: 'forward@example.test',
        }),
      ),
      http.get('*/api/aliases', () => HttpResponse.json(aliases)),
      http.post('*/api/aliases', async ({ request }) => {
        created = (await request.json()) as Record<string, unknown>
        const alias = {
          id: '00000000-0000-0000-0000-000000000102',
          userId: '00000000-0000-0000-0000-000000000001',
          label: 'Shop',
          randomSuffix: 'ab12cd34',
          fullAddress: 'shop-ab12cd34@alias.postern.test',
          purposeMetadata: null,
          category: 'shopping',
          status: 'Active',
          replacedByAliasId: null,
          kvDirty: false,
          createdAt: '2026-11-02T10:00:00Z',
          deletedAt: null,
        }
        aliases = [alias]
        return HttpResponse.json(alias, { status: 201 })
      }),
    )

    renderAt('/app')

    expect(await screen.findByRole('heading', { name: 'Your aliases' })).toBeDefined()
    await user.type(screen.getByLabelText('Label'), 'Shop')
    await user.click(screen.getByRole('button', { name: 'Create alias' }))

    expect(await screen.findByText(/shop-ab12cd34@alias\.postern\.test/)).toBeDefined()
    expect(created).toMatchObject({ label: 'shop', category: 'other' })
  })
})
