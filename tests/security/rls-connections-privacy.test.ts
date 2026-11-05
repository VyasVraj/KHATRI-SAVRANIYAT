/**
 * Security & RLS Tests: Connection-Aware Privacy & Cross-Domain Integration
 * (Phase 7 Subtask 3)
 *
 * Validates the connection-aware RLS policy (persons_select_connections),
 * function privilege hardening (are_users_connected), and complete authorization
 * matrix defined in:
 * supabase/migrations/20261005180000_add_connections_privacy_to_persons.sql
 *
 * Per AGENTS.md Section 7: Every RLS policy requires BOTH:
 *   - Positive test: authorized actor CAN perform the operation
 *   - Negative test: unauthorized actor CANNOT perform the operation
 *
 * Canonical domain rules validated:
 *   - PERSON != USER: Connections operate strictly USER ↔ USER.
 *   - persons.user_id is the ONLY linkage between a PERSON and a USER.
 *   - Unlinked persons (user_id IS NULL) CANNOT satisfy CONNECTIONS privacy.
 *   - Only status = 'ACCEPTED' connections satisfy CONNECTIONS privacy.
 *   - PENDING, REJECTED, and BLOCKED connections MUST NEVER satisfy CONNECTIONS privacy.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { PersonRow } from '@/types'

// ---------------------------------------------------------------------------
// Simulators mirroring the PostgreSQL RLS Policy & Helper Expressions
// ---------------------------------------------------------------------------

interface MockConnectionEdge {
  requester_id: string
  addressee_id: string
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED'
}

/**
 * Simulates: public.are_users_connected(user_a UUID, user_b UUID)
 * Checks for an active row with status = 'ACCEPTED' in either direction.
 * Enforces caller authorization to prevent social-graph probing (oracle attack).
 */
function simulateAreUsersConnected(
  callerUid: string | null | undefined,
  userA: string | null | undefined,
  userB: string | null | undefined,
  connections: MockConnectionEdge[],
  isModerator = false
): boolean {
  if (!callerUid || !userA || !userB || userA === userB) return false

  // Caller authorization: caller must be userA, userB, or active moderator
  if (callerUid !== userA && callerUid !== userB && !isModerator) return false

  return connections.some(
    (conn) =>
      conn.status === 'ACCEPTED' &&
      ((conn.requester_id === userA && conn.addressee_id === userB) ||
        (conn.requester_id === userB && conn.addressee_id === userA))
  )
}

/**
 * Evaluates full effective visibility of a Person record across all SELECT policies:
 * - persons_select_public
 * - persons_select_community
 * - persons_select_connections (Phase 7 Subtask 3)
 * - persons_select_own
 * - persons_select_admin
 */
function evaluateEffectivePersonSelect(
  person: Partial<PersonRow>,
  authUid: string | null,
  connections: MockConnectionEdge[],
  isModerator = false
): boolean {
  // Gate: deleted_at or archived check applies to general public/community/connections
  const isDeleted = person.deleted_at !== null && person.deleted_at !== undefined
  const isArchived = person.status === 'ARCHIVED'

  // Policy 1: persons_select_admin
  if (isModerator) return true

  // Policy 2: persons_select_own (owner can see their own person if not soft-deleted)
  if (authUid && person.user_id === authUid && !isDeleted) {
    return true
  }

  // Soft-deleted or archived records are invisible to non-admins
  if (isDeleted || isArchived) {
    return false
  }

  // Policy 3: persons_select_public
  if (person.profile_privacy === 'PUBLIC') {
    return true
  }

  // Policy 4: persons_select_community
  if (authUid !== null && person.profile_privacy === 'COMMUNITY') {
    return true
  }

  // Policy 5: persons_select_connections (Phase 7 Subtask 3)
  if (
    authUid !== null &&
    person.profile_privacy === 'CONNECTIONS' &&
    person.user_id !== null &&
    person.user_id !== undefined &&
    simulateAreUsersConnected(authUid, authUid, person.user_id, connections, isModerator)
  ) {
    return true
  }

  // No policy matched (e.g. PRIVATE, FAMILY without membership, or unauthorized CONNECTIONS)
  return false
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Security: Connection-Aware Privacy & RLS (Phase 7 Subtask 3)', () => {
  const USER_VIEWER = '11111111-1111-4111-8111-111111111111'
  const USER_OWNER = '22222222-2222-4222-8222-222222222222'
  const USER_STRANGER = '33333333-3333-4333-8333-333333333333'

  const BASE_PERSON: Partial<PersonRow> = {
    id: 'person-target-1',
    first_name: 'Anita',
    last_name: 'Desai',
    user_id: USER_OWNER,
    profile_privacy: 'CONNECTIONS',
    status: 'ACTIVE',
    deleted_at: null,
  }

  // ---------------------------------------------------------------------------
  // 1. Static Security Analysis of Migration File
  // ---------------------------------------------------------------------------
  describe('Static Migration Security Validation', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../supabase/migrations/20261005180000_add_connections_privacy_to_persons.sql'
    )

    it('migration file exists and is readable', () => {
      expect(fs.existsSync(migrationPath)).toBe(true)
    })

    const sql = fs.readFileSync(migrationPath, 'utf-8')

    it('revokes execution privileges on are_users_connected from PUBLIC and anon', () => {
      expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.are_users_connected.*FROM\s+PUBLIC\s*;/i)
      expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.are_users_connected.*FROM\s+anon\s*;/i)
    })

    it('grants execution privileges on are_users_connected strictly to authenticated', () => {
      expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.are_users_connected.*TO\s+authenticated\s*;/i)
    })

    it('creates persons_select_connections policy with strict predicates', () => {
      expect(sql).toMatch(/CREATE\s+POLICY\s+"persons_select_connections"\s+ON\s+public\.persons/i)
      expect(sql).toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL/i)
      expect(sql).toMatch(/profile_privacy\s*=\s*'CONNECTIONS'/i)
      expect(sql).toMatch(/user_id\s+IS\s+NOT\s+NULL/i)
      expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i)
      expect(sql).toMatch(/status\s*!=\s*'ARCHIVED'/i)
      expect(sql).toMatch(/public\.are_users_connected\(auth\.uid\(\),\s*user_id\)/i)
    })

    it('defines are_users_connected with caller authorization to prevent social-graph probing', () => {
      expect(sql).toContain('auth.uid() <> user_a AND auth.uid() <> user_b')
      expect(sql).toContain('public.is_community_moderator()')
      expect(sql).toContain('SECURITY DEFINER')
      expect(sql).toContain('SET search_path = public')
    })

    it('does NOT disable RLS on any table', () => {
      expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    })

    it('does NOT grant ALL privileges', () => {
      expect(sql).not.toMatch(/GRANT\s+ALL\b/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Oracle Prevention: are_users_connected Caller Authorization
  // ---------------------------------------------------------------------------
  describe('are_users_connected Caller Authorization (Oracle Prevention)', () => {
    const acceptedEdge: MockConnectionEdge = {
      requester_id: USER_OWNER,
      addressee_id: USER_VIEWER,
      status: 'ACCEPTED',
    }

    it('User A can evaluate A <-> B (returns TRUE if accepted)', () => {
      expect(simulateAreUsersConnected(USER_VIEWER, USER_VIEWER, USER_OWNER, [acceptedEdge])).toBe(true)
    })

    it('User B can evaluate A <-> B (returns TRUE if accepted)', () => {
      expect(simulateAreUsersConnected(USER_OWNER, USER_VIEWER, USER_OWNER, [acceptedEdge])).toBe(true)
    })

    it('Unrelated User C CANNOT probe A <-> B (returns FALSE, preventing oracle discovery)', () => {
      expect(simulateAreUsersConnected(USER_STRANGER, USER_VIEWER, USER_OWNER, [acceptedEdge], false)).toBe(false)
    })

    it('Unauthenticated caller CANNOT probe A <-> B (returns FALSE)', () => {
      expect(simulateAreUsersConnected(null, USER_VIEWER, USER_OWNER, [acceptedEdge])).toBe(false)
    })

    it('Null user arguments return FALSE', () => {
      expect(simulateAreUsersConnected(USER_VIEWER, null, USER_OWNER, [acceptedEdge])).toBe(false)
      expect(simulateAreUsersConnected(USER_VIEWER, USER_VIEWER, null, [acceptedEdge])).toBe(false)
    })

    it('Community moderator CAN evaluate A <-> B for moderation purposes', () => {
      expect(simulateAreUsersConnected(USER_STRANGER, USER_VIEWER, USER_OWNER, [acceptedEdge], true)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Full Authorization Matrix for CONNECTIONS Privacy Tier
  // ---------------------------------------------------------------------------
  describe('Authorization Matrix: CONNECTIONS Privacy Tier', () => {
    it('[POSITIVE - ACCEPTED (Outgoing)]: viewer who sent accepted connection CAN view person', () => {
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_VIEWER, addressee_id: USER_OWNER, status: 'ACCEPTED' },
      ]
      const canView = evaluateEffectivePersonSelect(BASE_PERSON, USER_VIEWER, connections)
      expect(canView).toBe(true)
    })

    it('[POSITIVE - ACCEPTED (Incoming)]: viewer who received accepted connection CAN view person', () => {
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_OWNER, addressee_id: USER_VIEWER, status: 'ACCEPTED' },
      ]
      const canView = evaluateEffectivePersonSelect(BASE_PERSON, USER_VIEWER, connections)
      expect(canView).toBe(true)
    })

    it('[POSITIVE - OWNER]: record owner CAN always view their own person record', () => {
      const connections: MockConnectionEdge[] = []
      const canView = evaluateEffectivePersonSelect(BASE_PERSON, USER_OWNER, connections)
      expect(canView).toBe(true)
    })

    it('[NEGATIVE - NO CONNECTION]: unrelated authenticated user CANNOT view person', () => {
      const connections: MockConnectionEdge[] = []
      const canView = evaluateEffectivePersonSelect(BASE_PERSON, USER_STRANGER, connections)
      expect(canView).toBe(false)
    })

    it('[NEGATIVE - PENDING (Outgoing)]: sent pending request does NOT grant access', () => {
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_VIEWER, addressee_id: USER_OWNER, status: 'PENDING' },
      ]
      const canView = evaluateEffectivePersonSelect(BASE_PERSON, USER_VIEWER, connections)
      expect(canView).toBe(false)
    })

    it('[NEGATIVE - PENDING (Incoming)]: received pending request does NOT grant access', () => {
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_OWNER, addressee_id: USER_VIEWER, status: 'PENDING' },
      ]
      const canView = evaluateEffectivePersonSelect(BASE_PERSON, USER_VIEWER, connections)
      expect(canView).toBe(false)
    })

    it('[NEGATIVE - REJECTED]: declined connection request does NOT grant access', () => {
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_VIEWER, addressee_id: USER_OWNER, status: 'REJECTED' },
      ]
      const canView = evaluateEffectivePersonSelect(BASE_PERSON, USER_VIEWER, connections)
      expect(canView).toBe(false)
    })

    it('[NEGATIVE - BLOCKED]: blocked connection edge does NOT grant access', () => {
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_VIEWER, addressee_id: USER_OWNER, status: 'BLOCKED' },
      ]
      const canView = evaluateEffectivePersonSelect(BASE_PERSON, USER_VIEWER, connections)
      expect(canView).toBe(false)
    })

    it('[NEGATIVE - ANONYMOUS]: unauthenticated user CANNOT view CONNECTIONS person', () => {
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_VIEWER, addressee_id: USER_OWNER, status: 'ACCEPTED' },
      ]
      const canView = evaluateEffectivePersonSelect(BASE_PERSON, null, connections)
      expect(canView).toBe(false)
    })

    it('[NEGATIVE - UNLINKED PERSON]: person with user_id IS NULL cannot be accessed via connections', () => {
      // PERSON != USER invariant: Unlinked census records have no account to connect with
      const unlinkedPerson: Partial<PersonRow> = {
        ...BASE_PERSON,
        user_id: null,
      }
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_VIEWER, addressee_id: USER_OWNER, status: 'ACCEPTED' },
      ]
      const canView = evaluateEffectivePersonSelect(unlinkedPerson, USER_VIEWER, connections)
      expect(canView).toBe(false)
    })

    it('[NEGATIVE - SOFT-DELETED]: soft-deleted record is invisible even with accepted connection', () => {
      const softDeletedPerson: Partial<PersonRow> = {
        ...BASE_PERSON,
        deleted_at: '2026-10-05T12:00:00Z',
      }
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_VIEWER, addressee_id: USER_OWNER, status: 'ACCEPTED' },
      ]
      const canView = evaluateEffectivePersonSelect(softDeletedPerson, USER_VIEWER, connections)
      expect(canView).toBe(false)
    })

    it('[NEGATIVE - ARCHIVED]: ARCHIVED record is invisible even with accepted connection', () => {
      const archivedPerson: Partial<PersonRow> = {
        ...BASE_PERSON,
        status: 'ARCHIVED',
      }
      const connections: MockConnectionEdge[] = [
        { requester_id: USER_VIEWER, addressee_id: USER_OWNER, status: 'ACCEPTED' },
      ]
      const canView = evaluateEffectivePersonSelect(archivedPerson, USER_VIEWER, connections)
      expect(canView).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Cross-Tier Isolation: Connections must not violate other privacy tiers
  // ---------------------------------------------------------------------------
  describe('Cross-Tier Isolation: Non-Weakening of Other Privacy Tiers', () => {
    const acceptedConnections: MockConnectionEdge[] = [
      { requester_id: USER_VIEWER, addressee_id: USER_OWNER, status: 'ACCEPTED' },
    ]

    it('PRIVATE tier is NOT accessible to an accepted connection (owner only)', () => {
      const privatePerson: Partial<PersonRow> = {
        ...BASE_PERSON,
        profile_privacy: 'PRIVATE',
      }
      expect(evaluateEffectivePersonSelect(privatePerson, USER_VIEWER, acceptedConnections)).toBe(false)
      expect(evaluateEffectivePersonSelect(privatePerson, USER_OWNER, acceptedConnections)).toBe(true)
    })

    it('FAMILY tier is NOT accessible to a non-family accepted connection', () => {
      const familyPerson: Partial<PersonRow> = {
        ...BASE_PERSON,
        profile_privacy: 'FAMILY',
      }
      expect(evaluateEffectivePersonSelect(familyPerson, USER_VIEWER, acceptedConnections)).toBe(false)
    })

    it('COMMUNITY tier remains accessible to authenticated users regardless of connection', () => {
      const communityPerson: Partial<PersonRow> = {
        ...BASE_PERSON,
        profile_privacy: 'COMMUNITY',
      }
      expect(evaluateEffectivePersonSelect(communityPerson, USER_STRANGER, [])).toBe(true)
      expect(evaluateEffectivePersonSelect(communityPerson, null, [])).toBe(false)
    })

    it('PUBLIC tier remains accessible to anonymous visitors regardless of connection', () => {
      const publicPerson: Partial<PersonRow> = {
        ...BASE_PERSON,
        profile_privacy: 'PUBLIC',
      }
      expect(evaluateEffectivePersonSelect(publicPerson, null, [])).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Directional Symmetry Verification
  // ---------------------------------------------------------------------------
  describe('Bidirectional Symmetry', () => {
    it('mutual connection grants symmetric access to both participants', () => {
      const userA = 'user-alice'
      const userB = 'user-bob'

      const personA: Partial<PersonRow> = {
        id: 'person-a',
        user_id: userA,
        profile_privacy: 'CONNECTIONS',
        status: 'ACTIVE',
        deleted_at: null,
      }

      const personB: Partial<PersonRow> = {
        id: 'person-b',
        user_id: userB,
        profile_privacy: 'CONNECTIONS',
        status: 'ACTIVE',
        deleted_at: null,
      }

      // Alice sent connection to Bob, Bob accepted
      const edges: MockConnectionEdge[] = [
        { requester_id: userA, addressee_id: userB, status: 'ACCEPTED' },
      ]

      // Alice can view Bob's person
      expect(evaluateEffectivePersonSelect(personB, userA, edges)).toBe(true)

      // Bob can view Alice's person
      expect(evaluateEffectivePersonSelect(personA, userB, edges)).toBe(true)

      // Third party Charlie cannot view either
      const userC = 'user-charlie'
      expect(evaluateEffectivePersonSelect(personA, userC, edges)).toBe(false)
      expect(evaluateEffectivePersonSelect(personB, userC, edges)).toBe(false)
    })
  })
})
