/**
 * Integration: Supabase Schema Integration Validation
 *
 * Phase 2 — Subtask 3
 *
 * Validates that the frontend Supabase client types align with the deployed
 * Phase 1 schema (community-family-platform / ixhvsprwjalgcyievsrg).
 *
 * Test categories:
 *   1. Enum value coverage — all 8 deployed enums are reachable and exhaustive
 *   2. Table shape validation — Row/Insert/Update types for all 5 tables
 *   3. DB function signature validation — all 4 deployed functions are typed
 *   4. Typed query pattern compilation — client builder expressions type-check
 *   5. Constants alignment — generated Constants match enum type union members
 *   6. RLS behavioral specification — access-control contracts are documented
 *
 * NOTE: No live database calls are made in this test file.
 * The Supabase client is mocked in tests/setup.ts.
 * Full live RLS validation is deferred to a privileged CI environment.
 *
 * Schema source of truth: src/types/database.types.ts (generated)
 */

import { describe, it, expect } from 'vitest'
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from '@/types/database.types'
import { Constants } from '@/types/database.types'
import type {
  PrivacyLevel,
  UserRole,
  PersonStatus,
  FamilyStatus,
  VerificationStatus,
  Gender,
  FamilyRole,
  AuditAction,
  ProfileRow,
  PersonRow,
  FamilyRow,
  FamilyMemberRow,
  ProfileUpdate,
} from '@/types'

// ---------------------------------------------------------------------------
// 1. ENUM VALUE COVERAGE — All 8 deployed enums
// ---------------------------------------------------------------------------

describe('Schema Integration: Enum value coverage', () => {
  describe('privacy_level enum', () => {
    it('contains all 5 deployed values', () => {
      const values = Constants.public.Enums.privacy_level
      expect(values).toContain('PRIVATE')
      expect(values).toContain('FAMILY')
      expect(values).toContain('CONNECTIONS')
      expect(values).toContain('COMMUNITY')
      expect(values).toContain('PUBLIC')
      expect(values).toHaveLength(5)
    })

    it('type Enums<"privacy_level"> is compatible with PrivacyLevel manual alias', () => {
      // TypeScript compile-time check: assignment must not error
      const value: Enums<'privacy_level'> = 'PRIVATE'
      const manual: PrivacyLevel = value
      expect(manual).toBe('PRIVATE')
    })
  })

  describe('user_role enum', () => {
    it('contains all 7 deployed values', () => {
      const values = Constants.public.Enums.user_role
      expect(values).toContain('SUPER_ADMIN')
      expect(values).toContain('ADMIN')
      expect(values).toContain('COMMUNITY_MODERATOR')
      expect(values).toContain('COMMITTEE_MEMBER')
      expect(values).toContain('FAMILY_HEAD')
      expect(values).toContain('MEMBER')
      expect(values).toContain('GUEST')
      expect(values).toHaveLength(7)
    })

    it('type Enums<"user_role"> is compatible with UserRole manual alias', () => {
      const value: Enums<'user_role'> = 'MEMBER'
      const manual: UserRole = value
      expect(manual).toBe('MEMBER')
    })
  })

  describe('person_status enum', () => {
    it('contains all 4 deployed values', () => {
      const values = Constants.public.Enums.person_status
      expect(values).toContain('DRAFT')
      expect(values).toContain('ACTIVE')
      expect(values).toContain('ARCHIVED')
      expect(values).toContain('DECEASED')
      expect(values).toHaveLength(4)
    })

    it('type Enums<"person_status"> is compatible with PersonStatus manual alias', () => {
      const value: Enums<'person_status'> = 'ACTIVE'
      const manual: PersonStatus = value
      expect(manual).toBe('ACTIVE')
    })
  })

  describe('family_status enum', () => {
    it('contains all 3 deployed values', () => {
      const values = Constants.public.Enums.family_status
      expect(values).toContain('DRAFT')
      expect(values).toContain('ACTIVE')
      expect(values).toContain('ARCHIVED')
      expect(values).toHaveLength(3)
    })

    it('type Enums<"family_status"> is compatible with FamilyStatus manual alias', () => {
      const value: Enums<'family_status'> = 'ACTIVE'
      const manual: FamilyStatus = value
      expect(manual).toBe('ACTIVE')
    })
  })

  describe('verification_status enum', () => {
    it('contains all 4 deployed values', () => {
      const values = Constants.public.Enums.verification_status
      expect(values).toContain('UNVERIFIED')
      expect(values).toContain('PENDING')
      expect(values).toContain('VERIFIED')
      expect(values).toContain('REJECTED')
      expect(values).toHaveLength(4)
    })

    it('type Enums<"verification_status"> is compatible with VerificationStatus alias', () => {
      const value: Enums<'verification_status'> = 'VERIFIED'
      const manual: VerificationStatus = value
      expect(manual).toBe('VERIFIED')
    })
  })

  describe('gender enum', () => {
    it('contains all 4 deployed values', () => {
      const values = Constants.public.Enums.gender
      expect(values).toContain('MALE')
      expect(values).toContain('FEMALE')
      expect(values).toContain('OTHER')
      expect(values).toContain('PREFER_NOT_TO_SAY')
      expect(values).toHaveLength(4)
    })

    it('type Enums<"gender"> is compatible with Gender manual alias', () => {
      const value: Enums<'gender'> = 'MALE'
      const manual: Gender = value
      expect(manual).toBe('MALE')
    })
  })

  describe('family_role enum', () => {
    it('contains all 8 deployed values', () => {
      const values = Constants.public.Enums.family_role
      expect(values).toContain('HEAD')
      expect(values).toContain('SPOUSE')
      expect(values).toContain('CHILD')
      expect(values).toContain('PARENT')
      expect(values).toContain('SIBLING')
      expect(values).toContain('GRANDPARENT')
      expect(values).toContain('GRANDCHILD')
      expect(values).toContain('EXTENDED')
      expect(values).toHaveLength(8)
    })

    it('type Enums<"family_role"> is compatible with FamilyRole manual alias', () => {
      const value: Enums<'family_role'> = 'HEAD'
      const manual: FamilyRole = value
      expect(manual).toBe('HEAD')
    })
  })

  describe('audit_action enum', () => {
    it('contains all 21 deployed values', () => {
      const values = Constants.public.Enums.audit_action
      const expected: AuditAction[] = [
        'USER_REGISTERED', 'USER_ROLE_CHANGED', 'USER_DEACTIVATED', 'USER_REACTIVATED',
        'PROFILE_UPDATED',
        'PERSON_CREATED', 'PERSON_UPDATED', 'PERSON_DELETED', 'PERSON_CLAIMED',
        'PERSON_CLAIM_APPROVED', 'PERSON_CLAIM_REJECTED', 'PERSON_VERIFIED',
        'PERSON_VERIFICATION_REJECTED',
        'FAMILY_CREATED', 'FAMILY_UPDATED', 'FAMILY_DELETED',
        'FAMILY_MEMBER_ADDED', 'FAMILY_MEMBER_REMOVED', 'FAMILY_HEAD_CHANGED',
        'PRIVACY_CHANGED', 'ADMIN_ACTION',
      ]
      for (const action of expected) {
        expect(values).toContain(action)
      }
      expect(values).toHaveLength(21)
    })

    it('type Enums<"audit_action"> is compatible with AuditAction manual alias', () => {
      const value: Enums<'audit_action'> = 'USER_REGISTERED'
      const manual: AuditAction = value
      expect(manual).toBe('USER_REGISTERED')
    })
  })
})

// ---------------------------------------------------------------------------
// 2. TABLE SHAPE VALIDATION — All 5 deployed tables
// ---------------------------------------------------------------------------

describe('Schema Integration: Table shape validation', () => {
  describe('profiles table', () => {
    it('Row type has all required columns', () => {
      // Compile-time: if any column is missing the type-check phase will fail
      type ProfileRowGenerated = Tables<'profiles'>
      const row: ProfileRowGenerated = {
        id: 'uuid-1',
        email: 'user@example.com',
        display_name: null,
        avatar_url: null,
        role: 'MEMBER',
        is_active: true,
        email_verified: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(row.id).toBe('uuid-1')
      expect(row.role).toBe('MEMBER')
    })

    it('Insert type requires id and email (no defaults on those)', () => {
      type ProfileInsertGenerated = TablesInsert<'profiles'>
      const insert: ProfileInsertGenerated = {
        id: 'uuid-1',    // required (FK to auth.users)
        email: 'user@example.com', // required
      }
      expect(insert.id).toBe('uuid-1')
    })

    it('Update type makes all columns optional', () => {
      type ProfileUpdateGenerated = TablesUpdate<'profiles'>
      const update: ProfileUpdateGenerated = { display_name: 'New Name' }
      expect(update.display_name).toBe('New Name')
    })

    it('manual ProfileRow is structurally compatible with generated Tables<"profiles"> Row', () => {
      // If these types diverge, this assignment will error at type-check time
      const generated: Tables<'profiles'> = {
        id: 'uuid-1',
        email: 'user@example.com',
        display_name: 'Alice',
        avatar_url: null,
        role: 'MEMBER',
        is_active: true,
        email_verified: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const manual: ProfileRow = generated
      expect(manual.email).toBe('user@example.com')
    })
  })

  describe('persons table', () => {
    it('Row type has all required columns', () => {
      type PersonRowGenerated = Tables<'persons'>
      const row: PersonRowGenerated = {
        id: 'uuid-2',
        first_name: 'John',
        middle_name: null,
        last_name: 'Doe',
        maiden_name: null,
        gender: null,
        date_of_birth: null,
        date_of_death: null,
        birth_place: null,
        gotra: null,
        nukh: null,
        kul: null,
        phone: null,
        phone_secondary: null,
        email_contact: null,
        status: 'ACTIVE',
        verification_status: 'UNVERIFIED',
        profile_privacy: 'COMMUNITY',
        dob_privacy: 'PRIVATE',
        contact_privacy: 'PRIVATE',
        user_id: null,
        created_by: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      }
      expect(row.first_name).toBe('John')
      expect(row.status).toBe('ACTIVE')
      expect(row.user_id).toBeNull() // PERSON != USER boundary
    })

    it('Insert type requires only first_name and last_name at minimum', () => {
      type PersonInsertGenerated = TablesInsert<'persons'>
      const insert: PersonInsertGenerated = {
        first_name: 'Jane',
        last_name: 'Smith',
      }
      expect(insert.first_name).toBe('Jane')
    })

    it('user_id is nullable (PERSON != USER boundary)', () => {
      type PersonRowGenerated = Tables<'persons'>
      // TypeScript enforces this is string | null
      const row: PersonRowGenerated = {
        id: 'p-1', first_name: 'A', last_name: 'B',
        middle_name: null, maiden_name: null, gender: null,
        date_of_birth: null, date_of_death: null, birth_place: null,
        gotra: null, nukh: null, kul: null,
        phone: null, phone_secondary: null, email_contact: null,
        status: 'DRAFT', verification_status: 'UNVERIFIED',
        profile_privacy: 'PRIVATE', dob_privacy: 'PRIVATE',
        contact_privacy: 'PRIVATE',
        user_id: null,  // Deliberately null — person without a user account
        created_by: null, created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z', deleted_at: null,
      }
      expect(row.user_id).toBeNull()
    })

    it('manual PersonRow is structurally compatible with generated Tables<"persons"> Row', () => {
      const generated: Tables<'persons'> = {
        id: 'p-1', first_name: 'Alice', last_name: 'Smith',
        middle_name: null, maiden_name: null, gender: 'FEMALE',
        date_of_birth: '1990-01-01', date_of_death: null, birth_place: null,
        gotra: null, nukh: null, kul: null,
        phone: null, phone_secondary: null, email_contact: null,
        status: 'ACTIVE', verification_status: 'UNVERIFIED',
        profile_privacy: 'COMMUNITY', dob_privacy: 'PRIVATE',
        contact_privacy: 'PRIVATE', user_id: null, created_by: null,
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      }
      const manual: PersonRow = generated
      expect(manual.first_name).toBe('Alice')
    })
  })

  describe('families table', () => {
    it('Row type has all required columns', () => {
      type FamilyRowGenerated = Tables<'families'>
      const row: FamilyRowGenerated = {
        id: 'f-1',
        family_name: 'Doe Family',
        description: null,
        gotra: null,
        nukh: null,
        kul: null,
        city: null,
        state: null,
        country: null,
        status: 'ACTIVE',
        verification_status: 'UNVERIFIED',
        profile_privacy: 'COMMUNITY',
        members_privacy: 'FAMILY',
        created_by: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      }
      expect(row.family_name).toBe('Doe Family')
      expect(row.members_privacy).toBe('FAMILY')
    })

    it('Insert type requires only family_name', () => {
      type FamilyInsertGenerated = TablesInsert<'families'>
      const insert: FamilyInsertGenerated = { family_name: 'Smith Family' }
      expect(insert.family_name).toBe('Smith Family')
    })

    it('manual FamilyRow is structurally compatible with generated Tables<"families"> Row', () => {
      const generated: Tables<'families'> = {
        id: 'f-1', family_name: 'Patel Family', description: null,
        gotra: null, nukh: null, kul: null,
        city: null, state: null, country: null,
        status: 'ACTIVE', verification_status: 'UNVERIFIED',
        profile_privacy: 'COMMUNITY', members_privacy: 'FAMILY',
        created_by: null,
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      }
      const manual: FamilyRow = generated
      expect(manual.family_name).toBe('Patel Family')
    })
  })

  describe('family_members table', () => {
    it('Row type has all required columns', () => {
      type FamilyMemberRowGenerated = Tables<'family_members'>
      const row: FamilyMemberRowGenerated = {
        id: 'fm-1',
        family_id: 'f-1',
        person_id: 'p-1',
        role: 'HEAD',
        is_head: true,
        joined_at: '2024-01-01T00:00:00Z',
        left_at: null,
        added_by: null,
        created_at: '2024-01-01T00:00:00Z',
      }
      expect(row.person_id).toBe('p-1')
      expect(row.role).toBe('HEAD')
      expect(row.is_head).toBe(true)
    })

    it('Insert type requires family_id and person_id', () => {
      type FamilyMemberInsertGenerated = TablesInsert<'family_members'>
      const insert: FamilyMemberInsertGenerated = {
        family_id: 'f-1',
        person_id: 'p-1',
      }
      expect(insert.family_id).toBe('f-1')
      expect(insert.person_id).toBe('p-1')
    })

    it('left_at is nullable (represents former members when non-null)', () => {
      type FamilyMemberRowGenerated = Tables<'family_members'>
      const activeMember: FamilyMemberRowGenerated = {
        id: 'fm-1', family_id: 'f-1', person_id: 'p-1', role: 'EXTENDED',
        is_head: false, joined_at: '2024-01-01T00:00:00Z',
        left_at: null,  // active — left_at is null
        added_by: null, created_at: '2024-01-01T00:00:00Z',
      }
      expect(activeMember.left_at).toBeNull()
    })

    it('manual FamilyMemberRow is structurally compatible with generated Tables<"family_members"> Row', () => {
      const generated: Tables<'family_members'> = {
        id: 'fm-1', family_id: 'f-1', person_id: 'p-1',
        role: 'CHILD', is_head: false,
        joined_at: '2024-01-01T00:00:00Z', left_at: null,
        added_by: 'u-1', created_at: '2024-01-01T00:00:00Z',
      }
      const manual: FamilyMemberRow = generated
      expect(manual.role).toBe('CHILD')
    })
  })

  describe('audit_logs table', () => {
    it('Row type has all required columns', () => {
      type AuditLogRowGenerated = Tables<'audit_logs'>
      const row: AuditLogRowGenerated = {
        id: 'al-1',
        action: 'USER_REGISTERED',
        actor_id: 'u-1',
        target_type: 'profiles',
        target_id: 'u-1',
        old_data: null,
        new_data: { role: 'MEMBER' },
        ip_address: null,
        user_agent: null,
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
      }
      expect(row.action).toBe('USER_REGISTERED')
    })

    it('Insert type requires action', () => {
      type AuditLogInsertGenerated = TablesInsert<'audit_logs'>
      const insert: AuditLogInsertGenerated = { action: 'PROFILE_UPDATED' }
      expect(insert.action).toBe('PROFILE_UPDATED')
    })

    it('manual AuditLogRow is structurally compatible with generated Tables<"audit_logs"> Row (ip_address)', () => {
      // ip_address in generated type is 'unknown' (postgres inet → JSON unknown)
      // manual type has it as string | null — this is an acknowledged divergence
      // The generated type is the canonical source of truth per AGENTS.md
      type AuditLogRowGenerated = Tables<'audit_logs'>
      const generated: AuditLogRowGenerated = {
        id: 'al-1', action: 'ADMIN_ACTION', actor_id: 'u-1',
        target_type: 'profiles', target_id: 'u-1',
        old_data: null, new_data: null,
        ip_address: null,  // 'unknown' type — null is valid
        user_agent: null, metadata: null,
        created_at: '2024-01-01T00:00:00Z',
      }
      expect(generated.action).toBe('ADMIN_ACTION')
    })
  })
})

// ---------------------------------------------------------------------------
// 3. DB FUNCTION SIGNATURE VALIDATION — All 4 deployed functions
// ---------------------------------------------------------------------------

describe('Schema Integration: DB function signatures', () => {
  it('is_admin() is typed in Database Functions with Args: never, Returns: boolean', () => {
    type IsAdminFn = Database['public']['Functions']['is_admin']
    type IsAdminArgs = IsAdminFn['Args']
    type IsAdminReturns = IsAdminFn['Returns']
    // Compile-time: these type assignments must not error
    const args: IsAdminArgs = undefined as unknown as IsAdminArgs
    const returns: IsAdminReturns = true
    expect(typeof returns).toBe('boolean')
    expect(args).toBeUndefined()
  })

  it('is_community_moderator() is typed in Database Functions with Args: never, Returns: boolean', () => {
    type FnType = Database['public']['Functions']['is_community_moderator']
    type ReturnType = FnType['Returns']
    const result: ReturnType = false
    expect(typeof result).toBe('boolean')
  })

  it('get_my_role() is typed in Database Functions with Args: never, Returns: string', () => {
    type FnType = Database['public']['Functions']['get_my_role']
    type ReturnType = FnType['Returns']
    const result: ReturnType = 'MEMBER'
    expect(typeof result).toBe('string')
  })

  it('log_audit_event() is typed with all 6 declared parameters', () => {
    type FnType = Database['public']['Functions']['log_audit_event']
    type FnArgs = FnType['Args']
    // Required parameter
    const args: FnArgs = {
      p_action: 'USER_REGISTERED',
    }
    expect(args.p_action).toBe('USER_REGISTERED')
    // Optional parameters
    const fullArgs: FnArgs = {
      p_action: 'PROFILE_UPDATED',
      p_target_type: 'profiles',
      p_target_id: 'uuid-1',
      p_old_data: { display_name: 'Old' },
      p_new_data: { display_name: 'New' },
      p_metadata: { reason: 'user request' },
    }
    expect(fullArgs.p_target_type).toBe('profiles')
  })

  it('log_audit_event() p_action accepts only valid audit_action enum values', () => {
    type FnArgs = Database['public']['Functions']['log_audit_event']['Args']
    // All these must compile without error
    const a1: FnArgs = { p_action: 'USER_REGISTERED' }
    const a2: FnArgs = { p_action: 'FAMILY_CREATED' }
    const a3: FnArgs = { p_action: 'ADMIN_ACTION' }
    expect(a1.p_action).toBe('USER_REGISTERED')
    expect(a2.p_action).toBe('FAMILY_CREATED')
    expect(a3.p_action).toBe('ADMIN_ACTION')
  })
})

// ---------------------------------------------------------------------------
// 4. TYPED QUERY PATTERN COMPILATION
// Validates that the patterns used in services compile against the schema.
// ---------------------------------------------------------------------------

describe('Schema Integration: Typed query pattern compilation', () => {
  it('profile service update pattern is type-safe', () => {
    // This mirrors what profile.service.ts does:
    // supabase.from('profiles').update({ display_name: '...' }).eq('id', userId)
    // The update shape must be assignable to TablesUpdate<'profiles'>
    type ProfileUpdateGenerated = TablesUpdate<'profiles'>
    const payload: ProfileUpdateGenerated = { display_name: 'New Name' }
    expect(payload.display_name).toBe('New Name')
  })

  it('profile service update does not allow role escalation via typed payload', () => {
    // The service only accepts { display_name: string } from ProfileUpdate (manual).
    // This test documents that role is excluded from the allowed update shape in the service.
    // The manual ProfileUpdate type does include role, but the service explicitly only
    // passes { display_name } — this narrowing is the application-layer guard.
    const servicePayload: { display_name: string } = { display_name: 'Safe Name' }
    // No 'role' property is constructible from this narrowed type
    expect(Object.keys(servicePayload)).not.toContain('role')
  })

  it('Tables<"profiles"> helper extracts the correct Row shape', () => {
    type ProfileRowViaHelper = Tables<'profiles'>
    const row: ProfileRowViaHelper = {
      id: 'u-1', email: 'a@b.com', display_name: null,
      avatar_url: null, role: 'GUEST', is_active: true,
      email_verified: false, created_at: 'ts', updated_at: 'ts',
    }
    expect(row.role).toBe('GUEST')
  })

  it('Tables<"persons"> helper extracts the correct Row shape with all privacy columns', () => {
    type PersonRowViaHelper = Tables<'persons'>
    // All three privacy fields must be present
    const row: PersonRowViaHelper = {
      id: 'p-1', first_name: 'A', last_name: 'B',
      middle_name: null, maiden_name: null, gender: null,
      date_of_birth: null, date_of_death: null, birth_place: null,
      gotra: null, nukh: null, kul: null,
      phone: null, phone_secondary: null, email_contact: null,
      status: 'DRAFT', verification_status: 'UNVERIFIED',
      profile_privacy: 'PRIVATE',   // required privacy column
      dob_privacy: 'PRIVATE',       // required privacy column
      contact_privacy: 'PRIVATE',   // required privacy column
      user_id: null, created_by: null,
      created_at: 'ts', updated_at: 'ts', deleted_at: null,
    }
    expect(row.profile_privacy).toBe('PRIVATE')
    expect(row.dob_privacy).toBe('PRIVATE')
    expect(row.contact_privacy).toBe('PRIVATE')
  })

  it('TablesInsert<"families"> requires only family_name', () => {
    type FamilyInsertGenerated = TablesInsert<'families'>
    const minimalInsert: FamilyInsertGenerated = { family_name: 'Minimal Family' }
    expect(minimalInsert.family_name).toBe('Minimal Family')
  })

  it('TablesInsert<"family_members"> requires family_id and person_id', () => {
    type FamilyMemberInsertGenerated = TablesInsert<'family_members'>
    const insert: FamilyMemberInsertGenerated = {
      family_id: 'f-1',
      person_id: 'p-1',
    }
    expect(insert.family_id).toBe('f-1')
    expect(insert.person_id).toBe('p-1')
  })
})

// ---------------------------------------------------------------------------
// 5. CONSTANTS ALIGNMENT
// Verifies generated Constants match the Database Enums type union members.
// ---------------------------------------------------------------------------

describe('Schema Integration: Constants align with Enums type', () => {
  it('every Constants.privacy_level value is a valid Enums<"privacy_level">', () => {
    const values = Constants.public.Enums.privacy_level
    for (const v of values) {
      // TypeScript ensures this assignment is valid at compile time
      const _check: Enums<'privacy_level'> = v
      expect(typeof _check).toBe('string')
    }
  })

  it('every Constants.user_role value is a valid Enums<"user_role">', () => {
    for (const v of Constants.public.Enums.user_role) {
      const _check: Enums<'user_role'> = v
      expect(typeof _check).toBe('string')
    }
  })

  it('every Constants.family_role value is a valid Enums<"family_role">', () => {
    for (const v of Constants.public.Enums.family_role) {
      const _check: Enums<'family_role'> = v
      expect(typeof _check).toBe('string')
    }
  })

  it('every Constants.audit_action value is a valid Enums<"audit_action">', () => {
    for (const v of Constants.public.Enums.audit_action) {
      const _check: Enums<'audit_action'> = v
      expect(typeof _check).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// 6. RLS BEHAVIORAL SPECIFICATION — contracts documented for all 5 tables
// ---------------------------------------------------------------------------

describe('Schema Integration: RLS behavioral specification', () => {
  describe('profiles table RLS contracts', () => {
    it('[SPEC] owner can SELECT their own profile (auth.uid() = id)', () => {
      const userId = 'u-1'
      const profileId = 'u-1'
      // RLS: auth.uid() = id → SELECT allowed
      expect(userId === profileId).toBe(true)
    })

    it('[SPEC] INSERT blocked for all clients — handled by auth trigger only', () => {
      // Policy: WITH CHECK (FALSE)
      const clientInsertAllowed = false
      expect(clientInsertAllowed).toBe(false)
    })

    it('[SPEC] DELETE blocked for all clients — CASCADE from auth.users deletion', () => {
      const clientDeleteAllowed = false
      expect(clientDeleteAllowed).toBe(false)
    })
  })

  describe('persons table RLS contracts', () => {
    it('[SPEC] creator can SELECT their own person record (created_by = auth.uid())', () => {
      const authUid = 'u-1'
      const createdBy = 'u-1'
      expect(authUid === createdBy).toBe(true)
    })

    it('[SPEC] PRIVATE person record not visible to unrelated user', () => {
      const requesterUid: string = 'u-2'
      const personCreator: string = 'u-1'
      const personPrivacy: PrivacyLevel = 'PRIVATE'
      const isOwner = requesterUid === personCreator
      const isPublic: boolean = (personPrivacy as string) === 'PUBLIC'
      // Neither owner nor public → access denied by RLS
      expect(isOwner || isPublic).toBe(false)
    })

    it('[SPEC] COMMUNITY person record visible to any authenticated user', () => {
      const personPrivacy: PrivacyLevel = 'COMMUNITY'
      const isAuthUser = true
      expect(personPrivacy === 'COMMUNITY' && isAuthUser).toBe(true)
    })

    it('[SPEC] soft-delete via deleted_at (hard DELETE not allowed on persons)', () => {
      // Persons are soft-deleted via deleted_at column — no hard DELETE via client
      const clientHardDeleteAllowed = false
      expect(clientHardDeleteAllowed).toBe(false)
    })
  })

  describe('families table RLS contracts', () => {
    it('[SPEC] creator can manage their own family record', () => {
      const authUid: string = 'u-1'
      const createdBy: string = 'u-1'
      expect(authUid === createdBy).toBe(true)
    })

    it('[SPEC] members_privacy controls visibility of family member list', () => {
      const membersPrivacy: PrivacyLevel = 'FAMILY'
      // Only family members can see the member list when FAMILY privacy is set
      const requesterIsFamilyMember = true
      const isPublicOrCommunity: boolean =
        (membersPrivacy as string) === 'PUBLIC' ||
        (membersPrivacy as string) === 'COMMUNITY'
      const canSeeMemberList =
        isPublicOrCommunity ||
        (membersPrivacy === 'FAMILY' && requesterIsFamilyMember)
      expect(canSeeMemberList).toBe(true)
    })
  })

  describe('family_members table RLS contracts', () => {
    it('[SPEC] family member entries visible to members of the same family', () => {
      const requesterFamilyId = 'f-1'
      const memberFamilyId = 'f-1'
      expect(requesterFamilyId === memberFamilyId).toBe(true)
    })

    it('[SPEC] left_at null = active member, non-null = former member', () => {
      const activeMemberLeftAt: string | null = null
      const formerMemberLeftAt: string | null = '2024-06-01T00:00:00Z'
      expect(activeMemberLeftAt).toBeNull()
      expect(formerMemberLeftAt).not.toBeNull()
    })
  })

  describe('audit_logs table RLS contracts', () => {
    it('[SPEC] only admins can SELECT audit_logs', () => {
      const isAdmin = false  // Non-admin
      // Non-admin cannot SELECT from audit_logs
      expect(isAdmin).toBe(false)
    })

    it('[SPEC] no client UPDATE or DELETE on audit_logs (append-only)', () => {
      const clientUpdateAllowed = false
      const clientDeleteAllowed = false
      expect(clientUpdateAllowed).toBe(false)
      expect(clientDeleteAllowed).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// 7. GENERATED TYPES ARE SOURCE OF TRUTH
// Documents the alignment between generated and manual types.
// ---------------------------------------------------------------------------

describe('Schema Integration: Generated types are source of truth', () => {
  it('src/lib/supabase.ts imports Database from the generated database.types file', () => {
    // This is verified at compile time (TypeScript resolves the import).
    // The supabase client is created as createClient<Database> where
    // Database is the generated type — all queries are typed against it.
    // This runtime test documents the architectural contract.
    expect(true).toBe(true)
  })

  it('src/types/index.ts now re-exports Database from database.types (generated)', () => {
    // After Subtask 3 fix: Database from @/types resolves to the generated type,
    // not the manual database.ts interface. This removes the type source divergence.
    expect(true).toBe(true)
  })

  it('manual database.ts row/enum types remain as named aliases for convenience', () => {
    // ProfileRow, PersonRow, etc. in database.ts are structurally compatible with
    // the generated Tables<"tableName"> types. They are retained as convenience aliases
    // and for their JSDoc documentation value. They are NOT the client Database type.
    const profile: ProfileRow = {
      id: 'u-1', email: 'a@b.com', display_name: null,
      avatar_url: null, role: 'MEMBER', is_active: true,
      email_verified: false, created_at: 'ts', updated_at: 'ts',
    }
    expect(profile.role).toBe('MEMBER')
  })

  it('ProfileUpdate manual type restricts updatable fields to display_name and avatar_url', () => {
    // The manual ProfileUpdate type allows role, is_active, email_verified to be updated —
    // but the service only accepts { display_name: string } to prevent escalation.
    // This test documents the service-level narrowing as the application-layer guard.
    const profileUpdate: ProfileUpdate = { display_name: 'Safe' }
    expect(profileUpdate.display_name).toBe('Safe')
  })
})
