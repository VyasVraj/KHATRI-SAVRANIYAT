/**
 * Security Tests: RLS Policies, Protected Fields & Privilege Model — Relationships Table
 *
 * Tests the Row Level Security policies, update guard trigger, and database access controls defined in:
 * supabase/migrations/20261004150000_create_relationships.sql
 *
 * Per AGENTS.md Section 7: Every RLS policy requires BOTH:
 *   - Positive test: authorized user CAN perform the operation
 *   - Negative test: unauthorized user CANNOT perform the operation
 *
 * These static specification tests validate:
 * 1. Policy logic specification tests (evaluator mirroring SQL USING / WITH CHECK expressions)
 * 2. Update guard trigger logic (evaluator mirroring handle_relationship_update_guard)
 * 3. Dual-endpoint privacy cases (Cases 1 through 8 per Phase 5 specs)
 * 4. Static SQL migration validation (privilege grants, revokes, constraints, indexes, RLS enablement)
 *
 * Live end-to-end integration tests against a populated test database are deferred
 * to Phase 15 (Hardening) per AGENTS.md.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Evaluator functions mirroring SQL policy USING and WITH CHECK expressions
// ---------------------------------------------------------------------------

interface PolicyContext {
  authUid: string | null
  isModerator?: boolean
  canViewPersonA?: boolean
  canViewPersonB?: boolean
  relationship: {
    id?: string
    person_a_id: string
    person_b_id: string
    relationship_type: 'PARENT' | 'SPOUSE' | 'SIBLING'
    notes?: string | null
    verification_status?: 'UNVERIFIED' | 'COMMUNITY_VERIFIED' | 'OFFICIALLY_VERIFIED'
    created_by: string | null
    created_at?: string
    deleted_at: string | null
  }
  newRelationship?: {
    id?: string
    person_a_id?: string
    person_b_id?: string
    relationship_type?: 'PARENT' | 'SPOUSE' | 'SIBLING'
    notes?: string | null
    verification_status?: 'UNVERIFIED' | 'COMMUNITY_VERIFIED' | 'OFFICIALLY_VERIFIED'
    created_by?: string | null
    created_at?: string
    deleted_at?: string | null
  }
}

/**
 * Policy: relationships_select_dual_endpoint
 * USING (
 *   deleted_at IS NULL
 *   AND EXISTS (SELECT 1 FROM public.persons pa WHERE pa.id = relationships.person_a_id)
 *   AND EXISTS (SELECT 1 FROM public.persons pb WHERE pb.id = relationships.person_b_id)
 * )
 */
function evaluateRelationshipsSelectDualEndpoint(ctx: PolicyContext): boolean {
  if (ctx.relationship.deleted_at !== null) return false
  return Boolean(ctx.canViewPersonA && ctx.canViewPersonB)
}

/**
 * Policy: relationships_select_admin
 * USING (public.is_community_moderator())
 */
function evaluateRelationshipsSelectAdmin(ctx: PolicyContext): boolean {
  return Boolean(ctx.isModerator)
}

/**
 * Policy: relationships_insert_authenticated
 * WITH CHECK (
 *   auth.uid() IS NOT NULL
 *   AND created_by = auth.uid()
 *   AND EXISTS (SELECT 1 FROM public.persons pa WHERE pa.id = relationships.person_a_id)
 *   AND EXISTS (SELECT 1 FROM public.persons pb WHERE pb.id = relationships.person_b_id)
 * )
 */
function evaluateRelationshipsInsertAuthenticated(ctx: PolicyContext): boolean {
  if (!ctx.authUid) return false
  if (ctx.relationship.created_by !== ctx.authUid) return false
  return Boolean(ctx.canViewPersonA && ctx.canViewPersonB)
}

/**
 * Policy: relationships_insert_admin
 * WITH CHECK (
 *   public.is_community_moderator()
 *   AND created_by = auth.uid()
 * )
 */
function evaluateRelationshipsInsertAdmin(ctx: PolicyContext): boolean {
  if (!ctx.isModerator) return false
  if (!ctx.authUid) return false
  if (ctx.relationship.created_by !== ctx.authUid) return false
  return true
}

/**
 * Policy: relationships_update_creator
 * USING (auth.uid() = created_by AND deleted_at IS NULL)
 * WITH CHECK (auth.uid() = created_by AND deleted_at IS NULL)
 */
function evaluateRelationshipsUpdateCreator(ctx: PolicyContext): boolean {
  if (!ctx.authUid) return false
  if (ctx.relationship.created_by !== ctx.authUid) return false
  if (ctx.relationship.deleted_at !== null) return false
  const newRow = ctx.newRelationship ?? ctx.relationship
  if (newRow.created_by !== ctx.authUid) return false
  if (newRow.deleted_at !== null) return false
  return true
}

/**
 * Policy: relationships_soft_delete_creator
 * USING (auth.uid() = created_by AND deleted_at IS NULL)
 * WITH CHECK (auth.uid() = created_by AND deleted_at IS NOT NULL)
 */
function evaluateRelationshipsSoftDeleteCreator(ctx: PolicyContext): boolean {
  if (!ctx.authUid) return false
  if (ctx.relationship.created_by !== ctx.authUid) return false
  if (ctx.relationship.deleted_at !== null) return false
  const newRow = ctx.newRelationship ?? {
    ...ctx.relationship,
    deleted_at: '2026-10-04T12:00:00Z',
  }
  if (newRow.created_by !== ctx.authUid) return false
  if (newRow.deleted_at === null || newRow.deleted_at === undefined) return false
  return true
}

/**
 * Policy: relationships_update_admin
 * USING (public.is_community_moderator())
 */
function evaluateRelationshipsUpdateAdmin(ctx: PolicyContext): boolean {
  return Boolean(ctx.isModerator)
}

/**
 * Policy: relationships_delete_deny
 * USING (FALSE)
 */
function evaluateRelationshipsDeleteDeny(): boolean {
  return false
}

/**
 * Trigger Function: handle_relationship_update_guard()
 * Enforces database-level immutability for protected fields and verification_status
 */
interface UpdateGuardRow {
  id: string
  person_a_id: string
  person_b_id: string
  relationship_type: 'PARENT' | 'SPOUSE' | 'SIBLING'
  notes?: string | null
  verification_status: 'UNVERIFIED' | 'COMMUNITY_VERIFIED' | 'OFFICIALLY_VERIFIED'
  created_by: string | null
  created_at: string
  deleted_at: string | null
}

function evaluateRelationshipUpdateGuard(
  oldRow: UpdateGuardRow,
  newRow: UpdateGuardRow,
  isModerator: boolean
): { allowed: boolean; error?: string } {
  if (isModerator) {
    return { allowed: true }
  }

  if (oldRow.id !== newRow.id) {
    return { allowed: false, error: 'Cannot modify relationship id' }
  }
  if (oldRow.person_a_id !== newRow.person_a_id || oldRow.person_b_id !== newRow.person_b_id) {
    return { allowed: false, error: 'Cannot modify relationship endpoints' }
  }
  if (oldRow.relationship_type !== newRow.relationship_type) {
    return { allowed: false, error: 'Cannot modify relationship_type' }
  }
  if (oldRow.created_by !== newRow.created_by) {
    return { allowed: false, error: 'Cannot modify created_by' }
  }
  if (oldRow.created_at !== newRow.created_at) {
    return { allowed: false, error: 'Cannot modify created_at' }
  }
  if (oldRow.verification_status !== newRow.verification_status) {
    return { allowed: false, error: 'Cannot modify verification_status' }
  }
  if (oldRow.deleted_at !== null) {
    return { allowed: false, error: 'Cannot modify an already soft-deleted relationship' }
  }
  if (newRow.deleted_at !== null) {
    if ((oldRow.notes ?? null) !== (newRow.notes ?? null)) {
      return { allowed: false, error: 'Cannot alter notes during soft-deletion' }
    }
  }

  return { allowed: true }
}

// ---------------------------------------------------------------------------
// 1. Policy Logic Specification Tests
// ---------------------------------------------------------------------------

describe('RLS Policy Specification: public.relationships', () => {
  const ALICE_UID = '00000000-0000-0000-0000-000000000001'
  const BOB_UID = '00000000-0000-0000-0000-000000000002'

  const BASE_RELATIONSHIP = {
    id: '55555555-5555-5555-5555-555555555555',
    person_a_id: '11111111-1111-1111-1111-111111111111',
    person_b_id: '22222222-2222-2222-2222-222222222222',
    relationship_type: 'PARENT' as const,
    notes: 'Father and son',
    verification_status: 'UNVERIFIED' as const,
    created_by: ALICE_UID,
    created_at: '2026-10-04T12:00:00Z',
    deleted_at: null,
  }

  // -------------------------------------------------------------------------
  // SELECT: relationships_select_dual_endpoint
  // -------------------------------------------------------------------------
  describe('SELECT: relationships_select_dual_endpoint', () => {
    it('POSITIVE: allows viewing when caller can view BOTH endpoint persons', () => {
      const allowed = evaluateRelationshipsSelectDualEndpoint({
        authUid: ALICE_UID,
        canViewPersonA: true,
        canViewPersonB: true,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(true)
    })

    it('NEGATIVE: denies viewing when caller cannot view person A', () => {
      const allowed = evaluateRelationshipsSelectDualEndpoint({
        authUid: ALICE_UID,
        canViewPersonA: false,
        canViewPersonB: true,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies viewing when caller cannot view person B', () => {
      const allowed = evaluateRelationshipsSelectDualEndpoint({
        authUid: ALICE_UID,
        canViewPersonA: true,
        canViewPersonB: false,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies viewing when relationship is soft-deleted', () => {
      const allowed = evaluateRelationshipsSelectDualEndpoint({
        authUid: ALICE_UID,
        canViewPersonA: true,
        canViewPersonB: true,
        relationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: '2026-10-04T12:00:00Z',
        },
      })
      expect(allowed).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // SELECT: relationships_select_admin
  // -------------------------------------------------------------------------
  describe('SELECT: relationships_select_admin', () => {
    it('POSITIVE: allows moderator to view even soft-deleted relationships', () => {
      const allowed = evaluateRelationshipsSelectAdmin({
        authUid: BOB_UID,
        isModerator: true,
        relationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: '2026-10-04T12:00:00Z',
        },
      })
      expect(allowed).toBe(true)
    })

    it('NEGATIVE: denies non-moderator from using admin select policy', () => {
      const allowed = evaluateRelationshipsSelectAdmin({
        authUid: ALICE_UID,
        isModerator: false,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // INSERT: relationships_insert_authenticated
  // -------------------------------------------------------------------------
  describe('INSERT: relationships_insert_authenticated', () => {
    it('POSITIVE: allows authenticated user to insert when created_by matches and can view both endpoints', () => {
      const allowed = evaluateRelationshipsInsertAuthenticated({
        authUid: ALICE_UID,
        canViewPersonA: true,
        canViewPersonB: true,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(true)
    })

    it('NEGATIVE: denies unauthenticated user (auth.uid() IS NULL)', () => {
      const allowed = evaluateRelationshipsInsertAuthenticated({
        authUid: null,
        canViewPersonA: true,
        canViewPersonB: true,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies when created_by does not match auth.uid() (actor spoofing)', () => {
      const allowed = evaluateRelationshipsInsertAuthenticated({
        authUid: BOB_UID,
        canViewPersonA: true,
        canViewPersonB: true,
        relationship: BASE_RELATIONSHIP, // created_by is ALICE_UID
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies insert when caller cannot view person A', () => {
      const allowed = evaluateRelationshipsInsertAuthenticated({
        authUid: ALICE_UID,
        canViewPersonA: false,
        canViewPersonB: true,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies insert when caller cannot view person B', () => {
      const allowed = evaluateRelationshipsInsertAuthenticated({
        authUid: ALICE_UID,
        canViewPersonA: true,
        canViewPersonB: false,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // INSERT: relationships_insert_admin
  // -------------------------------------------------------------------------
  describe('INSERT: relationships_insert_admin', () => {
    it('POSITIVE: allows moderator to insert relationship when created_by matches auth.uid()', () => {
      const allowed = evaluateRelationshipsInsertAdmin({
        authUid: BOB_UID,
        isModerator: true,
        relationship: {
          ...BASE_RELATIONSHIP,
          created_by: BOB_UID,
        },
      })
      expect(allowed).toBe(true)
    })

    it('NEGATIVE: denies moderator from inserting relationship when created_by is spoofed (does not match auth.uid())', () => {
      const allowed = evaluateRelationshipsInsertAdmin({
        authUid: BOB_UID,
        isModerator: true,
        relationship: {
          ...BASE_RELATIONSHIP,
          created_by: ALICE_UID, // Spoofed creator
        },
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies non-moderator from using admin insert policy', () => {
      const allowed = evaluateRelationshipsInsertAdmin({
        authUid: ALICE_UID,
        isModerator: false,
        relationship: {
          ...BASE_RELATIONSHIP,
          created_by: ALICE_UID,
        },
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies unauthenticated user from using admin insert policy', () => {
      const allowed = evaluateRelationshipsInsertAdmin({
        authUid: null,
        isModerator: true,
        relationship: {
          ...BASE_RELATIONSHIP,
          created_by: null,
        },
      })
      expect(allowed).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // UPDATE: relationships_update_creator (Active Row Updates)
  // -------------------------------------------------------------------------
  describe('UPDATE: relationships_update_creator', () => {
    it('POSITIVE: allows creator to update active relationship while remaining active', () => {
      const allowed = evaluateRelationshipsUpdateCreator({
        authUid: ALICE_UID,
        relationship: BASE_RELATIONSHIP,
        newRelationship: {
          ...BASE_RELATIONSHIP,
          notes: 'Updated notes',
          deleted_at: null,
        },
      })
      expect(allowed).toBe(true)
    })

    it('NEGATIVE: denies creator from altering created_by during update', () => {
      const allowed = evaluateRelationshipsUpdateCreator({
        authUid: ALICE_UID,
        relationship: BASE_RELATIONSHIP,
        newRelationship: {
          ...BASE_RELATIONSHIP,
          created_by: BOB_UID, // Altering creator is blocked
          deleted_at: null,
        },
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies using update_creator policy to soft-delete (requires soft_delete policy)', () => {
      const allowed = evaluateRelationshipsUpdateCreator({
        authUid: ALICE_UID,
        relationship: BASE_RELATIONSHIP,
        newRelationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: '2026-10-04T12:00:00Z', // WITH CHECK requires deleted_at IS NULL
        },
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies non-creator from updating relationship', () => {
      const allowed = evaluateRelationshipsUpdateCreator({
        authUid: BOB_UID,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies creator from updating already soft-deleted relationship via creator policy', () => {
      const allowed = evaluateRelationshipsUpdateCreator({
        authUid: ALICE_UID,
        relationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: '2026-10-04T12:00:00Z',
        },
      })
      expect(allowed).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // UPDATE: relationships_soft_delete_creator (Dedicated Soft-Delete Policy)
  // -------------------------------------------------------------------------
  describe('UPDATE: relationships_soft_delete_creator', () => {
    it('POSITIVE: allows creator to soft-delete their own active relationship', () => {
      const allowed = evaluateRelationshipsSoftDeleteCreator({
        authUid: ALICE_UID,
        relationship: BASE_RELATIONSHIP, // Active row (deleted_at IS NULL)
        newRelationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: '2026-10-04T13:00:00Z',
        },
      })
      expect(allowed).toBe(true)
    })

    it('NEGATIVE: denies unrelated user from soft-deleting relationship', () => {
      const allowed = evaluateRelationshipsSoftDeleteCreator({
        authUid: BOB_UID, // Not creator
        relationship: BASE_RELATIONSHIP,
        newRelationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: '2026-10-04T13:00:00Z',
        },
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies unauthenticated user from soft-deleting relationship', () => {
      const allowed = evaluateRelationshipsSoftDeleteCreator({
        authUid: null,
        relationship: BASE_RELATIONSHIP,
        newRelationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: '2026-10-04T13:00:00Z',
        },
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies soft-deleting an already soft-deleted relationship (idempotency/guard)', () => {
      const allowed = evaluateRelationshipsSoftDeleteCreator({
        authUid: ALICE_UID,
        relationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: '2026-10-04T12:00:00Z', // Old row is already soft-deleted
        },
        newRelationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: '2026-10-04T13:00:00Z',
        },
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies creator from changing created_by during soft-deletion', () => {
      const allowed = evaluateRelationshipsSoftDeleteCreator({
        authUid: ALICE_UID,
        relationship: BASE_RELATIONSHIP,
        newRelationship: {
          ...BASE_RELATIONSHIP,
          created_by: BOB_UID, // Altered creator
          deleted_at: '2026-10-04T13:00:00Z',
        },
      })
      expect(allowed).toBe(false)
    })

    it('NEGATIVE: denies using soft_delete policy without setting deleted_at', () => {
      const allowed = evaluateRelationshipsSoftDeleteCreator({
        authUid: ALICE_UID,
        relationship: BASE_RELATIONSHIP,
        newRelationship: {
          ...BASE_RELATIONSHIP,
          deleted_at: null, // WITH CHECK requires deleted_at IS NOT NULL
        },
      })
      expect(allowed).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // UPDATE: relationships_update_admin
  // -------------------------------------------------------------------------
  describe('UPDATE: relationships_update_admin', () => {
    it('POSITIVE: allows moderator to update relationship', () => {
      const allowed = evaluateRelationshipsUpdateAdmin({
        authUid: BOB_UID,
        isModerator: true,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(true)
    })

    it('NEGATIVE: denies non-moderator from using admin update policy', () => {
      const allowed = evaluateRelationshipsUpdateAdmin({
        authUid: ALICE_UID,
        isModerator: false,
        relationship: BASE_RELATIONSHIP,
      })
      expect(allowed).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE: relationships_delete_deny (Correction D)
  // -------------------------------------------------------------------------
  describe('DELETE: relationships_delete_deny', () => {
    it('NEGATIVE: denies regular user/creator from physically deleting relationship', () => {
      expect(evaluateRelationshipsDeleteDeny()).toBe(false)
    })

    it('NEGATIVE: denies moderator from physically deleting relationship via application DELETE', () => {
      expect(evaluateRelationshipsDeleteDeny()).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Trigger Guard: handle_relationship_update_guard (Correction A & B)
// ---------------------------------------------------------------------------

describe('Database Trigger Guard: handle_relationship_update_guard', () => {
  const BASE_ROW: UpdateGuardRow = {
    id: '55555555-5555-5555-5555-555555555555',
    person_a_id: '11111111-1111-1111-1111-111111111111',
    person_b_id: '22222222-2222-2222-2222-222222222222',
    relationship_type: 'PARENT',
    notes: 'Initial notes',
    verification_status: 'UNVERIFIED',
    created_by: '00000000-0000-0000-0000-000000000001',
    created_at: '2026-10-04T12:00:00Z',
    deleted_at: null,
  }

  it('POSITIVE: allows normal creator to update notes only', () => {
    const res = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, notes: 'Updated notes only' },
      false
    )
    expect(res.allowed).toBe(true)
  })

  it('NEGATIVE: rejects normal caller attempting to mutate id', () => {
    const res = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, id: '99999999-9999-9999-9999-999999999999' },
      false
    )
    expect(res.allowed).toBe(false)
    expect(res.error).toBe('Cannot modify relationship id')
  })

  it('NEGATIVE: rejects normal caller attempting to mutate person_a_id or person_b_id', () => {
    const resA = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, person_a_id: '99999999-9999-9999-9999-999999999999' },
      false
    )
    expect(resA.allowed).toBe(false)
    expect(resA.error).toBe('Cannot modify relationship endpoints')

    const resB = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, person_b_id: '99999999-9999-9999-9999-999999999999' },
      false
    )
    expect(resB.allowed).toBe(false)
    expect(resB.error).toBe('Cannot modify relationship endpoints')
  })

  it('NEGATIVE: rejects normal caller attempting to mutate relationship_type', () => {
    const res = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, relationship_type: 'SPOUSE' },
      false
    )
    expect(res.allowed).toBe(false)
    expect(res.error).toBe('Cannot modify relationship_type')
  })

  it('NEGATIVE: rejects normal caller attempting to mutate created_by', () => {
    const res = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, created_by: '00000000-0000-0000-0000-000000000099' },
      false
    )
    expect(res.allowed).toBe(false)
    expect(res.error).toBe('Cannot modify created_by')
  })

  it('NEGATIVE: rejects normal caller attempting to mutate created_at', () => {
    const res = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, created_at: '2026-10-05T00:00:00Z' },
      false
    )
    expect(res.allowed).toBe(false)
    expect(res.error).toBe('Cannot modify created_at')
  })

  it('NEGATIVE: rejects normal caller attempting to mutate verification_status', () => {
    const res = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, verification_status: 'COMMUNITY_VERIFIED' },
      false
    )
    expect(res.allowed).toBe(false)
    expect(res.error).toBe('Cannot modify verification_status')
  })

  it('NEGATIVE: rejects modifying an already soft-deleted relationship (cannot un-delete)', () => {
    const deletedRow: UpdateGuardRow = {
      ...BASE_ROW,
      deleted_at: '2026-10-04T12:00:00Z',
    }
    const res = evaluateRelationshipUpdateGuard(
      deletedRow,
      { ...deletedRow, deleted_at: null }, // Attempt un-delete
      false
    )
    expect(res.allowed).toBe(false)
    expect(res.error).toBe('Cannot modify an already soft-deleted relationship')
  })

  it('NEGATIVE: rejects altering notes during soft-deletion transition', () => {
    const res = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      {
        ...BASE_ROW,
        deleted_at: '2026-10-04T12:00:00Z',
        notes: 'Tampered note during soft-delete',
      },
      false
    )
    expect(res.allowed).toBe(false)
    expect(res.error).toBe('Cannot alter notes during soft-deletion')
  })

  it('POSITIVE: allows clean soft-deletion transition (setting deleted_at only)', () => {
    const res = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, deleted_at: '2026-10-04T12:00:00Z' },
      false
    )
    expect(res.allowed).toBe(true)
  })

  it('POSITIVE: allows moderator to perform elevated updates including verification_status', () => {
    const res = evaluateRelationshipUpdateGuard(
      BASE_ROW,
      { ...BASE_ROW, verification_status: 'COMMUNITY_VERIFIED' },
      true // isModerator = true
    )
    expect(res.allowed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. Dual-Endpoint Privacy Verification (Cases 1-8 per Prompt Section 7)
// ---------------------------------------------------------------------------

describe('Dual-Endpoint Privacy Verification (Cases 1-8)', () => {
  const BASE_REL = {
    person_a_id: '11111111-1111-1111-1111-111111111111',
    person_b_id: '22222222-2222-2222-2222-222222222222',
    relationship_type: 'PARENT' as const,
    created_by: '00000000-0000-0000-0000-000000000001',
    deleted_at: null,
  }

  it('Case 1: Person A visible AND Person B visible -> relationship IS visible', () => {
    expect(
      evaluateRelationshipsSelectDualEndpoint({
        authUid: 'user-1',
        canViewPersonA: true,
        canViewPersonB: true,
        relationship: BASE_REL,
      })
    ).toBe(true)
  })

  it('Case 2: Person A visible, Person B not visible -> relationship MUST NOT be visible', () => {
    expect(
      evaluateRelationshipsSelectDualEndpoint({
        authUid: 'user-1',
        canViewPersonA: true,
        canViewPersonB: false,
        relationship: BASE_REL,
      })
    ).toBe(false)
  })

  it('Case 3: Person A not visible, Person B visible -> relationship MUST NOT be visible', () => {
    expect(
      evaluateRelationshipsSelectDualEndpoint({
        authUid: 'user-1',
        canViewPersonA: false,
        canViewPersonB: true,
        relationship: BASE_REL,
      })
    ).toBe(false)
  })

  it('Case 4: Neither endpoint visible -> relationship MUST NOT be visible', () => {
    expect(
      evaluateRelationshipsSelectDualEndpoint({
        authUid: 'user-1',
        canViewPersonA: false,
        canViewPersonB: false,
        relationship: BASE_REL,
      })
    ).toBe(false)
  })

  it('Case 5: Caller owns Person A (private) + Person B public/community -> relationship IS visible', () => {
    // Under persons RLS: caller owning Person A allows viewing A (persons_select_own),
    // and Person B is community-visible (persons_select_community).
    // Both subqueries pass!
    expect(
      evaluateRelationshipsSelectDualEndpoint({
        authUid: 'owner-of-a',
        canViewPersonA: true, // evaluated via persons_select_own
        canViewPersonB: true, // evaluated via persons_select_community
        relationship: BASE_REL,
      })
    ).toBe(true)
  })

  it('Case 6: Unrelated caller + Person A private + Person B public -> relationship MUST be hidden', () => {
    // Unrelated caller cannot view Person A under persons RLS -> subquery A returns 0 rows.
    expect(
      evaluateRelationshipsSelectDualEndpoint({
        authUid: 'unrelated-user',
        canViewPersonA: false, // hidden because Person A is private to another
        canViewPersonB: true,  // Person B is public
        relationship: BASE_REL,
      })
    ).toBe(false)
  })

  it('Case 7: Deleted endpoint (Person A deleted) -> relationship MUST be hidden for normal users', () => {
    // Under persons RLS: persons_select_public and persons_select_community enforce deleted_at IS NULL.
    // If Person A is deleted, subquery A returns 0 rows.
    expect(
      evaluateRelationshipsSelectDualEndpoint({
        authUid: 'user-1',
        canViewPersonA: false, // hidden because Person A deleted_at IS NOT NULL
        canViewPersonB: true,
        relationship: BASE_REL,
      })
    ).toBe(false)
  })

  it('Case 8: Community moderator/admin -> elevated authority via relationships_select_admin', () => {
    expect(
      evaluateRelationshipsSelectAdmin({
        authUid: 'moderator-uid',
        isModerator: true,
        relationship: BASE_REL,
      })
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. Static SQL Migration Security & Integrity Validation
// ---------------------------------------------------------------------------

describe('Static Migration Security: 20261004150000_create_relationships.sql', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/20261004150000_create_relationships.sql'
  )

  const content = fs.readFileSync(migrationPath, 'utf-8')

  // Stripped single-line commands
  const sqlCommands = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'))
    .join(' ')

  it('verifies migration file exists and is populated', () => {
    expect(content.length).toBeGreaterThan(100)
  })

  it('uses schema-qualified to_regtype check for public.relationship_type enum', () => {
    expect(sqlCommands).toMatch(/to_regtype\s*\(\s*'public\.relationship_type'\s*\)\s+IS\s+NULL/i)
  })

  it('explicitly enables Row Level Security on public.relationships', () => {
    expect(sqlCommands).toMatch(
      /ALTER\s+TABLE\s+public\.relationships\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/i
    )
  })

  it('revokes all privileges from PUBLIC, anon, and authenticated at Gate 1', () => {
    expect(sqlCommands).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.relationships\s+FROM\s+PUBLIC\s*;/i
    )
    expect(sqlCommands).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.relationships\s+FROM\s+anon\s*;/i
    )
    expect(sqlCommands).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.relationships\s+FROM\s+authenticated\s*;/i
    )
  })

  it('grants operational privileges to authenticated role at Gate 1 (SELECT, INSERT, UPDATE only; NO DELETE, TRUNCATE, REFERENCES, TRIGGER, or GRANT ALL)', () => {
    expect(sqlCommands).toMatch(
      /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s+ON\s+TABLE\s+public\.relationships\s+TO\s+authenticated\s*;/i
    )
    expect(sqlCommands).not.toMatch(/GRANT\s+.*DELETE.*ON\s+TABLE\s+public\.relationships\s+TO\s+authenticated/i)
    expect(sqlCommands).not.toMatch(/GRANT\s+.*TRUNCATE.*ON\s+TABLE\s+public\.relationships\s+TO\s+authenticated/i)
    expect(sqlCommands).not.toMatch(/GRANT\s+.*REFERENCES.*ON\s+TABLE\s+public\.relationships\s+TO\s+authenticated/i)
    expect(sqlCommands).not.toMatch(/GRANT\s+.*TRIGGER.*ON\s+TABLE\s+public\.relationships\s+TO\s+authenticated/i)
    expect(sqlCommands).not.toMatch(/GRANT\s+ALL\s+ON\s+TABLE\s+public\.relationships/i)
  })


  it('enforces CHECK constraint preventing self-referential relationships', () => {
    expect(sqlCommands).toMatch(/CONSTRAINT\s+relationships_no_self_reference\s+CHECK\s*\(\s*person_a_id\s*<>\s*person_b_id\s*\)/i)
  })

  it('enforces CHECK constraint for symmetric canonical ordering (person_a_id < person_b_id)', () => {
    expect(sqlCommands).toMatch(/CONSTRAINT\s+relationships_symmetric_ordering\s+CHECK/i)
    expect(sqlCommands).toMatch(/relationship_type\s*=\s*'PARENT'\s+OR\s*\(\s*person_a_id\s*<\s*person_b_id\s*\)/i)
  })

  it('creates partial unique index for active relationships (WHERE deleted_at IS NULL)', () => {
    expect(sqlCommands).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_relationships_active_unique/i)
    expect(sqlCommands).toMatch(/WHERE\s+deleted_at\s+IS\s+NULL/i)
  })

  it('enforces RESTRICT foreign keys on person endpoints to protect integrity', () => {
    expect(sqlCommands).toMatch(/REFERENCES\s+public\.persons\s*\(id\)\s+ON\s+DELETE\s+RESTRICT/i)
  })

  it('attaches handle_updated_at trigger before update', () => {
    expect(sqlCommands).toMatch(/CREATE\s+TRIGGER\s+relationships_handle_updated_at/i)
    expect(sqlCommands).toMatch(/EXECUTE\s+FUNCTION\s+public\.handle_updated_at\s*\(\s*\)/i)
  })

  it('creates and attaches handle_relationship_update_guard trigger function to protect identity fields', () => {
    expect(sqlCommands).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.handle_relationship_update_guard/i)
    expect(sqlCommands).toMatch(/CREATE\s+TRIGGER\s+relationships_update_guard/i)
    expect(sqlCommands).toMatch(/EXECUTE\s+FUNCTION\s+public\.handle_relationship_update_guard\s*\(\s*\)/i)
  })

  it('enforces creator active-row update policy with deleted_at IS NULL in WITH CHECK', () => {
    expect(sqlCommands).toMatch(/CREATE\s+POLICY\s+"relationships_update_creator"\s+ON\s+public\.relationships/i)
    expect(sqlCommands).toMatch(/auth\.uid\(\)\s*=\s*created_by\s+AND\s+deleted_at\s+IS\s+NULL/i)
  })

  it('enforces dedicated creator soft-delete policy with deleted_at IS NOT NULL in WITH CHECK', () => {
    expect(sqlCommands).toMatch(/CREATE\s+POLICY\s+"relationships_soft_delete_creator"\s+ON\s+public\.relationships/i)
    expect(sqlCommands).toMatch(/auth\.uid\(\)\s*=\s*created_by\s+AND\s+deleted_at\s+IS\s+NOT\s+NULL/i)
  })

  it('strictly denies hard DELETE operations via relationships_delete_deny policy', () => {
    expect(sqlCommands).toMatch(/CREATE\s+POLICY\s+"relationships_delete_deny"\s+ON\s+public\.relationships/i)
    expect(sqlCommands).toMatch(/FOR\s+DELETE\s+USING\s*\(\s*FALSE\s*\)/i)
  })

  it('enforces verified provenance on moderator insert policy (created_by = auth.uid())', () => {
    expect(sqlCommands).toMatch(/CREATE\s+POLICY\s+"relationships_insert_admin"\s+ON\s+public\.relationships/i)
    expect(sqlCommands).toMatch(/public\.is_community_moderator\(\)\s+AND\s+created_by\s*=\s*auth\.uid\(\)/i)
  })
})

