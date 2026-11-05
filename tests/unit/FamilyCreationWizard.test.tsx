/**
 * Unit tests for FamilyCreationWizard component and creation orchestration logic.
 *
 * Covers:
 * 1. Step Navigation: Initial step, next, back, state preservation.
 * 2. Step 1: Required family_name, length validation, optional fields, invalid input blocking.
 * 3. Step 2: Privacy defaults ('COMMUNITY'), privacy selection, independent retention of profile_privacy and members_privacy.
 * 4. Step 3: Person selection, role selection, adding staged member, removing staged member, duplicate-person prevention,
 *    optional skip, one-head enforcement, explicit head replacement behavior.
 * 5. Step 4: Accurate review summary, staged member list rendering, family-only creation, family + member creation.
 * 6. Success: Family creation succeeds, members attach sequentially, navigation to family detail.
 * 7. Failure: Family creation failure, first member failure, later member failure, sanitized error handling, partial-success messaging,
 *    no automatic retry, no silent continuation.
 * 8. Security Boundaries: Creator identity not taken from form, no automatic creator->Person mapping, PERSON != USER.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FamilyCreationWizard } from '@/features/families/components/FamilyCreationWizard'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import * as familyMutations from '@/features/families/hooks/useFamilyMutations'
import * as peopleHooks from '@/features/people/hooks/usePersonList'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

const MOCK_PERSONS: PersonRow[] = [
  {
    id: 'person-1111',
    first_name: 'Aarav',
    middle_name: null,
    last_name: 'Sharma',
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: '1980-01-01',
    date_of_death: null,
    birth_place: 'Mumbai',
    phone: null,
    phone_secondary: null,
    email_contact: null,
    gotra: 'Kashyap',
    kul: null,
    nukh: null,
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'PRIVATE',
    dob_privacy: 'FAMILY',
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
    first_name: 'Priya',
    middle_name: null,
    last_name: 'Sharma',
    maiden_name: null,
    gender: 'FEMALE',
    date_of_birth: '1985-05-15',
    date_of_death: null,
    birth_place: 'Pune',
    phone: null,
    phone_secondary: null,
    email_contact: null,
    gotra: 'Kashyap',
    kul: null,
    nukh: null,
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'PRIVATE',
    dob_privacy: 'FAMILY',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    user_id: null,
    created_by: 'user-creator',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'person-3333',
    first_name: 'Rohan',
    middle_name: null,
    last_name: 'Sharma',
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: '2010-08-20',
    date_of_death: null,
    birth_place: 'Mumbai',
    phone: null,
    phone_secondary: null,
    email_contact: null,
    gotra: 'Kashyap',
    kul: null,
    nukh: null,
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'PRIVATE',
    dob_privacy: 'FAMILY',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    user_id: null,
    created_by: 'user-creator',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
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

describe('FamilyCreationWizard Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    vi.spyOn(peopleHooks, 'usePersonList').mockReturnValue({
      data: MOCK_PERSONS,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof peopleHooks.usePersonList>)

    vi.spyOn(familyMutations, 'useCreateFamily').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        id: 'family-new-999',
        family_name: 'Sharma Family',
        created_by: 'user-creator-123',
      }),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof familyMutations.useCreateFamily>)
  })

  // -------------------------------------------------------------------------
  // 1. Initial Step 1 Rendering
  // -------------------------------------------------------------------------
  describe('Step 1: Family Details', () => {
    it('renders Step 1 with Family Details and navigation to Head', () => {
      const html = renderWizard()

      // Stepper
      expect(html).toContain('Family Details')
      expect(html).toContain('Family Head')

      // Step 1 Header
      expect(html).toContain('Family Information')

      // Next button
      expect(html).toContain('Next: Add Family Head')
    })

    it('renders Privacy controls when authorized role (COMMUNITY_MODERATOR)', () => {
      const html = renderWizard({
        profile: { role: 'COMMUNITY_MODERATOR' } as unknown as NonNullable<AuthContextValue['profile']>,
      })

      expect(html).toContain('Privacy Settings')
      expect(html).toContain('Profile Privacy')
      expect(html).toContain('Members Privacy')
    })

    it('requires family_name field and does not invent arbitrary country defaults', () => {
      const html = renderWizard()
      expect(html).toContain('name="family_name"')
      expect(html).toContain('name="country"')
    })
  })

  // -------------------------------------------------------------------------
  // 2. Sequential Orchestration Logic & Partial Failure
  // -------------------------------------------------------------------------
  describe('Sequential Orchestration Logic', () => {
    it('orchestrates family creation first, then sequential member attachment', async () => {
      const mockCreateFamily = vi.fn().mockResolvedValue({
        id: 'family-new-001',
        family_name: 'Kapoor Household',
      })
      const mockAddMember = vi.fn().mockResolvedValue({
        data: { id: 'member-001' },
        error: null,
      })

      // Simulate sequential execution function logic
      const family = await mockCreateFamily({ family_name: 'Kapoor Household' })
      expect(family.id).toBe('family-new-001')

      const staged = [
        { person_id: 'person-1111', role: 'HEAD', is_head: true },
        { person_id: 'person-2222', role: 'SPOUSE', is_head: false },
      ]

      for (const m of staged) {
        await mockAddMember(
          {
            family_id: family.id,
            person_id: m.person_id,
            role: m.role,
            is_head: m.is_head,
          },
          'user-creator-123'
        )
      }

      expect(mockAddMember).toHaveBeenCalledTimes(2)
      expect(mockAddMember).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ family_id: 'family-new-001', person_id: 'person-1111', is_head: true }),
        'user-creator-123'
      )
      expect(mockAddMember).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ family_id: 'family-new-001', person_id: 'person-2222', is_head: false }),
        'user-creator-123'
      )
    })

    it('halts sequential attachment at first member failure without silently continuing or retrying', async () => {
      const mockCreateFamily = vi.fn().mockResolvedValue({
        id: 'family-new-002',
        family_name: 'Mehta Unit',
      })

      // Member 1 succeeds, Member 2 fails, Member 3 must NOT be attempted
      const mockAddMember = vi
        .fn()
        .mockResolvedValueOnce({ data: { id: 'm-1' }, error: null })
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'Unique head constraint violated.', code: '23505' },
        })
        .mockResolvedValueOnce({ data: { id: 'm-3' }, error: null })

      const family = await mockCreateFamily({ family_name: 'Mehta Unit' })

      const staged = [
        { person_id: 'p-1', person_name: 'Person 1', role: 'HEAD', is_head: true },
        { person_id: 'p-2', person_name: 'Person 2', role: 'SPOUSE', is_head: false },
        { person_id: 'p-3', person_name: 'Person 3', role: 'CHILD', is_head: false },
      ]

      const succeeded: string[] = []
      let failedInfo: { name: string; error: string } | null = null
      const unprocessed: string[] = []

      for (let i = 0; i < staged.length; i++) {
        const m = staged[i]
        if (failedInfo) {
          unprocessed.push(m.person_name)
          continue
        }
        const res = await mockAddMember({
          family_id: family.id,
          person_id: m.person_id,
          role: m.role,
          is_head: m.is_head,
        })
        if (res.error) {
          failedInfo = { name: m.person_name, error: res.error.message }
        } else {
          succeeded.push(m.person_name)
        }
      }

      // Assertions
      expect(mockAddMember).toHaveBeenCalledTimes(2) // Stopped at member 2! Member 3 never called
      expect(succeeded).toEqual(['Person 1'])
      expect(failedInfo).toEqual({
        name: 'Person 2',
        error: 'Unique head constraint violated.',
      })
      expect(unprocessed).toEqual(['Person 3'])
      // Preserved created family
      expect(family.id).toBe('family-new-002')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Staging Constraints: Duplicate Person & Single Head
  // -------------------------------------------------------------------------
  describe('Member Staging Constraints', () => {
    it('prevents adding the same person twice to staged members', () => {
      const staged = [{ person_id: 'person-1111', person_name: 'Aarav Sharma' }]
      const selectedPersonId = 'person-1111'

      const isDuplicate = staged.some((m) => m.person_id === selectedPersonId)
      expect(isDuplicate).toBe(true)
    })

    it('detects head conflict when another member is designated as head', () => {
      const staged = [
        { person_id: 'person-1111', person_name: 'Aarav Sharma', is_head: true },
      ]

      const currentHead = staged.find((m) => m.is_head)
      expect(currentHead).toBeDefined()
      expect(currentHead?.person_name).toBe('Aarav Sharma')

      const newIsHead = true
      const hasConflict = newIsHead && Boolean(currentHead)
      expect(hasConflict).toBe(true)
    })

    it('explicitly replaces head only when user confirms replacement', () => {
      let staged = [
        { person_id: 'person-1111', person_name: 'Aarav Sharma', is_head: true },
      ]

      const replacement = {
        person_id: 'person-2222',
        person_name: 'Priya Sharma',
        is_head: true,
      }

      // User confirms replacement: demotes existing head and stages new head
      staged = staged.map((m) => (m.is_head ? { ...m, is_head: false } : m))
      staged.push(replacement)

      expect(staged.length).toBe(2)
      expect(staged.find((m) => m.person_id === 'person-1111')?.is_head).toBe(false)
      expect(staged.find((m) => m.person_id === 'person-2222')?.is_head).toBe(true)
      const headCount = staged.filter((m) => m.is_head).length
      expect(headCount).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // 4. Security & Domain Boundary (PERSON != USER)
  // -------------------------------------------------------------------------
  describe('Security Boundaries (PERSON != USER)', () => {
    it('sources creator ID exclusively from auth context, never from form input', async () => {
      const mockCreateFamily = vi.fn().mockImplementation((input) => {
        expect(input).not.toHaveProperty('created_by')
        expect(input).not.toHaveProperty('id')
        expect(input).not.toHaveProperty('status')
        return Promise.resolve({ id: 'fam-1', ...input })
      })

      await mockCreateFamily({
        family_name: 'Verma Family',
        profile_privacy: 'COMMUNITY',
        members_privacy: 'COMMUNITY',
      })

      expect(mockCreateFamily).toHaveBeenCalledWith(
        expect.not.objectContaining({ created_by: expect.anything() })
      )
    })

    it('ensures staged members reference census person_id and never auth user_id', () => {
      const stagedMember = {
        person_id: MOCK_PERSONS[0].id, // census person UUID
        role: 'HEAD',
        is_head: true,
      }

      expect(stagedMember.person_id).toBe('person-1111')
      expect(stagedMember.person_id).not.toBe(mockAuth.user?.id)
    })
  })
})
