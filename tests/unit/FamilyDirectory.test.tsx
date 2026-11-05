/**
 * Unit tests: FamilyDirectory component & DiscoverPage tab switching
 * (src/features/discover/components/FamilyDirectory.tsx)
 * (src/features/discover/pages/DiscoverPage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FamilyDirectory } from '@/features/discover/components/FamilyDirectory'
import { DiscoverPage } from '@/features/discover/pages/DiscoverPage'
import * as familyHooks from '@/features/discover/hooks/useFamilyDirectory'
import * as peopleHooks from '@/features/discover/hooks/usePeopleDirectory'
import type { FamilyDiscoveryResult, DiscoveryPage } from '@/features/discover/types'

vi.mock('@/features/discover/hooks/useFamilyDirectory')
vi.mock('@/features/discover/hooks/usePeopleDirectory')
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

const MOCK_FAMILY: FamilyDiscoveryResult = {
  id: 'fam-1',
  family_name: 'Verma Clan',
  description: 'Ancient house of Surat.',
  gotra: 'Shandilya',
  kul: 'Suryavanshi',
  nukh: 'VermaNukh',
  city: 'Surat',
  state: 'Gujarat',
  country: 'India',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
}

describe('FamilyDirectory & DiscoverPage Tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(peopleHooks, 'useDiscoveryFilterOptions').mockReturnValue({
      data: {
        gotras: ['Shandilya'],
        nukhs: ['VermaNukh'],
        kuls: ['Suryavanshi'],
        cities: ['Surat'],
        states: ['Gujarat'],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof peopleHooks.useDiscoveryFilterOptions>)

    vi.spyOn(peopleHooks, 'usePeopleDirectory').mockReturnValue({
      data: {
        items: [],
        page: 1,
        pageSize: 20,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof peopleHooks.usePeopleDirectory>)
  })

  it('renders loading skeleton when family query is loading', () => {
    vi.spyOn(familyHooks, 'useFamilyDirectory').mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof familyHooks.useFamilyDirectory>)

    const html = renderToStaticMarkup(React.createElement(FamilyDirectory))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading family directory results')
  })

  it('renders error alert with retry button when query fails', () => {
    vi.spyOn(familyHooks, 'useFamilyDirectory').mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error('Database connection failed'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof familyHooks.useFamilyDirectory>)

    const html = renderToStaticMarkup(React.createElement(FamilyDirectory))
    expect(html).toContain('Unable to load family directory')
    expect(html).toContain('Database connection failed')
    expect(html).toContain('Retry')
  })

  it('renders empty state when zero records match query', () => {
    const emptyPage: DiscoveryPage<FamilyDiscoveryResult> = {
      items: [],
      page: 1,
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    }

    vi.spyOn(familyHooks, 'useFamilyDirectory').mockReturnValue({
      data: emptyPage,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof familyHooks.useFamilyDirectory>)

    const html = renderToStaticMarkup(React.createElement(FamilyDirectory))
    expect(html).toContain('No families found')
  })

  it('renders family cards when data is returned', () => {
    const populatedPage: DiscoveryPage<FamilyDiscoveryResult> = {
      items: [MOCK_FAMILY],
      page: 1,
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    }

    vi.spyOn(familyHooks, 'useFamilyDirectory').mockReturnValue({
      data: populatedPage,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof familyHooks.useFamilyDirectory>)

    const html = renderToStaticMarkup(React.createElement(FamilyDirectory))
    expect(html).toContain('Verma Clan')
    expect(html).toContain('Surat, Gujarat, India')
    expect(html).toContain('Gotra: Shandilya')
    expect(html).toContain('Ancient house of Surat.')
  })

  it('renders DiscoverPage with People and Family tabs', () => {
    const populatedPage: DiscoveryPage<FamilyDiscoveryResult> = {
      items: [MOCK_FAMILY],
      page: 1,
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    }

    vi.spyOn(familyHooks, 'useFamilyDirectory').mockReturnValue({
      data: populatedPage,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof familyHooks.useFamilyDirectory>)

    // Render DiscoverPage with defaultTab="families"
    const html = renderToStaticMarkup(React.createElement(DiscoverPage, { defaultTab: 'families' }))
    expect(html).toContain('People Directory')
    expect(html).toContain('Family Directory')
    expect(html).toContain('Verma Clan')
  })
})
