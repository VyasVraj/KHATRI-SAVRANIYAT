/**
 * Unit Tests: ConnectionCard component
 * (src/features/connections/components/ConnectionCard.tsx)
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConnectionCard } from '@/features/connections/components/ConnectionCard'
import type { ConnectionWithProfile } from '@/features/connections/types'

const BASE_CONN: ConnectionWithProfile = {
  id: 'conn-1',
  requester_id: 'user-1',
  addressee_id: 'user-2',
  status: 'ACCEPTED',
  created_at: '2026-10-05T00:00:00Z',
  updated_at: '2026-10-05T00:00:00Z',
  is_requester: true,
  other_user: {
    id: 'user-2',
    display_name: 'Anita Desai',
    avatar_url: null,
  },
}

describe('ConnectionCard', () => {
  it('renders accepted connection with Connected badge and name', () => {
    const html = renderToStaticMarkup(
      <ConnectionCard
        connection={BASE_CONN}
        onRemove={vi.fn()}
        onBlock={vi.fn()}
      />
    )

    expect(html).toContain('Anita Desai')
    expect(html).toContain('Connected')
    expect(html).toContain('Remove')
    expect(html).toContain('Block')
  })

  it('renders received pending request with Accept, Ignore, and Block buttons', () => {
    const receivedConn: ConnectionWithProfile = {
      ...BASE_CONN,
      status: 'PENDING',
      is_requester: false,
    }

    const html = renderToStaticMarkup(
      <ConnectionCard
        connection={receivedConn}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onBlock={vi.fn()}
      />
    )

    expect(html).toContain('Request Received')
    expect(html).toContain('Accept')
    expect(html).toContain('Ignore')
    expect(html).toContain('Block')
  })

  it('renders sent pending request with Request Sent badge and Cancel button', () => {
    const sentConn: ConnectionWithProfile = {
      ...BASE_CONN,
      status: 'PENDING',
      is_requester: true,
    }

    const html = renderToStaticMarkup(
      <ConnectionCard
        connection={sentConn}
        onCancel={vi.fn()}
      />
    )

    expect(html).toContain('Request Sent')
    expect(html).toContain('Cancel Request')
  })

  it('renders blocked state with Blocked badge and notice', () => {
    const blockedConn: ConnectionWithProfile = {
      ...BASE_CONN,
      status: 'BLOCKED',
    }

    const html = renderToStaticMarkup(<ConnectionCard connection={blockedConn} />)

    expect(html).toContain('Blocked')
    expect(html).toContain('This relationship is blocked.')
  })

  it('strictly excludes and never renders sensitive fields or internal IDs', () => {
    const html = renderToStaticMarkup(<ConnectionCard connection={BASE_CONN} />)

    expect(html).not.toContain(BASE_CONN.id)
    expect(html).not.toContain('2026-10-05')
    expect(html).not.toContain('email')
    expect(html).not.toContain('phone')
  })
})
