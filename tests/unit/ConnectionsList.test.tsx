/**
 * Unit Tests: ConnectionsList component
 * (src/features/connections/components/ConnectionsList.tsx)
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConnectionsList } from '@/features/connections/components/ConnectionsList'
import type { ConnectionWithProfile } from '@/features/connections/types'

const MOCK_CONN: ConnectionWithProfile = {
  id: 'conn-1',
  requester_id: 'user-1',
  addressee_id: 'user-2',
  status: 'ACCEPTED',
  created_at: '2026-10-05T00:00:00Z',
  updated_at: '2026-10-05T00:00:00Z',
  is_requester: true,
  other_user: {
    id: 'user-2',
    display_name: 'Manish Patel',
    avatar_url: null,
  },
}

describe('ConnectionsList', () => {
  it('renders loading skeletons when isLoading is true', () => {
    const html = renderToStaticMarkup(
      <ConnectionsList
        connections={[]}
        isLoading={true}
        error={null}
        onRemove={vi.fn()}
        onBlock={vi.fn()}
      />
    )

    expect(html).toContain('connections-list-loading')
    expect(html).toContain('animate-pulse')
  })

  it('renders error state and message when error occurs', () => {
    const html = renderToStaticMarkup(
      <ConnectionsList
        connections={[]}
        isLoading={false}
        error={new Error('Connection failure')}
        onRemove={vi.fn()}
        onBlock={vi.fn()}
        onRetry={vi.fn()}
      />
    )

    expect(html).toContain('connections-list-error')
    expect(html).toContain('Failed to load connections')
    expect(html).toContain('Connection failure')
    expect(html).toContain('Try Again')
  })

  it('renders empty state when no connections exist', () => {
    const html = renderToStaticMarkup(
      <ConnectionsList
        connections={[]}
        isLoading={false}
        error={null}
        onRemove={vi.fn()}
        onBlock={vi.fn()}
      />
    )

    expect(html).toContain('connections-list-empty')
    expect(html).toContain('No connections yet')
  })

  it('renders populated connections grid', () => {
    const html = renderToStaticMarkup(
      <ConnectionsList
        connections={[MOCK_CONN]}
        isLoading={false}
        error={null}
        onRemove={vi.fn()}
        onBlock={vi.fn()}
      />
    )

    expect(html).toContain('connections-list-grid')
    expect(html).toContain('Manish Patel')
    expect(html).toContain('Connected')
  })
})
