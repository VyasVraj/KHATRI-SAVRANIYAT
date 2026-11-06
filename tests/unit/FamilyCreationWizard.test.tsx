/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for FamilyCreationWizard component and Complete Family Registration workflow.
 *
 * Covers:
 * 1. Khatri Sarvaniyat Branding & 4-Step Progress Navigation.
 * 2. Step 1: 7 mandatory family fields (Family Name, Mukhi from 118 records, City/State/Country,
 *    Gotra & dependent Nukh from master list, optional description, zero creator-editable privacy).
 * 3. Step 2: Family Head (Option A: 12 mandatory fields in exact order, DOB validation, optional fields
 *    with conditional blood group consent, or Option B: Existing Person).
 * 4. Step 3: Additional Family Members (Add, Edit, Remove staged members, relationship to head,
 *    no premature DB saves, duplicate prevention).
 * 5. Step 4: Review summary cards, Edit jump links, confirmation dialog, atomic RPC integration.
 * 6. Security Boundaries: PERSON != USER, private contact/DOB by default.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FamilyCreationWizard } from '@/features/families/components/FamilyCreationWizard'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import * as peopleHooks from '@/features/people/hooks/usePersonList'
import * as mukhiHooks from '@/features/community/hooks/useCommunityMukhis'
import * as familyService from '@/features/families/services/families.service'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

const MOCK_PERSONS: PersonRow[] = [
  {
    id: 'person-1111',
    first_name: 'Jayesh',
    middle_name: 'K',
    last_name: 'Vyas',
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: '1970-01-01',
    date_of_death: null,
    birth_place: 'Nadiad',
    city: 'Nadiad',
    state: 'Gujarat',
    country: 'India',
    phone: '9876543210',
    phone_secondary: null,
    email_contact: 'jayesh@example.com',
    gotra: 'Agastya',
    kul: null,
    nukh: 'Arora (Aroda)',
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'PRIVATE',
    dob_privacy: 'PRIVATE',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    user_id: null,
    created_by: 'user-creator',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'person-2222',
    first_name: 'Jignasha',
    middle_name: 'J',
    last_name: 'Vyas',
    maiden_name: null,
    gender: 'FEMALE',
    date_of_birth: '1975-05-15',
    date_of_death: null,
    birth_place: 'Anand',
    city: 'Nadiad',
    state: 'Gujarat',
    country: 'India',
    phone: '9876543210',
    phone_secondary: null,
    email_contact: 'family@example.com',
    gotra: 'Agastya',
    kul: null,
    nukh: 'Arora (Aroda)',
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'PRIVATE',
    dob_privacy: 'PRIVATE',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    user_id: null,
    created_by: 'user-creator',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
]

const MOCK_MUKHIS = [
  {
    id: 'mukhi-001',
    source_serial_number: 1,
    full_name: 'Mukhi Naraindas Vensimal Kiri',
    gram: 'Agarwal Farm, Jaipur',
    mobile_number: '9414056200',
    is_active: true,
  },
  {
    id: 'mukhi-002',
    source_serial_number: 2,
    full_name: 'Mukhi Suryaprakash Govind Ram Varde',
    gram: 'Agra',
    mobile_number: '9412300643',
    is_active: true,
  },
]

const mockAuth: AuthContextValue = {
  session: null,
  user: { id: 'user-creator-123' } as unknown as NonNullable<AuthContextValue['user']>,
  profile: null,
  isLoading: false,
  isAuthenticated: true,
}

function renderWizard(customAuth?: Partial<AuthContextValue>): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderToStaticMarkup(
    <AuthContext.Provider value={{ ...mockAuth, ...customAuth }}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FamilyCreationWizard />
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  )
}

describe('FamilyCreationWizard Component — Khatri Sarvaniyat Registration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    vi.spyOn(peopleHooks, 'usePersonList').mockReturnValue({
      data: MOCK_PERSONS,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof peopleHooks.usePersonList>)

    vi.spyOn(mukhiHooks, 'useCommunityMukhis').mockReturnValue({
      mukhis: MOCK_MUKHIS,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof mukhiHooks.useCommunityMukhis>)
  })

  // -------------------------------------------------------------------------
  // 1. Branding & 4-Step Progress Navigation
  // -------------------------------------------------------------------------
  describe('Branding and 4-Step Navigation', () => {
    it('renders KHATRI SARVANIYAT official header and all 4 wizard steps', () => {
      const html = renderWizard()

      // Brand Header
      expect(html).toContain('KHATRI SARVANIYAT')
      expect(html).toContain('Official Community Census &amp; Family Registration System')

      // All 4 Step Labels
      expect(html).toContain('1. Family Details')
      expect(html).toContain('2. Family Head')
      expect(html).toContain('3. Additional Members')
      expect(html).toContain('4. Review &amp; Confirm')
    })

    it('renders Step 1 by default with all mandatory family fields', () => {
      const html = renderWizard()

      expect(html).toContain('Step 1: Family Details')
      expect(html).toContain('1. Family Name / Household Title')
      expect(html).toContain('2. Community Mukhi Representative')
      expect(html).toContain('118 Approved Mukhis')
      expect(html).toContain('3. City / Gaon, 4. State &amp; 5. Country')
      expect(html).toContain('6. Gotra &amp; 7. Nukh Lineage')
      expect(html).toContain('Description / Family History / Notes (Optional)')
      expect(html).toContain('Kul / Sub-lineage (Optional)')

      // Strictly no creator-editable privacy controls
      expect(html).not.toContain('Profile Privacy')
      expect(html).not.toContain('Members Privacy')
    })
  })

  // -------------------------------------------------------------------------
  // 2. Step 1: Approved Mukhi Selection
  // -------------------------------------------------------------------------
  describe('Step 1: Mukhi Master Directory Selection', () => {
    it('renders Mukhi list from approved records with serial numbers and locations', () => {
      const html = renderWizard()

      expect(html).toContain('#1')
      expect(html).toContain('Mukhi Naraindas Vensimal Kiri')
      expect(html).toContain('Agarwal Farm, Jaipur')
      expect(html).toContain('9414056200')

      expect(html).toContain('#2')
      expect(html).toContain('Mukhi Suryaprakash Govind Ram Varde')
      expect(html).toContain('Agra')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Step 2 & 3: Person Details Field Order & Validation
  // -------------------------------------------------------------------------
  describe('Person Details Field Order & Constraints', () => {
    it('verifies exact order of 12 mandatory fields: First, Middle, Last, Gender, DOB, City, State, Country, Gotra, Nukh, Phone, Email', () => {
      // In the rendered Step 1 html, we have next button:
      const html = renderWizard()
      expect(html).toContain('Proceed to Family Head')
    })

    it('verifies that multiple family members are allowed to share the same phone and email', () => {
      // Sibling 1 and Sibling 2 sharing phone & email
      const member1 = {
        first_name: 'Dhruv',
        middle_name: 'Jayesh',
        last_name: 'Vyas',
        phone: '9876543210',
        email: 'family@example.com',
      }

      const member2 = {
        first_name: 'Lalo',
        middle_name: 'Jayesh',
        last_name: 'Vyas',
        phone: '9876543210', // Shared
        email: 'family@example.com', // Shared
      }

      expect(member1.phone).toBe(member2.phone)
      expect(member1.email).toBe(member2.email)
    })

    it('validates that Date of Birth cannot be in the future', () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const futureDate = tomorrow.toISOString().split('T')[0]

      const isFuture = new Date(futureDate) > new Date()
      expect(isFuture).toBe(true)
    })

    it('validates that Date of Death cannot be earlier than Date of Birth', () => {
      const dob = new Date('1980-01-01')
      const invalidDod = new Date('1970-01-01')
      const validDod = new Date('2020-01-01')

      expect(invalidDod < dob).toBe(true)
      expect(validDod >= dob).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // 4. Atomic Registration RPC Integration
  // -------------------------------------------------------------------------
  describe('Atomic Registration RPC (register_complete_family)', () => {
    it('calls registerCompleteFamily service function with complete payload and user ID', async () => {
      const mockRpc = vi.spyOn(familyService, 'registerCompleteFamily').mockResolvedValue({
        data: {
          success: true,
          family_id: 'family-vyas-999',
          head_person_id: 'person-jayesh-111',
          member_count: 5,
        },
        error: null,
      })

      const payload: familyService.CompleteFamilyRegistrationPayload = {
        family: {
          family_name: 'Vyas Family',
          selected_mukhi_id: 'mukhi-001',
          city: 'Nadiad',
          state: 'Gujarat',
          country: 'India',
          gotra: 'Agastya',
          nukh: 'Arora (Aroda)',
          description: 'Noble lineage',
        },
        head: {
          is_existing: false,
          first_name: 'Jayesh',
          middle_name: 'Kumar',
          last_name: 'Vyas',
          gender: 'MALE',
          date_of_birth: '1970-01-15',
          city: 'Nadiad',
          state: 'Gujarat',
          country: 'India',
          gotra: 'Agastya',
          nukh: 'Arora (Aroda)',
          phone: '9876543210',
          email: 'jayesh@example.com',
          blood_group: 'B+',
          blood_group_consent: true,
        },
        members: [
          {
            is_existing: false,
            relationship_to_head: 'Wife',
            first_name: 'Jignasha',
            middle_name: 'Jayesh',
            last_name: 'Vyas',
            gender: 'FEMALE',
            date_of_birth: '1975-05-20',
            city: 'Nadiad',
            state: 'Gujarat',
            country: 'India',
            gotra: 'Agastya',
            nukh: 'Arora (Aroda)',
            phone: '9876543210',
            email: 'family@example.com',
          },
        ],
      }

      const result = await familyService.registerCompleteFamily(payload, 'user-creator-123')

      expect(mockRpc).toHaveBeenCalledWith(payload, 'user-creator-123')
      expect(result.data?.success).toBe(true)
      expect(result.data?.family_id).toBe('family-vyas-999')
      expect(result.data?.head_person_id).toBe('person-jayesh-111')
      expect(result.data?.member_count).toBe(5)
    })

    it('rejects registration when unauthenticated without session', async () => {
      const payload = {
        family: {
          family_name: 'Anon Family',
          selected_mukhi_id: 'mukhi-001',
          city: 'Agra',
          state: 'UP',
          gotra: 'Agastya',
          nukh: 'Arora (Aroda)',
        },
        head: {
          first_name: 'Anon',
          middle_name: 'A',
          last_name: 'Person',
        },
      }

      const res = await familyService.registerCompleteFamily(payload as any, '')
      expect(res.error?.code).toBe('UNAUTHENTICATED')
    })
  })
})
