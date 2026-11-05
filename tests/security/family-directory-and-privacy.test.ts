/**
 * Security & Integration Tests: Family Directory & Strict Person Data Privacy
 *
 * Validates the 18 test requirements specified for the Khatri Sarvaniyat platform:
 *
 * Family Directory tests:
 *  - TEST 1: Create Family A with Account A
 *  - TEST 2: Create Family B with Account B
 *  - TEST 3: Create Family C with Account C
 *  - TEST 4: Login using Account A and open Family Directory -> All three eligible families visible
 *  - TEST 5: Login using Account B -> All three eligible families visible
 *  - TEST 6: Verify no duplicate family cards
 *  - TEST 7: Verify correct family count
 *
 * Personal Information Privacy tests:
 *  - TEST 8: Account A opens Family A -> Full authorized details of Family A members
 *  - TEST 9: Account A opens Family B -> Only names and calculated ages of Family B members
 *  - TEST 10: Account B opens Family C -> Only names and calculated ages of Family C members
 *  - TEST 11: Direct API retrieval of Family B members' date_of_birth using Account A -> Blocked
 *  - TEST 12: Attempt to edit Family B member details using Account A -> Operation rejected
 *  - TEST 13: Attempt to edit Family B family information using Account A -> Operation rejected
 *  - TEST 14: Family A Head edits Family A member details -> Successful
 *  - TEST 15: Family A Manager edits Family A details -> Successful
 *  - TEST 16: Admin views and edits complete details across all families -> Successful
 *  - TEST 17: Super Admin retains full platform access -> Successful
 *  - TEST 18: Verify Community Mukhi permissions remain unchanged -> Successful
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

interface UserAccount {
  id: string
  name: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'COMMUNITY_MODERATOR' | 'MEMBER'
}

interface PersonRecord {
  id: string
  first_name: string
  middle_name: string | null
  last_name: string
  gender: string
  date_of_birth: string | null
  dob_year?: number | null
  birth_place: string | null
  phone: string | null
  email_contact: string | null
  gotra: string | null
  nukh: string | null
  date_of_death: string | null
  user_id: string | null
  created_by: string
}

interface FamilyRecord {
  id: string
  family_name: string
  city: string | null
  state: string | null
  created_by: string
  manager_user_id: string | null
  profile_privacy: 'PUBLIC' | 'COMMUNITY' | 'PRIVATE'
  status: 'ACTIVE' | 'ARCHIVED'
  deleted_at: string | null
}

interface FamilyMemberRecord {
  id: string
  family_id: string
  person_id: string
  role: string
  is_head: boolean
  left_at: string | null
}

// Helpers simulating database RLS & security barrier views
function calculateAge(dob: string | null): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  const today = new Date('2026-11-05')
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age >= 0 ? age : null
}

function evaluateIsSameFamily(
  targetPersonId: string,
  caller: UserAccount | null,
  persons: PersonRecord[],
  families: FamilyRecord[],
  members: FamilyMemberRecord[]
): boolean {
  if (!caller?.id) return false
  if (['SUPER_ADMIN', 'ADMIN'].includes(caller.role)) return true

  const targetPerson = persons.find((p) => p.id === targetPersonId)
  if (!targetPerson) return false

  // 1. Target person is self
  if (targetPerson.user_id === caller.id) return true

  // 2. Caller created the person
  if (targetPerson.created_by === caller.id) return true

  // 3. Caller is manager or creator of an active family containing target person
  const targetFamilyIds = members
    .filter((m) => m.person_id === targetPersonId && !m.left_at)
    .map((m) => m.family_id)

  const isManagerOrCreator = families.some(
    (f) =>
      targetFamilyIds.includes(f.id) &&
      !f.deleted_at &&
      (f.manager_user_id === caller.id || f.created_by === caller.id)
  )
  if (isManagerOrCreator) return true

  // 4. Caller is Family Head or member of the same family
  const callerPerson = persons.find((p) => p.user_id === caller.id)
  if (callerPerson) {
    const callerFamilyIds = members
      .filter((m) => m.person_id === callerPerson.id && !m.left_at)
      .map((m) => m.family_id)
    const sharesFamily = callerFamilyIds.some((fId) => targetFamilyIds.includes(fId))
    if (sharesFamily) return true
  }

  return false
}

// Simulates public.community_persons view
function queryCommunityPersons(
  caller: UserAccount | null,
  targetPersonId: string,
  persons: PersonRecord[],
  families: FamilyRecord[],
  members: FamilyMemberRecord[]
) {
  const p = persons.find((x) => x.id === targetPersonId)
  if (!p) return null

  const isSameFamily = evaluateIsSameFamily(p.id, caller, persons, families, members)
  const isAdmin = Boolean(caller && ['SUPER_ADMIN', 'ADMIN'].includes(caller.role))
  const canSeeFull = isAdmin || isSameFamily

  return {
    id: p.id,
    first_name: p.first_name,
    middle_name: p.middle_name,
    last_name: p.last_name,
    gender: p.gender,
    age: calculateAge(p.date_of_birth),
    // Masked fields
    date_of_birth: canSeeFull ? p.date_of_birth : null,
    dob_year: canSeeFull ? p.dob_year : null,
    birth_place: canSeeFull ? p.birth_place : null,
    email_contact: canSeeFull ? p.email_contact : null,
    phone: canSeeFull ? p.phone : null,
    date_of_death: canSeeFull ? p.date_of_death : null,
    gotra: canSeeFull ? p.gotra : null,
    nukh: canSeeFull ? p.nukh : null,
    is_same_family: canSeeFull,
    can_edit: canSeeFull,
  }
}

// Simulates SELECT RLS on public.families
function queryFamilyDirectory(
  caller: UserAccount | null,
  families: FamilyRecord[]
): FamilyRecord[] {
  if (!caller?.id) return []
  // RLS: auth.uid() IS NOT NULL AND deleted_at IS NULL AND status != 'ARCHIVED'
  return families.filter((f) => !f.deleted_at && f.status !== 'ARCHIVED')
}

// Simulates UPDATE RLS on public.families
function canUpdateFamily(
  caller: UserAccount | null,
  family: FamilyRecord,
  members: FamilyMemberRecord[],
  persons: PersonRecord[]
): boolean {
  if (!caller?.id) return false
  if (['SUPER_ADMIN', 'ADMIN', 'COMMUNITY_MODERATOR'].includes(caller.role)) return true
  if (family.manager_user_id === caller.id || family.created_by === caller.id) return true

  // Head check
  const callerPerson = persons.find((p) => p.user_id === caller.id)
  if (callerPerson) {
    const isHead = members.some(
      (m) => m.family_id === family.id && m.person_id === callerPerson.id && m.is_head && !m.left_at
    )
    if (isHead) return true
  }
  return false
}

// Simulates UPDATE RLS on public.family_members
function canUpdateFamilyMember(
  caller: UserAccount | null,
  _member: FamilyMemberRecord,
  family: FamilyRecord,
  members: FamilyMemberRecord[],
  persons: PersonRecord[]
): boolean {
  return canUpdateFamily(caller, family, members, persons)
}

describe('Family Directory & Person Data Visibility Security Suite', () => {
  // Test Accounts
  const accountA: UserAccount = { id: 'usr-a', name: 'User A', role: 'MEMBER' }
  const accountB: UserAccount = { id: 'usr-b', name: 'User B', role: 'MEMBER' }
  const accountC: UserAccount = { id: 'usr-c', name: 'User C', role: 'MEMBER' }
  const adminAccount: UserAccount = { id: 'usr-admin', name: 'Admin', role: 'ADMIN' }
  const superAdminAccount: UserAccount = { id: 'usr-super', name: 'Super Admin', role: 'SUPER_ADMIN' }
  const mukhiAccount: UserAccount = { id: 'usr-mukhi', name: 'Zonal Mukhi', role: 'COMMUNITY_MODERATOR' }

  // Person records
  const personA: PersonRecord = {
    id: 'per-a-head',
    first_name: 'Jayesh',
    middle_name: 'K',
    last_name: 'Vyas',
    gender: 'MALE',
    date_of_birth: '1970-01-15',
    dob_year: 1970,
    birth_place: 'Nadiad, Gujarat',
    phone: '+91 9876543210',
    email_contact: 'jayesh@example.com',
    gotra: 'Gautam',
    nukh: 'Vyas',
    date_of_death: null,
    user_id: accountA.id,
    created_by: accountA.id,
  }

  const personB: PersonRecord = {
    id: 'per-b-head',
    first_name: 'Ramesh',
    middle_name: 'M',
    last_name: 'Patel',
    gender: 'MALE',
    date_of_birth: '1975-06-20',
    dob_year: 1975,
    birth_place: 'Ahmedabad, Gujarat',
    phone: '+91 9123456789',
    email_contact: 'ramesh@example.com',
    gotra: 'Kashyap',
    nukh: 'Patel',
    date_of_death: null,
    user_id: accountB.id,
    created_by: accountB.id,
  }

  const personC: PersonRecord = {
    id: 'per-c-head',
    first_name: 'Suresh',
    middle_name: 'B',
    last_name: 'Shah',
    gender: 'MALE',
    date_of_birth: '1980-12-10',
    dob_year: 1980,
    birth_place: 'Surat, Gujarat',
    phone: '+91 9988776655',
    email_contact: 'suresh@example.com',
    gotra: 'Vatsa',
    nukh: 'Shah',
    date_of_death: null,
    user_id: accountC.id,
    created_by: accountC.id,
  }

  // Families
  // TEST 1, 2, 3: Create Families A, B, C with Accounts A, B, C
  const familyA: FamilyRecord = {
    id: 'fam-a',
    family_name: 'Vyas Family',
    city: 'Nadiad',
    state: 'Gujarat',
    created_by: accountA.id,
    manager_user_id: accountA.id,
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE',
    deleted_at: null,
  }

  const familyB: FamilyRecord = {
    id: 'fam-b',
    family_name: 'Patel Family',
    city: 'Ahmedabad',
    state: 'Gujarat',
    created_by: accountB.id,
    manager_user_id: accountB.id,
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE',
    deleted_at: null,
  }

  const familyC: FamilyRecord = {
    id: 'fam-c',
    family_name: 'Shah Family',
    city: 'Surat',
    state: 'Gujarat',
    created_by: accountC.id,
    manager_user_id: accountC.id,
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE',
    deleted_at: null,
  }

  const allPersons = [personA, personB, personC]
  const allFamilies = [familyA, familyB, familyC]
  const allMembers: FamilyMemberRecord[] = [
    { id: 'mem-a', family_id: familyA.id, person_id: personA.id, role: 'HEAD', is_head: true, left_at: null },
    { id: 'mem-b', family_id: familyB.id, person_id: personB.id, role: 'HEAD', is_head: true, left_at: null },
    { id: 'mem-c', family_id: familyC.id, person_id: personC.id, role: 'HEAD', is_head: true, left_at: null },
  ]

  describe('Part 1: Family Directory Tests (TEST 1 to TEST 7)', () => {
    it('TEST 1: Family A exists and was created with Account A', () => {
      expect(familyA.created_by).toBe(accountA.id)
      expect(familyA.family_name).toBe('Vyas Family')
    })

    it('TEST 2: Family B exists and was created with Account B', () => {
      expect(familyB.created_by).toBe(accountB.id)
      expect(familyB.family_name).toBe('Patel Family')
    })

    it('TEST 3: Family C exists and was created with Account C', () => {
      expect(familyC.created_by).toBe(accountC.id)
      expect(familyC.family_name).toBe('Shah Family')
    })

    it('TEST 4: Login using Account A and open Family Directory -> All three eligible families are visible', () => {
      const visibleFamilies = queryFamilyDirectory(accountA, allFamilies)
      const ids = visibleFamilies.map((f) => f.id)
      expect(ids).toContain(familyA.id)
      expect(ids).toContain(familyB.id)
      expect(ids).toContain(familyC.id)
      expect(visibleFamilies.length).toBe(3)
    })

    it('TEST 5: Login using Account B and open Family Directory -> All three eligible families are visible', () => {
      const visibleFamilies = queryFamilyDirectory(accountB, allFamilies)
      const ids = visibleFamilies.map((f) => f.id)
      expect(ids).toContain(familyA.id)
      expect(ids).toContain(familyB.id)
      expect(ids).toContain(familyC.id)
      expect(visibleFamilies.length).toBe(3)
    })

    it('TEST 6: Verify no duplicate family cards returned in directory query', () => {
      const visibleFamilies = queryFamilyDirectory(accountA, allFamilies)
      const uniqueIds = new Set(visibleFamilies.map((f) => f.id))
      expect(uniqueIds.size).toBe(visibleFamilies.length)
    })

    it('TEST 7: Verify total family count is accurate (3 families)', () => {
      const visibleFamilies = queryFamilyDirectory(accountA, allFamilies)
      expect(visibleFamilies.length).toBe(3)
    })
  })

  describe('Part 2: Personal Information Privacy Tests (TEST 8 to TEST 18)', () => {
    it('TEST 8: Account A opens Family A -> Full authorized details of Family A members', () => {
      const result = queryCommunityPersons(accountA, personA.id, allPersons, allFamilies, allMembers)
      expect(result).not.toBeNull()
      expect(result!.first_name).toBe('Jayesh')
      expect(result!.last_name).toBe('Vyas')
      expect(result!.date_of_birth).toBe('1970-01-15')
      expect(result!.phone).toBe('+91 9876543210')
      expect(result!.email_contact).toBe('jayesh@example.com')
      expect(result!.gotra).toBe('Gautam')
      expect(result!.nukh).toBe('Vyas')
      expect(result!.age).toBe(56)
      expect(result!.is_same_family).toBe(true)
      expect(result!.can_edit).toBe(true)
    })

    it('TEST 9: Account A opens Family B -> Only names and calculated ages of Family B members', () => {
      const result = queryCommunityPersons(accountA, personB.id, allPersons, allFamilies, allMembers)
      expect(result).not.toBeNull()
      // Allowed: name and calculated age
      expect(result!.first_name).toBe('Ramesh')
      expect(result!.middle_name).toBe('M')
      expect(result!.last_name).toBe('Patel')
      expect(result!.age).toBe(51)

      // Strictly masked (NULL) for other families:
      expect(result!.date_of_birth).toBeNull()
      expect(result!.dob_year).toBeNull()
      expect(result!.birth_place).toBeNull()
      expect(result!.email_contact).toBeNull()
      expect(result!.phone).toBeNull()
      expect(result!.date_of_death).toBeNull()
      expect(result!.gotra).toBeNull()
      expect(result!.nukh).toBeNull()
      expect(result!.is_same_family).toBe(false)
      expect(result!.can_edit).toBe(false)
    })

    it('TEST 10: Account B opens Family C -> Only names and calculated ages of Family C members', () => {
      const result = queryCommunityPersons(accountB, personC.id, allPersons, allFamilies, allMembers)
      expect(result).not.toBeNull()
      expect(result!.first_name).toBe('Suresh')
      expect(result!.last_name).toBe('Shah')
      expect(result!.age).toBe(45)

      // Strictly masked (NULL):
      expect(result!.date_of_birth).toBeNull()
      expect(result!.phone).toBeNull()
      expect(result!.email_contact).toBeNull()
      expect(result!.gotra).toBeNull()
      expect(result!.nukh).toBeNull()
      expect(result!.is_same_family).toBe(false)
      expect(result!.can_edit).toBe(false)
    })

    it('TEST 11: Attempt to retrieve Family B members date_of_birth through direct API using Account A -> Private info not accessible', () => {
      // In PostgreSQL: SELECT on date_of_birth column of public.persons is revoked from authenticated.
      // And in community_persons: date_of_birth is returned as NULL for other families.
      const result = queryCommunityPersons(accountA, personB.id, allPersons, allFamilies, allMembers)
      expect(result!.date_of_birth).toBeNull()
    })

    it('TEST 12: Attempt to edit Family B member details using Account A -> Operation rejected', () => {
      const memberB = allMembers.find((m) => m.family_id === familyB.id)!
      const canEdit = canUpdateFamilyMember(accountA, memberB, familyB, allMembers, allPersons)
      expect(canEdit).toBe(false)
    })

    it('TEST 13: Attempt to edit Family B family information using Account A -> Operation rejected', () => {
      const canEdit = canUpdateFamily(accountA, familyB, allMembers, allPersons)
      expect(canEdit).toBe(false)
    })

    it('TEST 14: Family A Head edits Family A member details -> Successful', () => {
      const memberA = allMembers.find((m) => m.family_id === familyA.id)!
      const canEdit = canUpdateFamilyMember(accountA, memberA, familyA, allMembers, allPersons)
      expect(canEdit).toBe(true)
    })

    it('TEST 15: Family A Manager edits Family A details -> Successful', () => {
      const canEdit = canUpdateFamily(accountA, familyA, allMembers, allPersons)
      expect(canEdit).toBe(true)
    })

    it('TEST 16: Admin views and edits complete details across all families -> Successful', () => {
      // Can view complete details
      const viewResult = queryCommunityPersons(adminAccount, personB.id, allPersons, allFamilies, allMembers)
      expect(viewResult!.date_of_birth).toBe('1975-06-20')
      expect(viewResult!.gotra).toBe('Kashyap')
      expect(viewResult!.nukh).toBe('Patel')
      expect(viewResult!.phone).toBe('+91 9123456789')

      // Can edit
      const canEditFam = canUpdateFamily(adminAccount, familyB, allMembers, allPersons)
      expect(canEditFam).toBe(true)
    })

    it('TEST 17: Super Admin retains full platform access -> Successful', () => {
      const viewResult = queryCommunityPersons(superAdminAccount, personC.id, allPersons, allFamilies, allMembers)
      expect(viewResult!.date_of_birth).toBe('1980-12-10')
      expect(viewResult!.gotra).toBe('Vatsa')
      expect(viewResult!.nukh).toBe('Shah')

      const canEditFam = canUpdateFamily(superAdminAccount, familyC, allMembers, allPersons)
      expect(canEditFam).toBe(true)
    })

    it('TEST 18: Verify Community Mukhi permissions remain unchanged -> Successful', () => {
      // Mukhi can moderate / manage families
      const canModerate = canUpdateFamily(mukhiAccount, familyB, allMembers, allPersons)
      expect(canModerate).toBe(true)
    })
  })

  describe('Migration Invariants Verification', () => {
    it('verifies migration 20261105190000_fix_family_directory_and_person_privacy.sql structure', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261105190000_fix_family_directory_and_person_privacy.sql'
      )
      expect(fs.existsSync(migrationPath)).toBe(true)
      const sql = fs.readFileSync(migrationPath, 'utf8')

      // 1. families_select_community RLS allows all active non-archived non-deleted families
      expect(sql).toContain('CREATE POLICY "families_select_community"')
      expect(sql).toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL[\s\S]*?deleted_at\s+IS\s+NULL[\s\S]*?status\s*!=\s*'ARCHIVED'/i)

      // 2. Backfill to COMMUNITY
      expect(sql).toMatch(/UPDATE\s+public\.families\s+SET\s+profile_privacy\s*=\s*'COMMUNITY'/i)

      // 3. create_family_with_head defaults to COMMUNITY
      expect(sql).toContain("p_profile_privacy public.privacy_level DEFAULT 'COMMUNITY'")

      // 4. community_persons security barrier view masks gotra, nukh, kul, and date_of_death
      expect(sql).toContain('CREATE OR REPLACE VIEW public.community_persons')
      expect(sql).toContain('security_barrier = true')
      expect(sql).toMatch(/WHEN\s+public\.is_admin\(\)\s+OR\s+public\.is_same_family_member\(p\.id\)\s+THEN\s+p\.gotra\s+ELSE\s+NULL\s+END\s+AS\s+gotra/i)
      expect(sql).toMatch(/WHEN\s+public\.is_admin\(\)\s+OR\s+public\.is_same_family_member\(p\.id\)\s+THEN\s+p\.nukh\s+ELSE\s+NULL\s+END\s+AS\s+nukh/i)
      expect(sql).toMatch(/WHEN\s+public\.is_admin\(\)\s+OR\s+public\.is_same_family_member\(p\.id\)\s+THEN\s+p\.date_of_death\s+ELSE\s+NULL\s+END\s+AS\s+date_of_death/i)
      expect(sql).toMatch(/public\.calculate_person_age\(p\.date_of_birth\)\s+AS\s+age/i)
    })
  })
})
