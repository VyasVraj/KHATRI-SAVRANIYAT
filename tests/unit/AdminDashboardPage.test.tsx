/**
 * Unit Tests: AdminDashboardPage (Phase 13 Subtask 2)
 * (src/features/admin/pages/AdminDashboardPage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AdminDashboardPage } from '@/features/admin/pages/AdminDashboardPage'
import * as usePlatformMetricsModule from '@/features/admin/hooks/usePlatformMetrics'
import type { PlatformMetrics } from '@/features/admin/types'

vi.mock('@/features/admin/hooks/usePlatformMetrics', () => ({
  usePlatformMetrics: vi.fn(),
}))

type MetricsQueryResult = ReturnType<typeof usePlatformMetricsModule.usePlatformMetrics>

function mockMetricsResult(overrides: Partial<MetricsQueryResult>) {
  vi.mocked(usePlatformMetricsModule.usePlatformMetrics).mockReturnValue(
    overrides as unknown as MetricsQueryResult
  )
}

describe('AdminDashboardPage Component', () => {
  const mockRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderPageMarkup(): string {
    return renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminDashboardPage)
      )
    )
  }

  it('renders loading skeleton when metrics query is in progress', () => {
    mockMetricsResult({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch as unknown as MetricsQueryResult['refetch'],
      isFetching: true,
    })

    const markup = renderPageMarkup()

    expect(markup).toContain('data-testid="metrics-loading"')
    expect(markup).toContain('Loading platform metrics…')
    expect(markup).toContain('animate-pulse')
  })

  it('renders error state with retry button when query fails', () => {
    mockMetricsResult({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network error connecting to database'),
      refetch: mockRefetch as unknown as MetricsQueryResult['refetch'],
      isFetching: false,
    })

    const markup = renderPageMarkup()

    expect(markup).toContain('data-testid="metrics-error"')
    expect(markup).toContain('Failed to Load Platform Metrics')
    expect(markup).toContain('Network error connecting to database')
    expect(markup).toContain('Retry')
  })

  it('renders platform metrics cards and PERSON != USER callout on success', () => {
    const mockMetrics: PlatformMetrics = {
      total_users: 50,
      active_users: 45,
      total_persons: 320,
      total_families: 88,
      pending_claims: 4,
      pending_verifications: 7,
      open_duplicates: 2,
      generated_at: '2026-10-16T15:30:00Z',
    }

    mockMetricsResult({
      data: mockMetrics,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch as unknown as MetricsQueryResult['refetch'],
      isFetching: false,
    })

    const markup = renderPageMarkup()

    // Title and Invariant Banner
    expect(markup).toContain('Platform Administration')
    expect(markup).toContain('PERSON ≠ USER')

    // Metric Cards and Values
    expect(markup).toContain('data-testid="metric-users"')
    expect(markup).toContain('50')
    expect(markup).toContain('45 active')

    expect(markup).toContain('data-testid="metric-persons"')
    expect(markup).toContain('320')

    expect(markup).toContain('data-testid="metric-families"')
    expect(markup).toContain('88')

    expect(markup).toContain('data-testid="metric-claims"')
    expect(markup).toContain('4')
    expect(markup).toContain('href="/admin/claims"')

    expect(markup).toContain('data-testid="metric-verifications"')
    expect(markup).toContain('7')
    expect(markup).toContain('href="/admin/verifications"')

    expect(markup).toContain('data-testid="metric-duplicates"')
    expect(markup).toContain('2')
    expect(markup).toContain('href="/admin/duplicates"')

    // Workflows section
    expect(markup).toContain('Claim Review Queue')
    expect(markup).toContain('Verification Review Queue')
    expect(markup).toContain('Duplicate Review Queue')
  })

  it('handles zero values cleanly across all metric cards', () => {
    const zeroMetrics: PlatformMetrics = {
      total_users: 0,
      active_users: 0,
      total_persons: 0,
      total_families: 0,
      pending_claims: 0,
      pending_verifications: 0,
      open_duplicates: 0,
      generated_at: '2026-10-16T15:30:00Z',
    }

    mockMetricsResult({
      data: zeroMetrics,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch as unknown as MetricsQueryResult['refetch'],
      isFetching: false,
    })

    const markup = renderPageMarkup()

    expect(markup).toContain('data-testid="total-users-value">0</span>')
    expect(markup).toContain('data-testid="total-persons-value">0</span>')
    expect(markup).toContain('data-testid="total-families-value">0</span>')
    expect(markup).toContain('data-testid="pending-claims-value">0</span>')
    expect(markup).toContain('data-testid="pending-verifications-value">0</span>')
    expect(markup).toContain('data-testid="open-duplicates-value">0</span>')
  })
})
