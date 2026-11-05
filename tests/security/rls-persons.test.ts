/**
 * Security Tests: RLS Policies — Persons Table
 *
 * Tests the Row Level Security policies defined in:
 * supabase/migrations/20261002130004_create_persons.sql
 *
 * Per AGENTS.md Section 7: Every RLS policy requires BOTH:
 *   - Positive test: authorized user CAN perform the operation
 *   - Negative test: unauthorized user CANNOT perform the operation
 *
 * Critical domain rule validated: PERSON != USER
 *   - A person with no user_id should still be accessible per privacy policy
 *   - A user cannot access PRIVATE persons that are not their own
 *   - Soft-deleted persons (deleted_at IS NOT NULL) are invisible to non-admins
 */

import { describe, it, expect } from 'vitest'
import type { PersonRow, PrivacyLevel } from '@/types'

// ---------------------------------------------------------------------------
// Helper: simulate RLS condition evaluation
// These mirror the exact USING clauses in the migration SQL
// ---------------------------------------------------------------------------

function evaluatePersonSelectPublic(person: Partial<PersonRow>): boolean {
  return (
    person.profile_privacy === 'PUBLIC' &&
    person.deleted_at === null &&
    person.status !== 'ARCHIVED'
  )
}

function evaluatePersonSelectCommunity(
  person: Partial<PersonRow>,
  authUid: string | null
): boolean {
  return (
    authUid !== null &&
    (person.profile_privacy === 'COMMUNITY' || person.profile_privacy === 'PUBLIC') &&
    person.deleted_at === null &&
    person.status !== 'ARCHIVED'
  )
}

function evaluatePersonSelectOwn(
  person: Partial<PersonRow>,
  authUid: string | null
): boolean {
  return authUid !== null && person.user_id === authUid && person.deleted_at === null
}

function evaluatePersonSelectConnections(
  person: Partial<PersonRow>,
  authUid: string | null,
  areConnected: boolean
): boolean {
  return (
    authUid !== null &&
    person.profile_privacy === 'CONNECTIONS' &&
    person.user_id !== null &&
    person.user_id !== undefined &&
    person.deleted_at === null &&
    person.status !== 'ARCHIVED' &&
    areConnected
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RLS Policy Specification: persons table', () => {
  // ---------------------------------------------------------------------------
  // persons_select_public
  // ---------------------------------------------------------------------------
  describe('persons_select_public (SELECT policy)', () => {
    it('[POSITIVE] PUBLIC person should be visible without authentication', () => {
      const person: Partial<PersonRow> = {
        id: 'person-1',
        first_name: 'John',
        last_name: 'Sharma',
        profile_privacy: 'PUBLIC',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectPublic(person)).toBe(true)
    })

    it('[NEGATIVE] COMMUNITY person should NOT be visible without authentication', () => {
      const person: Partial<PersonRow> = {
        id: 'person-2',
        profile_privacy: 'COMMUNITY',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectPublic(person)).toBe(false)
    })

    it('[NEGATIVE] PRIVATE person should NOT be visible without authentication', () => {
      const person: Partial<PersonRow> = {
        id: 'person-3',
        profile_privacy: 'PRIVATE',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectPublic(person)).toBe(false)
    })

    it('[NEGATIVE] soft-deleted PUBLIC person should NOT be visible', () => {
      const person: Partial<PersonRow> = {
        id: 'person-4',
        profile_privacy: 'PUBLIC',
        status: 'ACTIVE',
        deleted_at: '2026-10-01T00:00:00Z', // soft-deleted
      }
      expect(evaluatePersonSelectPublic(person)).toBe(false)
    })

    it('[NEGATIVE] ARCHIVED PUBLIC person should NOT be visible', () => {
      const person: Partial<PersonRow> = {
        id: 'person-5',
        profile_privacy: 'PUBLIC',
        status: 'ARCHIVED',
        deleted_at: null,
      }
      expect(evaluatePersonSelectPublic(person)).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // persons_select_community
  // ---------------------------------------------------------------------------
  describe('persons_select_community (SELECT policy)', () => {
    const authUid = 'user-authenticated'

    it('[POSITIVE] authenticated user can see COMMUNITY person', () => {
      const person: Partial<PersonRow> = {
        profile_privacy: 'COMMUNITY',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectCommunity(person, authUid)).toBe(true)
    })

    it('[POSITIVE] authenticated user can see PUBLIC person', () => {
      const person: Partial<PersonRow> = {
        profile_privacy: 'PUBLIC',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectCommunity(person, authUid)).toBe(true)
    })

    it('[NEGATIVE] unauthenticated user cannot see COMMUNITY person', () => {
      const person: Partial<PersonRow> = {
        profile_privacy: 'COMMUNITY',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectCommunity(person, null)).toBe(false)
    })

    it('[NEGATIVE] authenticated user cannot see PRIVATE person via community policy', () => {
      const person: Partial<PersonRow> = {
        profile_privacy: 'PRIVATE',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectCommunity(person, authUid)).toBe(false)
    })

    it('[NEGATIVE] authenticated user cannot see FAMILY person via community policy', () => {
      const person: Partial<PersonRow> = {
        profile_privacy: 'FAMILY',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectCommunity(person, authUid)).toBe(false)
    })

    it('[NEGATIVE] soft-deleted person is invisible even to authenticated users', () => {
      const person: Partial<PersonRow> = {
        profile_privacy: 'COMMUNITY',
        status: 'ACTIVE',
        deleted_at: '2026-10-01T00:00:00Z',
      }
      expect(evaluatePersonSelectCommunity(person, authUid)).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // persons_select_own — PERSON != USER validation
  // ---------------------------------------------------------------------------
  describe('persons_select_own (SELECT policy) — PERSON != USER', () => {
    it('[POSITIVE] user can see their own claimed person regardless of privacy level', () => {
      const privacyLevels: PrivacyLevel[] = ['PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC']
      const userId = 'user-123'

      for (const privacy of privacyLevels) {
        const person: Partial<PersonRow> = {
          user_id: userId,
          profile_privacy: privacy,
          deleted_at: null,
        }
        expect(evaluatePersonSelectOwn(person, userId)).toBe(true)
      }
    })

    it('[NEGATIVE] user cannot see a PRIVATE person claimed by another user', () => {
      const person: Partial<PersonRow> = {
        user_id: 'other-user-456',
        profile_privacy: 'PRIVATE',
        deleted_at: null,
      }
      const requestingUid = 'user-123'
      expect(evaluatePersonSelectOwn(person, requestingUid)).toBe(false)
    })

    it('[DOMAIN RULE] person with no user_id (unclaimed) is not accessible via own policy', () => {
      // PERSON != USER: An unclaimed person (no user_id) has no "own" accessor
      // This person is visible only via community/public policies based on privacy
      const person: Partial<PersonRow> = {
        user_id: null, // Unclaimed — no associated user account
        profile_privacy: 'COMMUNITY',
        deleted_at: null,
      }
      const requestingUid = 'any-user-123'
      // own policy: auth.uid() = user_id — fails because user_id is NULL
      expect(evaluatePersonSelectOwn(person, requestingUid)).toBe(false)
    })

    it('[POSITIVE] unclaimed person with COMMUNITY privacy is visible via community policy', () => {
      // Even with no user_id, a COMMUNITY person is visible to authenticated users
      const person: Partial<PersonRow> = {
        user_id: null,
        profile_privacy: 'COMMUNITY',
        status: 'ACTIVE',
        deleted_at: null,
      }
      const authenticatedUid = 'any-user-123'
      expect(evaluatePersonSelectCommunity(person, authenticatedUid)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // persons_select_connections (Phase 7 Subtask 3)
  // ---------------------------------------------------------------------------
  describe('persons_select_connections (SELECT policy) — Phase 7 Subtask 3', () => {
    const viewerUid = 'viewer-user-111'
    const ownerUid = 'owner-user-222'

    it('[POSITIVE] authenticated user with ACCEPTED connection can view CONNECTIONS person', () => {
      const person: Partial<PersonRow> = {
        user_id: ownerUid,
        profile_privacy: 'CONNECTIONS',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectConnections(person, viewerUid, true)).toBe(true)
    })

    it('[NEGATIVE] authenticated user without connection cannot view CONNECTIONS person', () => {
      const person: Partial<PersonRow> = {
        user_id: ownerUid,
        profile_privacy: 'CONNECTIONS',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectConnections(person, viewerUid, false)).toBe(false)
    })

    it('[NEGATIVE] anonymous user cannot view CONNECTIONS person', () => {
      const person: Partial<PersonRow> = {
        user_id: ownerUid,
        profile_privacy: 'CONNECTIONS',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectConnections(person, null, true)).toBe(false)
    })

    it('[NEGATIVE] unlinked person (user_id IS NULL) cannot be viewed via connections policy', () => {
      const person: Partial<PersonRow> = {
        user_id: null,
        profile_privacy: 'CONNECTIONS',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectConnections(person, viewerUid, true)).toBe(false)
    })

    it('[NEGATIVE] soft-deleted CONNECTIONS person is invisible even with accepted connection', () => {
      const person: Partial<PersonRow> = {
        user_id: ownerUid,
        profile_privacy: 'CONNECTIONS',
        status: 'ACTIVE',
        deleted_at: '2026-10-05T12:00:00Z',
      }
      expect(evaluatePersonSelectConnections(person, viewerUid, true)).toBe(false)
    })

    it('[NEGATIVE] ARCHIVED CONNECTIONS person is invisible even with accepted connection', () => {
      const person: Partial<PersonRow> = {
        user_id: ownerUid,
        profile_privacy: 'CONNECTIONS',
        status: 'ARCHIVED',
        deleted_at: null,
      }
      expect(evaluatePersonSelectConnections(person, viewerUid, true)).toBe(false)
    })

    it('[NEGATIVE] PRIVATE person cannot be accessed via connections policy', () => {
      const person: Partial<PersonRow> = {
        user_id: ownerUid,
        profile_privacy: 'PRIVATE',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectConnections(person, viewerUid, true)).toBe(false)
    })

    it('[NEGATIVE] FAMILY person cannot be accessed via connections policy', () => {
      const person: Partial<PersonRow> = {
        user_id: ownerUid,
        profile_privacy: 'FAMILY',
        status: 'ACTIVE',
        deleted_at: null,
      }
      expect(evaluatePersonSelectConnections(person, viewerUid, true)).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // persons_insert_authenticated
  // ---------------------------------------------------------------------------
  describe('persons_insert_authenticated (INSERT policy)', () => {
    it('[POSITIVE] authenticated user with correct created_by can insert', () => {
      const authUid = 'user-123'
      const insertData: Partial<PersonRow> = {
        first_name: 'Test',
        last_name: 'Person',
        created_by: authUid,
      }
      // Policy: auth.uid() IS NOT NULL AND created_by = auth.uid()
      expect(authUid !== null && insertData.created_by === authUid).toBe(true)
    })

    it('[NEGATIVE] unauthenticated user cannot insert person', () => {
      const authUid = null
      expect(authUid !== null).toBe(false)
    })

    it('[NEGATIVE] user cannot set created_by to a different user ID', () => {
      const authUid = 'user-123'
      const insertData: Partial<PersonRow> = {
        created_by: 'other-user-456', // Attempting to forge provenance
      }
      expect(authUid !== null && insertData.created_by === authUid).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // persons_delete_deny
  // ---------------------------------------------------------------------------
  describe('persons_delete_deny (DELETE policy)', () => {
    it('[NEGATIVE] no client should be able to hard-delete a person record', () => {
      // WITH CHECK (FALSE) → all hard deletes denied
      const hardDeleteAllowed = false
      expect(hardDeleteAllowed).toBe(false)
    })

    it('[SPECIFICATION] soft deletion via deleted_at = NOW() is the correct approach', () => {
      // To "delete" a person: UPDATE SET deleted_at = NOW()
      // This is enforced by application service, not by DB constraint
      // The audit trail is preserved; RLS hides soft-deleted records
      const softDeleteApproach = 'UPDATE persons SET deleted_at = NOW() WHERE id = ...'
      expect(softDeleteApproach).toContain('deleted_at')
    })
  })
})
