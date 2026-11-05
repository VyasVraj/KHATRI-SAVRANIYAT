/**
 * Unit Tests: AuditLogPage (Phase 13 Subtask 3)
 * (src/features/admin/pages/AuditLogPage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuditLogPage } from '@/features/admin/pages/AuditLogPage'
import * as useAuditLogsHook from '@/features/admin/hooks/useAuditLogs'
import type { AdminAuditLogItem } from '@/features/admin/types'

vi.mock('@/features/admin/hooks/useAuditLogs')

const MOCK_LOGS: AdminAuditLogItem[] = [
  {
    id: 'log-1',
    action: 'USER_ROLE_CHANGED',
    actor_id: 'actor-1',
    actor_name: 'Super Admin Sam',
    actor_email: 'sam@example.com',
    target_type: 'profile',
    target_id: 'user-2',
    old_data: { role: 'MEMBER' },
    new_data: { role: 'ADMIN' },
    metadata: { reason: 'Promotion' },
    created_at: '2026-10-16T12:00:00Z',
    total_count: 1,
  },
]

describe('AuditLogPage Component', () => {
  const mockRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderPage(): string {
    return renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AuditLogPage)
      )
    )
  }

  it('renders loading state when audit query is loading', () => {
    vi.spyOn(useAuditLogsHook, 'useAuditLogs').mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: true,
    } as never)

    const markup = renderPage()
    expect(markup).toContain('Loading audit trail...')
  })

  it('renders error state with retry button when query fails', () => {
    vi.spyOn(useAuditLogsHook, 'useAuditLogs').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Failed to query audit logs'),
      refetch: mockRefetch,
      isFetching: false,
    } as never)

    const markup = renderPage()
    expect(markup).toContain('Failed to load audit logs')
    expect(markup).toContain('Failed to query audit logs')
    expect(markup).toContain('Retry')
  })

  it('renders empty state when no audit events exist', () => {
    vi.spyOn(useAuditLogsHook, 'useAuditLogs').mockReturnValue({
      data: { logs: [], totalCount: 0, page: 1, pageSize: 20, totalPages: 1 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    } as never)

    const markup = renderPage()
    expect(markup).toContain('No audit events found')
  })

  it('renders audit events, action badges, and pagination on success', () => {
    vi.spyOn(useAuditLogsHook, 'useAuditLogs').mockReturnValue({
      data: { logs: MOCK_LOGS, totalCount: 1, page: 1, pageSize: 20, totalPages: 1 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    } as never)

    const markup = renderPage()

    expect(markup).toContain('Security &amp; Audit Trail')
    expect(markup).toContain('Role Changed')
    expect(markup).toContain('Super Admin Sam')
    expect(markup).toContain('sam@example.com')
    expect(markup).toContain('profile')
    expect(markup).toContain('Showing')
    expect(markup).toContain('1')
    expect(markup).toContain('audit records')
  })
})
