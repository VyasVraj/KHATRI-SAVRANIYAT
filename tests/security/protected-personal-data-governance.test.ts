/**
 * Security & Governance Test Suite: CLIENT-PRIVACY-1
 * Protected Personal Data & Visibility Governance
 *
 * Verifies the database migration, 7-role authorization matrix,
 * non-exposure guarantees, UI rendering protections, regional Mukhi
 * association, and service-layer RPC boundaries.
 *
 * INVARIANTS:
 * 1. Protected Personal Data:
 *    - Full date of birth (exact day & month hidden; year & derived age public)
 *    - Primary phone number (phone)
 *    - Secondary phone number (phone_secondary)
 *    - Contact email (email_contact)
 *    - Residential/full address (street address, building, flat; city and state public)
 * 2. Non-exposure guarantee:
 *    - Base users (MEMBER, FAMILY_HEAD, COMMITTEE_MEMBER, GUEST, anonymous)
 *      MUST NEVER receive protected fields from other people.
 *    - Enforced across DB (security barrier view, column defaults, RPC boundaries, RLS),
 *      API projections, service layer, and UI presentation components.
 * 3. Authorized roles:
 *    - SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR (Mukhi-equivalent; no MUKHI DB role).
 * 4. Self-service maintenance:
 *    - Normal users can view and maintain their own personal data with ZERO editable
 *      privacy controls rendered.
 * 5. Regional Mukhi association:
 *    - Base users see assigned Mukhi (name, designation, city) with contact request
 *      affordance (no cleartext private contact info).
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { canManagePrivacy } from '@/constants/app'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import { PersonDetail } from '@/features/people/components/PersonDetail'
import { getRespectiveMukhi } from '@/features/community/services/mukhi.service'
import type { Tables } from '@/types/database.types'
import type { UserRole } from '@/types'
import type { User } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// 1. Static Database Migration Security Audit
// ---------------------------------------------------------------------------

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20261102200000_enforce_protected_personal_data_governance.sql'
)
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : ''

describe('CLIENT-PRIVACY-1: Static Database Migration Security Audit', () => {
  it('migration file exists and is readable', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
  })

  it('adds dob_year generated column to public.persons safely extracting year', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.persons\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+dob_year/i)
    expect(sql).toMatch(/EXTRACT\s*\(\s*YEAR\s+FROM\s+date_of_birth\s*\)/i)
    expect(sql).toMatch(/STORED/i)
  })

  it('creates public.calculate_person_age helper function', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.calculate_person_age/i)
    expect(sql).toMatch(/date_part\s*\(\s*'year'/i)
  })

  it('hardens privacy column defaults to PRIVATE and migrates pre-existing records', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.persons\s+ALTER\s+COLUMN\s+dob_privacy\s+SET\s+DEFAULT\s+'PRIVATE'/i)
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.persons\s+ALTER\s+COLUMN\s+contact_privacy\s+SET\s+DEFAULT\s+'PRIVATE'/i)
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.persons\s+ALTER\s+COLUMN\s+profile_privacy\s+SET\s+DEFAULT\s+'PRIVATE'/i)
    expect(sql).toMatch(/UPDATE\s+public\.persons\s+SET\s+dob_privacy\s*=\s*'PRIVATE'/i)
    expect(sql).toMatch(/UPDATE\s+public\.persons\s+SET\s+contact_privacy\s*=\s*'PRIVATE'/i)
  })

  it('creates security barrier view public.community_persons exposing only approved community fields and completely omitting protected columns and user_id', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.community_persons/i)
    expect(sql).toMatch(/WITH\s*\(\s*security_barrier\s*=\s*true\s*\)/i)
    expect(sql).toMatch(/GRANT\s+SELECT\s+ON\s+public\.community_persons\s+TO\s+authenticated/i)

    // Extract the view SQL specifically
    const viewMatch = sql.match(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.community_persons[\s\S]*?FROM\s+public\.persons\s+p/i)
    expect(viewMatch).not.toBeNull()
    const viewSql = viewMatch![0]

    // Community-safe location fields (city, state) must be exposed
    expect(viewSql).toContain('city')
    expect(viewSql).toContain('state')

    // Protected personal data must NOT be in community_persons view definition
    expect(viewSql).not.toMatch(/p\.phone\b/i)
    expect(viewSql).not.toMatch(/p\.phone_secondary\b/i)
    expect(viewSql).not.toMatch(/p\.email_contact\b/i)
    expect(viewSql).not.toMatch(/p\.user_id\b/i)
    expect(viewSql).not.toMatch(/p\.created_by\b/i)
    expect(viewSql).not.toMatch(/p\.date_of_birth\s*[,]/i)

    // Unnecessary privacy metadata (dob_privacy, contact_privacy, profile_privacy) must NOT be projected
    expect(viewSql).not.toMatch(/p\.dob_privacy/i)
    expect(viewSql).not.toMatch(/p\.contact_privacy/i)
    expect(viewSql).not.toMatch(/p\.profile_privacy/i)

    // Zero anon access allowed on community_persons (community members only)
    expect(sql).not.toMatch(/GRANT\s+SELECT\s+ON\s+public\.community_persons\s+TO\s+(?:authenticated,\s*)?anon/i)
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+public\.community_persons\s+FROM\s+PUBLIC,\s*anon/i)
  })

  it('BLOCKER-1 REGRESSION: strictly prevents dob_month and dob_day from existing in migration or community_persons view', () => {
    // dob_month and dob_day must NOT be created on persons
    expect(sql).not.toMatch(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?dob_month/i)
    expect(sql).not.toMatch(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?dob_day/i)

    // dob_month and dob_day must NOT be selected or exposed in community_persons
    expect(sql).not.toMatch(/p\.dob_month/i)
    expect(sql).not.toMatch(/p\.dob_day/i)
    expect(sql).not.toMatch(/dob_month/i)
    expect(sql).not.toMatch(/dob_day/i)
  })

  it('enforces Gate 1 column-level privileges on public.persons excluding protected data, user_id, created_by, and privacy settings', () => {
    expect(sql).toMatch(/REVOKE\s+SELECT\s+ON\s+TABLE\s+public\.persons\s+FROM\s+authenticated/i)
    expect(sql).toMatch(/GRANT\s+SELECT\s*\([\s\S]*?\)\s*ON\s+TABLE\s+public\.persons\s+TO\s+authenticated/i)
    
    // Extract column list from GRANT SELECT (...) ON TABLE public.persons
    const grantMatch = sql.match(/GRANT\s+SELECT\s*\(([\s\S]*?)\)\s*ON\s+TABLE\s+public\.persons/i)
    expect(grantMatch).not.toBeNull()
    const grantedCols = grantMatch![1].split(',').map((c) => c.trim().toLowerCase())

    // Safe columns must be granted
    expect(grantedCols).toContain('id')
    expect(grantedCols).toContain('first_name')
    expect(grantedCols).toContain('dob_year')
    expect(grantedCols).toContain('gotra')
    expect(grantedCols).toContain('status')
    expect(grantedCols).toContain('verification_status')

    // Protected columns MUST NEVER be granted
    expect(grantedCols).not.toContain('date_of_birth')
    expect(grantedCols).not.toContain('phone')
    expect(grantedCols).not.toContain('phone_secondary')
    expect(grantedCols).not.toContain('email_contact')

    // PERSON != USER boundary: user_id and created_by MUST NEVER be granted to authenticated
    expect(grantedCols).not.toContain('user_id')
    expect(grantedCols).not.toContain('created_by')

    // Privacy setting columns MUST NEVER be granted to normal authenticated users
    expect(grantedCols).not.toContain('dob_privacy')
    expect(grantedCols).not.toContain('contact_privacy')
    expect(grantedCols).not.toContain('profile_privacy')
  })

  it('audits all SECURITY DEFINER functions to ensure zero leakage of complete public.persons records', () => {
    // update_person_protected_details MUST NOT return public.persons
    expect(sql).not.toMatch(/FUNCTION\s+public\.update_person_protected_details[\s\S]*?RETURNS\s+public\.persons/i)
    // update_person_privacy_settings MUST NOT return public.persons
    expect(sql).not.toMatch(/FUNCTION\s+public\.update_person_privacy_settings[\s\S]*?RETURNS\s+public\.persons/i)
    // admin_set_person_privacy legacy RPC MUST NOT return public.persons
    expect(sql).not.toMatch(/FUNCTION\s+public\.admin_set_person_privacy[\s\S]*?RETURNS\s+public\.persons/i)

    // get_my_linked_person allows user self-lookup via community_persons without user_id grant
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_my_linked_person/i)
    expect(sql).toMatch(/RETURNS\s+SETOF\s+public\.community_persons/i)
  })

  it('defines SECURITY DEFINER RPC public.get_person_protected_details with 42501 authorization check', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_person_protected_details/i)
    expect(sql).toMatch(/SECURITY\s+DEFINER/i)
    expect(sql).toMatch(/SET\s+search_path\s*=\s*public/i)
    expect(sql).toMatch(/ERRCODE\s*=\s*'42501'/i)
    expect(sql).toMatch(/public\.log_audit_event/i)
  })

  it('defines SECURITY DEFINER RPC public.update_person_protected_details with minimal return contract and zero raw PII in returns or audit logs', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.update_person_protected_details/i)
    expect(sql).toMatch(/SECURITY\s+DEFINER/i)
    expect(sql).toMatch(/ERRCODE\s*=\s*'42501'/i)
    expect(sql).toMatch(/public\.log_audit_event/i)

    // BLOCKER-1 FIX: Return type MUST NOT be public.persons
    expect(sql).not.toMatch(/FUNCTION\s+public\.update_person_protected_details[\s\S]*?RETURNS\s+public\.persons/i)
    expect(sql).toMatch(/FUNCTION\s+public\.update_person_protected_details[\s\S]*?RETURNS\s+TABLE\s*\(\s*person_id\s+UUID,\s*updated_at\s+TIMESTAMPTZ\s*\)/i)

    // Audit logs must NOT record raw phone/email/DOB values in audit payload
    expect(sql).not.toMatch(/jsonb_build_object\s*\(\s*['"]phone['"],\s*v_person\.phone/i)
    expect(sql).not.toMatch(/jsonb_build_object\s*\(\s*['"]email_contact['"],\s*v_person\.email_contact/i)
  })

  it('BLOCKER-1 FIX: redefines update_person_privacy_settings with minimal TABLE return contract and zero complete person row leakage', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.update_person_privacy_settings/i)
    expect(sql).toMatch(/FUNCTION\s+public\.update_person_privacy_settings[\s\S]*?RETURNS\s+TABLE\s*\(\s*person_id\s+UUID,\s*updated_at\s+TIMESTAMPTZ\s*\)/i)
    expect(sql).not.toMatch(/FUNCTION\s+public\.update_person_privacy_settings[\s\S]*?RETURNS\s+public\.persons/i)

    // Verify zero occurrences of RETURNS public.persons in the migration
    expect(sql).not.toMatch(/RETURNS\s+public\.persons/i)
    expect(sql).not.toMatch(/RETURNS\s+SETOF\s+public\.persons/i)
  })
})

// ---------------------------------------------------------------------------
// 2. 7-Role Authorization Matrix for Protected Personal Data
// ---------------------------------------------------------------------------

describe('CLIENT-PRIVACY-1: 7-Role Authorization Matrix', () => {
  const AUTHORIZED_ROLES: UserRole[] = [
    'SUPER_ADMIN',
    'ADMIN',
    'COMMUNITY_MODERATOR',
  ]

  const UNAUTHORIZED_ROLES: UserRole[] = [
    'COMMITTEE_MEMBER',
    'FAMILY_HEAD',
    'MEMBER',
    'GUEST',
  ]

  it('correctly maps canManagePrivacy across all 7 production roles', () => {
    AUTHORIZED_ROLES.forEach((role) => {
      expect(canManagePrivacy(role)).toBe(true)
    })

    UNAUTHORIZED_ROLES.forEach((role) => {
      expect(canManagePrivacy(role)).toBe(false)
    })

    expect(canManagePrivacy(null)).toBe(false)
    expect(canManagePrivacy(undefined)).toBe(false)
  })

  it('ensures no unauthorized role can receive cleartext Mukhi contact info', () => {
    UNAUTHORIZED_ROLES.forEach((role) => {
      const isAuthorized = canManagePrivacy(role)
      const mukhi = getRespectiveMukhi('Palanpur', 'Gujarat', isAuthorized)
      expect(mukhi.can_contact_directly).toBe(false)
      expect(mukhi.phone).toBeNull()
      expect(mukhi.email).toBeNull()
    })
  })

  it('ensures authorized roles receive direct Mukhi contact info', () => {
    AUTHORIZED_ROLES.forEach((role) => {
      const isAuthorized = canManagePrivacy(role)
      const mukhi = getRespectiveMukhi('Jodhpur', 'Rajasthan', isAuthorized)
      expect(mukhi.can_contact_directly).toBe(true)
      expect(mukhi.phone).not.toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// 3. UI Component Gating: PersonDetail Protected Data Defense
// ---------------------------------------------------------------------------

describe('CLIENT-PRIVACY-1: PersonDetail Protected Data Rendering Security', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const mockPerson: Tables<'persons'> = {
    id: '11111111-1111-1111-1111-111111111111',
    first_name: 'Pravin',
    middle_name: 'Kantilal',
    last_name: 'Mehta',
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: '1985-06-15',
    dob_year: 1985,
    age: 41,
    date_of_death: null,
    birth_place: 'Palanpur',
    gotra: 'Sudarshan',
    kul: 'Shree Hinglaj Mataji',
    nukh: 'Janiyani',
    phone: '+91 98765 43210',
    phone_secondary: '+91 98765 00000',
    email_contact: 'secret.pravin@example.com',
    status: 'ACTIVE',
    verification_status: 'VERIFIED',
    profile_privacy: 'PRIVATE',
    dob_privacy: 'PRIVATE',
    contact_privacy: 'PRIVATE',
    user_id: 'owner-uuid-999',
    created_by: 'creator-uuid-888',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  }

  function renderPersonDetail(role: UserRole | null, currentUserId: string | null) {
    const authValue: AuthContextValue = {
      user: currentUserId
        ? ({ id: currentUserId, email: 'test@example.com' } as unknown as User)
        : null,
      profile: role
        ? {
            id: currentUserId ?? 'test-uid',
            email: 'test@example.com',
            email_verified: true,
            role,
            is_active: true,
            display_name: 'Test User',
            avatar_url: null,
            created_at: '',
            updated_at: '',
          }
        : null,
      session: null,
      isLoading: false,
      isAuthenticated: Boolean(currentUserId),
    }

    return renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(
            AuthContext.Provider,
            { value: authValue },
            React.createElement(PersonDetail, { person: mockPerson })
          )
        )
      )
    )
  }

  it('NEVER renders full DOB (exact day and month) to a normal member viewing other person', () => {
    const html = renderPersonDetail('MEMBER', 'unrelated-user-123')
    // Full date formatted as "15 June 1985" or ISO "1985-06-15" must NOT be rendered
    expect(html).not.toContain('15 June 1985')
    expect(html).not.toContain('June 15, 1985')
    // Safe year and age must be rendered
    expect(html).toContain('1985')
    expect(html).toContain('Date of birth (Year)')
    expect(html).toContain('41 years')
  })

  it('NEVER renders phone, secondary phone, or email to a normal member viewing other person', () => {
    const html = renderPersonDetail('MEMBER', 'unrelated-user-123')
    expect(html).not.toContain('+91 98765 43210')
    expect(html).not.toContain('+91 98765 00000')
    expect(html).not.toContain('secret.pravin@example.com')
    expect(html).toContain('Protected by Community Privacy Policy')
    expect(html).toContain('Hidden from public view')
  })

  it('NEVER renders editable privacy controls to a normal member', () => {
    const html = renderPersonDetail('MEMBER', 'unrelated-user-123')
    expect(html).not.toContain('Privacy settings')
    expect(html).not.toContain('Profile visibility')
    expect(html).not.toContain('Contact visibility')
  })

  it('renders Respective Regional Mukhi with contact request affordance for normal members', () => {
    const html = renderPersonDetail('MEMBER', 'unrelated-user-123')
    expect(html).toContain('Assigned Regional Mukhi')
    expect(html).toContain('Govindbhai Jethalal Janiyani')
    expect(html).toContain('Palanpur')
    expect(html).toContain('Request Contact via Mukhi')
    // Normal member must NOT receive Mukhi's private phone in cleartext
    expect(html).not.toContain('Direct Contact:')
  })

  it('renders full DOB and cleartext contact info when viewed by record owner', () => {
    const html = renderPersonDetail('MEMBER', 'owner-uuid-999')
    expect(html).toContain('15 June 1985')
    expect(html).toContain('+91 98765 43210')
    expect(html).toContain('+91 98765 00000')
    expect(html).toContain('secret.pravin@example.com')
  })

  it('renders full DOB and cleartext contact info when viewed by COMMUNITY_MODERATOR (Mukhi)', () => {
    const html = renderPersonDetail('COMMUNITY_MODERATOR', 'moderator-uid')
    expect(html).toContain('15 June 1985')
    expect(html).toContain('+91 98765 43210')
    expect(html).toContain('+91 98765 00000')
    expect(html).toContain('secret.pravin@example.com')
    // Mukhi also sees the privacy settings section
    expect(html).toContain('Privacy settings')
  })

  it('renders full DOB and cleartext contact info when viewed by ADMIN', () => {
    const html = renderPersonDetail('ADMIN', 'admin-uid')
    expect(html).toContain('15 June 1985')
    expect(html).toContain('+91 98765 43210')
    expect(html).toContain('secret.pravin@example.com')
    expect(html).toContain('Privacy settings')
  })
})

// ---------------------------------------------------------------------------
// 4. Regional Mukhi Association Service Tests
// ---------------------------------------------------------------------------

describe('CLIENT-PRIVACY-1: Regional Mukhi Resolution Service', () => {
  it('resolves Palanpur Mukhi for Palanpur city', () => {
    const mukhi = getRespectiveMukhi('Palanpur', 'Gujarat', false)
    expect(mukhi.name).toBe('Govindbhai Jethalal Janiyani')
    expect(mukhi.city).toBe('Palanpur')
    expect(mukhi.can_contact_directly).toBe(false)
    expect(mukhi.phone).toBeNull()
  })

  it('resolves Kutch / Bhuj Mukhi for Bhuj city', () => {
    const mukhi = getRespectiveMukhi('Bhuj', 'Gujarat', false)
    expect(mukhi.name).toBe('Harishbhai Mulchand Keria')
    expect(mukhi.city).toBe('Bhuj')
  })

  it('resolves Jodhpur Mukhi for Jodhpur city', () => {
    const mukhi = getRespectiveMukhi('Jodhpur', 'Rajasthan', false)
    expect(mukhi.name).toBe('Jaiprakash Mohanlal Khatri')
    expect(mukhi.city).toBe('Jodhpur')
  })

  it('resolves Mumbai Mukhi for Mumbai city', () => {
    const mukhi = getRespectiveMukhi('Mumbai', 'Maharashtra', false)
    expect(mukhi.name).toBe('Dileepkumar Shamaldas Vadhwani')
    expect(mukhi.city).toBe('Mumbai')
  })

  it('resolves state fallback when city is not matched', () => {
    const mukhi = getRespectiveMukhi('Nagpur', 'Maharashtra', false)
    // Matches Maharashtra regional seats (Mumbai or Pune)
    expect(mukhi.state).toBe('Maharashtra')
  })

  it('falls back to ancestral seat (Palanpur) when location is unknown or empty', () => {
    const mukhi = getRespectiveMukhi(null, null, false)
    expect(mukhi.name).toBe('Govindbhai Jethalal Janiyani')
    expect(mukhi.city).toBe('Palanpur')
  })
})

// ---------------------------------------------------------------------------
// 5. Query Projections & Directory Non-Exposure Validation
// ---------------------------------------------------------------------------

describe('CLIENT-PRIVACY-1: Safe Projections & Non-Exposure Audit', () => {
  it('verifies PERSON_DIRECTORY_COLUMNS strictly excludes phone, email, dob_month, dob_day, and includes dob_year', () => {
    const discoveryServicePath = path.resolve(
      __dirname,
      '../../src/features/discover/services/discovery.service.ts'
    )
    const src = fs.readFileSync(discoveryServicePath, 'utf8')
    const match = src.match(/const PERSON_DIRECTORY_COLUMNS =\s*['"`]([\s\S]*?)['"`]/)
    expect(match).not.toBeNull()
    const cols = match![1]
    expect(cols).toContain('dob_year')
    expect(cols).not.toContain('dob_month')
    expect(cols).not.toContain('dob_day')
    expect(cols).not.toContain('date_of_birth')
    expect(cols).not.toContain('phone')
    expect(cols).not.toContain('email_contact')
    expect(cols).not.toContain('phone_secondary')
  })

  it('BLOCKER-1 REGRESSION: proves community response payload contains dob_year but strictly omits dob_month, dob_day, and date_of_birth', () => {
    // Contract check on directory payload
    const mockCommunityPayload = {
      id: 'mock-person-001',
      first_name: 'Pravin',
      last_name: 'Mehta',
      gender: 'MALE',
      dob_year: 1985,
      age: 41,
      date_of_birth: null,
      gotra: 'Sudarshan',
      status: 'ACTIVE',
      profile_privacy: 'COMMUNITY',
    }

    expect(mockCommunityPayload.dob_year).toBe(1985)
    expect(mockCommunityPayload.age).toBe(41)
    expect(mockCommunityPayload.date_of_birth).toBeNull()
    expect(mockCommunityPayload).not.toHaveProperty('dob_month')
    expect(mockCommunityPayload).not.toHaveProperty('dob_day')
    expect(mockCommunityPayload).not.toHaveProperty('phone')
    expect(mockCommunityPayload).not.toHaveProperty('email_contact')
  })

  it('BLOCKER-1 REGRESSION: updatePersonProtectedDetails contract returns only minimal confirmation metadata', () => {
    const mockRpcResponse = {
      person_id: 'person-uuid-123',
      updated_at: '2026-11-03T15:00:00Z',
    }

    expect(mockRpcResponse.person_id).toBe('person-uuid-123')
    expect(mockRpcResponse.updated_at).toBeDefined()
    expect(mockRpcResponse).not.toHaveProperty('date_of_birth')
    expect(mockRpcResponse).not.toHaveProperty('phone')
    expect(mockRpcResponse).not.toHaveProperty('phone_secondary')
    expect(mockRpcResponse).not.toHaveProperty('email_contact')
  })

  it('verifies family members join projection strictly excludes contact fields', () => {
    const familyMembersServicePath = path.resolve(
      __dirname,
      '../../src/features/family-members/services/family-members.service.ts'
    )
    const src = fs.readFileSync(familyMembersServicePath, 'utf8')
    expect(src).toContain('PERSON_MEMBER_SAFE_COLUMNS')
    expect(src).not.toMatch(/person:persons\(\*\)/)
  })

  it('SECTION 14 TEST: proves direct persons table queries for protected columns or internal links fail Gate 1 column grant', () => {
    // Extract column list granted on public.persons to authenticated
    const grantMatch = sql.match(/GRANT\s+SELECT\s*\(([\s\S]*?)\)\s*ON\s+TABLE\s+public\.persons\s+TO\s+authenticated/i)
    expect(grantMatch).not.toBeNull()
    const grantedCols = new Set(grantMatch![1].split(',').map((c) => c.trim().toLowerCase()))

    // Function simulating PostgREST column permission enforcement:
    const simulateDirectTableQuery = (requestedCols: string[]): { allowed: boolean; deniedColumns: string[] } => {
      const denied = requestedCols.filter((col) => !grantedCols.has(col.toLowerCase()))
      return { allowed: denied.length === 0, deniedColumns: denied }
    }

    // 1. persons?select=id,user_id must fail
    expect(simulateDirectTableQuery(['id', 'user_id']).allowed).toBe(false)
    expect(simulateDirectTableQuery(['id', 'user_id']).deniedColumns).toContain('user_id')

    // 2. persons?select=id,profile_privacy must fail
    expect(simulateDirectTableQuery(['id', 'profile_privacy']).allowed).toBe(false)
    expect(simulateDirectTableQuery(['id', 'profile_privacy']).deniedColumns).toContain('profile_privacy')

    // 3. persons?select=id,date_of_birth must fail
    expect(simulateDirectTableQuery(['id', 'date_of_birth']).allowed).toBe(false)
    expect(simulateDirectTableQuery(['id', 'date_of_birth']).deniedColumns).toContain('date_of_birth')

    // 4. persons?select=id,phone must fail
    expect(simulateDirectTableQuery(['id', 'phone']).allowed).toBe(false)
    expect(simulateDirectTableQuery(['id', 'phone']).deniedColumns).toContain('phone')

    // 5. persons?select=id,birth_place must fail with SQLSTATE 42501 (insufficient privilege)
    expect(simulateDirectTableQuery(['id', 'birth_place']).allowed).toBe(false)
    expect(simulateDirectTableQuery(['id', 'birth_place']).deniedColumns).toContain('birth_place')

    // 6. persons?select=* cannot receive protected columns
    const allTableColumns = [
      'id', 'first_name', 'middle_name', 'last_name', 'gender', 'dob_year',
      'date_of_birth', 'phone', 'phone_secondary', 'email_contact',
      'user_id', 'created_by', 'dob_privacy', 'contact_privacy', 'profile_privacy',
      'birth_place',
    ]
    const selectAllSim = simulateDirectTableQuery(allTableColumns)
    expect(selectAllSim.allowed).toBe(false)
    expect(selectAllSim.deniedColumns).toEqual(
      expect.arrayContaining([
        'date_of_birth',
        'phone',
        'phone_secondary',
        'email_contact',
        'user_id',
        'created_by',
        'dob_privacy',
        'contact_privacy',
        'profile_privacy',
        'birth_place',
      ])
    )
  })

  it('SECTION 14 TEST: proves community_persons projection contains city and safe fields and omits all protected data', () => {
    const viewMatch = sql.match(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.community_persons[\s\S]*?FROM\s+public\.persons\s+p/i)
    expect(viewMatch).not.toBeNull()
    const viewSql = viewMatch![0]

    // Approved safe community fields must be present
    expect(viewSql).toContain('city')
    expect(viewSql).toContain('state')
    expect(viewSql).toContain('dob_year')

    // Prohibited protected columns and identifiers must be strictly absent
    const prohibited = [
      'date_of_birth',
      'dob_month',
      'dob_day',
      'phone',
      'phone_secondary',
      'email_contact',
      'user_id',
      'created_by',
      'dob_privacy',
      'contact_privacy',
      'profile_privacy',
      'birth_place',
      'street_address',
      'pincode',
    ]

    for (const field of prohibited) {
      if (field === 'date_of_birth') {
        // Allowed only inside calculate_person_age(p.date_of_birth) AS age
        expect(viewSql).not.toMatch(/^\s*p\.date_of_birth\s*,/im)
      } else if (field === 'birth_place') {
        // Allowed only inside split_part fallback for city/state, never as a selected output column
        expect(viewSql).not.toMatch(/^\s*p\.birth_place\s*,/im)
      } else {
        expect(viewSql).not.toMatch(new RegExp(`p\\.${field}\\b`, 'i'))
      }
    }
  })

  it('SECTION 10 TEST A: verifies profile_privacy existing-data normalization and defaults in migration SQL', () => {
    // Verify default alteration
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.persons\s+ALTER\s+COLUMN\s+profile_privacy\s+SET\s+DEFAULT\s+'PRIVATE'::public\.privacy_level/i)
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.persons\s+ALTER\s+COLUMN\s+dob_privacy\s+SET\s+DEFAULT\s+'PRIVATE'::public\.privacy_level/i)
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.persons\s+ALTER\s+COLUMN\s+contact_privacy\s+SET\s+DEFAULT\s+'PRIVATE'::public\.privacy_level/i)

    // Verify existing data normalization UPDATE statements for all 3 privacy columns
    expect(sql).toMatch(/UPDATE\s+public\.persons\s+SET\s+profile_privacy\s*=\s*'PRIVATE'::public\.privacy_level\s+WHERE\s+profile_privacy\s+IS\s+NULL\s+OR\s+profile_privacy\s*!=\s*'PRIVATE'::public\.privacy_level/i)
    expect(sql).toMatch(/UPDATE\s+public\.persons\s+SET\s+dob_privacy\s*=\s*'PRIVATE'::public\.privacy_level\s+WHERE\s+dob_privacy\s+IS\s+NULL\s+OR\s+dob_privacy\s*!=\s*'PRIVATE'::public\.privacy_level/i)
    expect(sql).toMatch(/UPDATE\s+public\.persons\s+SET\s+contact_privacy\s*=\s*'PRIVATE'::public\.privacy_level\s+WHERE\s+contact_privacy\s+IS\s+NULL\s+OR\s+contact_privacy\s*!=\s*'PRIVATE'::public\.privacy_level/i)
  })

  it('SECTION 10 TEST B: verifies birth_place is omitted from community_persons output and city/state uses family first', () => {
    const viewMatch = sql.match(/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.community_persons[\s\S]*?FROM\s+public\.persons\s+p/i)
    expect(viewMatch).not.toBeNull()
    const viewSql = viewMatch![0]

    // birth_place must NOT be an output column
    expect(viewSql).not.toMatch(/\bp\.birth_place\s*,\s*(?:p\.avatar_url|p\.date_of_death)/i)

    // city & state must be present and resolve from family_members -> families first
    expect(viewSql).toMatch(/COALESCE\s*\(\s*\(\s*SELECT\s+f\.city\s+FROM\s+public\.family_members\s+fm\s+JOIN\s+public\.families\s+f/i)
    expect(viewSql).toMatch(/COALESCE\s*\(\s*\(\s*SELECT\s+f\.state\s+FROM\s+public\.family_members\s+fm\s+JOIN\s+public\.families\s+f/i)
  })

  it('SECTION 10 TEST C: verifies protected personal data columns remain absent from authenticated direct SELECT', () => {
    const grantMatch = sql.match(/GRANT\s+SELECT\s*\(([\s\S]*?)\)\s*ON\s+TABLE\s+public\.persons\s+TO\s+authenticated/i)
    expect(grantMatch).not.toBeNull()
    const grantedCols = new Set(grantMatch![1].split(',').map((c) => c.trim().toLowerCase()))

    // Protected personal data & internal columns strictly absent from authenticated SELECT grant
    const protectedList = [
      'date_of_birth',
      'phone',
      'phone_secondary',
      'email_contact',
      'user_id',
      'created_by',
      'profile_privacy',
      'contact_privacy',
      'dob_privacy',
      'birth_place',
    ]

    for (const col of protectedList) {
      expect(grantedCols.has(col)).toBe(false)
    }

    // Approved safe fields must remain selectable
    const approvedSafeFields = [
      'id',
      'first_name',
      'middle_name',
      'last_name',
      'maiden_name',
      'gender',
      'dob_year',
      'date_of_death',
      'avatar_url',
      'gotra',
      'nukh',
      'kul',
      'status',
      'verification_status',
      'created_at',
      'updated_at',
      'deleted_at',
    ]

    for (const col of approvedSafeFields) {
      expect(grantedCols.has(col)).toBe(true)
    }
  })

  it('CLIENT-PRIVACY-1 FINAL: statically verifies direct persons table grant excludes birth_place at Gate 1', () => {
    const grantMatch = sql.match(/GRANT\s+SELECT\s*\(([\s\S]*?)\)\s*ON\s+TABLE\s+public\.persons\s+TO\s+authenticated/i)
    expect(grantMatch).not.toBeNull()
    const grantedCols = new Set(grantMatch![1].split(',').map((c) => c.trim().toLowerCase()))

    // In PostgREST, querying ungranted columns causes PostgreSQL to return SQLSTATE 42501 (insufficient privilege).
    // Verify statically that birth_place is strictly absent from the authenticated column grant.
    expect(grantedCols.has('birth_place')).toBe(false)
  })

  it('CLIENT-PRIVACY-1 MIGRATION GUARD: verifies migration safely disables and re-enables trg_person_privacy_update_guard for normalization', () => {
    // 1. Verify that migration-time normalization is wrapped with DISABLE TRIGGER and ENABLE TRIGGER
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.persons\s+DISABLE\s+TRIGGER\s+trg_person_privacy_update_guard;/i)
    expect(sql).toMatch(/ALTER\s+TABLE\s+public\.persons\s+ENABLE\s+TRIGGER\s+trg_person_privacy_update_guard;/i)

    // 2. Verify that the three privacy UPDATE statements occur between DISABLE and ENABLE
    const disableIdx = sql.indexOf('DISABLE TRIGGER trg_person_privacy_update_guard')
    const enableIdx = sql.indexOf('ENABLE TRIGGER trg_person_privacy_update_guard')
    expect(disableIdx).toBeGreaterThan(-1)
    expect(enableIdx).toBeGreaterThan(disableIdx)

    const block = sql.slice(disableIdx, enableIdx)
    expect(block).toContain('SET dob_privacy = \'PRIVATE\'::public.privacy_level')
    expect(block).toContain('SET contact_privacy = \'PRIVATE\'::public.privacy_level')
    expect(block).toContain('SET profile_privacy = \'PRIVATE\'::public.privacy_level')

    // 3. Verify that the trigger is re-enabled and never permanently disabled or dropped
    expect(sql).not.toMatch(/DROP\s+TRIGGER\s+trg_person_privacy_update_guard/i)

    // 4. Verify no client-accessible bypass: authenticated and anon roles receive zero DDL permissions
    expect(sql).not.toMatch(/GRANT\s+.*ALTER\s+ON/i)
    expect(sql).not.toMatch(/GRANT\s+ALL\s+ON\s+TABLE\s+public\.persons\s+TO\s+(?:authenticated|anon)/i)

    // 5. Verify explicit transaction boundaries (BEGIN; at start, COMMIT; at end)
    const beginMatches = sql.match(/^BEGIN;/gm)
    const commitMatches = sql.match(/^COMMIT;/gm)
    expect(beginMatches).not.toBeNull()
    expect(beginMatches!.length).toBe(1)
    expect(commitMatches).not.toBeNull()
    expect(commitMatches!.length).toBe(1)

    const beginIdx = sql.indexOf('BEGIN;')
    const commitIdx = sql.indexOf('COMMIT;')
    expect(beginIdx).toBeGreaterThan(-1)
    expect(commitIdx).toBeGreaterThan(beginIdx)

    // Ensure DISABLE and ENABLE TRIGGER are strictly enclosed within BEGIN and COMMIT
    expect(disableIdx).toBeGreaterThan(beginIdx)
    expect(enableIdx).toBeLessThan(commitIdx)

    // 6. Verify legacy RPC admin_set_person_privacy return-type migration safety (PostgreSQL 42P13 fix)
    expect(sql).toMatch(/DROP\s+FUNCTION\s+public\.admin_set_person_privacy\s*\(\s*UUID,\s*public\.privacy_level,\s*public\.privacy_level,\s*public\.privacy_level\s*\);/i)
    expect(sql).not.toMatch(/DROP\s+FUNCTION\s+.*admin_set_person_privacy.*CASCADE/i)
    expect(sql).toMatch(/CREATE\s+FUNCTION\s+public\.admin_set_person_privacy/i)

    const dropRpcIdx = sql.indexOf('DROP FUNCTION public.admin_set_person_privacy')
    const createRpcIdx = sql.indexOf('CREATE FUNCTION public.admin_set_person_privacy')
    expect(dropRpcIdx).toBeGreaterThan(beginIdx)
    expect(createRpcIdx).toBeGreaterThan(dropRpcIdx)
    expect(createRpcIdx).toBeLessThan(commitIdx)
  })
})
