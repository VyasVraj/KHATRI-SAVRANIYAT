/**
 * Unit Tests: PersonConnectionSection Component
 * (src/features/connections/components/PersonConnectionSection.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PersonConnectionSection } from '@/features/connections/components/PersonConnectionSection'
import * as authContext from '@/features/auth/context/AuthContext'
import * as useConnHook from '@/features/connections/hooks/useConnectionWithUser'
import * as useMutualHook from '@/features/connections/hooks/useMutualConnections'
import * as useMutationsHook from '@/features/connections/hooks/useConnectionMutations'
import type { ConnectionRow, MutualConnectionsCountResult } from '@/features/connections/types'
import type { UseQueryResult } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/connections/hooks/useConnectionWithUser')
vi.mock('@/features/connections/hooks/useMutualConnections')
vi.mock('@/features/connections/hooks/useConnectionMutations')

const CALLER_USER_ID = '11111111-1111-4111-8111-111111111111'
const TARGET_USER_ID = '22222222-2222-4222-8222-222222222222'
const CONN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('PersonConnectionSection', () => {
  const mockSendMutateAsync = vi.fn().mockResolvedValue({})
  const mockAcceptMutateAsync = vi.fn().mockResolvedValue({})
  const mockRejectMutateAsync = vi.fn().mockResolvedValue({})
  const mockRemoveMutateAsync = vi.fn().mockResolvedValue({})
  const mockBlockMutateAsync = vi.fn().mockResolvedValue({})

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: CALLER_USER_ID } as unknown as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })

    vi.spyOn(useConnHook, 'useConnectionWithUser').mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as unknown as UseQueryResult<ConnectionRow | null, Error>)

    vi.spyOn(useMutualHook, 'useMutualConnections').mockReturnValue({
      data: { user_a_id: CALLER_USER_ID, user_b_id: TARGET_USER_ID, mutual_count: 2 },
      isLoading: false,
    } as unknown as UseQueryResult<MutualConnectionsCountResult, Error>)

    vi.spyOn(useMutationsHook, 'useConnectionMutations').mockReturnValue({
      sendRequest: { mutateAsync: mockSendMutateAsync, isPending: false },
      acceptRequest: { mutateAsync: mockAcceptMutateAsync, isPending: false },
      rejectRequest: { mutateAsync: mockRejectMutateAsync, isPending: false },
      remove: { mutateAsync: mockRemoveMutateAsync, isPending: false },
      block: { mutateAsync: mockBlockMutateAsync, isPending: false },
    } as unknown as ReturnType<typeof useMutationsHook.useConnectionMutations>)
  })


  it('1. Renders NOTHING when targetUserId is null/undefined (PERSON != USER boundary)', () => {
    const html = renderToStaticMarkup(<PersonConnectionSection targetUserId={null} />)
    expect(html).toBe('')
  })

  it('2. Renders self-link confirmation when targetUserId === callerUserId', () => {
    const html = renderToStaticMarkup(<PersonConnectionSection targetUserId={CALLER_USER_ID} />)
    expect(html).toContain('linked to your user account')
    expect(html).not.toContain('Connect')
  })

  it('3. Renders "Connect" button and mutual count when not connected', () => {
    vi.spyOn(useConnHook, 'useConnectionWithUser').mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as UseQueryResult<ConnectionRow | null, Error>)

    const html = renderToStaticMarkup(
      <PersonConnectionSection targetUserId={TARGET_USER_ID} personName="Aarav Mehta" />
    )

    expect(html).toContain('Community connection')
    expect(html).toContain('2 mutual connections')
    expect(html).toContain('Connect')
  })

  it('4. Renders "Request sent" and Cancel action when PENDING (sent by caller)', () => {
    const pendingConn: ConnectionRow = {
      id: CONN_ID,
      requester_id: CALLER_USER_ID,
      addressee_id: TARGET_USER_ID,
      status: 'PENDING',
      created_at: '2026-10-05T00:00:00Z',
      updated_at: '2026-10-05T00:00:00Z',
    }
    vi.spyOn(useConnHook, 'useConnectionWithUser').mockReturnValue({
      data: pendingConn,
      isLoading: false,
      error: null,
    } as UseQueryResult<ConnectionRow | null, Error>)

    const html = renderToStaticMarkup(
      <PersonConnectionSection targetUserId={TARGET_USER_ID} />
    )

    expect(html).toContain('Request sent')
    expect(html).toContain('Cancel')
  })

  it('5. Renders "Received request" with Accept and Decline buttons when PENDING (received)', () => {
    const receivedConn: ConnectionRow = {
      id: CONN_ID,
      requester_id: TARGET_USER_ID,
      addressee_id: CALLER_USER_ID,
      status: 'PENDING',
      created_at: '2026-10-05T00:00:00Z',
      updated_at: '2026-10-05T00:00:00Z',
    }
    vi.spyOn(useConnHook, 'useConnectionWithUser').mockReturnValue({
      data: receivedConn,
      isLoading: false,
      error: null,
    } as UseQueryResult<ConnectionRow | null, Error>)

    const html = renderToStaticMarkup(
      <PersonConnectionSection targetUserId={TARGET_USER_ID} />
    )

    expect(html).toContain('Received request')
    expect(html).toContain('Accept')
    expect(html).toContain('Decline')
  })

  it('6. Renders "Connected" badge and Disconnect action when ACCEPTED', () => {
    const acceptedConn: ConnectionRow = {
      id: CONN_ID,
      requester_id: TARGET_USER_ID,
      addressee_id: CALLER_USER_ID,
      status: 'ACCEPTED',
      created_at: '2026-10-05T00:00:00Z',
      updated_at: '2026-10-05T00:00:00Z',
    }
    vi.spyOn(useConnHook, 'useConnectionWithUser').mockReturnValue({
      data: acceptedConn,
      isLoading: false,
      error: null,
    } as UseQueryResult<ConnectionRow | null, Error>)

    const html = renderToStaticMarkup(
      <PersonConnectionSection targetUserId={TARGET_USER_ID} />
    )

    expect(html).toContain('Connected')
    expect(html).toContain('Disconnect')
  })

  it('7. Renders "Blocked" badge when BLOCKED', () => {
    const blockedConn: ConnectionRow = {
      id: CONN_ID,
      requester_id: CALLER_USER_ID,
      addressee_id: TARGET_USER_ID,
      status: 'BLOCKED',
      created_at: '2026-10-05T00:00:00Z',
      updated_at: '2026-10-05T00:00:00Z',
    }
    vi.spyOn(useConnHook, 'useConnectionWithUser').mockReturnValue({
      data: blockedConn,
      isLoading: false,
      error: null,
    } as UseQueryResult<ConnectionRow | null, Error>)

    const html = renderToStaticMarkup(
      <PersonConnectionSection targetUserId={TARGET_USER_ID} />
    )

    expect(html).toContain('Blocked')
    expect(html).not.toContain('Connect')
  })
})
