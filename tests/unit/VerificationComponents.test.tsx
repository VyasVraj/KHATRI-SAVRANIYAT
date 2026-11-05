/**
 * Unit Tests: Verification UI Components (Phase 9 Subtask 2)
 * (src/features/verification/components/*)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { VerificationBadge } from '@/features/verification/components/VerificationBadge'
import { VerificationSubmitModal } from '@/features/verification/components/VerificationSubmitModal'
import { PersonVerificationSection } from '@/features/verification/components/PersonVerificationSection'
import { FamilyVerificationSection } from '@/features/verification/components/FamilyVerificationSection'
import * as authContext from '@/features/auth/context/AuthContext'
import * as useVerificationHook from '@/features/verification/hooks/useVerification'
import type { PersonRow, FamilyRow } from '@/types'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/verification/hooks/useVerification')

const CALLER_USER_ID = '11111111-1111-4111-8111-111111111111'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'
const FAMILY_ID = '33333333-3333-4333-8333-333333333333'

const BASE_PERSON: PersonRow = {
  id: PERSON_ID,
  first_name: 'Dev',
  middle_name: null,
  last_name: 'Patel',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1995-01-01',
  date_of_death: null,
  birth_place: 'Ahmedabad',
  gotra: 'Kashyap',
  nukh: null,
  kul: null,
  phone: null,
  phone_secondary: null,
  email_contact: null,
  status: 'ACTIVE',
  verification_status: 'UNVERIFIED',
  profile_privacy: 'PUBLIC',
  dob_privacy: 'PRIVATE',
  contact_privacy: 'PRIVATE',
  user_id: null,
  created_by: CALLER_USER_ID,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const BASE_FAMILY: FamilyRow = {
  id: FAMILY_ID,
  family_name: 'Patel Family',
  description: 'Community registered family',
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'UNVERIFIED',
  created_by: CALLER_USER_ID,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
  city: 'Ahmedabad',
  state: 'Gujarat',
  country: 'India',
  gotra: 'Kashyap',
  nukh: null,
  kul: null,
}

describe('VerificationBadge', () => {
  it('renders VERIFIED status correctly with emerald classes', () => {
    const html = renderToStaticMarkup(<VerificationBadge status="VERIFIED" />)
    expect(html).toContain('Verified')
    expect(html).toContain('text-emerald-700')
  })

  it('renders PENDING status correctly with amber classes', () => {
    const html = renderToStaticMarkup(<VerificationBadge status="PENDING" />)
    expect(html).toContain('Verification Pending')
    expect(html).toContain('text-amber-800')
  })

  it('renders REJECTED status correctly with rose classes', () => {
    const html = renderToStaticMarkup(<VerificationBadge status="REJECTED" />)
    expect(html).toContain('Rejected')
    expect(html).toContain('text-rose-700')
  })

  it('renders UNVERIFIED status correctly with navy/slate classes', () => {
    const html = renderToStaticMarkup(<VerificationBadge status="UNVERIFIED" />)
    expect(html).toContain('Unverified')
    expect(html).toContain('text-navy-600')
  })

  it('renders small size when size="sm" is passed', () => {
    const html = renderToStaticMarkup(<VerificationBadge status="VERIFIED" size="sm" />)
    expect(html).toContain('text-xs')
  })
})

describe('VerificationSubmitModal', () => {
  const mockMutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(useVerificationHook, 'useSubmitVerificationRequest').mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useVerificationHook.useSubmitVerificationRequest>)
  })

  it('renders empty when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <VerificationSubmitModal
        isOpen={false}
        onClose={vi.fn()}
        entityType="PERSON"
        entityId={PERSON_ID}
        entityName="Dev Patel"
      />
    )
    expect(html).toBe('')
  })

  it('renders title, entity name and character counter when open', () => {
    const html = renderToStaticMarkup(
      <VerificationSubmitModal
        isOpen={true}
        onClose={vi.fn()}
        entityType="PERSON"
        entityId={PERSON_ID}
        entityName="Dev Patel"
      />
    )
    expect(html).toContain('Request Verification')
    expect(html).toContain('Dev Patel')
    expect(html).toContain('0 / 1000')
    expect(html).toContain('Submit request')
  })
})

describe('PersonVerificationSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: CALLER_USER_ID } as unknown as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })
    vi.spyOn(useVerificationHook, 'useSubmitVerificationRequest').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useVerificationHook.useSubmitVerificationRequest>)
  })

  function renderSection(person: PersonRow) {
    return renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(PersonVerificationSection, { person })
      )
    )
  }

  it('renders section and Request verification button for UNVERIFIED living person', () => {
    const html = renderSection(BASE_PERSON)
    expect(html).toContain('data-testid="person-verification-section"')
    expect(html).toContain('Community verification')
    expect(html).toContain('Unverified')
    expect(html).toContain('Request verification')
  })

  it('does NOT render Request verification button for deceased person (date_of_death is set)', () => {
    const html = renderSection({ ...BASE_PERSON, date_of_death: '2020-01-01' })
    expect(html).toContain('Deceased records cannot be submitted for live member verification.')
    expect(html).not.toContain('Request verification')
  })

  it('renders pending description and no submit button when status is PENDING', () => {
    const html = renderSection({ ...BASE_PERSON, verification_status: 'PENDING' })
    expect(html).toContain('Verification Pending')
    expect(html).toContain('A verification request is pending review by community moderators.')
    expect(html).not.toContain('Request verification')
  })

  it('renders verified description and no submit button when status is VERIFIED', () => {
    const html = renderSection({ ...BASE_PERSON, verification_status: 'VERIFIED' })
    expect(html).toContain('Verified')
    expect(html).toContain('This person record has been reviewed and verified by an authorized community moderator.')
    expect(html).not.toContain('Request verification')
  })

  it('renders rejected description and submit button when status is REJECTED', () => {
    const html = renderSection({ ...BASE_PERSON, verification_status: 'REJECTED' })
    expect(html).toContain('Rejected')
    expect(html).toContain('A previous verification request was rejected. You may submit a new request')
    expect(html).toContain('Request verification')
  })

  it('returns empty html if person is soft-deleted', () => {
    const html = renderSection({ ...BASE_PERSON, deleted_at: '2026-10-02T00:00:00Z' })
    expect(html).toBe('')
  })

  it('returns empty html if person status is not ACTIVE', () => {
    const html = renderSection({ ...BASE_PERSON, status: 'ARCHIVED' })
    expect(html).toBe('')
  })

  it('renders sign-in prompt if user is unauthenticated', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: null,
      profile: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
    })

    const html = renderSection(BASE_PERSON)
    expect(html).toContain('Sign in to request verification')
    expect(html).not.toContain('Request verification</button>')
  })
})

describe('FamilyVerificationSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: CALLER_USER_ID } as unknown as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })
    vi.spyOn(useVerificationHook, 'useSubmitVerificationRequest').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useVerificationHook.useSubmitVerificationRequest>)
  })

  function renderSection(family: FamilyRow) {
    return renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(FamilyVerificationSection, { family })
      )
    )
  }

  it('renders section and Request verification button for UNVERIFIED family', () => {
    const html = renderSection(BASE_FAMILY)
    expect(html).toContain('data-testid="family-verification-section"')
    expect(html).toContain('Community verification')
    expect(html).toContain('Unverified')
    expect(html).toContain('Request verification')
  })

  it('renders pending description and no submit button when status is PENDING', () => {
    const html = renderSection({ ...BASE_FAMILY, verification_status: 'PENDING' })
    expect(html).toContain('Verification Pending')
    expect(html).toContain('A verification request is pending review by community moderators.')
    expect(html).not.toContain('Request verification')
  })

  it('renders verified description and no submit button when status is VERIFIED', () => {
    const html = renderSection({ ...BASE_FAMILY, verification_status: 'VERIFIED' })
    expect(html).toContain('Verified')
    expect(html).toContain('This family record has been reviewed and verified by an authorized community moderator.')
    expect(html).not.toContain('Request verification')
  })

  it('returns empty html if family is soft-deleted', () => {
    const html = renderSection({ ...BASE_FAMILY, deleted_at: '2026-10-02T00:00:00Z' })
    expect(html).toBe('')
  })

  it('renders sign-in prompt if user is unauthenticated', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: null,
      profile: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
    })

    const html = renderSection(BASE_FAMILY)
    expect(html).toContain('Sign in to request verification')
    expect(html).not.toContain('Request verification</button>')
  })
})
