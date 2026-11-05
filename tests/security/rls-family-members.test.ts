/**
 * Security Tests: RLS Policies — Family Members Table
 *
 * Tests the Row Level Security policies defined in:
 * supabase/migrations/20261002140000_phase1_foundation.sql (Section 9: Family Members)
 *
 * Per AGENTS.md Section 7: Every RLS policy requires BOTH:
 *   - Positive test: authorized user CAN perform the operation
 *   - Negative test: unauthorized user CANNOT perform the operation
 *
 * IMPORTANT: These are static specification tests. They validate the logical
 * correctness of the RLS policy USING/WITH CHECK conditions by evaluating
 * equivalent TypeScript expressions against simulated database states.
 * They do NOT make live network requests and do NOT require an active Supabase session.
 *
 * Live end-to-end integration tests against a populated test database are deferred
 * to Phase 15 (Hardening) per AGENTS.md.
 *
 * Policies covered:
 *   1. family_members_select_community  SELECT for authenticated users when family is COMMUNITY/PUBLIC
 *   2. family_members_select_own        SELECT for person linked to auth.uid()
 *   3. family_members_select_admin      SELECT for community moderator/admin
 *   4. family_members_insert_creator    INSERT for family creator where added_by = auth.uid()
 *   5. family_members_insert_admin      INSERT for community moderator/admin
 *   6. family_members_update_creator    UPDATE for family creator (active family)
 *   7. family_members_update_admin      UPDATE for community moderator/admin
 *   8. family_members_delete_creator    DELETE for family creator
 *   9. family_members_delete_admin      DELETE for community moderator/admin
 */

import { describe, it, expect } from 'vitest'
import type { Tables } from '@/types/database.types'

type FamilyMemberRow = Tables<'family_members'>
type FamilyRow = Tables<'families'>
type PersonRow = Tables<'persons'>

// ---------------------------------------------------------------------------
// Evaluator functions mirroring SQL policy USING and WITH CHECK expressions
// ---------------------------------------------------------------------------

interface PolicyContext {
  authUid: string | null
  isModerator?: boolean
  family?: Partial<FamilyRow> | null
  person?: Partial<PersonRow> | null
}

/**
 * Policy: family_members_select_community
 * USING (
 *   auth.uid() IS NOT NULL
 *   AND EXISTS (
 *     SELECT 1 FROM public.families f
 *     WHERE f.id = family_members.family_id
 *       AND f.profile_privacy IN ('COMMUNITY', 'PUBLIC')
 *       AND f.deleted_at IS NULL
 *       AND f.status != 'ARCHIVED'
 *   )
 * )
 */
function evaluateFamilyMembersSelectCommunity(ctx: PolicyContext): boolean {
  if (!ctx.authUid) return false
  if (!ctx.family) return false

  const isPublicOrCommunity =
    ctx.family.profile_privacy === 'COMMUNITY' || ctx.family.profile_privacy === 'PUBLIC'
  const isNotDeleted = ctx.family.deleted_at === null || ctx.family.deleted_at === undefined
  const isNotArchived = ctx.family.status !== 'ARCHIVED'

  return isPublicOrCommunity && isNotDeleted && isNotArchived
}

/**
 * Policy: family_members_select_own
 * USING (
 *   EXISTS (
 *     SELECT 1 FROM public.persons p
 *     WHERE p.id = family_members.person_id
 *       AND p.user_id = auth.uid()
 *   )
 * )
 */
function evaluateFamilyMembersSelectOwn(ctx: PolicyContext): boolean {
  if (!ctx.authUid) return false
  if (!ctx.person) return false
  return ctx.person.user_id === ctx.authUid
}

/**
 * Policy: family_members_select_admin
 * USING (public.is_community_moderator())
 */
function evaluateFamilyMembersSelectAdmin(ctx: PolicyContext): boolean {
  return Boolean(ctx.isModerator)
}

/**
 * Policy: family_members_insert_creator
 * WITH CHECK (
 *   auth.uid() IS NOT NULL
 *   AND EXISTS (
 *     SELECT 1 FROM public.families f
 *     WHERE f.id = family_members.family_id
 *       AND f.created_by = auth.uid()
 *       AND f.deleted_at IS NULL
 *   )
 *   AND added_by = auth.uid()
 * )
 */
function evaluateFamilyMembersInsertCreator(
  memberData: Partial<FamilyMemberRow>,
  ctx: PolicyContext
): boolean {
  if (!ctx.authUid) return false
  if (!ctx.family) return false

  const isFamilyCreator = ctx.family.created_by === ctx.authUid
  const isFamilyNotDeleted = ctx.family.deleted_at === null || ctx.family.deleted_at === undefined
  const isAddedByCaller = memberData.added_by === ctx.authUid

  return isFamilyCreator && isFamilyNotDeleted && isAddedByCaller
}

/**
 * Policy: family_members_insert_admin
 * WITH CHECK (public.is_community_moderator())
 */
function evaluateFamilyMembersInsertAdmin(ctx: PolicyContext): boolean {
  return Boolean(ctx.isModerator)
}

/**
 * Policy: family_members_update_creator
 * USING / WITH CHECK (
 *   EXISTS (
 *     SELECT 1 FROM public.families f
 *     WHERE f.id = family_members.family_id
 *       AND f.created_by = auth.uid()
 *       AND f.deleted_at IS NULL
 *   )
 * )
 */
function evaluateFamilyMembersUpdateCreator(ctx: PolicyContext): boolean {
  if (!ctx.authUid) return false
  if (!ctx.family) return false

  const isFamilyCreator = ctx.family.created_by === ctx.authUid
  const isFamilyNotDeleted = ctx.family.deleted_at === null || ctx.family.deleted_at === undefined

  return isFamilyCreator && isFamilyNotDeleted
}

/**
 * Policy: family_members_update_admin
 * USING (public.is_community_moderator())
 */
function evaluateFamilyMembersUpdateAdmin(ctx: PolicyContext): boolean {
  return Boolean(ctx.isModerator)
}

/**
 * Policy: family_members_delete_creator
 * USING (
 *   EXISTS (
 *     SELECT 1 FROM public.families f
 *     WHERE f.id = family_members.family_id
 *       AND f.created_by = auth.uid()
 *   )
 * )
 */
function evaluateFamilyMembersDeleteCreator(ctx: PolicyContext): boolean {
  if (!ctx.authUid) return false
  if (!ctx.family) return false
  return ctx.family.created_by === ctx.authUid
}

/**
 * Policy: family_members_delete_admin
 * USING (public.is_community_moderator())
 */
function evaluateFamilyMembersDeleteAdmin(ctx: PolicyContext): boolean {
  return Boolean(ctx.isModerator)
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('RLS Policy Specification: family_members table', () => {
  const ALICE_UID = 'user-alice-1111'
  const BOB_UID = 'user-bob-2222'

  // -------------------------------------------------------------------------
  // 1. family_members_select_community
  // -------------------------------------------------------------------------
  describe('family_members_select_community (SELECT policy)', () => {
    it('[POSITIVE] authenticated user can read members of a COMMUNITY family', () => {
      const result = evaluateFamilyMembersSelectCommunity({
        authUid: BOB_UID,
        family: {
          profile_privacy: 'COMMUNITY',
          status: 'ACTIVE',
          deleted_at: null,
        },
      })
      expect(result).toBe(true)
    })

    it('[POSITIVE] authenticated user can read members of a PUBLIC family', () => {
      const result = evaluateFamilyMembersSelectCommunity({
        authUid: BOB_UID,
        family: {
          profile_privacy: 'PUBLIC',
          status: 'ACTIVE',
          deleted_at: null,
        },
      })
      expect(result).toBe(true)
    })

    it('[NEGATIVE] unauthenticated visitor CANNOT read members even if family is PUBLIC', () => {
      const result = evaluateFamilyMembersSelectCommunity({
        authUid: null,
        family: {
          profile_privacy: 'PUBLIC',
          status: 'ACTIVE',
          deleted_at: null,
        },
      })
      expect(result).toBe(false)
    })

    it('[NEGATIVE] authenticated user CANNOT read members of a PRIVATE family via community policy', () => {
      const result = evaluateFamilyMembersSelectCommunity({
        authUid: BOB_UID,
        family: {
          profile_privacy: 'PRIVATE',
          status: 'ACTIVE',
          deleted_at: null,
        },
      })
      expect(result).toBe(false)
    })

    it('[NEGATIVE] authenticated user CANNOT read members of a soft-deleted family', () => {
      const result = evaluateFamilyMembersSelectCommunity({
        authUid: BOB_UID,
        family: {
          profile_privacy: 'COMMUNITY',
          status: 'ACTIVE',
          deleted_at: '2026-10-01T00:00:00Z',
        },
      })
      expect(result).toBe(false)
    })

    it('[NEGATIVE] authenticated user CANNOT read members of an ARCHIVED family', () => {
      const result = evaluateFamilyMembersSelectCommunity({
        authUid: BOB_UID,
        family: {
          profile_privacy: 'COMMUNITY',
          status: 'ARCHIVED',
          deleted_at: null,
        },
      })
      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 2. family_members_select_own
  // -------------------------------------------------------------------------
  describe('family_members_select_own (SELECT policy)', () => {
    it('[POSITIVE] user can read their own membership record (person.user_id = auth.uid)', () => {
      const result = evaluateFamilyMembersSelectOwn({
        authUid: ALICE_UID,
        person: {
          id: 'person-alice',
          user_id: ALICE_UID,
        },
      })
      expect(result).toBe(true)
    })

    it('[NEGATIVE] user CANNOT read another person membership record via own policy', () => {
      const result = evaluateFamilyMembersSelectOwn({
        authUid: BOB_UID,
        person: {
          id: 'person-alice',
          user_id: ALICE_UID,
        },
      })
      expect(result).toBe(false)
    })

    it('[NEGATIVE] unauthenticated caller CANNOT read membership via own policy', () => {
      const result = evaluateFamilyMembersSelectOwn({
        authUid: null,
        person: {
          id: 'person-alice',
          user_id: ALICE_UID,
        },
      })
      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 3. family_members_select_admin
  // -------------------------------------------------------------------------
  describe('family_members_select_admin (SELECT policy)', () => {
    it('[POSITIVE] community moderator CAN read family member records', () => {
      const result = evaluateFamilyMembersSelectAdmin({
        authUid: ALICE_UID,
        isModerator: true,
      })
      expect(result).toBe(true)
    })

    it('[NEGATIVE] regular user (non-moderator) CANNOT read via admin policy', () => {
      const result = evaluateFamilyMembersSelectAdmin({
        authUid: BOB_UID,
        isModerator: false,
      })
      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 4. family_members_insert_creator
  // -------------------------------------------------------------------------
  describe('family_members_insert_creator (INSERT policy)', () => {
    it('[POSITIVE] family creator CAN insert member into their active family with matching added_by', () => {
      const result = evaluateFamilyMembersInsertCreator(
        { added_by: ALICE_UID },
        {
          authUid: ALICE_UID,
          family: {
            created_by: ALICE_UID,
            deleted_at: null,
          },
        }
      )
      expect(result).toBe(true)
    })

    it('[NEGATIVE] non-creator user CANNOT insert member into someone else family', () => {
      const result = evaluateFamilyMembersInsertCreator(
        { added_by: BOB_UID },
        {
          authUid: BOB_UID,
          family: {
            created_by: ALICE_UID,
            deleted_at: null,
          },
        }
      )
      expect(result).toBe(false)
    })

    it('[NEGATIVE] family creator CANNOT insert member into a soft-deleted family', () => {
      const result = evaluateFamilyMembersInsertCreator(
        { added_by: ALICE_UID },
        {
          authUid: ALICE_UID,
          family: {
            created_by: ALICE_UID,
            deleted_at: '2026-10-01T00:00:00Z',
          },
        }
      )
      expect(result).toBe(false)
    })

    it('[NEGATIVE] insert FAILS if added_by does NOT match caller auth.uid (spoofing prevention)', () => {
      const result = evaluateFamilyMembersInsertCreator(
        { added_by: BOB_UID }, // spoofing Bob
        {
          authUid: ALICE_UID,
          family: {
            created_by: ALICE_UID,
            deleted_at: null,
          },
        }
      )
      expect(result).toBe(false)
    })

    it('[NEGATIVE] unauthenticated caller CANNOT insert members', () => {
      const result = evaluateFamilyMembersInsertCreator(
        { added_by: ALICE_UID },
        {
          authUid: null,
          family: {
            created_by: ALICE_UID,
            deleted_at: null,
          },
        }
      )
      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 5. family_members_insert_admin
  // -------------------------------------------------------------------------
  describe('family_members_insert_admin (INSERT policy)', () => {
    it('[POSITIVE] community moderator CAN insert member records', () => {
      const result = evaluateFamilyMembersInsertAdmin({
        authUid: ALICE_UID,
        isModerator: true,
      })
      expect(result).toBe(true)
    })

    it('[NEGATIVE] non-moderator CANNOT insert via admin policy', () => {
      const result = evaluateFamilyMembersInsertAdmin({
        authUid: BOB_UID,
        isModerator: false,
      })
      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 6. family_members_update_creator
  // -------------------------------------------------------------------------
  describe('family_members_update_creator (UPDATE policy)', () => {
    it('[POSITIVE] family creator CAN update member in active family', () => {
      const result = evaluateFamilyMembersUpdateCreator({
        authUid: ALICE_UID,
        family: {
          created_by: ALICE_UID,
          deleted_at: null,
        },
      })
      expect(result).toBe(true)
    })

    it('[NEGATIVE] non-creator CANNOT update member record', () => {
      const result = evaluateFamilyMembersUpdateCreator({
        authUid: BOB_UID,
        family: {
          created_by: ALICE_UID,
          deleted_at: null,
        },
      })
      expect(result).toBe(false)
    })

    it('[NEGATIVE] family creator CANNOT update member in a soft-deleted family', () => {
      const result = evaluateFamilyMembersUpdateCreator({
        authUid: ALICE_UID,
        family: {
          created_by: ALICE_UID,
          deleted_at: '2026-10-01T00:00:00Z',
        },
      })
      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 7. family_members_update_admin
  // -------------------------------------------------------------------------
  describe('family_members_update_admin (UPDATE policy)', () => {
    it('[POSITIVE] community moderator CAN update member records', () => {
      const result = evaluateFamilyMembersUpdateAdmin({
        authUid: ALICE_UID,
        isModerator: true,
      })
      expect(result).toBe(true)
    })

    it('[NEGATIVE] non-moderator CANNOT update via admin policy', () => {
      const result = evaluateFamilyMembersUpdateAdmin({
        authUid: BOB_UID,
        isModerator: false,
      })
      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 8. family_members_delete_creator
  // -------------------------------------------------------------------------
  describe('family_members_delete_creator (DELETE policy)', () => {
    it('[POSITIVE] family creator CAN delete member record from their family', () => {
      const result = evaluateFamilyMembersDeleteCreator({
        authUid: ALICE_UID,
        family: {
          created_by: ALICE_UID,
        },
      })
      expect(result).toBe(true)
    })

    it('[NEGATIVE] non-creator CANNOT delete member record from family', () => {
      const result = evaluateFamilyMembersDeleteCreator({
        authUid: BOB_UID,
        family: {
          created_by: ALICE_UID,
        },
      })
      expect(result).toBe(false)
    })

    it('[NEGATIVE] unauthenticated caller CANNOT delete member records', () => {
      const result = evaluateFamilyMembersDeleteCreator({
        authUid: null,
        family: {
          created_by: ALICE_UID,
        },
      })
      expect(result).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // 9. family_members_delete_admin
  // -------------------------------------------------------------------------
  describe('family_members_delete_admin (DELETE policy)', () => {
    it('[POSITIVE] community moderator CAN delete member records', () => {
      const result = evaluateFamilyMembersDeleteAdmin({
        authUid: ALICE_UID,
        isModerator: true,
      })
      expect(result).toBe(true)
    })

    it('[NEGATIVE] non-moderator CANNOT delete via admin policy', () => {
      const result = evaluateFamilyMembersDeleteAdmin({
        authUid: BOB_UID,
        isModerator: false,
      })
      expect(result).toBe(false)
    })
  })
})
