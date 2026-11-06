import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BlockedActivity } from '../../src/components/app/BlockedActivity'
import type { ActivityFeed } from '../../src/hooks/useActivity'
import type { BlockedMessage } from '../../src/services/activityService'
import type { Alias } from '../../src/services/aliasService'

const ALIAS: Alias = {
  id: 'alias-1',
  userId: 'user-1',
  label: 'Shop',
  randomSuffix: 'k4m2',
  fullAddress: 'shop.k4m2@postern.local',
  purposeMetadata: null,
  category: 'shopping',
  status: 'Active',
  replacedByAliasId: null,
  kvDirty: false,
  createdAt: '2026-02-01T10:00:00Z',
  deletedAt: null,
}

function feed(overrides: Partial<ActivityFeed<BlockedMessage>>): ActivityFeed<BlockedMessage> {
  return {
    items: [],
    status: 'ready',
    error: null,
    hasMore: false,
    isLoadingMore: false,
    loadMore: async () => undefined,
    ...overrides,
  }
}

describe('BlockedActivity', () => {
  it('renders loading, error, and empty states', () => {
    const { rerender } = render(<BlockedActivity aliases={[ALIAS]} feed={feed({ status: 'loading' })} />)
    expect(screen.getByRole('status', { name: /loading blocked mail/i })).toBeInTheDocument()

    rerender(<BlockedActivity aliases={[ALIAS]} feed={feed({ status: 'error', error: 'boom' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')

    rerender(<BlockedActivity aliases={[ALIAS]} feed={feed({ status: 'ready' })} />)
    expect(screen.getByText(/nothing blocked/i)).toBeInTheDocument()
  })

  it('renders blocked messages and loads more', async () => {
    const user = userEvent.setup()
    const loadMore = vi.fn().mockResolvedValue(undefined)
    render(
      <BlockedActivity
        aliases={[ALIAS]}
        feed={feed({
          items: [
            {
              id: 'm1',
              aliasId: 'alias-1',
              fromHeader: 'bad@example.com',
              subject: null,
              receivedAt: '2026-02-01T10:00:00Z',
              reason: 'blocked_sender',
            },
          ],
          hasMore: true,
          loadMore,
        })}
      />,
    )

    expect(screen.getByText('bad@example.com')).toBeInTheDocument()
    expect(screen.getByText('blocked_sender')).toBeInTheDocument()
    expect(screen.getByText('Shop')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /load older messages/i }))
    expect(loadMore).toHaveBeenCalled()
  })
})
