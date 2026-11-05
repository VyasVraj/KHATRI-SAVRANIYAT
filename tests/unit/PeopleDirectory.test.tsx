/**
 * Unit tests: PeopleDirectory component
 * (src/features/discover/components/PeopleDirectory.tsx)
 * (src/features/discover/pages/DiscoverPage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PeopleDirectory } from '@/features/discover/components/PeopleDirectory'
import { DiscoverPage } from '@/features/discover/pages/DiscoverPage'
import * as directoryHooks from '@/features/discover/hooks/usePeopleDirectory'
import type { PersonDiscoveryResult, DiscoveryPage } from '@/features/discover/types'

vi.mock('@/features/discover/hooks/usePeopleDirectory')
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

const MOCK_PERSON: PersonDiscoveryResult = {
  id: 'p-1',
  first_name: 'Rohit',
  middle_name: null,
  last_name: 'Verma',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1985-06-15',
  date_of_death: null,
  birth_place: 'Surat',
  gotra: 'Shandilya',
  kul: 'Suryavanshi',
  nukh: 'VermaNukh',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
}

describe('PeopleDirectory & DiscoverPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(directoryHooks, 'useDiscoveryFilterOptions').mockReturnValue({
      data: {
        gotras: ['Shandilya'],
        nukhs: ['VermaNukh'],
        kuls: ['Suryavanshi'],
        cities: [],
        states: [],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof directoryHooks.useDiscoveryFilterOptions>)
  })

  it('renders loading skeleton when query isLoading is true', () => {
    vi.spyOn(directoryHooks, 'usePeopleDirectory').mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryHooks.usePeopleDirectory>)

    const html = renderToStaticMarkup(React.createElement(PeopleDirectory))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading directory results')
  })

  it('renders error alert with retry button when query fails', () => {
    vi.spyOn(directoryHooks, 'usePeopleDirectory').mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error('Network connection timeout'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryHooks.usePeopleDirectory>)

    const html = renderToStaticMarkup(React.createElement(PeopleDirectory))
    expect(html).toContain('Unable to load directory')
    expect(html).toContain('Network connection timeout')
    expect(html).toContain('Retry')
  })

  it('renders empty state when zero records match query', () => {
    const emptyPage: DiscoveryPage<PersonDiscoveryResult> = {
      items: [],
      page: 1,
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    }

    vi.spyOn(directoryHooks, 'usePeopleDirectory').mockReturnValue({
      data: emptyPage,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryHooks.usePeopleDirectory>)

    const html = renderToStaticMarkup(React.createElement(PeopleDirectory))
    expect(html).toContain('No community members found')
  })

  it('renders member cards when directory data is populated', () => {
    const populatedPage: DiscoveryPage<PersonDiscoveryResult> = {
      items: [MOCK_PERSON],
      page: 1,
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    }

    vi.spyOn(directoryHooks, 'usePeopleDirectory').mockReturnValue({
      data: populatedPage,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryHooks.usePeopleDirectory>)

    const html = renderToStaticMarkup(React.createElement(PeopleDirectory))
    expect(html).toContain('Rohit Verma')
    expect(html).toContain('Surat')
    expect(html).toContain('Gotra: Shandilya')
    expect(html).toContain('b. 1985')
  })

  it('renders DiscoverPage wrapper cleanly', () => {
    const populatedPage: DiscoveryPage<PersonDiscoveryResult> = {
      items: [MOCK_PERSON],
      page: 1,
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    }

    vi.spyOn(directoryHooks, 'usePeopleDirectory').mockReturnValue({
      data: populatedPage,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof directoryHooks.usePeopleDirectory>)

    const html = renderToStaticMarkup(React.createElement(DiscoverPage))
    expect(html).toContain('Community Directory')
    expect(html).toContain('Rohit Verma')
  })
})
