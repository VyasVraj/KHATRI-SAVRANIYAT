/**
 * Unit Tests:
 * 1. Multilingual Home Page Title & Description Paragraph Removal.
 * 2. Country Dialing Code list (245 countries from ITU-T PDF) & Default '+91'.
 * 3. Complete Family Member Editing by Family Head in EditMemberModal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomePage } from '@/features/home/pages/HomePage'
import { LanguageProvider, useLanguage } from '@/features/i18n'
import { TRANSLATIONS } from '@/features/i18n/translations'
import { COUNTRY_DIALING_CODES, DEFAULT_DIALING_CODE } from '@/constants/countryDialingCodes'
import { EditMemberModal } from '@/features/family-members/components/EditMemberModal'
import type { FamilyMemberWithPerson } from '@/features/family-members/services/family-members.service'
import * as peopleService from '@/features/people/services/people.service'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import { supabase } from '@/lib/supabase'

describe('1. Multilingual Home Page Title & Description Removal', () => {
  it('contains the organization title in all 3 supported languages', () => {
    expect(TRANSLATIONS.en['home.organization_title']).toBe(
      'AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)'
    )
    expect(TRANSLATIONS.hi['home.organization_title']).toBe(
      'अखिल भारत सिंधी ब्रह्मखत्री पंचायत (सरवाणियत)'
    )
    expect(TRANSLATIONS.gu['home.organization_title']).toBe(
      'અખિલ ભારત સિંધી બ્રહ્મખત્રી પંચાયત (સરવાણિયત)'
    )
  })

  it('renders multilingual organization title and excludes the deleted description paragraph', () => {
    function TestWrapper() {
      const { setLanguage } = useLanguage()
      return (
        <div>
          <button data-testid="set-hi" onClick={() => setLanguage('hi')}>
            Hindi
          </button>
          <button data-testid="set-gu" onClick={() => setLanguage('gu')}>
            Gujarati
          </button>
          <button data-testid="set-en" onClick={() => setLanguage('en')}>
            English
          </button>
          <HomePage />
        </div>
      )
    }

    render(
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: null,
            profile: null,
            isLoading: false,
            isAuthenticated: false,
            role: 'COMMUNITY_MEMBER',
            signIn: vi.fn(),
            signOut: vi.fn(),
            refreshProfile: vi.fn(),
          } as unknown as AuthContextValue}
        >
          <LanguageProvider>
            <TestWrapper />
          </LanguageProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    // English by default
    expect(
      screen.getByText('AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)')
    ).toBeInTheDocument()

    // Deleted description paragraph MUST NOT be in document
    expect(
      screen.queryByText(/(?:KHATRI SARVANIYAT|SINDHI KHATRI SAMAJ) is a digital platform dedicated to preserving our community identity/i)
    ).not.toBeInTheDocument()

    // Switch to Hindi
    fireEvent.click(screen.getByTestId('set-hi'))
    expect(
      screen.getByText('अखिल भारत सिंधी ब्रह्मखत्री पंचायत (सरवाणियत)')
    ).toBeInTheDocument()

    // Switch to Gujarati
    fireEvent.click(screen.getByTestId('set-gu'))
    expect(
      screen.getByText('અખિલ ભારત સિંધી બ્રહ્મખત્રી પંચાયત (સરવાણિયત)')
    ).toBeInTheDocument()
  })
})

describe('2. International Country Calling Codes (ITU-T E.164)', () => {
  it('includes all 245 countries and territories from the reference PDF', () => {
    expect(COUNTRY_DIALING_CODES.length).toBe(245)
  })

  it('defaults to India (+91)', () => {
    expect(DEFAULT_DIALING_CODE).toBe('+91')
    const india = COUNTRY_DIALING_CODES.find((c) => c.country === 'India')
    expect(india).toBeDefined()
    expect(india?.dialing_code).toBe('+91')
  })

  it('includes key global destinations from PDF', () => {
    const us = COUNTRY_DIALING_CODES.find((c) => c.country === 'United States')
    expect(us?.dialing_code).toBe('+1')

    const uk = COUNTRY_DIALING_CODES.find((c) => c.country === 'United Kingdom')
    expect(uk?.dialing_code).toBe('+44')

    const uae = COUNTRY_DIALING_CODES.find((c) => c.country === 'United Arab Emirates')
    expect(uae?.dialing_code).toBe('+971')

    const aus = COUNTRY_DIALING_CODES.find((c) => c.country === 'Australia')
    expect(aus?.dialing_code).toBe('+61')

    const can = COUNTRY_DIALING_CODES.find((c) => c.country === 'Canada')
    expect(can?.dialing_code).toBe('+1')
  })
})

describe('3. Complete Family Member Editing by Family Head', () => {
  let queryClient: QueryClient

  const mockMember: FamilyMemberWithPerson = {
    id: 'mem-101',
    family_id: 'fam-vyas',
    person_id: 'p-dhruv',
    role: 'CHILD',
    relationship_to_head: 'Son (बेटा)',
    is_head: false,
    added_by: null,
    joined_at: '2024-01-01',
    left_at: null,
    created_at: '2024-01-01',
    person: {
      id: 'p-dhruv',
      first_name: 'Dhruv',
      middle_name: 'Jayesh',
      last_name: 'Vyas',
      maiden_name: null,
      gender: 'MALE',
      date_of_birth: '2000-05-15',
      birth_place: 'Anand',
      city: 'Anand',
      state: 'Gujarat',
      country: 'India',
      blood_group: 'B+',
      phone: '+91 9876543210',
      phone_secondary: null,
      email_contact: 'dhruv@example.com',
      gotra: 'Kashyap',
      nukh: null,
      kul: null,
      occupation: 'Information Technology',
      is_deceased: false,
      date_of_death: null,
      status: 'ACTIVE',
      verification_status: 'UNVERIFIED',
      profile_privacy: 'COMMUNITY',
      contact_privacy: 'PRIVATE',
      dob_privacy: 'PRIVATE',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
      deleted_at: null,
      user_id: null,
      created_by: 'user-jayesh',
    },
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.spyOn(supabase, 'rpc').mockReturnValue(
      Promise.resolve({ data: { success: true }, error: null }) as ReturnType<typeof supabase.rpc>
    )
    vi.spyOn(peopleService, 'updatePerson').mockResolvedValue({
      data: mockMember.person!,
      error: null,
    })
  })

  it('pre-fills all existing personal identity, contact, community, and occupation details', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <EditMemberModal
            isOpen={true}
            familyId="fam-vyas"
            member={mockMember}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Personal identity
    expect(screen.getByDisplayValue('Dhruv')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Jayesh')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Vyas')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2000-05-15')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('Anand').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByDisplayValue('Gujarat')).toBeInTheDocument()
    expect(screen.getByDisplayValue('India')).toBeInTheDocument()

    // Contact details
    expect(screen.getByDisplayValue('9876543210')).toBeInTheDocument()
    expect(screen.getByDisplayValue('dhruv@example.com')).toBeInTheDocument()

    // Community heritage
    expect(screen.getByDisplayValue('B+')).toBeInTheDocument()

    // Occupation (Information Technology)
    expect(screen.getAllByText('Information Technology')[0]).toBeInTheDocument()
  })

  it('allows Family Head to update member details and submits successfully', async () => {
    const handleClose = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <EditMemberModal
            isOpen={true}
            familyId="fam-vyas"
            member={mockMember}
            onClose={handleClose}
          />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Edit birthplace
    const bpInput = screen.getAllByDisplayValue('Anand')[0]
    fireEvent.change(bpInput, { target: { value: 'Vadodara' } })

    // Submit form
    const saveBtn = screen.getByRole('button', { name: /Save Member Details/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/Member details updated successfully!/i)).toBeInTheDocument()
    })
  })
})
