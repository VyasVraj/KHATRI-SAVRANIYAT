/**
 * Unit Tests: PersonClaimSection Component (Phase 8 Subtask 2)
 * (src/features/claims/components/PersonClaimSection.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { PersonClaimSection } from '@/features/claims/components/PersonClaimSection'
import * as authContext from '@/features/auth/context/AuthContext'
import * as useClaimHook from '@/features/claims/hooks/usePersonClaim'
import type { PersonRow } from '@/types'
import type { PersonClaim } from '@/features/claims/types'
import type { UseQueryResult } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/claims/hooks/usePersonClaim')

const CALLER_USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const PERSON_ID = '33333333-3333-4333-8333-333333333333'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'

const BASE_PERSON: PersonRow = {
  id: PERSON_ID,
  first_name: 'Aarav',
  middle_name: 'K.',
  last_name: 'Patel',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1990-05-15',
  date_of_death: null,
  birth_place: 'Mumbai',
  gotra: 'Kashyap',
  nukh: null,
  kul: null,
  phone: null,
  phone_secondary: null,
  email_contact: null,
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'PUBLIC',
  dob_privacy: 'PRIVATE',
  contact_privacy: 'PRIVATE',
  user_id: null,
  created_by: CALLER_USER_ID,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

describe('PersonClaimSection', () => {
  const mockSubmitMutateAsync = vi.fn().mockResolvedValue({})
  const mockCancelMutateAsync = vi.fn().mockResolvedValue({})

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: CALLER_USER_ID } as unknown as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })

    vi.spyOn(useClaimHook, 'usePersonClaim').mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as unknown as UseQueryResult<PersonClaim | null, Error>)

    vi.spyOn(useClaimHook, 'useClaimMutations').mockReturnValue({
      submitClaim: { mutateAsync: mockSubmitMutateAsync, isPending: false } as unknown as ReturnType<
        typeof useClaimHook.useClaimMutations
      >['submitClaim'],
      cancelClaim: { mutateAsync: mockCancelMutateAsync, isPending: false } as unknown as ReturnType<
        typeof useClaimHook.useClaimMutations
      >['cancelClaim'],
    })
  })

  function renderSection(person: PersonRow) {
    return renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(PersonClaimSection, { person })
      )
    )
  }

  describe('Eligibility filtering', () => {
    it('returns empty html for deceased persons', () => {
      const html = renderSection({ ...BASE_PERSON, date_of_death: '2020-01-01' })
      expect(html).toBe('')
    })

    it('returns empty html for inactive persons', () => {
      const html = renderSection({ ...BASE_PERSON, status: 'ARCHIVED' })
      expect(html).toBe('')
    })

    it('returns empty html for soft-deleted persons', () => {
      const html = renderSection({ ...BASE_PERSON, deleted_at: '2026-10-01T00:00:00Z' })
      expect(html).toBe('')
    })
  })

  describe('Unauthenticated viewer', () => {
    beforeEach(() => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        profile: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      })
    })

    it('prompts sign in when census person is unclaimed', () => {
      const html = renderSection(BASE_PERSON)
      expect(html).toContain('data-testid="person-claim-unauthenticated"')
      expect(html).toContain('Sign in')
      expect(html).toContain('Is this your census record?')
    })

    it('shows claimed badge without leaking owner ID when claimed by someone', () => {
      const html = renderSection({ ...BASE_PERSON, user_id: OTHER_USER_ID })
      expect(html).toContain('data-testid="person-claim-claimed-by-other"')
      expect(html).toContain('Claimed Census Record')
      expect(html).not.toContain(OTHER_USER_ID)
    })
  })

  describe('Authenticated viewer ownership states', () => {
    it('renders self-linked profile badge when current user owns the person record', () => {
      const html = renderSection({ ...BASE_PERSON, user_id: CALLER_USER_ID })
      expect(html).toContain('data-testid="person-claim-self"')
      expect(html).toContain('Your Linked Profile')
      expect(html).toContain('linked to your user account')
    })

    it('renders privacy-safe claimed banner when owned by another user', () => {
      const html = renderSection({ ...BASE_PERSON, user_id: OTHER_USER_ID })
      expect(html).toContain('data-testid="person-claim-claimed-by-other"')
      expect(html).toContain('Claimed Census Record')
      expect(html).not.toContain(OTHER_USER_ID)
      expect(html).not.toContain('Claim record')
    })
  })

  describe('Claim workflow states', () => {
    it('renders loading placeholder while claim status is loading', () => {
      vi.spyOn(useClaimHook, 'usePersonClaim').mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      } as unknown as UseQueryResult<PersonClaim | null, Error>)

      const html = renderSection(BASE_PERSON)
      expect(html).toContain('data-testid="person-claim-loading"')
      expect(html).toContain('Checking claim status')
    })

    it('renders pending review banner with evidence note and withdraw action', () => {
      const mockPendingClaim: PersonClaim = {
        id: CLAIM_ID,
        person_id: PERSON_ID,
        claimant_id: CALLER_USER_ID,
        status: 'PENDING',
        evidence_notes: 'I am the son of Ramesh.',
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: '2026-10-06T00:00:00Z',
        updated_at: '2026-10-06T00:00:00Z',
      }

      vi.spyOn(useClaimHook, 'usePersonClaim').mockReturnValue({
        data: mockPendingClaim,
        isLoading: false,
        error: null,
      } as unknown as UseQueryResult<PersonClaim | null, Error>)

      const html = renderSection(BASE_PERSON)
      expect(html).toContain('data-testid="person-claim-pending"')
      expect(html).toContain('Claim Under Review')
      expect(html).toContain('I am the son of Ramesh.')
      expect(html).toContain('Withdraw claim')
    })

    it('renders rejection notice with feedback when previous claim was rejected', () => {
      const mockRejectedClaim: PersonClaim = {
        id: CLAIM_ID,
        person_id: PERSON_ID,
        claimant_id: CALLER_USER_ID,
        status: 'REJECTED',
        evidence_notes: 'Previous note',
        rejection_reason: 'Please provide proof of parentage.',
        reviewed_by: 'some-mod-id',
        reviewed_at: '2026-10-06T01:00:00Z',
        created_at: '2026-10-06T00:00:00Z',
        updated_at: '2026-10-06T01:00:00Z',
      }

      vi.spyOn(useClaimHook, 'usePersonClaim').mockReturnValue({
        data: mockRejectedClaim,
        isLoading: false,
        error: null,
      } as unknown as UseQueryResult<PersonClaim | null, Error>)

      const html = renderSection(BASE_PERSON)
      expect(html).toContain('data-testid="person-claim-rejected"')
      expect(html).toContain('Previous Claim Rejected')
      expect(html).toContain('Please provide proof of parentage.')
      expect(html).not.toContain('some-mod-id') // Moderator identity is private
      expect(html).toContain('Submit new claim')
    })

    it('renders eligible claim CTA when record is unclaimed and user has no active claim', () => {
      vi.spyOn(useClaimHook, 'usePersonClaim').mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      } as unknown as UseQueryResult<PersonClaim | null, Error>)

      const html = renderSection(BASE_PERSON)
      expect(html).toContain('data-testid="person-claim-eligible"')
      expect(html).toContain('Is this your census record?')
      expect(html).toContain('Claim record')
    })
  })
})
