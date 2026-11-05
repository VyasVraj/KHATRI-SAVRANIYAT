/**
 * Unit & Integration tests: Phase 6 Subtask 4 — Full Discovery Integration & Mobile Polish
 * (src/features/discover/pages/DiscoverPage.tsx)
 * (src/features/discover/components/PeopleDirectory.tsx)
 * (src/features/discover/components/FamilyDirectory.tsx)
 * (src/features/discover/components/PersonDirectoryCard.tsx)
 * (src/features/discover/components/FamilyDirectoryCard.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiscoverPage } from '@/features/discover/pages/DiscoverPage'
import { PersonDirectoryCard } from '@/features/discover/components/PersonDirectoryCard'
import { FamilyDirectoryCard } from '@/features/discover/components/FamilyDirectoryCard'
import * as peopleHooks from '@/features/discover/hooks/usePeopleDirectory'
import * as familyHooks from '@/features/discover/hooks/useFamilyDirectory'
import type {
  PersonDiscoveryResult,
  FamilyDiscoveryResult,
  DiscoveryPage as PageData,
} from '@/features/discover/types'

vi.mock('@/features/discover/hooks/usePeopleDirectory')
vi.mock('@/features/discover/hooks/useFamilyDirectory')
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

const MOCK_PERSON: PersonDiscoveryResult = {
  id: 'person-test-1',
  first_name: 'Meera',
  middle_name: null,
  last_name: 'Khatri',
  maiden_name: 'Solanki',
  gender: 'FEMALE',
  date_of_birth: '1992-08-20',
  date_of_death: null,
  birth_place: 'Anjar, Kutch',
  gotra: 'Kashyap',
  kul: 'Bhavani',
  nukh: 'KhatriNukh',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
}

const MOCK_FAMILY: FamilyDiscoveryResult = {
  id: 'family-test-1',
  family_name: 'Khatri Royal House of Kutch and Saurashtra',
  description:
    'A very long historical description of this illustrious family with extensive heritage, roots in Anjar, migration records, and community leaders.',
  gotra: 'Kashyap',
  kul: 'Bhavani',
  nukh: 'KhatriNukh',
  city: 'Anjar',
  state: 'Gujarat',
  country: 'India',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
}

describe('Discovery Integration & Polish (Phase 6 Subtask 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(peopleHooks, 'useDiscoveryFilterOptions').mockReturnValue({
      data: {
        gotras: ['Kashyap'],
        nukhs: ['KhatriNukh'],
        kuls: ['Bhavani'],
        cities: ['Anjar'],
        states: ['Gujarat'],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof peopleHooks.useDiscoveryFilterOptions>)

    vi.spyOn(peopleHooks, 'usePeopleDirectory').mockReturnValue({
      data: {
        items: [MOCK_PERSON],
        page: 1,
        pageSize: 20,
        hasNextPage: false,
        hasPreviousPage: false,
      } as PageData<PersonDiscoveryResult>,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof peopleHooks.usePeopleDirectory>)

    vi.spyOn(familyHooks, 'useFamilyDirectory').mockReturnValue({
      data: {
        items: [MOCK_FAMILY],
        page: 1,
        pageSize: 20,
        hasNextPage: false,
        hasPreviousPage: false,
      } as PageData<FamilyDiscoveryResult>,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof familyHooks.useFamilyDirectory>)
  })

  describe('DiscoverPage Layout & Tab Integration', () => {
    it('renders the unified page header with icon, title, description, and tab bar', () => {
      const html = renderToStaticMarkup(React.createElement(DiscoverPage))

      expect(html).toContain('Community Directory')
      expect(html).toContain(
        'Search and discover community members and families across verified census records.'
      )
      expect(html).toContain('People Directory')
      expect(html).toContain('Family Directory')
      expect(html).toContain('role="tablist"')
      expect(html).toContain('role="tabpanel"')
    })

    it('renders PeopleDirectory when defaultTab is "people"', () => {
      const html = renderToStaticMarkup(React.createElement(DiscoverPage, { defaultTab: 'people' }))
      expect(html).toContain('Meera Khatri')
      expect(html).toContain('née Solanki')
      expect(html).toContain('Anjar, Kutch')
      expect(html).toContain('b. 1992')
      expect(html).not.toContain('Khatri Royal House of Kutch and Saurashtra')
    })

    it('renders FamilyDirectory when defaultTab is "families"', () => {
      const html = renderToStaticMarkup(React.createElement(DiscoverPage, { defaultTab: 'families' }))
      expect(html).toContain('Khatri Royal House of Kutch and Saurashtra')
      expect(html).toContain('Anjar, Gujarat, India')
      expect(html).toContain('Gotra: Kashyap')
      expect(html).not.toContain('Meera Khatri')
    })
  })

  describe('Location & Lineage Graceful Omission', () => {
    it('omits lineage badges gracefully when person has null lineage fields', () => {
      const minimalPerson: PersonDiscoveryResult = {
        ...MOCK_PERSON,
        gotra: null,
        kul: null,
        nukh: null,
        birth_place: null,
      }

      const html = renderToStaticMarkup(
        React.createElement(PersonDirectoryCard, { person: minimalPerson })
      )
      expect(html).toContain('Meera Khatri')
      expect(html).not.toContain('Gotra:')
      expect(html).not.toContain('Kul:')
      expect(html).not.toContain('Nukh:')
    })

    it('omits lineage and location gracefully when family has null lineage and location fields', () => {
      const minimalFamily: FamilyDiscoveryResult = {
        ...MOCK_FAMILY,
        gotra: null,
        kul: null,
        nukh: null,
        city: null,
        state: null,
        country: null,
        description: null,
      }

      const html = renderToStaticMarkup(
        React.createElement(FamilyDirectoryCard, { family: minimalFamily })
      )
      expect(html).toContain('Khatri Royal House of Kutch and Saurashtra')
      expect(html).not.toContain('Gotra:')
      expect(html).not.toContain('Kul:')
      expect(html).not.toContain('Nukh:')
      expect(html).not.toContain('MapPin')
    })
  })

  describe('Long Content & Responsive Wrapping Resilience', () => {
    it('handles long family descriptions with clamp and long names with truncation classes', () => {
      const html = renderToStaticMarkup(
        React.createElement(FamilyDirectoryCard, { family: MOCK_FAMILY })
      )
      // Checks for responsive line-clamp and truncation classes
      expect(html).toContain('truncate')
      expect(html).toContain('line-clamp-2')
      expect(html).toContain('Khatri Royal House of Kutch and Saurashtra')
    })

    it('handles long person names with truncation class and proper initials', () => {
      const longPerson: PersonDiscoveryResult = {
        ...MOCK_PERSON,
        first_name: 'Chandrashekhar',
        last_name: 'Venkataramanaswamy',
      }
      const html = renderToStaticMarkup(
        React.createElement(PersonDirectoryCard, { person: longPerson })
      )
      expect(html).toContain('CV') // Initials
      expect(html).toContain('truncate')
      expect(html).toContain('Chandrashekhar Venkataramanaswamy')
    })
  })

  describe('Negative Privacy Invariants', () => {
    it('person card never exposes contact or auth internals', () => {
      const html = renderToStaticMarkup(
        React.createElement(PersonDirectoryCard, { person: MOCK_PERSON })
      )
      expect(html).not.toContain('phone')
      expect(html).not.toContain('email')
      expect(html).not.toContain('user_id')
      expect(html).not.toContain('created_at')
      expect(html).not.toContain('updated_at')
    })

    it('family card never exposes contact, member rosters or auth internals', () => {
      const html = renderToStaticMarkup(
        React.createElement(FamilyDirectoryCard, { family: MOCK_FAMILY })
      )
      expect(html).not.toContain('phone')
      expect(html).not.toContain('email')
      expect(html).not.toContain('user_id')
      expect(html).not.toContain('created_by')
      expect(html).not.toContain('created_at')
      expect(html).not.toContain('members')
    })
  })
})
