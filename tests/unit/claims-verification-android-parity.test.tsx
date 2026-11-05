/**
 * ANDROID-7: Claims, Verification & Duplicate Flows Unit & Parity Tests
 * (tests/unit/claims-verification-android-parity.test.tsx)
 *
 * Verifies Android parity requirements across:
 * 1. Screen 04 & Screens 21-24: Census seat claiming, states (pending/approved/rejected/already claimed),
 *    cancel claim dialog, and mobile touch targets >= 44px.
 * 2. Record verification badges, requests, moderator review, and rejection feedback.
 * 3. Duplicate detection warnings, moderator-only visibility, and side-by-side review (DETECT != MERGE).
 * 4. Multi-language localization across English, Hindi, and Gujarati.
 * 5. Strict preservation of PERSON != USER and ANDROID-2 Privacy Authorization Lock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import { PersonClaimSection } from '@/features/claims/components/PersonClaimSection'
import { ClaimPersonModal } from '@/features/claims/components/ClaimPersonModal'
import { CancelClaimDialog } from '@/features/claims/components/CancelClaimDialog'
import { VerificationBadge } from '@/features/verification/components/VerificationBadge'
import { PersonVerificationSection } from '@/features/verification/components/PersonVerificationSection'
import { VerificationSubmitModal } from '@/features/verification/components/VerificationSubmitModal'
import { PersonDuplicateWarningBanner } from '@/features/verification/components/PersonDuplicateWarningBanner'
import { DuplicateReviewModal } from '@/features/verification/components/DuplicateReviewModal'
import * as authContext from '@/features/auth/context/AuthContext'
import * as useClaimHook from '@/features/claims/hooks/usePersonClaim'
import * as useVerificationHook from '@/features/verification/hooks/useVerification'
import * as useDuplicateHook from '@/features/verification/hooks/useDuplicateDetection'
import type { PersonRow, ProfileRow } from '@/types'
import type { PersonClaim } from '@/features/claims/types'
import type { EnrichedDuplicateFlag } from '@/features/verification/types/duplicate.types'
import type { UseQueryResult } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/claims/hooks/usePersonClaim')
vi.mock('@/features/verification/hooks/useVerification')
vi.mock('@/features/verification/hooks/useDuplicateDetection')

const CALLER_USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const PERSON_ID = '33333333-3333-4333-8333-333333333333'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'

const BASE_PERSON: PersonRow = {
  id: PERSON_ID,
  first_name: 'Dharmesh',
  middle_name: 'K.',
  last_name: 'Khatri',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1988-04-12',
  date_of_death: null,
  birth_place: 'Bhuj',
  gotra: 'Kashyap',
  nukh: 'Prajapati',
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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderWithProviders(ui: React.ReactElement, initialLang: 'en' | 'hi' | 'gu' = 'en') {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('app_language', initialLang)
  }
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider defaultLanguage={initialLang}>
        <MemoryRouter>{ui}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('ANDROID-7 — Claims, Verification & Duplicate Flows Parity', () => {
  const mockSubmitClaim = vi.fn().mockResolvedValue({})
  const mockCancelClaim = vi.fn().mockResolvedValue({})
  const mockSubmitVerification = vi.fn().mockResolvedValue({})
  const mockResolveDuplicate = vi.fn().mockResolvedValue(true)
  const mockFlagDuplicate = vi.fn().mockResolvedValue('flag-123')

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: CALLER_USER_ID, email: 'dharmesh@example.com' } as unknown as User,
      profile: {
        id: CALLER_USER_ID,
        role: 'MEMBER',
        display_name: 'Dharmesh Khatri',
        phone: null,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      } as unknown as ProfileRow,
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
      submitClaim: { mutateAsync: mockSubmitClaim, isPending: false } as unknown as ReturnType<
        typeof useClaimHook.useClaimMutations
      >['submitClaim'],
      cancelClaim: { mutateAsync: mockCancelClaim, isPending: false } as unknown as ReturnType<
        typeof useClaimHook.useClaimMutations
      >['cancelClaim'],
    })

    vi.spyOn(useVerificationHook, 'useSubmitVerificationRequest').mockReturnValue({
      mutateAsync: mockSubmitVerification,
      isPending: false,
    } as unknown as ReturnType<typeof useVerificationHook.useSubmitVerificationRequest>)

    vi.spyOn(useDuplicateHook, 'useResolveDuplicate').mockReturnValue({
      mutateAsync: mockResolveDuplicate,
      isPending: false,
    } as unknown as ReturnType<typeof useDuplicateHook.useResolveDuplicate>)

    vi.spyOn(useDuplicateHook, 'useFlagDuplicate').mockReturnValue({
      mutateAsync: mockFlagDuplicate,
      isPending: false,
    } as unknown as ReturnType<typeof useDuplicateHook.useFlagDuplicate>)

    vi.spyOn(useDuplicateHook, 'usePersonDuplicateCandidates').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useDuplicateHook.usePersonDuplicateCandidates>)
  })

  /* ======================================================================
   * 1. CENSUS SEAT CLAIMING FLOWS (Screen 04, Screens 21-24)
   * ====================================================================== */
  describe('Census Seat Claiming Flows', () => {
    it('renders eligible claim card for unclaimed census person with accessible touch target', () => {
      renderWithProviders(<PersonClaimSection person={BASE_PERSON} />)

      const card = screen.getByTestId('person-claim-eligible')
      expect(card).toBeInTheDocument()
      expect(screen.getByText('Is this your census record?')).toBeInTheDocument()

      const claimBtn = screen.getByRole('button', { name: /Claim record/i })
      expect(claimBtn).toBeInTheDocument()
      expect(claimBtn).toHaveClass('min-h-[44px]')
    })

    it('renders unauthenticated prompt when user is not logged in', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        profile: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      })

      renderWithProviders(<PersonClaimSection person={BASE_PERSON} />)

      const unauthBanner = screen.getByTestId('person-claim-unauthenticated')
      expect(unauthBanner).toBeInTheDocument()
      expect(screen.getByText('Is this your census record?')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Sign in/i })).toHaveAttribute('href', '/auth/sign-in')
    })

    it('renders pending claim banner with submitted evidence and accessible withdraw action', () => {
      const mockPendingClaim: PersonClaim = {
        id: CLAIM_ID,
        person_id: PERSON_ID,
        claimant_id: CALLER_USER_ID,
        status: 'PENDING',
        evidence_notes: 'Grandson of Velji Khatri from Mandvi.',
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: '2026-10-10T10:00:00Z',
        updated_at: '2026-10-10T10:00:00Z',
      }

      vi.spyOn(useClaimHook, 'usePersonClaim').mockReturnValue({
        data: mockPendingClaim,
        isLoading: false,
        error: null,
      } as unknown as UseQueryResult<PersonClaim | null, Error>)

      renderWithProviders(<PersonClaimSection person={BASE_PERSON} />)

      const pendingCard = screen.getByTestId('person-claim-pending')
      expect(pendingCard).toBeInTheDocument()
      expect(screen.getByText('Claim Under Review')).toBeInTheDocument()
      expect(screen.getByText(/Grandson of Velji Khatri/i)).toBeInTheDocument()

      const withdrawBtn = screen.getByRole('button', { name: /Withdraw claim/i })
      expect(withdrawBtn).toBeInTheDocument()
      expect(withdrawBtn).toHaveClass('min-h-[44px]')
    })

    it('renders privacy-safe claimed banner when record is owned by another person (zero-leak)', () => {
      renderWithProviders(<PersonClaimSection person={{ ...BASE_PERSON, user_id: OTHER_USER_ID }} />)

      const claimedCard = screen.getByTestId('person-claim-claimed-by-other')
      expect(claimedCard).toBeInTheDocument()
      expect(screen.getByText('Claimed Census Record')).toBeInTheDocument()
      expect(screen.getByText(/linked to a verified community member/i)).toBeInTheDocument()

      // CRITICAL PRIVACY: The other user's ID must never appear in the DOM
      expect(screen.queryByText(OTHER_USER_ID)).toBeNull()
      expect(screen.queryByRole('button', { name: /Claim record/i })).toBeNull()
    })

    it('renders linked profile badge when person record belongs to current user', () => {
      renderWithProviders(<PersonClaimSection person={{ ...BASE_PERSON, user_id: CALLER_USER_ID }} />)

      const selfCard = screen.getByTestId('person-claim-self')
      expect(selfCard).toBeInTheDocument()
      expect(screen.getByText('Your Linked Profile')).toBeInTheDocument()
      expect(screen.getByText(/linked to your user account/i)).toBeInTheDocument()
    })

    it('renders previous claim rejection with feedback and lets user submit a new claim', () => {
      const mockRejectedClaim: PersonClaim = {
        id: CLAIM_ID,
        person_id: PERSON_ID,
        claimant_id: CALLER_USER_ID,
        status: 'REJECTED',
        evidence_notes: 'Initial attempt',
        rejection_reason: 'Identity could not be verified by family head.',
        reviewed_by: OTHER_USER_ID,
        reviewed_at: '2026-10-12T10:00:00Z',
        created_at: '2026-10-10T10:00:00Z',
        updated_at: '2026-10-12T10:00:00Z',
      }

      vi.spyOn(useClaimHook, 'usePersonClaim').mockReturnValue({
        data: mockRejectedClaim,
        isLoading: false,
        error: null,
      } as unknown as UseQueryResult<PersonClaim | null, Error>)

      renderWithProviders(<PersonClaimSection person={BASE_PERSON} />)

      const rejectedCard = screen.getByTestId('person-claim-rejected')
      expect(rejectedCard).toBeInTheDocument()
      expect(screen.getByText('Previous Claim Rejected')).toBeInTheDocument()
      expect(screen.getByText(/Identity could not be verified/i)).toBeInTheDocument()

      const newClaimBtn = screen.getByRole('button', { name: /Submit new claim/i })
      expect(newClaimBtn).toBeInTheDocument()
      expect(newClaimBtn).toHaveClass('min-h-[44px]')
    })

    it('opens ClaimPersonModal with community integrity notice and submits valid claim', async () => {
      const onClose = vi.fn()
      renderWithProviders(<ClaimPersonModal person={BASE_PERSON} isOpen={true} onClose={onClose} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Claim Census Record')).toBeInTheDocument()
      expect(screen.getByText(/Community Integrity Note:/i)).toBeInTheDocument()

      const textarea = screen.getByPlaceholderText(/Provide information to help moderators verify your identity/i)
      fireEvent.change(textarea, { target: { value: 'My father is Govind Khatri.' } })

      const submitBtn = screen.getByRole('button', { name: /Submit Claim for Review/i })
      expect(submitBtn).toHaveClass('min-h-[44px]')
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockSubmitClaim).toHaveBeenCalledWith({
          personId: PERSON_ID,
          evidenceNotes: 'My father is Govind Khatri.',
        })
      })
    })

    it('renders CancelClaimDialog and executes claim withdrawal', async () => {
      const onClose = vi.fn()
      renderWithProviders(
        <CancelClaimDialog
          claimId={CLAIM_ID}
          personId={PERSON_ID}
          personName="Dharmesh Khatri"
          isOpen={true}
          onClose={onClose}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Withdraw Census Record Claim')).toBeInTheDocument()
      expect(screen.getByText(/Are you sure you want to withdraw your pending claim for Dharmesh Khatri/i)).toBeInTheDocument()

      const confirmBtn = screen.getByRole('button', { name: /Yes, withdraw claim/i })
      expect(confirmBtn).toHaveClass('min-h-[44px]')
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(mockCancelClaim).toHaveBeenCalledWith({
          claimId: CLAIM_ID,
          personId: PERSON_ID,
        })
      })
    })
  })

  /* ======================================================================
   * 2. RECORD VERIFICATION BADGES & REQUESTS (Screens 04, 15)
   * ====================================================================== */
  describe('Record Verification Badges & Requests', () => {
    it('renders VerificationBadge with proper styles for all statuses', () => {
      const { unmount: u1 } = renderWithProviders(<VerificationBadge status="VERIFIED" />)
      expect(screen.getByTestId('verification-badge-verified')).toHaveTextContent('Verified')
      u1()

      const { unmount: u2 } = renderWithProviders(<VerificationBadge status="PENDING" />)
      expect(screen.getByTestId('verification-badge-pending')).toHaveTextContent('Verification Pending')
      u2()

      const { unmount: u3 } = renderWithProviders(<VerificationBadge status="REJECTED" />)
      expect(screen.getByTestId('verification-badge-rejected')).toHaveTextContent('Rejected')
      u3()

      const { unmount: u4 } = renderWithProviders(<VerificationBadge status="UNVERIFIED" />)
      expect(screen.getByTestId('verification-badge-unverified')).toHaveTextContent('Unverified')
      u4()
    })

    it('renders PersonVerificationSection with request verification button for unverified living person', () => {
      renderWithProviders(
        <PersonVerificationSection person={{ ...BASE_PERSON, verification_status: 'UNVERIFIED' }} />
      )

      expect(screen.getByTestId('person-verification-section')).toBeInTheDocument()
      expect(screen.getByText('Community verification')).toBeInTheDocument()
      expect(screen.getByText(/This record is unverified/i)).toBeInTheDocument()

      const reqBtn = screen.getByRole('button', { name: /Request verification/i })
      expect(reqBtn).toBeInTheDocument()
      expect(reqBtn).toHaveClass('min-h-[44px]')
    })

    it('submits verification request via VerificationSubmitModal with touch targets', async () => {
      const onClose = vi.fn()
      renderWithProviders(
        <VerificationSubmitModal
          isOpen={true}
          onClose={onClose}
          entityType="PERSON"
          entityId={PERSON_ID}
          entityName="Dharmesh Khatri"
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Request Verification')).toBeInTheDocument()

      const notesInput = screen.getByLabelText(/Supporting notes/i)
      fireEvent.change(notesInput, { target: { value: 'Verified through community panchayat records.' } })

      const submitBtn = screen.getByRole('button', { name: /Submit request/i })
      expect(submitBtn).toHaveClass('min-h-[44px]')
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockSubmitVerification).toHaveBeenCalledWith({
          entityType: 'PERSON',
          entityId: PERSON_ID,
          supportingNotes: 'Verified through community panchayat records.',
        })
      })
    })
  })

  /* ======================================================================
   * 3. DUPLICATE DETECTION & REVIEW (DETECT != MERGE)
   * ====================================================================== */
  describe('Duplicate Detection & Review (DETECT != MERGE)', () => {
    it('shows duplicate warning banner only to authorized moderators, hidden for regular members', () => {
      // Mock candidate return
      vi.spyOn(useDuplicateHook, 'usePersonDuplicateCandidates').mockReturnValue({
        data: [
          {
            targetRecordId: PERSON_ID,
            candidate: {
              ...BASE_PERSON,
              id: '99999999-9999-4999-8999-999999999999',
              first_name: 'Dharmesh',
              last_name: 'Khatri',
              date_of_birth: '1988-04-12',
              birth_place: 'Bhuj',
            },
            confidence: 'STRONG',
            score: 95,
            matchSignals: ['Exact Name Match', 'Matching Birth Date', 'Matching Gotra'],
            differingSignals: [],
          },
        ],
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useDuplicateHook.usePersonDuplicateCandidates>)

      // 1. Regular MEMBER — should NOT see banner (privacy preserved)
      const { unmount } = renderWithProviders(<PersonDuplicateWarningBanner person={BASE_PERSON} />)
      expect(screen.queryByTestId('person-duplicate-warning-banner')).toBeNull()
      unmount()

      // 2. COMMUNITY_MODERATOR — SHOULD see banner
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: { id: CALLER_USER_ID } as unknown as User,
        profile: {
          id: CALLER_USER_ID,
          role: 'COMMUNITY_MODERATOR',
          display_name: 'Moderator User',
        } as unknown as ProfileRow,
        session: null,
        isAuthenticated: true,
        isLoading: false,
      })

      renderWithProviders(<PersonDuplicateWarningBanner person={BASE_PERSON} />)
      const banner = screen.getByTestId('person-duplicate-warning-banner')
      expect(banner).toBeInTheDocument()
      expect(screen.getByText('Potential Duplicate Flag')).toBeInTheDocument()
      expect(screen.getByText(/1 candidate detected/i)).toBeInTheDocument()
      expect(screen.getByText(/STRONG MATCH/i)).toBeInTheDocument()
      expect(screen.getByText(/DETECT != MERGE/i)).toBeInTheDocument()

      const reviewBtn = screen.getByRole('button', { name: /Review Duplicate/i })
      expect(reviewBtn).toHaveClass('min-h-[44px]')
    })

    it('renders DuplicateReviewModal with side-by-side comparison and resolves non-destructively', async () => {
      const mockFlag: EnrichedDuplicateFlag = {
        id: 'flag-888',
        entity_type: 'PERSON',
        record_a_id: PERSON_ID,
        record_b_id: '99999999-9999-4999-8999-999999999999',
        confidence: 'STRONG',
        status: 'OPEN',
        match_reasons: ['Same First & Last Name', 'Identical Birth Year'],
        flagged_by: CALLER_USER_ID,
        flagged_at: '2026-10-15T10:00:00Z',
        resolved_by: null,
        resolved_at: null,
        resolution_notes: null,
        created_at: '2026-10-15T10:00:00Z',
        updated_at: '2026-10-15T10:00:00Z',
        recordA: BASE_PERSON,
        recordB: {
          ...BASE_PERSON,
          id: '99999999-9999-4999-8999-999999999999',
          first_name: 'Dharmesh',
          last_name: 'Khatri',
        },
      }

      const onClose = vi.fn()
      renderWithProviders(<DuplicateReviewModal isOpen={true} onClose={onClose} flag={mockFlag} />)

      expect(screen.getByTestId('duplicate-review-modal')).toBeInTheDocument()
      expect(screen.getByTestId('duplicate-record-a-card')).toBeInTheDocument()
      expect(screen.getByTestId('duplicate-record-b-card')).toBeInTheDocument()
      expect(screen.getByText(/DETECT != MERGE Guarantee:/i)).toBeInTheDocument()

      const confirmBtn = screen.getByTestId('confirm-duplicate-button')
      expect(confirmBtn).toHaveClass('min-h-[44px]')
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(mockResolveDuplicate).toHaveBeenCalledWith({
          flagId: 'flag-888',
          resolution: 'CONFIRMED_DUPLICATE',
          resolutionNotes: undefined,
        })
      })
    })
  })

  /* ======================================================================
   * 4. TRILINGUAL LOCALIZATION (English, Hindi, Gujarati)
   * ====================================================================== */
  describe('Trilingual Localization Support (en, hi, gu)', () => {
    it('renders claim and verification in Hindi', () => {
      renderWithProviders(<PersonClaimSection person={BASE_PERSON} />, 'hi')
      expect(screen.getByText('क्या यह आपका जनगणना रिकॉर्ड है?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /रिकॉर्ड का दावा करें/i })).toBeInTheDocument()

      const { unmount } = renderWithProviders(<VerificationBadge status="VERIFIED" />, 'hi')
      expect(screen.getByText('सत्यापित')).toBeInTheDocument()
      unmount()
    })

    it('renders claim and verification in Gujarati', () => {
      renderWithProviders(<PersonClaimSection person={BASE_PERSON} />, 'gu')
      expect(screen.getByText('શું આ તમારો વસ્તી ગણતરી રેકોર્ડ છે?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /રેકોર્ડનો દાવો કરો/i })).toBeInTheDocument()

      const { unmount } = renderWithProviders(<VerificationBadge status="VERIFIED" />, 'gu')
      expect(screen.getByText('ચકાસાયેલ')).toBeInTheDocument()
      unmount()
    })
  })
})
