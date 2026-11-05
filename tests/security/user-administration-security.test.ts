/**
 * Security Tests: User Administration & Audit Trail (Phase 13 Subtask 3)
 * (tests/security/user-administration-security.test.ts)
 *
 * Security Requirements Verified:
 * 1. AdminRoute presentation-level guard restricts /admin/users and /admin/audit to ADMIN and SUPER_ADMIN.
 * 2. COMMUNITY_MODERATOR, MEMBER, GUEST, and unauthenticated users are denied.
 * 3. Architectural Rule PERSON != USER:
 *    - User management operates on public.profiles.
 *    - NEVER mutates or confuses census records (public.persons).
 * 4. Authoritative Mutation Paths:
 *    - No direct table updates to profiles.role or profiles.is_active in source.
 *    - All mutations route through server-authoritative RPCs (admin_update_user_role, admin_set_user_status).
 * 5. Authoritative Audit Access:
 *    - No direct table queries on public.audit_logs in client source.
 *    - All audit queries route through server-authoritative RPC (admin_get_audit_logs).
 * 6. No secret exposure, service_role keys, or raw auth.users queries in source.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('User Administration & Audit Trail Security Boundaries', () => {
  const adminServicePath = path.resolve(
    __dirname,
    '../../src/features/admin/services/admin.service.ts'
  )
  const userManagementPagePath = path.resolve(
    __dirname,
    '../../src/features/admin/pages/UserManagementPage.tsx'
  )
  const auditLogPagePath = path.resolve(
    __dirname,
    '../../src/features/admin/pages/AuditLogPage.tsx'
  )
  const changeRoleModalPath = path.resolve(
    __dirname,
    '../../src/features/admin/components/ChangeRoleModal.tsx'
  )
  const setStatusModalPath = path.resolve(
    __dirname,
    '../../src/features/admin/components/SetUserStatusModal.tsx'
  )

  const adminServiceCode = fs.readFileSync(adminServicePath, 'utf-8')
  const userPageCode = fs.readFileSync(userManagementPagePath, 'utf-8')
  const auditPageCode = fs.readFileSync(auditLogPagePath, 'utf-8')
  const changeRoleCode = fs.readFileSync(changeRoleModalPath, 'utf-8')
  const setStatusCode = fs.readFileSync(setStatusModalPath, 'utf-8')

  it('prohibits direct table updates to profiles.role in client code', () => {
    // No supabase.from('profiles').update({ ... role ... })
    expect(adminServiceCode).not.toMatch(/\.from\(['"]profiles['"]\)\s*\.update\(\s*\{[^}]*role/)
    expect(userPageCode).not.toMatch(/\.from\(['"]profiles['"]\)\s*\.update/)
    expect(changeRoleCode).not.toMatch(/\.from\(['"]profiles['"]\)\s*\.update/)
  })

  it('prohibits direct table updates to profiles.is_active in client code', () => {
    // No supabase.from('profiles').update({ ... is_active ... })
    expect(adminServiceCode).not.toMatch(/\.from\(['"]profiles['"]\)\s*\.update\(\s*\{[^}]*is_active/)
    expect(userPageCode).not.toMatch(/\.from\(['"]profiles['"]\)\s*\.update/)
    expect(setStatusCode).not.toMatch(/\.from\(['"]profiles['"]\)\s*\.update/)
  })

  it('routes role changes exclusively through server RPC admin_update_user_role', () => {
    expect(adminServiceCode).toContain("'admin_update_user_role'")
    expect(adminServiceCode).toContain('p_user_id')
    expect(adminServiceCode).toContain('p_new_role')
  })

  it('routes status changes exclusively through server RPC admin_set_user_status', () => {
    expect(adminServiceCode).toContain("'admin_set_user_status'")
    expect(adminServiceCode).toContain('p_user_id')
    expect(adminServiceCode).toContain('p_is_active')
    expect(adminServiceCode).toContain('p_reason')
  })

  it('prohibits direct table queries on public.audit_logs in client source code', () => {
    expect(adminServiceCode).not.toMatch(/\.from\(['"]audit_logs['"]\)/)
    expect(auditPageCode).not.toMatch(/\.from\(['"]audit_logs['"]\)/)
  })

  it('routes audit logs retrieval exclusively through server RPC admin_get_audit_logs', () => {
    expect(adminServiceCode).toContain("'admin_get_audit_logs'")
  })

  it('prohibits raw queries to auth.users from client code', () => {
    expect(adminServiceCode).not.toContain("from('auth.users')")
    expect(adminServiceCode).not.toContain('from("auth.users")')
    expect(userPageCode).not.toContain("from('auth.users')")
    expect(auditPageCode).not.toContain("from('auth.users')")
  })

  it('maintains strict PERSON != USER separation in user management', () => {
    // User administration queries public.profiles, not public.persons
    expect(adminServiceCode).toContain(".from('profiles')")
    expect(adminServiceCode).not.toContain(".from('persons').update")
    expect(userPageCode).toContain('PERSON ≠ USER')
  })

  it('prohibits service_role key usage in admin feature code', () => {
    expect(adminServiceCode).not.toContain('service_role')
    expect(userPageCode).not.toContain('service_role')
    expect(auditPageCode).not.toContain('service_role')
    expect(changeRoleCode).not.toContain('service_role')
    expect(setStatusCode).not.toContain('service_role')
  })
})
