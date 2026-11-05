/**
 * Unit Tests: RequestsList component
 * (src/features/connections/components/RequestsList.tsx)
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RequestsList } from '@/features/connections/components/RequestsList'
import type { ConnectionWithProfile } from '@/features/connections/types'

const MOCK_RECEIVED: ConnectionWithProfile = {
  id: 'conn-recv',
  requester_id: 'user-sender',
  addressee_id: 'user-me',
  status: 'PENDING',
  created_at: '2026-10-05T00:00:00Z',
  updated_at: '2026-10-05T00:00:00Z',
  is_requester: false,
  other_user: {
    id: 'user-sender',
    display_name: 'Rajesh Varma',
    avatar_url: null,
  },
}

const MOCK_SENT: ConnectionWithProfile = {
  id: 'conn-sent',
  requester_id: 'user-me',
  addressee_id: 'user-target',
  status: 'PENDING',
  created_at: '2026-10-05T00:00:00Z',
  updated_at: '2026-10-05T00:00:00Z',
  is_requester: true,
  other_user: {
    id: 'user-target',
    display_name: 'Kavita Joshi',
    avatar_url: null,
  },
}

describe('RequestsList', () => {
  it('renders loading state when isLoading is true', () => {
    const html = renderToStaticMarkup(
      <RequestsList
        receivedRequests={[]}
        sentRequests={[]}
        isLoading={true}
        error={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onBlock={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(html).toContain('requests-list-loading')
  })

  it('renders error state when error is present', () => {
    const html = renderToStaticMarkup(
      <RequestsList
        receivedRequests={[]}
        sentRequests={[]}
        isLoading={false}
        error={new Error('Network error')}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onBlock={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(html).toContain('requests-list-error')
    expect(html).toContain('Network error')
  })

  it('renders empty state when no pending requests exist', () => {
    const html = renderToStaticMarkup(
      <RequestsList
        receivedRequests={[]}
        sentRequests={[]}
        isLoading={false}
        error={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onBlock={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(html).toContain('requests-list-empty')
    expect(html).toContain('No pending requests')
  })

  it('renders both received and sent request sections when populated', () => {
    const html = renderToStaticMarkup(
      <RequestsList
        receivedRequests={[MOCK_RECEIVED]}
        sentRequests={[MOCK_SENT]}
        isLoading={false}
        error={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onBlock={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(html).toContain('requests-list-content')
    expect(html).toContain('Received Requests (1)')
    expect(html).toContain('Rajesh Varma')
    expect(html).toContain('Sent Requests (1)')
    expect(html).toContain('Kavita Joshi')
  })
})
