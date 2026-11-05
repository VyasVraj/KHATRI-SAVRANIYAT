/**
 * Security Test Suite: ANDROID-2 — Privacy Authorization Lock
 *
 * Verifies the database trigger guards, RPCs, audit logging, authorization matrix,
 * and UI component privacy gating.
 *
 * SECURITY MODEL:
 * - Only SUPER_ADMIN, ADMIN, and COMMUNITY_MODERATOR (temporary Mukhi-equivalent)
 *   are authorized to view or modify privacy controls.
 * - COMMITTEE_MEMBER, FAMILY_HEAD, MEMBER, GUEST, and anonymous users are DENIED.
 * - Enforced at database trigger level so direct table UPDATEs through row-ownership
 *   policies cannot bypass privacy controls.
 * - Safe defaults are enforced as 'PRIVATE'.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  canManagePrivacy,
  PRIVACY_MANAGEMENT_ROLES,
  USER_ROLES,
} from '@/constants/app'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import { PersonDetail } from '@/features/people/components/PersonDetail'
import { FamilyDetail } from '@/features/families/components/FamilyDetail'
import { createPersonSchema } from '@/features/people/schemas/people.schemas'
import { createFamilySchema } from '@/features/families/schemas/families.schemas'
import type { Tables } from '@/types/database.types'
import type { UserRole } from '@/types'

// ---------------------------------------------------------------------------
// 1. Static Migration Audit
// ---------------------------------------------------------------------------

describe('ANDROID-2: Database Migration Static Security Audit', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/20261026200000_enforce_privacy_authorization_lock.sql'
  )

  it('migration file exists and is readable', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
  })

  const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : ''

  it('defines public.can_manage_privacy_settings() with SECURITY DEFINER and search_path', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_manage_privacy_settings()')
    expect(sql).toMatch(/SECURITY DEFINER/i)
    expect(sql).toMatch(/SET search_path\s*=\s*public/i)
  })

  it('authorizes only SUPER_ADMIN, ADMIN, and COMMUNITY_MODERATOR in can_manage_privacy_settings()', () => {
    expect(sql).toMatch(
      /role\s+IN\s*\(\s*'SUPER_ADMIN',\s*'ADMIN',\s*'COMMUNITY_MODERATOR'\s*\)/i
    )
  })

  it('alters persons and families table column defaults to PRIVATE', () => {
    expect(sql).toMatch(/ALTER TABLE\s+public\.persons\s+ALTER COLUMN\s+profile_privacy\s+SET DEFAULT\s+'PRIVATE'/i)
    expect(sql).toMatch(/ALTER TABLE\s+public\.persons\s+ALTER COLUMN\s+dob_privacy\s+SET DEFAULT\s+'PRIVATE'/i)
    expect(sql).toMatch(/ALTER TABLE\s+public\.persons\s+ALTER COLUMN\s+contact_privacy\s+SET DEFAULT\s+'PRIVATE'/i)
    expect(sql).toMatch(/ALTER TABLE\s+public\.families\s+ALTER COLUMN\s+profile_privacy\s+SET DEFAULT\s+'PRIVATE'/i)
    expect(sql).toMatch(/ALTER TABLE\s+public\.families\s+ALTER COLUMN\s+members_privacy\s+SET DEFAULT\s+'PRIVATE'/i)
  })

  it('defines BEFORE UPDATE trigger guard on persons table', () => {
    expect(sql).toContain('FUNCTION public.handle_person_privacy_update_guard()')
    expect(sql).toContain('TRIGGER trg_person_privacy_update_guard')
    expect(sql).toMatch(/BEFORE UPDATE ON\s+public\.persons/i)
    expect(sql).toContain("ERRCODE = '42501'")
  })

  it('defines BEFORE UPDATE trigger guard on families table', () => {
    expect(sql).toContain('FUNCTION public.handle_family_privacy_update_guard()')
    expect(sql).toContain('TRIGGER trg_family_privacy_update_guard')
    expect(sql).toMatch(/BEFORE UPDATE ON\s+public\.families/i)
    expect(sql).toContain("ERRCODE = '42501'")
  })

  it('defines BEFORE INSERT trigger guards forcing PRIVATE default on unauthorized inserts', () => {
    expect(sql).toContain('FUNCTION public.handle_person_privacy_insert_guard()')
    expect(sql).toContain('TRIGGER trg_person_privacy_insert_guard')
    expect(sql).toMatch(/BEFORE INSERT ON\s+public\.persons/i)

    expect(sql).toContain('FUNCTION public.handle_family_privacy_insert_guard()')
    expect(sql).toContain('TRIGGER trg_family_privacy_insert_guard')
    expect(sql).toMatch(/BEFORE INSERT ON\s+public\.families/i)
  })

  it('logs audit events via public.log_audit_event on privacy changes', () => {
    expect(sql).toMatch(/public\.log_audit_event\s*\(/)
    expect(sql).toContain('ADMIN_ACTION')
    expect(sql).toContain('PRIVACY_SETTING_CHANGED')
  })

  it('defines authoritative admin RPCs with SECURITY DEFINER and revoked anon access', () => {
    expect(sql).toContain('FUNCTION public.admin_set_person_privacy')
    expect(sql).toContain('FUNCTION public.admin_set_family_privacy')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_person_privacy/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_set_person_privacy/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_family_privacy/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_set_family_privacy/i)
  })
})

// ---------------------------------------------------------------------------
// 2. Authorization Matrix Verification
// ---------------------------------------------------------------------------

describe('ANDROID-2: Role Authorization Matrix', () => {
  const ALL_ROLES: UserRole[] = Object.values(USER_ROLES)

  it('PRIVACY_MANAGEMENT_ROLES contains exactly SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR', () => {
    expect(PRIVACY_MANAGEMENT_ROLES).toEqual([
      'SUPER_ADMIN',
      'ADMIN',
      'COMMUNITY_MODERATOR',
    ])
  })

  it('ALLOWS exactly SUPER_ADMIN, ADMIN, and COMMUNITY_MODERATOR', () => {
    expect(canManagePrivacy('SUPER_ADMIN')).toBe(true)
    expect(canManagePrivacy('ADMIN')).toBe(true)
    expect(canManagePrivacy('COMMUNITY_MODERATOR')).toBe(true)
  })

  it('DENIES COMMITTEE_MEMBER, FAMILY_HEAD, MEMBER, and GUEST', () => {
    expect(canManagePrivacy('COMMITTEE_MEMBER')).toBe(false)
    expect(canManagePrivacy('FAMILY_HEAD')).toBe(false)
    expect(canManagePrivacy('MEMBER')).toBe(false)
    expect(canManagePrivacy('GUEST')).toBe(false)
  })

  it('DENIES null, undefined, and arbitrary strings', () => {
    expect(canManagePrivacy(null)).toBe(false)
    expect(canManagePrivacy(undefined)).toBe(false)
    expect(canManagePrivacy('')).toBe(false)
    expect(canManagePrivacy('ANONYMOUS')).toBe(false)
    expect(canManagePrivacy('MUKHI')).toBe(false) // Mukhi role does NOT exist yet
  })

  it('exhaustively covers all known roles with zero unexpected allowances', () => {
    const allowed = ALL_ROLES.filter((role) => canManagePrivacy(role))
    const denied = ALL_ROLES.filter((role) => !canManagePrivacy(role))

    expect(allowed).toEqual(['SUPER_ADMIN', 'ADMIN', 'COMMUNITY_MODERATOR'])
    expect(denied).toEqual(['COMMITTEE_MEMBER', 'FAMILY_HEAD', 'MEMBER', 'GUEST'])
  })
})

// ---------------------------------------------------------------------------
// 3. Simulated Trigger Guard Execution
// ---------------------------------------------------------------------------

describe('ANDROID-2: Simulated Server Trigger Guard Behavior', () => {
  // Simulates guard_person_privacy_update() logic
  function simulatePersonPrivacyUpdateGuard(
    oldRow: { profile_privacy: string; dob_privacy: string; contact_privacy: string; first_name: string },
    newRow: { profile_privacy: string; dob_privacy: string; contact_privacy: string; first_name: string },
    userRole: string | null
  ): { allowed: boolean; errorCode?: string; auditLogged?: boolean } {
    const privacyChanged =
      oldRow.profile_privacy !== newRow.profile_privacy ||
      oldRow.dob_privacy !== newRow.dob_privacy ||
      oldRow.contact_privacy !== newRow.contact_privacy

    if (!privacyChanged) {
      return { allowed: true, auditLogged: false }
    }

    const isAuthorized = canManagePrivacy(userRole)
    if (!isAuthorized) {
      return { allowed: false, errorCode: '42501' }
    }

    return { allowed: true, auditLogged: true }
  }

  // Simulates guard_person_privacy_insert() logic
  function simulatePersonPrivacyInsertGuard(
    input: { profile_privacy?: string; dob_privacy?: string; contact_privacy?: string },
    userRole: string | null
  ): { profile_privacy: string; dob_privacy: string; contact_privacy: string } {
    const isAuthorized = canManagePrivacy(userRole)
    if (!isAuthorized) {
      return {
        profile_privacy: 'PRIVATE',
        dob_privacy: 'PRIVATE',
        contact_privacy: 'PRIVATE',
      }
    }
    return {
      profile_privacy: input.profile_privacy ?? 'PRIVATE',
      dob_privacy: input.dob_privacy ?? 'PRIVATE',
      contact_privacy: input.contact_privacy ?? 'PRIVATE',
    }
  }

  it('rejects direct UPDATE on person privacy columns by non-moderator (MEMBER)', () => {
    const oldRow = { profile_privacy: 'PRIVATE', dob_privacy: 'PRIVATE', contact_privacy: 'PRIVATE', first_name: 'Aarav' }
    const newRow = { profile_privacy: 'PUBLIC', dob_privacy: 'PRIVATE', contact_privacy: 'PRIVATE', first_name: 'Aarav' }

    const result = simulatePersonPrivacyUpdateGuard(oldRow, newRow, 'MEMBER')
    expect(result.allowed).toBe(false)
    expect(result.errorCode).toBe('42501')
  })

  it('rejects direct UPDATE on person privacy columns by FAMILY_HEAD', () => {
    const oldRow = { profile_privacy: 'PRIVATE', dob_privacy: 'PRIVATE', contact_privacy: 'PRIVATE', first_name: 'Aarav' }
    const newRow = { profile_privacy: 'COMMUNITY', dob_privacy: 'COMMUNITY', contact_privacy: 'PRIVATE', first_name: 'Aarav' }

    const result = simulatePersonPrivacyUpdateGuard(oldRow, newRow, 'FAMILY_HEAD')
    expect(result.allowed).toBe(false)
    expect(result.errorCode).toBe('42501')
  })

  it('permits UPDATE on non-privacy columns by normal user without triggering privacy guard', () => {
    const oldRow = { profile_privacy: 'PRIVATE', dob_privacy: 'PRIVATE', contact_privacy: 'PRIVATE', first_name: 'Aarav' }
    const newRow = { profile_privacy: 'PRIVATE', dob_privacy: 'PRIVATE', contact_privacy: 'PRIVATE', first_name: 'Aarav Kumar' }

    const result = simulatePersonPrivacyUpdateGuard(oldRow, newRow, 'MEMBER')
    expect(result.allowed).toBe(true)
    expect(result.auditLogged).toBe(false)
  })

  it('permits privacy UPDATE by COMMUNITY_MODERATOR and emits audit log', () => {
    const oldRow = { profile_privacy: 'PRIVATE', dob_privacy: 'PRIVATE', contact_privacy: 'PRIVATE', first_name: 'Aarav' }
    const newRow = { profile_privacy: 'COMMUNITY', dob_privacy: 'FAMILY', contact_privacy: 'PRIVATE', first_name: 'Aarav' }

    const result = simulatePersonPrivacyUpdateGuard(oldRow, newRow, 'COMMUNITY_MODERATOR')
    expect(result.allowed).toBe(true)
    expect(result.auditLogged).toBe(true)
  })

  it('forces PRIVATE default on INSERT when caller is MEMBER attempting to set PUBLIC', () => {
    const insertPayload = { profile_privacy: 'PUBLIC', dob_privacy: 'PUBLIC', contact_privacy: 'PUBLIC' }
    const sanitized = simulatePersonPrivacyInsertGuard(insertPayload, 'MEMBER')

    expect(sanitized.profile_privacy).toBe('PRIVATE')
    expect(sanitized.dob_privacy).toBe('PRIVATE')
    expect(sanitized.contact_privacy).toBe('PRIVATE')
  })

  it('respects provided privacy values on INSERT when caller is COMMUNITY_MODERATOR', () => {
    const insertPayload = { profile_privacy: 'COMMUNITY', dob_privacy: 'FAMILY', contact_privacy: 'PRIVATE' }
    const sanitized = simulatePersonPrivacyInsertGuard(insertPayload, 'COMMUNITY_MODERATOR')

    expect(sanitized.profile_privacy).toBe('COMMUNITY')
    expect(sanitized.dob_privacy).toBe('FAMILY')
    expect(sanitized.contact_privacy).toBe('PRIVATE')
  })
})

// ---------------------------------------------------------------------------
// 4. UI Privacy View Restriction
// ---------------------------------------------------------------------------

describe('ANDROID-2: UI Privacy View Gate (PersonDetail & FamilyDetail)', () => {
  const mockPerson: Tables<'persons'> = {
    id: 'person-test-1',
    first_name: 'Dev',
    middle_name: null,
    last_name: 'Sharma',
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: '1990-01-01',
    date_of_death: null,
    birth_place: 'Jaipur',
    phone: null,
    phone_secondary: null,
    email_contact: null,
    gotra: 'Kashyap',
    kul: null,
    nukh: null,
    profile_privacy: 'PRIVATE',
    contact_privacy: 'PRIVATE',
    dob_privacy: 'PRIVATE',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    user_id: null,
    avatar_url: null,
    created_by: 'user-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  }

  const mockFamily: Tables<'families'> = {
    id: 'family-test-1',
    family_name: 'Sharma Family',
    description: null,
    city: 'Jaipur',
    state: 'RJ',
    country: 'India',
    gotra: 'Kashyap',
    kul: null,
    nukh: null,
    profile_privacy: 'PRIVATE',
    members_privacy: 'PRIVATE',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    avatar_url: null,
    created_by: 'user-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  }

  function renderWithAuth(element: React.ReactNode, role: UserRole | null): string {
    const authVal: AuthContextValue = {
      session: null,
      user: { id: 'u1' } as unknown as NonNullable<AuthContextValue['user']>,
      profile: role ? ({ role } as unknown as NonNullable<AuthContextValue['profile']>) : null,
      isLoading: false,
      isAuthenticated: Boolean(role),
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    return renderToStaticMarkup(
      React.createElement(
        AuthContext.Provider,
        { value: authVal },
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, element)
        )
      )
    )
  }

  it('PersonDetail hides Privacy Settings section for regular MEMBER', () => {
    const html = renderWithAuth(React.createElement(PersonDetail, { person: mockPerson }), 'MEMBER')
    expect(html).not.toContain('Privacy settings')
    expect(html).not.toContain('Profile visibility')
  })

  it('PersonDetail hides Privacy Settings section for unauthenticated / null role', () => {
    const html = renderWithAuth(React.createElement(PersonDetail, { person: mockPerson }), null)
    expect(html).not.toContain('Privacy settings')
  })

  it('PersonDetail renders Privacy Settings section for COMMUNITY_MODERATOR', () => {
    const html = renderWithAuth(React.createElement(PersonDetail, { person: mockPerson }), 'COMMUNITY_MODERATOR')
    expect(html).toContain('Privacy settings')
    expect(html).toContain('Profile visibility')
  })

  it('PersonDetail renders Privacy Settings section for ADMIN', () => {
    const html = renderWithAuth(React.createElement(PersonDetail, { person: mockPerson }), 'ADMIN')
    expect(html).toContain('Privacy settings')
    expect(html).toContain('Profile visibility')
  })

  it('FamilyDetail hides Privacy Settings section for regular MEMBER', () => {
    const html = renderWithAuth(React.createElement(FamilyDetail, { family: mockFamily }), 'MEMBER')
    expect(html).not.toContain('Privacy Settings')
    expect(html).not.toContain('Family profile visibility')
  })

  it('FamilyDetail renders Privacy Settings section for COMMUNITY_MODERATOR', () => {
    const html = renderWithAuth(React.createElement(FamilyDetail, { family: mockFamily }), 'COMMUNITY_MODERATOR')
    expect(html).toContain('Privacy Settings')
    expect(html).toContain('Family profile visibility')
  })
})

// ---------------------------------------------------------------------------
// 5. Schema Safe Defaults
// ---------------------------------------------------------------------------

describe('ANDROID-2: Zod Schema Safe Defaults', () => {
  it('createPersonSchema defaults profile_privacy, contact_privacy, dob_privacy to PRIVATE', () => {
    const parsed = createPersonSchema.parse({
      first_name: 'Test',
      last_name: 'User',
    })
    expect(parsed.profile_privacy).toBe('PRIVATE')
    expect(parsed.contact_privacy).toBe('PRIVATE')
    expect(parsed.dob_privacy).toBe('PRIVATE')
  })

  it('createFamilySchema defaults profile_privacy and members_privacy to PRIVATE', () => {
    const parsed = createFamilySchema.parse({
      family_name: 'Test Family',
    })
    expect(parsed.profile_privacy).toBe('PRIVATE')
    expect(parsed.members_privacy).toBe('PRIVATE')
  })
})
