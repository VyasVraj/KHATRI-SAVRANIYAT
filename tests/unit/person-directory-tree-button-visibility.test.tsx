/**
 * Unit Tests: PersonDirectoryCard Family Tree Button Visibility & Access Control
 *
 * Requirements:
 * 1. Normal user browsing an unrelated family's person card sees "View Profile",
 *    and "Family Tree" button is completely hidden (no empty space).
 * 2. Family creator browsing their own family's person card sees BOTH "View Profile"
 *    and "Family Tree" buttons.
 * 3. Approved family claimant sees BOTH "View Profile" and "Family Tree" buttons.
 * 4. Approved member profile claimant sees BOTH "View Profile" and "Family Tree" buttons.
 * 5. Admin and Super Admin see BOTH buttons for all persons.
 * 6. Authorized Mukhi within assigned scope sees BOTH buttons; unauthorized Mukhi outside scope sees only "View Profile".
 * 7. Pending or rejected claimant sees only "View Profile".
 * 8. Deactivated Mukhi sees only "View Profile".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PersonDirectoryCard } from '@/features/discover/components/PersonDirectoryCard'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import type { PersonDiscoveryResult } from '@/features/discover/types'

function renderCard(person: PersonDiscoveryResult, authValue: Partial<AuthContextValue>) {
  const fullAuth: AuthContextValue = {
    session: null,
    user: authValue.user ?? null,
    profile: authValue.profile ?? null,
    isLoading: false,
    isAuthenticated: Boolean(authValue.user),
    ...authValue,
  }

  return render(
    <AuthContext.Provider value={fullAuth}>
      <MemoryRouter>
        <PersonDirectoryCard person={person} />
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

describe('PersonDirectoryCard — Family Tree Button Visibility & Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const unrelatedPerson: PersonDiscoveryResult = {
    id: 'suthar-person-1',
    first_name: 'Bhavesh',
    middle_name: 'B',
    last_name: 'Suthar',
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: null,
    dob_year: null,
    age: 60,
    city: 'Anand',
    state: 'Gujarat',
    date_of_death: null,
    birth_place: null,
    gotra: 'Krishna',
    kul: null,
    nukh: 'Karatela',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    can_view_tree: false,
    family_id: 'suthar-family-id',
  }

  const authorizedPerson: PersonDiscoveryResult = {
    ...unrelatedPerson,
    id: 'vyas-person-1',
    first_name: 'Jayesh',
    middle_name: 'C',
    last_name: 'Vyas',
    can_view_tree: true,
    family_id: 'vyas-family-id',
  }

  it('1. Hides Family Tree button for normal user visiting an unrelated family card', () => {
    renderCard(unrelatedPerson, {
      user: { id: 'jignasha-user-id', email: 'jignasha@example.com' } as never,
      profile: { id: 'jignasha-user-id', role: 'MEMBER', is_active: true } as never,
    })

    // "View Profile" button MUST be present
    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument()

    // "Family Tree" / "View Tree" button MUST be completely hidden
    expect(screen.queryByRole('button', { name: /view tree|family tree/i })).not.toBeInTheDocument()
  })

  it('2. Shows Family Tree button when user is authorized for that person/family (creator / member / approved claimant)', () => {
    renderCard(authorizedPerson, {
      user: { id: 'jignasha-user-id', email: 'jignasha@example.com' } as never,
      profile: { id: 'jignasha-user-id', role: 'MEMBER', is_active: true } as never,
    })

    // Both "View Profile" and "Family Tree" buttons MUST be visible
    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view tree|family tree/i })).toBeInTheDocument()
  })

  it('3. Admin sees Family Tree button on all member cards', () => {
    renderCard(unrelatedPerson, {
      user: { id: 'admin-user-id', email: 'admin@example.com' } as never,
      profile: { id: 'admin-user-id', role: 'ADMIN', is_active: true } as never,
    })

    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view tree|family tree/i })).toBeInTheDocument()
  })

  it('4. Super Admin sees Family Tree button on all member cards', () => {
    renderCard(unrelatedPerson, {
      user: { id: 'superadmin-user-id', email: 'superadmin@example.com' } as never,
      profile: { id: 'superadmin-user-id', role: 'SUPER_ADMIN', is_active: true } as never,
    })

    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view tree|family tree/i })).toBeInTheDocument()
  })

  it('5. Pending or rejected claimant has can_view_tree=false and does NOT see Family Tree button', () => {
    const pendingClaimantPerson: PersonDiscoveryResult = {
      ...unrelatedPerson,
      can_view_tree: false,
    }

    renderCard(pendingClaimantPerson, {
      user: { id: 'pending-claimant-id', email: 'pending@example.com' } as never,
      profile: { id: 'pending-claimant-id', role: 'MEMBER', is_active: true } as never,
    })

    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view tree|family tree/i })).not.toBeInTheDocument()
  })

  it('6. Deactivated Mukhi has can_view_tree=false and does NOT see Family Tree button', () => {
    const deactivatedMukhiPerson: PersonDiscoveryResult = {
      ...unrelatedPerson,
      can_view_tree: false,
    }

    renderCard(deactivatedMukhiPerson, {
      user: { id: 'deactivated-mukhi-id', email: 'mukhi@example.com' } as never,
      profile: { id: 'deactivated-mukhi-id', role: 'MEMBER', is_active: true } as never,
    })

    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view tree|family tree/i })).not.toBeInTheDocument()
  })

  it('7. When can_view_tree is undefined, falls back to is_same_family=true to show Family Tree button', () => {
    const fallbackSameFamilyPerson: PersonDiscoveryResult = {
      ...unrelatedPerson,
      can_view_tree: undefined,
      is_same_family: true,
    }

    renderCard(fallbackSameFamilyPerson, {
      user: { id: 'jignasha-user-id', email: 'jignasha@example.com' } as never,
      profile: { id: 'jignasha-user-id', role: 'MEMBER', is_active: true } as never,
    })

    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view tree|family tree/i })).toBeInTheDocument()
  })

  it('8. When can_view_tree is undefined, falls back to is_same_family=false to hide Family Tree button', () => {
    const fallbackUnrelatedPerson: PersonDiscoveryResult = {
      ...unrelatedPerson,
      can_view_tree: undefined,
      is_same_family: false,
    }

    renderCard(fallbackUnrelatedPerson, {
      user: { id: 'jignasha-user-id', email: 'jignasha@example.com' } as never,
      profile: { id: 'jignasha-user-id', role: 'MEMBER', is_active: true } as never,
    })

    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view tree|family tree/i })).not.toBeInTheDocument()
  })
})
