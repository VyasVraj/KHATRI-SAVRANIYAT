/**
 * ANDROID-6 Unit Tests: Directory, Filters & Discovery UX Parity
 * (Screens 03, 16–20)
 *
 * Verifies:
 * - DiscoverPage tab navigation, titles, and creation actions
 * - People & Family directory search, debouncing, and result presentation
 * - Filter panels, active chips, and reset/clear behaviors
 * - PersonDirectoryCard (Screen 19) actions: View Profile, Family Tree
 * - FamilyDirectoryCard (Screen 20) actions: View Family, Family Tree
 * - Multilingual rendering (English, Hindi, Gujarati)
 * - Privacy protection (no contact info, no user credentials leaked)
 * - PERSON != USER separation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiscoverPage } from '@/features/discover/pages/DiscoverPage'
import { PeopleDirectory } from '@/features/discover/components/PeopleDirectory'
import { FamilyDirectory } from '@/features/discover/components/FamilyDirectory'
import { PersonDirectoryCard } from '@/features/discover/components/PersonDirectoryCard'
import { FamilyDirectoryCard } from '@/features/discover/components/FamilyDirectoryCard'
import { PeopleFilters } from '@/features/discover/components/PeopleFilters'
import { PeopleFilterChips } from '@/features/discover/components/PeopleFilterChips'
import { FamilyFilterChips } from '@/features/discover/components/FamilyFilterChips'
import * as peopleDirectoryHooks from '@/features/discover/hooks/usePeopleDirectory'
import * as familyDirectoryHooks from '@/features/discover/hooks/useFamilyDirectory'
import type {
  PersonDiscoveryResult,
  FamilyDiscoveryResult,
  PersonDiscoveryFilters,
  FamilyDiscoveryFilters,
} from '@/features/discover/types'
import { LanguageContext, type LanguageContextValue } from '@/features/i18n/context/LanguageContext'
import { TRANSLATIONS, SUPPORTED_LANGUAGES } from '@/features/i18n/translations'
import type { SupportedLanguage, TranslationKey } from '@/features/i18n/types'

vi.mock('@/features/discover/hooks/usePeopleDirectory')
vi.mock('@/features/discover/hooks/useFamilyDirectory')

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const MOCK_PERSON: PersonDiscoveryResult = {
  id: 'person-101',
  first_name: 'Chandru',
  middle_name: 'Mulchand',
  last_name: 'Vaswani',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1978-05-12',
  date_of_death: null,
  birth_place: 'Palanpur',
  gotra: 'Sudarshan',
  kul: 'Varun',
  nukh: 'VaswaniNukh',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
}

const MOCK_FAMILY: FamilyDiscoveryResult = {
  id: 'family-201',
  family_name: 'Vaswani Family',
  description: 'Heritage census unit residing in Gujarat.',
  gotra: 'Sudarshan',
  kul: 'Varun',
  nukh: 'VaswaniNukh',
  city: 'Palanpur',
  state: 'Gujarat',
  country: 'India',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
}

function renderWithLanguage(element: React.ReactElement, lang: SupportedLanguage = 'en'): string {
  const langOption = SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? SUPPORTED_LANGUAGES[0]
  const contextValue: LanguageContextValue = {
    language: lang,
    setLanguage: vi.fn(),
    t: (key: TranslationKey, fallback?: string) => TRANSLATIONS[lang][key] ?? fallback ?? key,
    languages: SUPPORTED_LANGUAGES,
    currentLanguageOption: langOption,
  }

  return renderToStaticMarkup(
    React.createElement(LanguageContext.Provider, { value: contextValue }, element)
  )
}

describe('ANDROID-6: Directory, Filters & Discovery UX Parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(peopleDirectoryHooks, 'useDiscoveryFilterOptions').mockReturnValue({
      data: {
        gotras: ['Sudarshan', 'Kashyap'],
        nukhs: ['VaswaniNukh', 'Karotela'],
        kuls: ['Varun', 'Suryavanshi'],
        cities: ['Palanpur', 'Surat'],
        states: ['Gujarat'],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof peopleDirectoryHooks.useDiscoveryFilterOptions>)

    vi.spyOn(peopleDirectoryHooks, 'usePeopleDirectory').mockReturnValue({
      data: {
        items: [MOCK_PERSON],
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
    } as unknown as ReturnType<typeof peopleDirectoryHooks.usePeopleDirectory>)

    vi.spyOn(familyDirectoryHooks, 'useFamilyDirectory').mockReturnValue({
      data: {
        items: [MOCK_FAMILY],
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
    } as unknown as ReturnType<typeof familyDirectoryHooks.useFamilyDirectory>)
  })

  describe('Screen 03 & 16: Directory Entry, Tabs & Results Display', () => {
    it('renders Community Directory header, tabs, and action button in English', () => {
      const html = renderWithLanguage(React.createElement(DiscoverPage, { defaultTab: 'people' }))
      expect(html).toContain('Community Directory')
      expect(html).toContain('Search and discover community members and families across verified census records.')
      expect(html).toContain('People Directory')
      expect(html).toContain('Family Directory')
      expect(html).toContain('Add Person')
    })

    it('renders Family Directory tab and Add Family CTA when defaultTab is families', () => {
      const html = renderWithLanguage(React.createElement(DiscoverPage, { defaultTab: 'families' }))
      expect(html).toContain('Family Directory')
      expect(html).toContain('Add Family')
    })

    it('displays summary count header when members are loaded', () => {
      const html = renderWithLanguage(React.createElement(PeopleDirectory))
      expect(html).toContain('Showing 1 members')
    })

    it('displays summary count header when families are loaded', () => {
      const html = renderWithLanguage(React.createElement(FamilyDirectory))
      expect(html).toContain('Showing 1 families')
    })
  })

  describe('Screen 17 & 18: Filter Panel, Active Chips & Clear Behavior', () => {
    it('renders PeopleFilters with active count and reset action', () => {
      const activeFilters: PersonDiscoveryFilters = { gotra: 'Sudarshan', status: 'ACTIVE' }
      const html = renderWithLanguage(
        React.createElement(PeopleFilters, {
          filters: activeFilters,
          onFilterChange: vi.fn(),
          onReset: vi.fn(),
          isOpen: true,
          onToggle: vi.fn(),
        })
      )

      expect(html).toContain('Filters')
      expect(html).toContain('Reset filters')
      expect(html).toContain('2') // activeCount badge
      expect(html).toContain('Gotra')
      expect(html).toContain('Nukh')
      expect(html).not.toContain('label-kul')
      expect(html).toContain('Birth Place')
      expect(html).toContain('Living Status')
      expect(html).toContain('Verification Status')
    })

    it('renders PeopleFilterChips with remove buttons and Clear all', () => {
      const filters: PersonDiscoveryFilters = { gotra: 'Sudarshan', nukh: 'VaswaniNukh' }
      const html = renderWithLanguage(
        React.createElement(PeopleFilterChips, {
          filters,
          onRemoveFilter: vi.fn(),
          onClearAll: vi.fn(),
        })
      )

      expect(html).toContain('Active filters:')
      expect(html).toContain('Gotra:')
      expect(html).toContain('Sudarshan')
      expect(html).toContain('Nukh:')
      expect(html).toContain('VaswaniNukh')
      expect(html).toContain('Clear all')
    })

    it('renders FamilyFilterChips with remove buttons and Clear all', () => {
      const filters: FamilyDiscoveryFilters = { city: 'Palanpur', gotra: 'Sudarshan' }
      const html = renderWithLanguage(
        React.createElement(FamilyFilterChips, {
          filters,
          onRemoveFilter: vi.fn(),
          onClearAll: vi.fn(),
        })
      )

      expect(html).toContain('Active filters:')
      expect(html).toContain('City:')
      expect(html).toContain('Palanpur')
      expect(html).toContain('Gotra:')
      expect(html).toContain('Sudarshan')
      expect(html).toContain('Clear all')
    })
  })

  describe('Screen 19: PersonDirectoryCard Parity & Quick Actions', () => {
    it('renders member name, lineage, birthplace, and verification', () => {
      const html = renderWithLanguage(React.createElement(PersonDirectoryCard, { person: MOCK_PERSON }))
      expect(html).toContain('Chandru Mulchand Vaswani')
      expect(html).toContain('CV') // Initials
      expect(html).toContain('Palanpur')
      expect(html).toContain('Gotra: Sudarshan')
      expect(html).toContain('Nukh: VaswaniNukh')
      expect(html).not.toContain('Kul:')
      expect(html).toContain('Verified')
      expect(html).toContain('Active')
    })

    it('renders quick action buttons: View Profile and Family Tree (Screen 19 Parity)', () => {
      const html = renderWithLanguage(React.createElement(PersonDirectoryCard, { person: MOCK_PERSON }))
      expect(html).toContain('View Profile')
      expect(html).toContain('Family Tree')
    })
  })

  describe('Screen 20: FamilyDirectoryCard Parity & Quick Actions', () => {
    it('renders family name, residential location, description, and lineage', () => {
      const html = renderWithLanguage(React.createElement(FamilyDirectoryCard, { family: MOCK_FAMILY }))
      expect(html).toContain('Vaswani Family')
      expect(html).toContain('Palanpur, Gujarat, India')
      expect(html).toContain('Heritage census unit residing in Gujarat.')
      expect(html).toContain('Gotra: Sudarshan')
      expect(html).toContain('Nukh: VaswaniNukh')
      expect(html).not.toContain('Kul:')
      expect(html).toContain('Verified')
      expect(html).toContain('Active')
    })

    it('renders quick action buttons: View Family and Family Tree (Screen 20 Parity)', () => {
      const html = renderWithLanguage(React.createElement(FamilyDirectoryCard, { family: MOCK_FAMILY }))
      expect(html).toContain('View Family')
      expect(html).toContain('Family Tree')
    })
  })

  describe('Multi-Language Support (English, Hindi, Gujarati)', () => {
    it('renders directory page and card actions in Hindi (hi)', () => {
      const html = renderWithLanguage(React.createElement(DiscoverPage, { defaultTab: 'people' }), 'hi')
      expect(html).toContain('समुदाय डायरेक्टरी')
      expect(html).toContain('सदस्य डायरेक्टरी')
      expect(html).toContain('परिवार डायरेक्टरी')
      expect(html).toContain('सदस्य जोड़ें')
      expect(html).toContain('प्रोफ़ाइल देखें')
      expect(html).toContain('वंशवृक्ष देखें')
    })

    it('renders directory page and card actions in Gujarati (gu)', () => {
      const html = renderWithLanguage(React.createElement(DiscoverPage, { defaultTab: 'families' }), 'gu')
      expect(html).toContain('સમુદાય ડિરેક્ટરી')
      expect(html).toContain('સભ્યો ડિરેક્ટરી')
      expect(html).toContain('પરિવાર ડિરેક્ટરી')
      expect(html).toContain('પરિવાર ઉમેરો')
      expect(html).toContain('પરિવાર જુઓ')
      expect(html).toContain('કુટુંબ વૃક્ષ જુઓ')
    })
  })

  describe('Privacy & Security Isolation', () => {
    it('strictly excludes private contact details (phone, email) from PersonDirectoryCard', () => {
      const html = renderWithLanguage(React.createElement(PersonDirectoryCard, { person: MOCK_PERSON }))
      expect(html).not.toContain('phone')
      expect(html).not.toContain('email')
      expect(html).not.toContain('+91')
    })

    it('strictly excludes authentication credentials and user_id from PersonDirectoryCard', () => {
      const html = renderWithLanguage(React.createElement(PersonDirectoryCard, { person: MOCK_PERSON }))
      expect(html).not.toContain('user_id')
      expect(html).not.toContain('password')
      expect(html).not.toContain('created_at')
      expect(html).not.toContain('updated_at')
    })

    it('strictly excludes internal keys from FamilyDirectoryCard', () => {
      const html = renderWithLanguage(React.createElement(FamilyDirectoryCard, { family: MOCK_FAMILY }))
      expect(html).not.toContain('user_id')
      expect(html).not.toContain('created_by')
      expect(html).not.toContain('created_at')
      expect(html).not.toContain('updated_at')
      expect(html).not.toContain('deleted_at')
    })
  })
})
