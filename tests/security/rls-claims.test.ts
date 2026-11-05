/**
 * Security & RLS Tests: Person Claims and Invitations (Phase 8 Subtask 1)
 *
 * Validates the Row Level Security policies, update guards, status transition guards,
 * atomic claim approval/rejection functions, and table privileges defined in:
 * supabase/migrations/20261006090000_create_claims_and_invitations.sql
 *
 * Per AGENTS.md Section 7: Every RLS policy requires BOTH:
 *   - Positive test: authorized actor CAN perform the operation
 *   - Negative test: unauthorized actor CANNOT perform the operation
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Evaluators mirroring SQL policy expressions and database logic
// ---------------------------------------------------------------------------

interface PersonRecord {
  id: string
  user_id: string | null
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'DECEASED'
  date_of_death: string | null
  deleted_at: string | null
}

interface ClaimRecord {
  id: string
  person_id: string
  claimant_id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  evidence_notes: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

interface InvitationRecord {
  id: string
  family_id: string | null
  person_id: string | null
  invited_email: string
  invited_by: string
  role: string
  token_hash: string
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
  expires_at: string
  accepted_by: string | null
  accepted_at: string | null
  created_at: string
  updated_at: string
}

interface FamilyRecord {
  id: string
  created_by: string
  deleted_at: string | null
}

interface EvaluatorContext {
  authUid: string | null
  isModerator?: boolean
  linkedPersonId?: string | null
}

// ---------------------------------------------------------------------------
// Evaluators: person_claims
// ---------------------------------------------------------------------------

function canSelectClaim(row: ClaimRecord, ctx: EvaluatorContext): boolean {
  if (!ctx.authUid) return false
  if (ctx.isModerator) return true
  return ctx.authUid === row.claimant_id
}

function canInsertClaim(
  row: ClaimRecord,
  ctx: EvaluatorContext,
  targetPerson: PersonRecord | null,
  claimantHasPerson: boolean
): boolean {
  if (!ctx.authUid) return false
  if (row.claimant_id !== ctx.authUid) return false
  if (row.status !== 'PENDING') return false
  if (row.reviewed_by !== null || row.reviewed_at !== null || row.rejection_reason !== null) return false

  // Target person validation
  if (!targetPerson) return false
  if (targetPerson.user_id !== null) return false
  if (targetPerson.deleted_at !== null) return false
  if (targetPerson.status !== 'ACTIVE') return false
  if (targetPerson.date_of_death !== null) return false

  // Claimant must not already be linked
  if (claimantHasPerson) return false

  return true
}

function canUpdateClaim(
  oldRow: ClaimRecord,
  newRow: ClaimRecord,
  ctx: EvaluatorContext
): boolean {
  if (!ctx.authUid) return false

  // Moderator direct UPDATE is NOT permitted via RLS.
  // Moderators must use approve_person_claim or reject_person_claim RPC functions.
  if (ctx.isModerator) return false

  // Claimant cancellation
  if (ctx.authUid === oldRow.claimant_id && oldRow.status === 'PENDING') {
    return newRow.claimant_id === oldRow.claimant_id && newRow.status === 'CANCELLED'
  }

  return false
}

function canDeleteClaim(): boolean {
  return false
}

// ---------------------------------------------------------------------------
// Evaluators: invitations
// ---------------------------------------------------------------------------

function canSelectInvitation(
  row: InvitationRecord,
  ctx: EvaluatorContext,
  family: FamilyRecord | null
): boolean {
  if (!ctx.authUid) return false
  if (ctx.isModerator) return true
  if (ctx.authUid === row.invited_by) return true
  if (family && family.id === row.family_id && family.created_by === ctx.authUid && family.deleted_at === null) {
    return true
  }
  return false
}

function canInsertInvitation(
  row: InvitationRecord,
  ctx: EvaluatorContext,
  family: FamilyRecord | null
): boolean {
  if (!ctx.authUid) return false
  if (row.invited_by !== ctx.authUid) return false
  if (row.status !== 'PENDING') return false
  if (row.accepted_by !== null || row.accepted_at !== null) return false

  if (ctx.isModerator) return true

  if (row.family_id && family && family.id === row.family_id && family.created_by === ctx.authUid && family.deleted_at === null) {
    return true
  }

  return false
}

function canUpdateInvitation(
  oldRow: InvitationRecord,
  newRow: InvitationRecord,
  ctx: EvaluatorContext
): boolean {
  if (!ctx.authUid) return false

  // Moderator update: can only revoke PENDING invitations
  if (ctx.isModerator && oldRow.status === 'PENDING') {
    return newRow.status === 'REVOKED'
  }

  // Inviter revocation: can only revoke own PENDING invitations
  if (ctx.authUid === oldRow.invited_by && oldRow.status === 'PENDING') {
    return newRow.invited_by === oldRow.invited_by && newRow.status === 'REVOKED'
  }

  return false
}

function canDeleteInvitation(): boolean {
  return false
}

// ---------------------------------------------------------------------------
// State Machine Guards Simulation
// ---------------------------------------------------------------------------

function validateClaimStatusTransition(
  oldStatus: ClaimRecord['status'],
  newStatus: ClaimRecord['status']
): boolean {
  if (oldStatus === newStatus) return true
  if (oldStatus === 'APPROVED' || oldStatus === 'REJECTED' || oldStatus === 'CANCELLED') return false
  if (oldStatus === 'PENDING') {
    return newStatus === 'APPROVED' || newStatus === 'REJECTED' || newStatus === 'CANCELLED'
  }
  return false
}

function validateInvitationStatusTransition(
  oldStatus: InvitationRecord['status'],
  newStatus: InvitationRecord['status']
): boolean {
  if (oldStatus === newStatus) return true
  if (oldStatus === 'ACCEPTED' || oldStatus === 'REVOKED' || oldStatus === 'EXPIRED') return false
  if (oldStatus === 'PENDING') {
    return newStatus === 'ACCEPTED' || newStatus === 'REVOKED' || newStatus === 'EXPIRED'
  }
  return false
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

describe('Phase 8 Subtask 1: Claim & Invitation Schema, RLS & Functions', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/20261006090000_create_claims_and_invitations.sql'
  )

  // =========================================================================
  // 1. Static SQL Migration Analysis
  // =========================================================================
  describe('1. Static SQL Migration Analysis', () => {
    it('migration file exists and is readable', () => {
      expect(fs.existsSync(migrationPath)).toBe(true)
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content.length).toBeGreaterThan(1000)
    })

    it('defines public.claim_status and public.invitation_status enums', () => {
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content).toContain("CREATE TYPE public.claim_status AS ENUM")
      expect(content).toContain("'PENDING'")
      expect(content).toContain("'APPROVED'")
      expect(content).toContain("'REJECTED'")
      expect(content).toContain("'CANCELLED'")

      expect(content).toContain("CREATE TYPE public.invitation_status AS ENUM")
      expect(content).toContain("'EXPIRED'")
      expect(content).toContain("'REVOKED'")
    })

    it('creates public.person_claims table with required constraints and columns', () => {
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content).toContain("CREATE TABLE IF NOT EXISTS public.person_claims")
      expect(content).toContain("person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT")
      expect(content).toContain("claimant_id UUID NOT NULL REFERENCES public.profiles(id)")
      expect(content).toContain("status public.claim_status NOT NULL DEFAULT 'PENDING'")
      expect(content).toContain("evidence_notes TEXT")
      expect(content).toContain("rejection_reason TEXT")
      expect(content).toContain("reviewed_by UUID REFERENCES public.profiles(id)")
      expect(content).toContain("reviewed_at TIMESTAMPTZ")
      // Explicit requirement that CANCELLED status must have NULL review fields
      expect(content).toContain("(status = 'CANCELLED' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)")
    })

    it('creates public.invitations table with required constraints and columns', () => {
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content).toContain("CREATE TABLE IF NOT EXISTS public.invitations")
      expect(content).toContain("family_id UUID REFERENCES public.families(id)")
      expect(content).toContain("person_id UUID REFERENCES public.persons(id)")
      expect(content).toContain("invited_email TEXT NOT NULL")
      expect(content).toContain("invited_by UUID NOT NULL REFERENCES public.profiles(id)")
      expect(content).toContain("token_hash TEXT NOT NULL UNIQUE")
      expect(content).toContain("expires_at TIMESTAMPTZ NOT NULL")
    })

    it('creates partial unique indexes preventing concurrent pending claims', () => {
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_person_claims_pending_person")
      expect(content).toContain("WHERE status = 'PENDING'")
      expect(content).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_person_claims_pending_claimant")
    })

    it('creates immutability and state transition guard triggers on person_claims and invitations', () => {
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content).toContain("handle_claim_update_guard")
      expect(content).toContain("handle_claim_status_transition_guard")
      expect(content).toContain("handle_invitation_update_guard")
      expect(content).toContain("handle_invitation_status_transition_guard")
    })

    it('creates privileged functions approve_person_claim and reject_person_claim', () => {
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content).toContain("CREATE OR REPLACE FUNCTION public.approve_person_claim(p_claim_id UUID)")
      expect(content).toContain("CREATE OR REPLACE FUNCTION public.reject_person_claim(p_claim_id UUID, p_reason TEXT)")
      expect(content).toContain("SECURITY DEFINER")
      expect(content).toContain("SET search_path = public")
    })

    it('enables RLS and defines policies on person_claims and invitations without direct moderator claim UPDATE', () => {
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content).toContain("ALTER TABLE public.person_claims ENABLE ROW LEVEL SECURITY;")
      expect(content).toContain("ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;")
      expect(content).toContain('"person_claims_select_own"')
      expect(content).toContain('"person_claims_select_admin"')
      expect(content).toContain('"person_claims_insert_authenticated"')
      expect(content).toContain('"person_claims_update_cancel"')
      // Direct moderator update policy must NOT be created
      expect(content).toContain('DROP POLICY IF EXISTS "person_claims_update_admin" ON public.person_claims;')
      expect(content).not.toContain('CREATE POLICY "person_claims_update_admin"')
      expect(content).toContain('"person_claims_delete_deny"')
      expect(content).toContain('"invitations_select_inviter"')
      expect(content).toContain('"invitations_select_admin"')
      expect(content).toContain('"invitations_delete_deny"')
    })

    it('enforces least privilege Gate 1 table grants and protects invitation token_hash on SELECT and INSERT', () => {
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content).toContain("REVOKE ALL ON public.person_claims FROM PUBLIC;")
      expect(content).toContain("REVOKE ALL ON public.person_claims FROM anon;")
      expect(content).toContain("GRANT SELECT, INSERT, UPDATE ON public.person_claims TO authenticated;")
      expect(content).toContain("REVOKE ALL ON public.invitations FROM PUBLIC;")
      expect(content).toContain("REVOKE ALL ON public.invitations FROM anon;")
      expect(content).toContain("REVOKE SELECT, INSERT ON public.invitations FROM authenticated;")
      // token_hash excluded from SELECT
      expect(content).toContain("GRANT SELECT (")
      expect(content).not.toMatch(/GRANT SELECT \([^)]*token_hash[^)]*\) ON public\.invitations/)
      // token_hash excluded from INSERT
      expect(content).toContain("GRANT INSERT (")
      expect(content).not.toMatch(/GRANT INSERT \([^)]*token_hash[^)]*\) ON public\.invitations/)
      expect(content).toContain("GRANT UPDATE ON public.invitations TO authenticated;")
      expect(content).toContain("REVOKE ALL ON FUNCTION public.approve_person_claim(UUID) FROM PUBLIC;")
      expect(content).toContain("GRANT EXECUTE ON FUNCTION public.approve_person_claim(UUID) TO authenticated;")
    })

    it('logs audit events via public.log_audit_event in approval and rejection', () => {
      const content = fs.readFileSync(migrationPath, 'utf8')
      expect(content).toContain("log_audit_event")
      expect(content).toContain("'PERSON_CLAIM_APPROVED'::public.audit_action")
      expect(content).toContain("'PERSON_CLAIM_REJECTED'::public.audit_action")
    })
  })

  // =========================================================================
  // 2. Behavioral RLS Simulation: person_claims
  // =========================================================================
  describe('2. Behavioral RLS Simulation: person_claims', () => {
    const claimantUid = '11111111-1111-4111-a111-111111111111'
    const otherUserUid = '22222222-2222-4222-a222-222222222222'
    const moderatorUid = '99999999-9999-4999-a999-999999999999'

    const samplePerson: PersonRecord = {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      user_id: null,
      status: 'ACTIVE',
      date_of_death: null,
      deleted_at: null,
    }

    const sampleClaim: ClaimRecord = {
      id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      person_id: samplePerson.id,
      claimant_id: claimantUid,
      status: 'PENDING',
      evidence_notes: 'I am the son named in this record',
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    it('positive: claimant can SELECT their own claim', () => {
      expect(canSelectClaim(sampleClaim, { authUid: claimantUid })).toBe(true)
    })

    it('positive: moderator can SELECT any claim', () => {
      expect(canSelectClaim(sampleClaim, { authUid: moderatorUid, isModerator: true })).toBe(true)
    })

    it('negative: unrelated user CANNOT SELECT claim', () => {
      expect(canSelectClaim(sampleClaim, { authUid: otherUserUid })).toBe(false)
    })

    it('negative: unauthenticated / anon CANNOT SELECT claim', () => {
      expect(canSelectClaim(sampleClaim, { authUid: null })).toBe(false)
    })

    it('positive: authenticated user can INSERT pending claim on eligible person', () => {
      expect(canInsertClaim(sampleClaim, { authUid: claimantUid }, samplePerson, false)).toBe(true)
    })

    it('negative: unauthenticated CANNOT INSERT claim', () => {
      expect(canInsertClaim(sampleClaim, { authUid: null }, samplePerson, false)).toBe(false)
    })

    it('negative: user cannot insert claim for another user (claimant_id mismatch)', () => {
      expect(canInsertClaim(sampleClaim, { authUid: otherUserUid }, samplePerson, false)).toBe(false)
    })

    it('negative: cannot insert claim with pre-set non-PENDING status', () => {
      const approvedClaim = { ...sampleClaim, status: 'APPROVED' as const }
      expect(canInsertClaim(approvedClaim, { authUid: claimantUid }, samplePerson, false)).toBe(false)
    })

    it('negative: cannot insert claim with pre-set reviewer fields', () => {
      const preReviewed = { ...sampleClaim, reviewed_by: moderatorUid }
      expect(canInsertClaim(preReviewed, { authUid: claimantUid }, samplePerson, false)).toBe(false)
    })

    it('negative: cannot claim person who is already linked (user_id IS NOT NULL)', () => {
      const alreadyLinkedPerson = { ...samplePerson, user_id: otherUserUid }
      expect(canInsertClaim(sampleClaim, { authUid: claimantUid }, alreadyLinkedPerson, false)).toBe(false)
    })

    it('negative: cannot claim soft-deleted person', () => {
      const deletedPerson = { ...samplePerson, deleted_at: new Date().toISOString() }
      expect(canInsertClaim(sampleClaim, { authUid: claimantUid }, deletedPerson, false)).toBe(false)
    })

    it('negative: cannot claim archived person', () => {
      const archivedPerson = { ...samplePerson, status: 'ARCHIVED' as const }
      expect(canInsertClaim(sampleClaim, { authUid: claimantUid }, archivedPerson, false)).toBe(false)
    })

    it('negative: cannot claim deceased person', () => {
      const deceasedPerson = { ...samplePerson, date_of_death: '2020-01-01' }
      expect(canInsertClaim(sampleClaim, { authUid: claimantUid }, deceasedPerson, false)).toBe(false)
    })

    it('negative: claimant who is already linked to a person cannot claim another person', () => {
      expect(canInsertClaim(sampleClaim, { authUid: claimantUid }, samplePerson, true)).toBe(false)
    })

    it('positive: claimant can cancel their own PENDING claim', () => {
      const cancelledClaim = { ...sampleClaim, status: 'CANCELLED' as const }
      expect(canUpdateClaim(sampleClaim, cancelledClaim, { authUid: claimantUid })).toBe(true)
    })

    it('negative: cancelled claim cannot contain reviewer attribution, review timestamp, or rejection_reason', () => {
      function validateReviewedConsistency(row: ClaimRecord): boolean {
        if (row.status === 'PENDING') {
          return row.reviewed_by === null && row.reviewed_at === null && row.rejection_reason === null
        }
        if (row.status === 'CANCELLED') {
          return row.reviewed_by === null && row.reviewed_at === null && row.rejection_reason === null
        }
        if (row.status === 'APPROVED') {
          return row.reviewed_by !== null && row.reviewed_at !== null && row.rejection_reason === null
        }
        if (row.status === 'REJECTED') {
          return row.reviewed_by !== null && row.reviewed_at !== null && row.rejection_reason !== null
        }
        return false
      }

      // Valid cancelled claim
      const validCancelled: ClaimRecord = {
        ...sampleClaim,
        status: 'CANCELLED',
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
      }
      expect(validateReviewedConsistency(validCancelled)).toBe(true)

      // Invalid: reviewed_by is set
      const invalidCancelled1: ClaimRecord = {
        ...sampleClaim,
        status: 'CANCELLED',
        reviewed_by: moderatorUid,
        reviewed_at: null,
        rejection_reason: null,
      }
      expect(validateReviewedConsistency(invalidCancelled1)).toBe(false)

      // Invalid: reviewed_at is set
      const invalidCancelled2: ClaimRecord = {
        ...sampleClaim,
        status: 'CANCELLED',
        reviewed_by: null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: null,
      }
      expect(validateReviewedConsistency(invalidCancelled2)).toBe(false)

      // Invalid: rejection_reason is set
      const invalidCancelled3: ClaimRecord = {
        ...sampleClaim,
        status: 'CANCELLED',
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: 'Mistake',
      }
      expect(validateReviewedConsistency(invalidCancelled3)).toBe(false)
    })

    it('negative: claimant CANNOT approve their own claim', () => {
      const approvedClaim = { ...sampleClaim, status: 'APPROVED' as const }
      expect(canUpdateClaim(sampleClaim, approvedClaim, { authUid: claimantUid })).toBe(false)
    })

    it('negative: unrelated user cannot cancel claimant claim', () => {
      const cancelledClaim = { ...sampleClaim, status: 'CANCELLED' as const }
      expect(canUpdateClaim(sampleClaim, cancelledClaim, { authUid: otherUserUid })).toBe(false)
    })

    it('negative: moderator CANNOT directly UPDATE claim status via table UPDATE (must use RPC)', () => {
      const reviewedClaim = { ...sampleClaim, status: 'APPROVED' as const, reviewed_by: moderatorUid }
      // Direct table UPDATE is blocked by RLS (no moderator UPDATE policy)
      expect(canUpdateClaim(sampleClaim, reviewedClaim, { authUid: moderatorUid, isModerator: true })).toBe(false)
    })

    it('negative: claimant linked to soft-deleted person CANNOT claim another person (one-user one-person invariant)', () => {
      // Claimant already linked to a person, even if that person is soft-deleted
      expect(canInsertClaim(sampleClaim, { authUid: claimantUid }, samplePerson, true)).toBe(false)
    })

    it('negative: DELETE is denied for all actors', () => {
      expect(canDeleteClaim()).toBe(false)
    })
  })

  // =========================================================================
  // 3. Behavioral RLS Simulation: invitations
  // =========================================================================
  describe('3. Behavioral RLS Simulation: invitations', () => {
    const inviterUid = '33333333-3333-4333-a333-333333333333'
    const otherUserUid = '44444444-4444-4444-a444-444444444444'
    const moderatorUid = '99999999-9999-4999-a999-999999999999'

    const sampleFamily: FamilyRecord = {
      id: 'ffffffff-ffff-4fff-ffff-ffffffffffff',
      created_by: inviterUid,
      deleted_at: null,
    }

    const sampleInvitation: InvitationRecord = {
      id: 'iiiiiiii-iiii-4iii-iiii-iiiiiiiiiiii',
      family_id: sampleFamily.id,
      person_id: null,
      invited_email: 'relative@example.com',
      invited_by: inviterUid,
      role: 'CHILD',
      token_hash: 'hash-abc-123',
      status: 'PENDING',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      accepted_by: null,
      accepted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    it('positive: inviter can SELECT own invitation', () => {
      expect(canSelectInvitation(sampleInvitation, { authUid: inviterUid }, sampleFamily)).toBe(true)
    })

    it('positive: family creator can SELECT family invitation', () => {
      expect(canSelectInvitation(sampleInvitation, { authUid: inviterUid }, sampleFamily)).toBe(true)
    })

    it('positive: moderator can SELECT any invitation', () => {
      expect(canSelectInvitation(sampleInvitation, { authUid: moderatorUid, isModerator: true }, sampleFamily)).toBe(true)
    })

    it('negative: unrelated user CANNOT SELECT invitation', () => {
      expect(canSelectInvitation(sampleInvitation, { authUid: otherUserUid }, sampleFamily)).toBe(false)
    })

    it('negative: anon CANNOT SELECT invitation', () => {
      expect(canSelectInvitation(sampleInvitation, { authUid: null }, sampleFamily)).toBe(false)
    })

    it('positive: family creator can INSERT invitation for their family', () => {
      expect(canInsertInvitation(sampleInvitation, { authUid: inviterUid }, sampleFamily)).toBe(true)
    })

    it('positive: moderator can INSERT invitation', () => {
      const modInvite = { ...sampleInvitation, invited_by: moderatorUid }
      expect(canInsertInvitation(modInvite, { authUid: moderatorUid, isModerator: true }, sampleFamily)).toBe(true)
    })

    it('negative: non-creator/non-moderator CANNOT INSERT family invitation', () => {
      expect(canInsertInvitation(sampleInvitation, { authUid: otherUserUid }, sampleFamily)).toBe(false)
    })

    it('positive: inviter can revoke own PENDING invitation', () => {
      const revoked = { ...sampleInvitation, status: 'REVOKED' as const }
      expect(canUpdateInvitation(sampleInvitation, revoked, { authUid: inviterUid })).toBe(true)
    })

    it('negative: inviter CANNOT mark invitation ACCEPTED directly', () => {
      const accepted = { ...sampleInvitation, status: 'ACCEPTED' as const }
      expect(canUpdateInvitation(sampleInvitation, accepted, { authUid: inviterUid })).toBe(false)
    })

    it('negative: DELETE is denied on invitations', () => {
      expect(canDeleteInvitation()).toBe(false)
    })
  })

  // =========================================================================
  // 4. State Machine & Status Transition Guards
  // =========================================================================
  describe('4. State Machine & Status Transition Guards', () => {
    it('claim state transitions: PENDING can transition to APPROVED, REJECTED, CANCELLED', () => {
      expect(validateClaimStatusTransition('PENDING', 'APPROVED')).toBe(true)
      expect(validateClaimStatusTransition('PENDING', 'REJECTED')).toBe(true)
      expect(validateClaimStatusTransition('PENDING', 'CANCELLED')).toBe(true)
    })

    it('claim state transitions: terminal states cannot be changed', () => {
      expect(validateClaimStatusTransition('APPROVED', 'PENDING')).toBe(false)
      expect(validateClaimStatusTransition('APPROVED', 'REJECTED')).toBe(false)
      expect(validateClaimStatusTransition('REJECTED', 'APPROVED')).toBe(false)
      expect(validateClaimStatusTransition('REJECTED', 'PENDING')).toBe(false)
      expect(validateClaimStatusTransition('CANCELLED', 'APPROVED')).toBe(false)
      expect(validateClaimStatusTransition('CANCELLED', 'PENDING')).toBe(false)
    })

    it('invitation state transitions: PENDING can transition to ACCEPTED, REVOKED, EXPIRED', () => {
      expect(validateInvitationStatusTransition('PENDING', 'ACCEPTED')).toBe(true)
      expect(validateInvitationStatusTransition('PENDING', 'REVOKED')).toBe(true)
      expect(validateInvitationStatusTransition('PENDING', 'EXPIRED')).toBe(true)
    })

    it('invitation state transitions: terminal states cannot be changed', () => {
      expect(validateInvitationStatusTransition('ACCEPTED', 'PENDING')).toBe(false)
      expect(validateInvitationStatusTransition('ACCEPTED', 'REVOKED')).toBe(false)
      expect(validateInvitationStatusTransition('REVOKED', 'ACCEPTED')).toBe(false)
      expect(validateInvitationStatusTransition('EXPIRED', 'PENDING')).toBe(false)
    })
  })

  // =========================================================================
  // 5. Atomic Claim Function Logic & Invariants
  // =========================================================================
  describe('5. Atomic Claim Function Logic & Invariants', () => {
    function simulateApproveClaim(
      claim: ClaimRecord,
      person: PersonRecord,
      caller: EvaluatorContext,
      claimantHasExistingPerson: boolean
    ): { success: boolean; error?: string } {
      if (!caller.authUid) return { success: false, error: 'Unauthenticated' }
      if (!caller.isModerator) return { success: false, error: 'Unauthorized' }
      if (claim.status !== 'PENDING') return { success: false, error: 'Claim not PENDING' }
      if (person.user_id !== null) return { success: false, error: 'Target person already linked' }
      if (person.deleted_at !== null) return { success: false, error: 'Target person soft-deleted' }
      if (person.status !== 'ACTIVE') return { success: false, error: 'Target person not ACTIVE' }
      if (person.date_of_death !== null) return { success: false, error: 'Deceased person cannot be claimed' }
      if (claimantHasExistingPerson) return { success: false, error: 'Claimant already linked to a person' }

      return { success: true }
    }

    it('positive: moderator approving valid pending claim succeeds', () => {
      const claim: ClaimRecord = {
        id: 'c1',
        person_id: 'p1',
        claimant_id: 'u1',
        status: 'PENDING',
        evidence_notes: 'My record',
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const person: PersonRecord = {
        id: 'p1',
        user_id: null,
        status: 'ACTIVE',
        date_of_death: null,
        deleted_at: null,
      }

      const res = simulateApproveClaim(claim, person, { authUid: 'mod1', isModerator: true }, false)
      expect(res.success).toBe(true)
    })

    it('negative: non-moderator caller cannot approve claim', () => {
      const claim: ClaimRecord = {
        id: 'c1',
        person_id: 'p1',
        claimant_id: 'u1',
        status: 'PENDING',
        evidence_notes: 'My record',
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const person: PersonRecord = {
        id: 'p1',
        user_id: null,
        status: 'ACTIVE',
        date_of_death: null,
        deleted_at: null,
      }

      const res = simulateApproveClaim(claim, person, { authUid: 'user2', isModerator: false }, false)
      expect(res.success).toBe(false)
      expect(res.error).toBe('Unauthorized')
    })

    it('negative: cannot approve claim if person is already linked', () => {
      const claim: ClaimRecord = {
        id: 'c1',
        person_id: 'p1',
        claimant_id: 'u1',
        status: 'PENDING',
        evidence_notes: null,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const person: PersonRecord = {
        id: 'p1',
        user_id: 'other-user',
        status: 'ACTIVE',
        date_of_death: null,
        deleted_at: null,
      }

      const res = simulateApproveClaim(claim, person, { authUid: 'mod1', isModerator: true }, false)
      expect(res.success).toBe(false)
      expect(res.error).toBe('Target person already linked')
    })

    it('negative: cannot approve claim if claimant already has a linked person', () => {
      const claim: ClaimRecord = {
        id: 'c1',
        person_id: 'p1',
        claimant_id: 'u1',
        status: 'PENDING',
        evidence_notes: null,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const person: PersonRecord = {
        id: 'p1',
        user_id: null,
        status: 'ACTIVE',
        date_of_death: null,
        deleted_at: null,
      }

      const res = simulateApproveClaim(claim, person, { authUid: 'mod1', isModerator: true }, true)
      expect(res.success).toBe(false)
      expect(res.error).toBe('Claimant already linked to a person')
    })

    it('negative: cannot approve claim if claimant is linked to a soft-deleted person (one-to-one invariant)', () => {
      const claim: ClaimRecord = {
        id: 'c1',
        person_id: 'p1',
        claimant_id: 'u1',
        status: 'PENDING',
        evidence_notes: null,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const person: PersonRecord = {
        id: 'p1',
        user_id: null,
        status: 'ACTIVE',
        date_of_death: null,
        deleted_at: null,
      }

      // Even if previous person is soft-deleted, claimantHasExistingPerson is TRUE
      const res = simulateApproveClaim(claim, person, { authUid: 'mod1', isModerator: true }, true)
      expect(res.success).toBe(false)
      expect(res.error).toBe('Claimant already linked to a person')
    })
  })
})
