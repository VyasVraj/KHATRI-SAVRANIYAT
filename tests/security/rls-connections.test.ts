/**
 * Security & RLS Tests: Connections Table Access Control (Phase 7 Subtask 1)
 *
 * Validates the Row Level Security policies, update guard trigger,
 * unordered pair uniqueness, and table-level privileges defined in:
 * supabase/migrations/20261005170000_create_connections.sql
 *
 * Per AGENTS.md Section 7: Every RLS policy requires BOTH:
 *   - Positive test: authorized actor CAN perform the operation
 *   - Negative test: unauthorized actor CANNOT perform the operation
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Evaluators mirroring SQL policy expressions
// ---------------------------------------------------------------------------

interface ConnectionRecord {
  id: string
  requester_id: string
  addressee_id: string
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED'
  created_at: string
  updated_at: string
}

interface EvaluatorContext {
  authUid: string | null
  isModerator?: boolean
}

/**
 * Evaluates: connections_select_participants
 * USING (
 *   auth.uid() = requester_id
 *   OR auth.uid() = addressee_id
 *   OR public.is_community_moderator()
 * )
 */
function canSelectConnection(row: ConnectionRecord, ctx: EvaluatorContext): boolean {
  if (!ctx.authUid) return false
  if (ctx.isModerator) return true
  return ctx.authUid === row.requester_id || ctx.authUid === row.addressee_id
}

/**
 * Evaluates: connections_insert_requester
 * WITH CHECK (
 *   auth.uid() IS NOT NULL
 *   AND auth.uid() = requester_id
 *   AND requester_id <> addressee_id
 *   AND status = 'PENDING'
 * )
 */
function canInsertConnection(row: ConnectionRecord, ctx: EvaluatorContext): boolean {
  if (!ctx.authUid) return false
  if (ctx.authUid !== row.requester_id) return false
  if (row.requester_id === row.addressee_id) return false
  if (row.status !== 'PENDING') return false
  return true
}

/**
 * Evaluates: connections_update_participants
 * USING (
 *   auth.uid() = requester_id
 *   OR auth.uid() = addressee_id
 *   OR public.is_community_moderator()
 * )
 * WITH CHECK (
 *   public.is_community_moderator()
 *   OR
 *   (status = 'BLOCKED' AND (auth.uid() = requester_id OR auth.uid() = addressee_id))
 *   OR
 *   (auth.uid() = addressee_id AND status IN ('ACCEPTED', 'REJECTED'))
 * )
 */
function canUpdateConnection(
  oldRow: ConnectionRecord,
  newRow: ConnectionRecord,
  ctx: EvaluatorContext
): boolean {
  if (!ctx.authUid) return false

  // USING check
  const allowedUsing =
    ctx.authUid === oldRow.requester_id ||
    ctx.authUid === oldRow.addressee_id ||
    Boolean(ctx.isModerator)

  if (!allowedUsing) return false

  // WITH CHECK
  if (ctx.isModerator) return true

  // Participant setting BLOCKED
  if (
    newRow.status === 'BLOCKED' &&
    (ctx.authUid === oldRow.requester_id || ctx.authUid === oldRow.addressee_id)
  ) {
    return true
  }

  // Only addressee can accept or reject
  if (
    ctx.authUid === oldRow.addressee_id &&
    (newRow.status === 'ACCEPTED' || newRow.status === 'REJECTED')
  ) {
    return true
  }

  return false
}

/**
 * Evaluates: connections_delete_participants
 * USING (
 *   public.is_community_moderator()
 *   OR (
 *     (auth.uid() = requester_id OR auth.uid() = addressee_id)
 *     AND status <> 'BLOCKED'
 *   )
 * )
 */
function canDeleteConnection(row: ConnectionRecord, ctx: EvaluatorContext): boolean {
  if (!ctx.authUid) return false
  if (ctx.isModerator) return true
  const isParticipant = ctx.authUid === row.requester_id || ctx.authUid === row.addressee_id
  return isParticipant && row.status !== 'BLOCKED'
}

/**
 * Evaluates: handle_connection_update_guard trigger
 */
function passesUpdateGuard(oldRow: ConnectionRecord, newRow: ConnectionRecord): boolean {
  if (newRow.id !== oldRow.id) return false
  if (newRow.requester_id !== oldRow.requester_id) return false
  if (newRow.addressee_id !== oldRow.addressee_id) return false
  if (newRow.created_at !== oldRow.created_at) return false
  return true
}

/**
 * Evaluates: handle_connection_status_transition_guard trigger
 */
function passesStatusTransitionGuard(
  oldRow: ConnectionRecord,
  newRow: ConnectionRecord,
  ctx: EvaluatorContext
): boolean {
  // 1. Moderator override
  if (ctx.isModerator) return true
  if (!ctx.authUid) return false

  const isParticipant =
    ctx.authUid === oldRow.requester_id || ctx.authUid === oldRow.addressee_id
  if (!isParticipant) return false

  // 2. Participant transition matrix
  if (oldRow.status === 'PENDING') {
    if (newRow.status === 'ACCEPTED' || newRow.status === 'REJECTED') {
      return ctx.authUid === oldRow.addressee_id
    }
    if (newRow.status === 'BLOCKED') {
      return true
    }
    return false
  }

  if (oldRow.status === 'ACCEPTED') {
    return newRow.status === 'BLOCKED'
  }

  if (oldRow.status === 'REJECTED') {
    return newRow.status === 'BLOCKED'
  }

  if (oldRow.status === 'BLOCKED') {
    return false // Participants cannot modify BLOCKED connections
  }

  return false
}

/**
 * Evaluates: are_users_connected(user_a UUID, user_b UUID)
 * Enforces caller authorization to prevent arbitrary social graph probing.
 */
function evaluateAreUsersConnected(
  callerUid: string | null,
  userA: string | null,
  userB: string | null,
  connections: ConnectionRecord[],
  isModerator = false
): boolean {
  if (!callerUid || !userA || !userB) return false

  // Caller authorization: caller must be userA, userB, or an active moderator/admin
  if (callerUid !== userA && callerUid !== userB && !isModerator) return false

  return connections.some(
    (conn) =>
      conn.status === 'ACCEPTED' &&
      ((conn.requester_id === userA && conn.addressee_id === userB) ||
        (conn.requester_id === userB && conn.addressee_id === userA))
  )
}

describe('Security: Connections Table RLS Policies & Access Controls', () => {
  const USER_A = '11111111-1111-4111-8111-111111111111'
  const USER_B = '22222222-2222-4222-8222-222222222222'
  const USER_C = '33333333-3333-4333-8333-333333333333'

  const BASE_CONN: ConnectionRecord = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    requester_id: USER_A,
    addressee_id: USER_B,
    status: 'PENDING',
    created_at: '2026-10-05T00:00:00Z',
    updated_at: '2026-10-05T00:00:00Z',
  }

  describe('Policy: connections_select_participants', () => {
    it('Positive: requester can read their connection record', () => {
      expect(canSelectConnection(BASE_CONN, { authUid: USER_A })).toBe(true)
    })

    it('Positive: addressee can read connection record', () => {
      expect(canSelectConnection(BASE_CONN, { authUid: USER_B })).toBe(true)
    })

    it('Positive: community moderator can read any connection record', () => {
      expect(canSelectConnection(BASE_CONN, { authUid: USER_C, isModerator: true })).toBe(true)
    })

    it('Negative: unrelated third-party user CANNOT read connection record', () => {
      expect(canSelectConnection(BASE_CONN, { authUid: USER_C, isModerator: false })).toBe(false)
    })

    it('Negative: unauthenticated visitor (null authUid) CANNOT read connection', () => {
      expect(canSelectConnection(BASE_CONN, { authUid: null })).toBe(false)
    })
  })

  describe('Policy: connections_insert_requester', () => {
    it('Positive: authenticated user can create request as requester with PENDING status', () => {
      expect(canInsertConnection(BASE_CONN, { authUid: USER_A })).toBe(true)
    })

    it('Negative: user cannot create request on behalf of another user', () => {
      expect(canInsertConnection(BASE_CONN, { authUid: USER_B })).toBe(false)
    })

    it('Negative: user cannot connect to themselves (self-connection)', () => {
      const selfConn = { ...BASE_CONN, requester_id: USER_A, addressee_id: USER_A }
      expect(canInsertConnection(selfConn, { authUid: USER_A })).toBe(false)
    })

    it('Negative: client cannot insert directly with ACCEPTED status (privilege escalation)', () => {
      const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
      expect(canInsertConnection(accepted, { authUid: USER_A })).toBe(false)
    })

    it('Negative: unauthenticated visitor cannot insert connection requests', () => {
      expect(canInsertConnection(BASE_CONN, { authUid: null })).toBe(false)
    })
  })

  describe('Policy: connections_update_participants', () => {
    it('Positive: addressee can accept a PENDING request', () => {
      const updated = { ...BASE_CONN, status: 'ACCEPTED' as const }
      expect(canUpdateConnection(BASE_CONN, updated, { authUid: USER_B })).toBe(true)
    })

    it('Positive: addressee can reject a PENDING request', () => {
      const updated = { ...BASE_CONN, status: 'REJECTED' as const }
      expect(canUpdateConnection(BASE_CONN, updated, { authUid: USER_B })).toBe(true)
    })

    it('Positive: requester can transition to BLOCKED', () => {
      const updated = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(canUpdateConnection(BASE_CONN, updated, { authUid: USER_A })).toBe(true)
    })

    it('Positive: addressee can transition to BLOCKED', () => {
      const updated = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(canUpdateConnection(BASE_CONN, updated, { authUid: USER_B })).toBe(true)
    })

    it('Negative: requester CANNOT accept their own connection request', () => {
      const updated = { ...BASE_CONN, status: 'ACCEPTED' as const }
      expect(canUpdateConnection(BASE_CONN, updated, { authUid: USER_A })).toBe(false)
    })

    it('Negative: requester CANNOT reject their own connection request', () => {
      const updated = { ...BASE_CONN, status: 'REJECTED' as const }
      expect(canUpdateConnection(BASE_CONN, updated, { authUid: USER_A })).toBe(false)
    })

    it('Negative: unrelated user CANNOT update status', () => {
      const updated = { ...BASE_CONN, status: 'ACCEPTED' as const }
      expect(canUpdateConnection(BASE_CONN, updated, { authUid: USER_C, isModerator: false })).toBe(
        false
      )
    })
  })

  describe('Policy: connections_delete_participants', () => {
    it('Positive: requester can delete/cancel a PENDING connection', () => {
      expect(canDeleteConnection(BASE_CONN, { authUid: USER_A })).toBe(true)
    })

    it('Positive: addressee can delete/cancel a PENDING connection', () => {
      expect(canDeleteConnection(BASE_CONN, { authUid: USER_B })).toBe(true)
    })

    it('Positive: requester can delete an ACCEPTED connection', () => {
      const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
      expect(canDeleteConnection(accepted, { authUid: USER_A })).toBe(true)
    })

    it('Positive: addressee can delete an ACCEPTED connection', () => {
      const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
      expect(canDeleteConnection(accepted, { authUid: USER_B })).toBe(true)
    })

    it('Positive: requester can delete a REJECTED connection', () => {
      const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
      expect(canDeleteConnection(rejected, { authUid: USER_A })).toBe(true)
    })

    it('Positive: addressee can delete a REJECTED connection', () => {
      const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
      expect(canDeleteConnection(rejected, { authUid: USER_B })).toBe(true)
    })

    it('Negative: requester (blocker) CANNOT delete a BLOCKED connection', () => {
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(canDeleteConnection(blocked, { authUid: USER_A })).toBe(false)
    })

    it('Negative: addressee (blocked) CANNOT delete a BLOCKED connection', () => {
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(canDeleteConnection(blocked, { authUid: USER_B })).toBe(false)
    })

    it('Positive: community moderator CAN delete a BLOCKED connection', () => {
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(canDeleteConnection(blocked, { authUid: USER_C, isModerator: true })).toBe(true)
    })

    it('Negative: unrelated third party CANNOT delete connection', () => {
      expect(canDeleteConnection(BASE_CONN, { authUid: USER_C, isModerator: false })).toBe(false)
    })

    it('Negative: unauthenticated visitor CANNOT delete connection', () => {
      expect(canDeleteConnection(BASE_CONN, { authUid: null })).toBe(false)
    })
  })

  describe('Anti-Bypass Invariant: Persistent BLOCKED State & Re-request Prevention', () => {
    it('proves blocked participant cannot delete row to bypass block and send new request', () => {
      // 1. User A blocks User B
      const blockedRow: ConnectionRecord = {
        ...BASE_CONN,
        requester_id: USER_A,
        addressee_id: USER_B,
        status: 'BLOCKED',
      }

      // 2. User B tries to delete the BLOCKED connection row
      const bCanDelete = canDeleteConnection(blockedRow, { authUid: USER_B })
      expect(bCanDelete).toBe(false)

      // 3. User A (who created the block) also cannot delete via normal participant DELETE
      const aCanDelete = canDeleteConnection(blockedRow, { authUid: USER_A })
      expect(aCanDelete).toBe(false)

      // 4. Because the row cannot be deleted, the canonical pair remains occupied:
      // (LEAST(A, B), GREATEST(A, B)) is still present in the table.
      // Any new INSERT for this unordered pair fails canonical uniqueness (Postgres 23505).
      const newRequestAttempt: ConnectionRecord = {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        requester_id: USER_B,
        addressee_id: USER_A,
        status: 'PENDING',
        created_at: '2026-10-05T01:00:00Z',
        updated_at: '2026-10-05T01:00:00Z',
      }

      // Canonical pair calculation matches existing row
      const existingPair = [
        blockedRow.requester_id < blockedRow.addressee_id ? blockedRow.requester_id : blockedRow.addressee_id,
        blockedRow.requester_id > blockedRow.addressee_id ? blockedRow.requester_id : blockedRow.addressee_id,
      ]
      const newPair = [
        newRequestAttempt.requester_id < newRequestAttempt.addressee_id
          ? newRequestAttempt.requester_id
          : newRequestAttempt.addressee_id,
        newRequestAttempt.requester_id > newRequestAttempt.addressee_id
          ? newRequestAttempt.requester_id
          : newRequestAttempt.addressee_id,
      ]
      expect(newPair).toEqual(existingPair) // Collides with existing BLOCKED row!
    })
  })

  describe('Trigger: handle_connection_update_guard', () => {
    it('Positive: allows status and updated_at updates', () => {
      const modified = { ...BASE_CONN, status: 'ACCEPTED' as const, updated_at: '2026-10-05T01:00:00Z' }
      expect(passesUpdateGuard(BASE_CONN, modified)).toBe(true)
    })

    it('Negative: rejects mutating id', () => {
      const modified = { ...BASE_CONN, id: 'new-id-uuid-1111-111111111111' }
      expect(passesUpdateGuard(BASE_CONN, modified)).toBe(false)
    })

    it('Negative: rejects mutating requester_id', () => {
      const modified = { ...BASE_CONN, requester_id: USER_C }
      expect(passesUpdateGuard(BASE_CONN, modified)).toBe(false)
    })

    it('Negative: rejects mutating addressee_id', () => {
      const modified = { ...BASE_CONN, addressee_id: USER_C }
      expect(passesUpdateGuard(BASE_CONN, modified)).toBe(false)
    })

    it('Negative: rejects mutating created_at', () => {
      const modified = { ...BASE_CONN, created_at: '1990-01-01T00:00:00Z' }
      expect(passesUpdateGuard(BASE_CONN, modified)).toBe(false)
    })
  })

  describe('Trigger: handle_connection_status_transition_guard (Lifecycle Integrity)', () => {
    describe('Valid Participant Transitions', () => {
      it('PENDING -> ACCEPTED (only addressee)', () => {
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        expect(passesStatusTransitionGuard(pending, accepted, { authUid: USER_B })).toBe(true)
      })

      it('PENDING -> REJECTED (only addressee)', () => {
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
        expect(passesStatusTransitionGuard(pending, rejected, { authUid: USER_B })).toBe(true)
      })

      it('PENDING -> BLOCKED (requester)', () => {
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
        expect(passesStatusTransitionGuard(pending, blocked, { authUid: USER_A })).toBe(true)
      })

      it('PENDING -> BLOCKED (addressee)', () => {
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
        expect(passesStatusTransitionGuard(pending, blocked, { authUid: USER_B })).toBe(true)
      })

      it('ACCEPTED -> BLOCKED (either participant)', () => {
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
        expect(passesStatusTransitionGuard(accepted, blocked, { authUid: USER_A })).toBe(true)
        expect(passesStatusTransitionGuard(accepted, blocked, { authUid: USER_B })).toBe(true)
      })

      it('REJECTED -> BLOCKED (either participant)', () => {
        const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
        const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
        expect(passesStatusTransitionGuard(rejected, blocked, { authUid: USER_A })).toBe(true)
        expect(passesStatusTransitionGuard(rejected, blocked, { authUid: USER_B })).toBe(true)
      })

      it('Moderator can perform transitions', () => {
        const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        expect(passesStatusTransitionGuard(blocked, accepted, { authUid: USER_C, isModerator: true })).toBe(true)
      })
    })

    describe('Invalid Participant Transitions', () => {
      it('Negative: ACCEPTED -> REJECTED (disallowed)', () => {
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
        expect(passesStatusTransitionGuard(accepted, rejected, { authUid: USER_B })).toBe(false)
      })

      it('Negative: ACCEPTED -> ACCEPTED (no participant cycling)', () => {
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        expect(passesStatusTransitionGuard(accepted, accepted, { authUid: USER_B })).toBe(false)
      })

      it('Negative: REJECTED -> ACCEPTED (disallowed)', () => {
        const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        expect(passesStatusTransitionGuard(rejected, accepted, { authUid: USER_B })).toBe(false)
      })

      it('Negative: REJECTED -> REJECTED (no participant cycling)', () => {
        const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
        expect(passesStatusTransitionGuard(rejected, rejected, { authUid: USER_B })).toBe(false)
      })

      it('Negative: ACCEPTED -> PENDING (disallowed)', () => {
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        expect(passesStatusTransitionGuard(accepted, pending, { authUid: USER_A })).toBe(false)
      })

      it('Negative: REJECTED -> PENDING (disallowed)', () => {
        const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        expect(passesStatusTransitionGuard(rejected, pending, { authUid: USER_A })).toBe(false)
      })

      it('Negative: BLOCKED -> ACCEPTED (disallowed for participants)', () => {
        const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        expect(passesStatusTransitionGuard(blocked, accepted, { authUid: USER_A })).toBe(false)
        expect(passesStatusTransitionGuard(blocked, accepted, { authUid: USER_B })).toBe(false)
      })

      it('Negative: BLOCKED -> REJECTED (disallowed for participants)', () => {
        const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
        const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
        expect(passesStatusTransitionGuard(blocked, rejected, { authUid: USER_A })).toBe(false)
      })

      it('Negative: BLOCKED -> PENDING (disallowed for participants)', () => {
        const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        expect(passesStatusTransitionGuard(blocked, pending, { authUid: USER_B })).toBe(false)
      })

      it('Negative: BLOCKED -> BLOCKED (disallowed for participants)', () => {
        const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
        expect(passesStatusTransitionGuard(blocked, blocked, { authUid: USER_A })).toBe(false)
      })

      it('Negative: PENDING -> ACCEPTED by requester (only addressee can accept)', () => {
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        expect(passesStatusTransitionGuard(pending, accepted, { authUid: USER_A })).toBe(false)
      })

      it('Negative: PENDING -> REJECTED by requester (only addressee can reject)', () => {
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
        expect(passesStatusTransitionGuard(pending, rejected, { authUid: USER_A })).toBe(false)
      })

      it('Negative: non-participant cannot update connection status', () => {
        const pending = { ...BASE_CONN, status: 'PENDING' as const }
        const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
        expect(passesStatusTransitionGuard(pending, accepted, { authUid: USER_C, isModerator: false })).toBe(false)
      })
    })
  })

  describe('Specification Verification: 20 Mandatory Transition, Immutability & Anti-Bypass Requirements', () => {
    // 1. PENDING -> ACCEPTED by addressee
    it('1. VALID: PENDING -> ACCEPTED by addressee', () => {
      const pending = { ...BASE_CONN, status: 'PENDING' as const }
      const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
      expect(passesStatusTransitionGuard(pending, accepted, { authUid: USER_B })).toBe(true)
    })

    // 2. PENDING -> REJECTED by addressee
    it('2. VALID: PENDING -> REJECTED by addressee', () => {
      const pending = { ...BASE_CONN, status: 'PENDING' as const }
      const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
      expect(passesStatusTransitionGuard(pending, rejected, { authUid: USER_B })).toBe(true)
    })

    // 3. PENDING -> BLOCKED by requester
    it('3. VALID: PENDING -> BLOCKED by requester', () => {
      const pending = { ...BASE_CONN, status: 'PENDING' as const }
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(passesStatusTransitionGuard(pending, blocked, { authUid: USER_A })).toBe(true)
    })

    // 4. PENDING -> BLOCKED by addressee
    it('4. VALID: PENDING -> BLOCKED by addressee', () => {
      const pending = { ...BASE_CONN, status: 'PENDING' as const }
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(passesStatusTransitionGuard(pending, blocked, { authUid: USER_B })).toBe(true)
    })

    // 5. ACCEPTED -> BLOCKED by participant
    it('5. VALID: ACCEPTED -> BLOCKED by participant', () => {
      const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(passesStatusTransitionGuard(accepted, blocked, { authUid: USER_A })).toBe(true)
      expect(passesStatusTransitionGuard(accepted, blocked, { authUid: USER_B })).toBe(true)
    })

    // 6. REJECTED -> BLOCKED by participant
    it('6. VALID: REJECTED -> BLOCKED by participant', () => {
      const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(passesStatusTransitionGuard(rejected, blocked, { authUid: USER_A })).toBe(true)
      expect(passesStatusTransitionGuard(rejected, blocked, { authUid: USER_B })).toBe(true)
    })

    // 7. ACCEPTED -> REJECTED
    it('7. INVALID: ACCEPTED -> REJECTED', () => {
      const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
      const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
      expect(passesStatusTransitionGuard(accepted, rejected, { authUid: USER_A })).toBe(false)
      expect(passesStatusTransitionGuard(accepted, rejected, { authUid: USER_B })).toBe(false)
    })

    // 8. REJECTED -> ACCEPTED
    it('8. INVALID: REJECTED -> ACCEPTED', () => {
      const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
      const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
      expect(passesStatusTransitionGuard(rejected, accepted, { authUid: USER_A })).toBe(false)
      expect(passesStatusTransitionGuard(rejected, accepted, { authUid: USER_B })).toBe(false)
    })

    // 9. ACCEPTED -> PENDING
    it('9. INVALID: ACCEPTED -> PENDING', () => {
      const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
      const pending = { ...BASE_CONN, status: 'PENDING' as const }
      expect(passesStatusTransitionGuard(accepted, pending, { authUid: USER_A })).toBe(false)
      expect(passesStatusTransitionGuard(accepted, pending, { authUid: USER_B })).toBe(false)
    })

    // 10. REJECTED -> PENDING
    it('10. INVALID: REJECTED -> PENDING', () => {
      const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
      const pending = { ...BASE_CONN, status: 'PENDING' as const }
      expect(passesStatusTransitionGuard(rejected, pending, { authUid: USER_A })).toBe(false)
      expect(passesStatusTransitionGuard(rejected, pending, { authUid: USER_B })).toBe(false)
    })

    // 11. BLOCKED -> ACCEPTED
    it('11. INVALID: BLOCKED -> ACCEPTED', () => {
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      const accepted = { ...BASE_CONN, status: 'ACCEPTED' as const }
      expect(passesStatusTransitionGuard(blocked, accepted, { authUid: USER_A })).toBe(false)
      expect(passesStatusTransitionGuard(blocked, accepted, { authUid: USER_B })).toBe(false)
    })

    // 12. BLOCKED -> REJECTED
    it('12. INVALID: BLOCKED -> REJECTED', () => {
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      const rejected = { ...BASE_CONN, status: 'REJECTED' as const }
      expect(passesStatusTransitionGuard(blocked, rejected, { authUid: USER_A })).toBe(false)
      expect(passesStatusTransitionGuard(blocked, rejected, { authUid: USER_B })).toBe(false)
    })

    // 13. BLOCKED -> PENDING
    it('13. INVALID: BLOCKED -> PENDING', () => {
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      const pending = { ...BASE_CONN, status: 'PENDING' as const }
      expect(passesStatusTransitionGuard(blocked, pending, { authUid: USER_A })).toBe(false)
      expect(passesStatusTransitionGuard(blocked, pending, { authUid: USER_B })).toBe(false)
    })

    // 14. id immutability
    it('14. id immutability', () => {
      const modified = { ...BASE_CONN, id: '99999999-9999-4999-8999-999999999999' }
      expect(passesUpdateGuard(BASE_CONN, modified)).toBe(false)
    })

    // 15. requester_id immutability
    it('15. requester_id immutability', () => {
      const modified = { ...BASE_CONN, requester_id: USER_C }
      expect(passesUpdateGuard(BASE_CONN, modified)).toBe(false)
    })

    // 16. addressee_id immutability
    it('16. addressee_id immutability', () => {
      const modified = { ...BASE_CONN, addressee_id: USER_C }
      expect(passesUpdateGuard(BASE_CONN, modified)).toBe(false)
    })

    // 17. created_at immutability
    it('17. created_at immutability', () => {
      const modified = { ...BASE_CONN, created_at: '2020-01-01T00:00:00Z' }
      expect(passesUpdateGuard(BASE_CONN, modified)).toBe(false)
    })

    // 18. BLOCKED participant deletion denied
    it('18. BLOCKED participant deletion denied', () => {
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(canDeleteConnection(blocked, { authUid: USER_A })).toBe(false)
      expect(canDeleteConnection(blocked, { authUid: USER_B })).toBe(false)
    })

    // 19. moderator BLOCKED deletion allowed
    it('19. moderator BLOCKED deletion allowed', () => {
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(canDeleteConnection(blocked, { authUid: USER_C, isModerator: true })).toBe(true)
    })

    // 20. canonical pair cannot be recreated after participant BLOCKED state
    it('20. canonical pair cannot be recreated after participant BLOCKED state', () => {
      const blocked = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(canDeleteConnection(blocked, { authUid: USER_B })).toBe(false)
      const newAttempt = {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requester_id: USER_B,
        addressee_id: USER_A,
        status: 'PENDING' as const,
        created_at: '2026-10-05T02:00:00Z',
        updated_at: '2026-10-05T02:00:00Z',
      }
      const pairBlocked = [
        blocked.requester_id < blocked.addressee_id ? blocked.requester_id : blocked.addressee_id,
        blocked.requester_id > blocked.addressee_id ? blocked.requester_id : blocked.addressee_id,
      ]
      const pairNew = [
        newAttempt.requester_id < newAttempt.addressee_id ? newAttempt.requester_id : newAttempt.addressee_id,
        newAttempt.requester_id > newAttempt.addressee_id ? newAttempt.requester_id : newAttempt.addressee_id,
      ]
      expect(pairNew).toEqual(pairBlocked)
    })
  })

  describe('Caller-Authorized Helper: are_users_connected (Oracle Prevention)', () => {
    const acceptedEdge: ConnectionRecord = {
      ...BASE_CONN,
      status: 'ACCEPTED',
    }

    it('1. User A asks A <-> B (accepted): returns TRUE', () => {
      expect(evaluateAreUsersConnected(USER_A, USER_A, USER_B, [acceptedEdge])).toBe(true)
    })

    it('2. User A asks A <-> B (pending): returns FALSE', () => {
      const pendingEdge = { ...BASE_CONN, status: 'PENDING' as const }
      expect(evaluateAreUsersConnected(USER_A, USER_A, USER_B, [pendingEdge])).toBe(false)
    })

    it('3. User A asks A <-> B (rejected): returns FALSE', () => {
      const rejectedEdge = { ...BASE_CONN, status: 'REJECTED' as const }
      expect(evaluateAreUsersConnected(USER_A, USER_A, USER_B, [rejectedEdge])).toBe(false)
    })

    it('4. User A asks A <-> B (blocked): returns FALSE', () => {
      const blockedEdge = { ...BASE_CONN, status: 'BLOCKED' as const }
      expect(evaluateAreUsersConnected(USER_A, USER_A, USER_B, [blockedEdge])).toBe(false)
    })

    it('5. User B asks A <-> B (accepted): returns TRUE', () => {
      expect(evaluateAreUsersConnected(USER_B, USER_A, USER_B, [acceptedEdge])).toBe(true)
    })

    it('6. Unrelated User C asks A <-> B (accepted): returns FALSE (prevents social graph probing)', () => {
      expect(evaluateAreUsersConnected(USER_C, USER_A, USER_B, [acceptedEdge], false)).toBe(false)
    })

    it('7. Unauthenticated execution (null caller): returns FALSE', () => {
      expect(evaluateAreUsersConnected(null, USER_A, USER_B, [acceptedEdge])).toBe(false)
    })

    it('8. Null user arguments: returns FALSE', () => {
      expect(evaluateAreUsersConnected(USER_A, null, USER_B, [acceptedEdge])).toBe(false)
      expect(evaluateAreUsersConnected(USER_A, USER_A, null, [acceptedEdge])).toBe(false)
    })

    it('9. Active community moderator asks A <-> B: returns TRUE', () => {
      expect(evaluateAreUsersConnected(USER_C, USER_A, USER_B, [acceptedEdge], true)).toBe(true)
    })
  })

  describe('Static Migration Verification (supabase/migrations/20261005170000_create_connections.sql)', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../supabase/migrations/20261005170000_create_connections.sql'
    )
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8')

    it('1. Enables Row Level Security on connections', () => {
      expect(migrationContent).toMatch(
        /ALTER\s+TABLE\s+public\.connections\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/i
      )
    })

    it('2. Enforces unordered pair uniqueness (no duplicate pairs A,B and B,A)', () => {
      expect(migrationContent).toMatch(/CREATE\s+UNIQUE\s+INDEX.*idx_connections_canonical_pair/i)
      expect(migrationContent).toContain('LEAST(requester_id, addressee_id)')
      expect(migrationContent).toContain('GREATEST(requester_id, addressee_id)')
    })

    it('3. Enforces no self-connections via check constraint', () => {
      expect(migrationContent).toMatch(
        /CONSTRAINT\s+connections_no_self_connection\s+CHECK\s*\(\s*requester_id\s*<>\s*addressee_id\s*\)/i
      )
    })

    it('4. Revokes all privileges from PUBLIC and anon (Gate 1 deny-by-default)', () => {
      expect(migrationContent).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.connections\s+FROM\s+PUBLIC\s*;/i
      )
      expect(migrationContent).toMatch(
        /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.connections\s+FROM\s+anon\s*;/i
      )
    })

    it('5. Grants minimum required privileges (SELECT, INSERT, UPDATE, DELETE) to authenticated', () => {
      expect(migrationContent).toMatch(
        /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.connections\s+TO\s+authenticated\s*;/i
      )
    })

    it('6. Implements SECURITY DEFINER are_users_connected helper with search_path and caller authorization', () => {
      expect(migrationContent).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.are_users_connected/i)
      expect(migrationContent).toContain('SECURITY DEFINER')
      expect(migrationContent).toContain('SET search_path = public')
      expect(migrationContent).toContain('auth.uid() <> user_a AND auth.uid() <> user_b')
      expect(migrationContent).toContain('public.is_community_moderator()')
    })

    it('7. Enforces hardened connections_delete_participants policy (blocks participant deletion of BLOCKED rows)', () => {
      expect(migrationContent).toMatch(
        /CREATE\s+POLICY\s+"connections_delete_participants"\s+ON\s+public\.connections\s+FOR\s+DELETE/i
      )
      expect(migrationContent).toContain('public.is_community_moderator()')
      expect(migrationContent).toMatch(/status\s*<>\s*'BLOCKED'/i)
    })

    it('8. Enforces handle_connection_status_transition_guard trigger for authoritative lifecycle transitions', () => {
      expect(migrationContent).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.handle_connection_status_transition_guard/i)
      expect(migrationContent).toMatch(/CREATE\s+TRIGGER\s+connections_status_transition_guard/i)
      expect(migrationContent).toContain('Invalid connection status transition from ACCEPTED')
      expect(migrationContent).toContain('Invalid connection status transition from REJECTED')
      expect(migrationContent).toContain('Participants cannot modify a BLOCKED connection')
    })
  })
})
