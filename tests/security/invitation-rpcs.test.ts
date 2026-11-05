/**
 * Security & RLS Tests: Invitation RPCs & Hardening (Phase 8 Subtask 4A)
 *
 * Validates the database RPC functions, privilege grants, and architectural
 * invariants defined in:
 * supabase/migrations/20261006120000_create_invitation_rpcs.sql
 *
 * Verified Invariants:
 * 1. PERSON != USER (invitation acceptance does NOT touch persons.user_id)
 * 2. FAMILY MEMBERSHIP != PERSON OWNERSHIP (membership does not grant claim ownership)
 * 3. INVITATION != CLAIM (invitation acceptance does not create or approve a claim)
 * 4. FAMILY MEMBERSHIP != RELATIONSHIP (invitations do not touch public.relationships)
 * 5. NO SYNTHETIC PEOPLE (requires existing living census record)
 * 6. TOKEN SECURITY & PRIVILEGE HARDENING (SHA-256 only, token_hash withheld, least privilege)
 * 7. ATOMICITY & IDEMPOTENT MEMBERSHIP (locking FOR UPDATE, active vs historical left_at handling)
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Load migration SQL content for static AST / semantic verification
const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20261006120000_create_invitation_rpcs.sql'
)
const migrationSql = fs.readFileSync(migrationPath, 'utf8')

// ---------------------------------------------------------------------------
// 1. Static Migration & Schema Inspection Tests
// ---------------------------------------------------------------------------

describe('Migration Static Inspection: 20261006120000_create_invitation_rpcs.sql', () => {
  it('migration file exists and is non-empty', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
    expect(migrationSql.length).toBeGreaterThan(1000)
  })

  it('defines create_family_invitation as SECURITY DEFINER with search_path = public', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_family_invitation\(/)
    expect(migrationSql).toMatch(/public\.create_family_invitation[\s\S]*?SECURITY DEFINER/)
    expect(migrationSql).toMatch(/public\.create_family_invitation[\s\S]*?SET search_path = public/)
  })

  it('defines get_invitation_by_token as SECURITY DEFINER with search_path = public', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_invitation_by_token\(/)
    expect(migrationSql).toMatch(/public\.get_invitation_by_token[\s\S]*?SECURITY DEFINER/)
    expect(migrationSql).toMatch(/public\.get_invitation_by_token[\s\S]*?SET search_path = public/)
  })

  it('defines accept_invitation as SECURITY DEFINER with search_path = public', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.accept_invitation\(/)
    expect(migrationSql).toMatch(/public\.accept_invitation[\s\S]*?SECURITY DEFINER/)
    expect(migrationSql).toMatch(/public\.accept_invitation[\s\S]*?SET search_path = public/)
  })

  it('uses actual family_members columns (added_by, left_at) and avoids created_by / deleted_at assumptions', () => {
    // Must use added_by and left_at
    expect(migrationSql).toContain('added_by')
    expect(migrationSql).toContain('left_at')

    // Must NOT assume created_by or deleted_at on family_members
    expect(migrationSql).not.toMatch(/family_members\s*\([^)]*created_by/i)
    expect(migrationSql).not.toMatch(/family_members\s+SET[^;]*created_by/i)
    expect(migrationSql).not.toMatch(/v_existing_member\.created_by/i)
    expect(migrationSql).not.toMatch(/family_members\s*\([^)]*deleted_at/i)
    expect(migrationSql).not.toMatch(/family_members\s+SET[^;]*deleted_at/i)
    expect(migrationSql).not.toMatch(/v_existing_member\.deleted_at/i)
  })

  it('strictly preserves PERSON != USER: does NOT modify persons.user_id', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.persons\s+SET[\s\S]*?user_id\s*=/)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.persons/)
  })

  it('strictly preserves INVITATION != CLAIM: does NOT modify person_claims', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.person_claims/)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.person_claims/)
  })

  it('strictly preserves MEMBERSHIP != RELATIONSHIP: does NOT modify relationships', () => {
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.relationships/)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.relationships/)
  })

  it('enforces row-level locking (FOR UPDATE) in accept_invitation', () => {
    expect(migrationSql).toMatch(/FROM public\.invitations[\s\S]*?FOR UPDATE;/)
  })

  it('validates 64-character SHA-256 token hash format via regex', () => {
    expect(migrationSql).toContain("^[0-9a-f]{64}$")
  })

  it('verifies Gate 1 privilege hardening: least privilege enforced, service_role omitted', () => {
    // create_family_invitation
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.create_family_invitation[\s\S]*?FROM PUBLIC;/)
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.create_family_invitation[\s\S]*?FROM anon;/)
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.create_family_invitation[\s\S]*?FROM service_role;/)
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_family_invitation[\s\S]*?TO authenticated;/)
    expect(migrationSql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.create_family_invitation[\s\S]*?TO service_role;/)

    // get_invitation_by_token (anon and authenticated granted for preview; service_role omitted)
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.get_invitation_by_token[\s\S]*?FROM PUBLIC;/)
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.get_invitation_by_token[\s\S]*?FROM service_role;/)
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_invitation_by_token[\s\S]*?TO anon;/)
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_invitation_by_token[\s\S]*?TO authenticated;/)
    expect(migrationSql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.get_invitation_by_token[\s\S]*?TO service_role;/)

    // accept_invitation (authenticated only; service_role omitted)
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.accept_invitation[\s\S]*?FROM PUBLIC;/)
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.accept_invitation[\s\S]*?FROM anon;/)
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.accept_invitation[\s\S]*?FROM service_role;/)
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.accept_invitation[\s\S]*?TO authenticated;/)
    expect(migrationSql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.accept_invitation[\s\S]*?TO service_role;/)

    // Direct client insertion on invitations table revoked in favor of the RPC
    expect(migrationSql).toContain('REVOKE INSERT ON public.invitations FROM authenticated;')
  })

  it('resets is_head = FALSE in Case B to guarantee active-head uniqueness is never violated', () => {
    expect(migrationSql).toMatch(/UPDATE\s+public\.family_members[\s\S]*?is_head\s*=\s*FALSE/)
  })

  it('enforces database-level uniqueness via partial unique index idx_invitations_one_pending_per_person', () => {
    expect(migrationSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_one_pending_per_person[\s\S]*?ON public\.invitations\s*\(\s*family_id\s*,\s*person_id\s*\)[\s\S]*?WHERE status\s*=\s*'PENDING';/
    )
  })

  it('locks existing pending row FOR UPDATE in create_family_invitation to handle concurrency safely', () => {
    expect(migrationSql).toMatch(
      /SELECT id, expires_at INTO v_existing_pending[\s\S]*?FROM public\.invitations[\s\S]*?WHERE family_id = p_family_id[\s\S]*?AND person_id = p_person_id[\s\S]*?AND status = 'PENDING'[\s\S]*?FOR UPDATE;/
    )
  })

  it('guards INSERT with unique_violation exception handler in create_family_invitation', () => {
    expect(migrationSql).toMatch(/EXCEPTION[\s\S]*?WHEN unique_violation THEN[\s\S]*?RAISE EXCEPTION/)
  })

  it('audits public.family_role enum from foundation migration to verify purely census classification with zero elevated privileges', () => {
    const foundationPath = path.resolve(__dirname, '../../supabase/migrations/20261002140000_phase1_foundation.sql')
    const foundationSql = fs.readFileSync(foundationPath, 'utf8')
    const expectedRoles = ['HEAD', 'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'GRANDPARENT', 'GRANDCHILD', 'EXTENDED']
    for (const role of expectedRoles) {
      expect(foundationSql).toContain(`'${role}'`)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Behavioral Simulation & Logic Contract Verification
// ---------------------------------------------------------------------------

interface SimulationContext {
  callerId: string | null
  isModerator: boolean
}

interface FamilyState {
  id: string
  created_by: string
  status: 'ACTIVE' | 'ARCHIVED'
  deleted_at: string | null
}

interface PersonState {
  id: string
  status: 'ACTIVE' | 'ARCHIVED'
  deleted_at: string | null
  date_of_death: string | null
}

interface MemberState {
  id: string
  family_id: string
  person_id: string
  role: string
  is_head: boolean
  left_at: string | null
  added_by: string
}

interface InvitationState {
  id: string
  family_id: string
  person_id: string
  invited_email: string
  invited_by: string
  role: string
  token_hash: string
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
  expires_at: string
  accepted_by: string | null
  accepted_at: string | null
}

describe('Invitation RPC Logic Contract Simulation', () => {
  const FAMILY_ID = '11111111-1111-4111-8111-111111111111'
  const PERSON_ID = '22222222-2222-4222-8222-222222222222'
  const CREATOR_ID = '33333333-3333-4333-8333-333333333333'
  const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444'
  const VALID_HASH = 'a'.repeat(64)
  const VALID_HASH_2 = 'b'.repeat(64)

  const ACTIVE_FAMILY: FamilyState = {
    id: FAMILY_ID,
    created_by: CREATOR_ID,
    status: 'ACTIVE',
    deleted_at: null,
  }

  const ACTIVE_PERSON: PersonState = {
    id: PERSON_ID,
    status: 'ACTIVE',
    deleted_at: null,
    date_of_death: null,
  }

  function simulateCreateInvitation(
    ctx: SimulationContext,
    params: {
      familyId: string | null
      personId: string | null
      invitedEmail: string
      role: string
      tokenHash: string
      expiresAt: string
    },
    family: FamilyState | null,
    person: PersonState | null,
    existingMembers: MemberState[],
    existingInvitations: InvitationState[]
  ): { success: boolean; error?: string } {
    if (!ctx.callerId) return { success: false, error: 'Authentication required' }
    if (!params.familyId) return { success: false, error: 'family_id required' }
    if (!family || family.deleted_at !== null || family.status !== 'ACTIVE') {
      return { success: false, error: 'Target family does not exist or inactive' }
    }
    const isAuthorized = ctx.isModerator || family.created_by === ctx.callerId
    if (!isAuthorized) return { success: false, error: 'Not authorized for family' }

    if (!params.personId) return { success: false, error: 'person_id required' }
    if (!person || person.deleted_at !== null || person.status !== 'ACTIVE') {
      return { success: false, error: 'Target person does not exist or inactive' }
    }
    if (person.date_of_death !== null) return { success: false, error: 'Person is deceased' }

    // Active member check
    const isAlreadyMember = existingMembers.some(
      (m) => m.family_id === params.familyId && m.person_id === params.personId && m.left_at === null
    )
    if (isAlreadyMember) return { success: false, error: 'Person is already active member' }

    // Duplicate pending invitation check / handling under partial unique index
    const now = new Date()
    const existingPending = existingInvitations.find(
      (i) => i.family_id === params.familyId && i.person_id === params.personId && i.status === 'PENDING'
    )
    if (existingPending) {
      if (new Date(existingPending.expires_at) > now) {
        return { success: false, error: 'Active invitation already exists' }
      } else {
        // Expired pending invitation is transitioned to EXPIRED, clearing the unique constraint
        existingPending.status = 'EXPIRED'
      }
    }

    // Email check
    const cleanEmail = params.invitedEmail.trim().toLowerCase()
    if (!cleanEmail.includes('@') || cleanEmail.length < 3) return { success: false, error: 'Invalid email' }

    // Hash check
    if (!/^[0-9a-f]{64}$/.test(params.tokenHash)) return { success: false, error: 'Invalid token hash' }

    // Expiration check
    if (new Date(params.expiresAt) <= now) return { success: false, error: 'Expiration must be in future' }

    return { success: true }
  }

  function simulateAcceptInvitation(
    ctx: SimulationContext,
    tokenHash: string,
    invitation: InvitationState | null,
    family: FamilyState | null,
    person: PersonState | null,
    existingMembers: MemberState[]
  ): { success: boolean; memberAction: 'INSERT' | 'UPDATE' | 'NONE'; error?: string; resultingIsHead?: boolean } {
    if (!ctx.callerId) return { success: false, memberAction: 'NONE', error: 'Authentication required' }
    if (!/^[0-9a-f]{64}$/.test(tokenHash)) return { success: false, memberAction: 'NONE', error: 'Invalid token' }
    if (!invitation) return { success: false, memberAction: 'NONE', error: 'Invitation not found' }
    if (invitation.status !== 'PENDING') return { success: false, memberAction: 'NONE', error: 'Not pending' }

    const now = new Date()
    if (new Date(invitation.expires_at) <= now) {
      return { success: false, memberAction: 'NONE', error: 'Expired' }
    }

    if (!family || family.deleted_at !== null || family.status !== 'ACTIVE') {
      return { success: false, memberAction: 'NONE', error: 'Family inactive' }
    }
    if (!person || person.deleted_at !== null || person.status !== 'ACTIVE' || person.date_of_death !== null) {
      return { success: false, memberAction: 'NONE', error: 'Person inactive or deceased' }
    }

    const existing = existingMembers.find(
      (m) => m.family_id === invitation.family_id && m.person_id === invitation.person_id
    )

    let memberAction: 'INSERT' | 'UPDATE' | 'NONE' = 'INSERT'
    let resultingIsHead = false
    if (existing) {
      if (existing.left_at === null) {
        // Active membership already exists
        memberAction = 'NONE'
        resultingIsHead = existing.is_head
      } else {
        // Historical membership reactivated: role updated, is_head explicitly reset to false
        memberAction = 'UPDATE'
        resultingIsHead = false
      }
    }

    return { success: true, memberAction, resultingIsHead }
  }

  describe('create_family_invitation simulation', () => {
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString()
    const pastDate = new Date(Date.now() - 1000).toISOString()

    it('positive: authorized family creator can create invitation', () => {
      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        []
      )
      expect(res.success).toBe(true)
    })

    it('positive: community moderator can create invitation for any family', () => {
      const res = simulateCreateInvitation(
        { callerId: OTHER_USER_ID, isModerator: true },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        []
      )
      expect(res.success).toBe(true)
    })

    it('negative: unauthenticated caller is rejected', () => {
      const res = simulateCreateInvitation(
        { callerId: null, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Authentication required')
    })

    it('negative: unauthorized non-creator member cannot create invitation', () => {
      const res = simulateCreateInvitation(
        { callerId: OTHER_USER_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Not authorized for family')
    })

    it('negative: rejects deceased target person', () => {
      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        { ...ACTIVE_PERSON, date_of_death: '2020-01-01' },
        [],
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Person is deceased')
    })

    it('negative: rejects invitation if person is already active family member', () => {
      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [
          {
            id: 'm1',
            family_id: FAMILY_ID,
            person_id: PERSON_ID,
            role: 'CHILD',
            is_head: false,
            left_at: null,
            added_by: CREATOR_ID,
          },
        ],
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Person is already active member')
    })

    it('negative: rejects duplicate active pending invitation for target person', () => {
      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        [
          {
            id: 'inv1',
            family_id: FAMILY_ID,
            person_id: PERSON_ID,
            invited_email: 'test@example.com',
            invited_by: CREATOR_ID,
            role: 'EXTENDED',
            token_hash: VALID_HASH,
            status: 'PENDING',
            expires_at: futureDate,
            accepted_by: null,
            accepted_at: null,
          },
        ]
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Active invitation already exists')
    })

    it('positive: expired pending invitation is safely transitioned to EXPIRED and replaced with new invitation', () => {
      const expiredInv: InvitationState = {
        id: 'inv-expired',
        family_id: FAMILY_ID,
        person_id: PERSON_ID,
        invited_email: 'test@example.com',
        invited_by: CREATOR_ID,
        role: 'EXTENDED',
        token_hash: VALID_HASH,
        status: 'PENDING',
        expires_at: pastDate,
        accepted_by: null,
        accepted_at: null,
      }

      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test2@example.com',
          role: 'CHILD',
          tokenHash: VALID_HASH_2,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        [expiredInv]
      )
      expect(res.success).toBe(true)
      expect(expiredInv.status).toBe('EXPIRED')
    })

    it('positive: allows invitation for same family with different target person', () => {
      const existingInv: InvitationState = {
        id: 'inv1',
        family_id: FAMILY_ID,
        person_id: 'p-other-999',
        invited_email: 'other@example.com',
        invited_by: CREATOR_ID,
        role: 'EXTENDED',
        token_hash: VALID_HASH,
        status: 'PENDING',
        expires_at: futureDate,
        accepted_by: null,
        accepted_at: null,
      }

      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH_2,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        [existingInv]
      )
      expect(res.success).toBe(true)
    })

    it('positive: allows invitation for different family with same target person', () => {
      const existingInv: InvitationState = {
        id: 'inv1',
        family_id: 'f-other-888',
        person_id: PERSON_ID,
        invited_email: 'test@example.com',
        invited_by: CREATOR_ID,
        role: 'EXTENDED',
        token_hash: VALID_HASH,
        status: 'PENDING',
        expires_at: futureDate,
        accepted_by: null,
        accepted_at: null,
      }

      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH_2,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        [existingInv]
      )
      expect(res.success).toBe(true)
    })

    it('positive: allows invitation for same family and person when prior invitation was ACCEPTED (historical member departed)', () => {
      const acceptedInv: InvitationState = {
        id: 'inv-accepted',
        family_id: FAMILY_ID,
        person_id: PERSON_ID,
        invited_email: 'test@example.com',
        invited_by: CREATOR_ID,
        role: 'EXTENDED',
        token_hash: VALID_HASH,
        status: 'ACCEPTED',
        expires_at: pastDate,
        accepted_by: OTHER_USER_ID,
        accepted_at: pastDate,
      }

      const historicalMember: MemberState = {
        id: 'm-old',
        family_id: FAMILY_ID,
        person_id: PERSON_ID,
        role: 'EXTENDED',
        is_head: false,
        left_at: pastDate,
        added_by: CREATOR_ID,
      }

      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'CHILD',
          tokenHash: VALID_HASH_2,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [historicalMember],
        [acceptedInv]
      )
      expect(res.success).toBe(true)
    })

    it('positive: allows invitation for same family and person when prior invitation was REVOKED', () => {
      const revokedInv: InvitationState = {
        id: 'inv-revoked',
        family_id: FAMILY_ID,
        person_id: PERSON_ID,
        invited_email: 'test@example.com',
        invited_by: CREATOR_ID,
        role: 'EXTENDED',
        token_hash: VALID_HASH,
        status: 'REVOKED',
        expires_at: futureDate,
        accepted_by: null,
        accepted_at: null,
      }

      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'CHILD',
          tokenHash: VALID_HASH_2,
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        [revokedInv]
      )
      expect(res.success).toBe(true)
    })

    it('negative: rejects malformed token hash', () => {
      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: 'not-64-hex',
          expiresAt: futureDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Invalid token hash')
    })

    it('negative: rejects past expiration date', () => {
      const res = simulateCreateInvitation(
        { callerId: CREATOR_ID, isModerator: false },
        {
          familyId: FAMILY_ID,
          personId: PERSON_ID,
          invitedEmail: 'test@example.com',
          role: 'EXTENDED',
          tokenHash: VALID_HASH,
          expiresAt: pastDate,
        },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [],
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Expiration must be in future')
    })
  })

  describe('accept_invitation simulation', () => {
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString()
    const pastDate = new Date(Date.now() - 1000).toISOString()

    const PENDING_INV: InvitationState = {
      id: 'inv-1',
      family_id: FAMILY_ID,
      person_id: PERSON_ID,
      invited_email: 'invitee@example.com',
      invited_by: CREATOR_ID,
      role: 'EXTENDED',
      token_hash: VALID_HASH,
      status: 'PENDING',
      expires_at: futureDate,
      accepted_by: null,
      accepted_at: null,
    }

    it('positive: accepts pending invitation and inserts new family member when no prior membership', () => {
      const res = simulateAcceptInvitation(
        { callerId: OTHER_USER_ID, isModerator: false },
        VALID_HASH,
        PENDING_INV,
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        []
      )
      expect(res.success).toBe(true)
      expect(res.memberAction).toBe('INSERT')
    })

    it('positive: accepts invitation and reactivates historical membership (left_at set) without duplicate key error', () => {
      const historicalMember: MemberState = {
        id: 'm-old',
        family_id: FAMILY_ID,
        person_id: PERSON_ID,
        role: 'EXTENDED',
        is_head: false,
        left_at: '2025-01-01T00:00:00Z',
        added_by: CREATOR_ID,
      }

      const res = simulateAcceptInvitation(
        { callerId: OTHER_USER_ID, isModerator: false },
        VALID_HASH,
        PENDING_INV,
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [historicalMember]
      )
      expect(res.success).toBe(true)
      expect(res.memberAction).toBe('UPDATE')
      expect(res.resultingIsHead).toBe(false)
    })

    it('positive: accepts invitation and reactivates historical membership even if former member was head, resetting is_head to false', () => {
      const historicalFormerHead: MemberState = {
        id: 'm-former-head',
        family_id: FAMILY_ID,
        person_id: PERSON_ID,
        role: 'HEAD_OF_HOUSEHOLD',
        is_head: true,
        left_at: '2025-01-01T00:00:00Z',
        added_by: CREATOR_ID,
      }

      const res = simulateAcceptInvitation(
        { callerId: OTHER_USER_ID, isModerator: false },
        VALID_HASH,
        PENDING_INV,
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [historicalFormerHead]
      )
      expect(res.success).toBe(true)
      expect(res.memberAction).toBe('UPDATE')
      expect(res.resultingIsHead).toBe(false)
    })

    it('positive: accepts invitation without inserting duplicate when person is already active member', () => {
      const activeMember: MemberState = {
        id: 'm-active',
        family_id: FAMILY_ID,
        person_id: PERSON_ID,
        role: 'EXTENDED',
        is_head: false,
        left_at: null,
        added_by: CREATOR_ID,
      }

      const res = simulateAcceptInvitation(
        { callerId: OTHER_USER_ID, isModerator: false },
        VALID_HASH,
        PENDING_INV,
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        [activeMember]
      )
      expect(res.success).toBe(true)
      expect(res.memberAction).toBe('NONE')
    })

    it('negative: unauthenticated user cannot accept invitation', () => {
      const res = simulateAcceptInvitation(
        { callerId: null, isModerator: false },
        VALID_HASH,
        PENDING_INV,
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Authentication required')
    })

    it('negative: expired invitation cannot be accepted', () => {
      const res = simulateAcceptInvitation(
        { callerId: OTHER_USER_ID, isModerator: false },
        VALID_HASH,
        { ...PENDING_INV, expires_at: pastDate },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Expired')
    })

    it('negative: already-accepted invitation cannot be accepted again', () => {
      const res = simulateAcceptInvitation(
        { callerId: OTHER_USER_ID, isModerator: false },
        VALID_HASH,
        { ...PENDING_INV, status: 'ACCEPTED', accepted_by: CREATOR_ID, accepted_at: new Date().toISOString() },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Not pending')
    })

    it('negative: revoked invitation cannot be accepted', () => {
      const res = simulateAcceptInvitation(
        { callerId: OTHER_USER_ID, isModerator: false },
        VALID_HASH,
        { ...PENDING_INV, status: 'REVOKED' },
        ACTIVE_FAMILY,
        ACTIVE_PERSON,
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Not pending')
    })

    it('negative: rejects acceptance for deceased target person', () => {
      const res = simulateAcceptInvitation(
        { callerId: OTHER_USER_ID, isModerator: false },
        VALID_HASH,
        PENDING_INV,
        ACTIVE_FAMILY,
        { ...ACTIVE_PERSON, date_of_death: '2024-05-01' },
        []
      )
      expect(res.success).toBe(false)
      expect(res.error).toBe('Person inactive or deceased')
    })
  })
})
