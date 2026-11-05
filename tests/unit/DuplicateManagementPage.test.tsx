/**
 * Unit Tests: DuplicateManagementPage (Phase 13 Subtask 4)
 * (src/features/admin/pages/DuplicateManagementPage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { DuplicateManagementPage } from '@/features/admin/pages/DuplicateManagementPage'
import * as useAdminDuplicatesModule from '@/features/admin/hooks/useAdminDuplicates'
import type { AdminDuplicateItem } from '@/features/admin/types'

vi.mock('@/features/admin/hooks/useAdminDuplicates', () => ({
  useAdminDuplicates: vi.fn(),
  useResolveAdminDuplicate: vi.fn(),
}))

const mockFlags: AdminDuplicateItem[] = [
  {
    id: 'flag-1',
    entity_type: 'PERSON',
    record_a_id: 'person-a',
    record_b_id: 'person-b',
    confidence: 'STRONG',
    status: 'OPEN',
    match_signals: ['Same name', 'Same birth date'],
    notes: null,
    resolution_notes: null,
    flagged_by: 'user-1',
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-10-16T12:00:00Z',
    updated_at: '2026-10-16T12:00:00Z',
    record_a_preview: { id: 'person-a', label: 'Dev Patel' },
    record_b_preview: { id: 'person-b', label: 'Dev K. Patel' },
  },
]

describe('DuplicateManagementPage Component', () => {
  const mockRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAdminDuplicatesModule.useResolveAdminDuplicate).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useAdminDuplicatesModule.useResolveAdminDuplicate>)
  })

  function renderPageMarkup(): string {
    return renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(DuplicateManagementPage)
      )
    )
  }

  it('renders loading state when query is loading', () => {
    vi.mocked(useAdminDuplicatesModule.useAdminDuplicates).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    } as unknown as ReturnType<typeof useAdminDuplicatesModule.useAdminDuplicates>)

    const markup = renderPageMarkup()

    expect(markup).toContain('data-testid="duplicate-queue-loading"')
    expect(markup).toContain('Loading duplicate review queue…')
  })

  it('renders error state with retry button when query fails', () => {
    vi.mocked(useAdminDuplicatesModule.useAdminDuplicates).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Database access denied'),
      refetch: mockRefetch,
      isFetching: false,
    } as unknown as ReturnType<typeof useAdminDuplicatesModule.useAdminDuplicates>)

    const markup = renderPageMarkup()

    expect(markup).toContain('data-testid="duplicate-queue-error"')
    expect(markup).toContain('Database access denied')
    expect(markup).toContain('Try Again')
  })

  it('renders empty queue state when no flags match', () => {
    vi.mocked(useAdminDuplicatesModule.useAdminDuplicates).mockReturnValue({
      data: {
        items: [],
        totalCount: 0,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    } as unknown as ReturnType<typeof useAdminDuplicatesModule.useAdminDuplicates>)

    const markup = renderPageMarkup()

    expect(markup).toContain('data-testid="duplicate-queue-empty"')
    expect(markup).toContain('No Duplicate Flags Found')
  })

  it('renders duplicate flags in table with Candidate A, Candidate B, and Review button', () => {
    vi.mocked(useAdminDuplicatesModule.useAdminDuplicates).mockReturnValue({
      data: {
        items: mockFlags,
        totalCount: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    } as unknown as ReturnType<typeof useAdminDuplicatesModule.useAdminDuplicates>)

    const markup = renderPageMarkup()

    expect(markup).toContain('Duplicate Review Queue')
    expect(markup).toContain('data-testid="duplicate-row-flag-1"')
    expect(markup).toContain('Dev Patel')
    expect(markup).toContain('Dev K. Patel')
    expect(markup).toContain('Same name')
    expect(markup).toContain('Strong')
    expect(markup).toContain('Review')
  })
})
