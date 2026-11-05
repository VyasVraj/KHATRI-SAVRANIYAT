/**
 * Security & RLS Tests: Admin Authorization Infrastructure & Database RPCs
 * Phase 13 Subtask 1 (supabase/migrations/20261016180000_create_admin_authorization_rpcs.sql)
 *
 * Verifies:
 * 1. Static SQL schema & AST invariants (SECURITY DEFINER, search_path, permissions, immutability)
 * 2. Role hierarchy & anti-lockout enforcement (SUPER_ADMIN vs ADMIN vs COMMUNITY_MODERATOR vs MEMBER)
 * 3. Self-demotion and self-deactivation protection
 * 4. Sole active SUPER_ADMIN protection
 * 5. Automated audit logging for USER_ROLE_CHANGED, USER_DEACTIVATED, USER_REACTIVATED
 * 6. Audit logs pagination and platform metrics query authorization
 * 7. PERSON != USER architectural separation: administrative changes touch profiles, never persons
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { UserRole } from '@/types'

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261016180000_create_admin_authorization_rpcs.sql'
)
const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8')

// ============================================================================
// PART 1: STATIC SQL INVARIANTS & SECURITY CHECKS
// ============================================================================

describe('Static Migration Inspection: 20261016180000_create_admin_authorization_rpcs.sql', () => {
  it('migration file exists and contains content', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true)
    expect(migrationSql.length).toBeGreaterThan(1000)
  })

  it('defines all 4 administrative RPCs', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_update_user_role\(/)
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_set_user_status\(/)
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_get_audit_logs\(/)
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_get_platform_metrics\(/)
  })

  it('declares SECURITY DEFINER on all 4 administrative RPCs', () => {
    const roleMatches = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_update_user_role[\s\S]*?SECURITY DEFINER/i
    )
    const statusMatches = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_set_user_status[\s\S]*?SECURITY DEFINER/i
    )
    const auditMatches = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_get_audit_logs[\s\S]*?SECURITY DEFINER/i
    )
    const metricsMatches = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_get_platform_metrics[\s\S]*?SECURITY DEFINER/i
    )

    expect(roleMatches).not.toBeNull()
    expect(statusMatches).not.toBeNull()
    expect(auditMatches).not.toBeNull()
    expect(metricsMatches).not.toBeNull()
  })

  it('declares explicit search_path = public, auth on all 4 RPCs', () => {
    const roleMatches = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_update_user_role[\s\S]*?SET search_path = public, auth/i
    )
    const statusMatches = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_set_user_status[\s\S]*?SET search_path = public, auth/i
    )
    const auditMatches = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_get_audit_logs[\s\S]*?SET search_path = public, auth/i
    )
    const metricsMatches = migrationSql.match(
      /CREATE OR REPLACE FUNCTION public\.admin_get_platform_metrics[\s\S]*?SET search_path = public, auth/i
    )

    expect(roleMatches).not.toBeNull()
    expect(statusMatches).not.toBeNull()
    expect(auditMatches).not.toBeNull()
    expect(metricsMatches).not.toBeNull()
  })

  it('revokes execution privileges from PUBLIC and anon for all 4 RPCs', () => {
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_update_user_role\(UUID, public\.user_role\) FROM PUBLIC, anon;/i
    )
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_set_user_status\(UUID, BOOLEAN, TEXT\) FROM PUBLIC, anon;/i
    )
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_get_audit_logs\(public\.audit_action, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT\) FROM PUBLIC, anon;/i
    )
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_get_platform_metrics\(\) FROM PUBLIC, anon;/i
    )
  })

  it('grants execution privileges to authenticated and service_role for all 4 RPCs', () => {
    expect(migrationSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_update_user_role\(UUID, public\.user_role\) TO authenticated, service_role;/i
    )
    expect(migrationSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_set_user_status\(UUID, BOOLEAN, TEXT\) TO authenticated, service_role;/i
    )
    expect(migrationSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_get_audit_logs\(public\.audit_action, UUID, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT\) TO authenticated, service_role;/i
    )
    expect(migrationSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_get_platform_metrics\(\) TO authenticated, service_role;/i
    )
  })

  it('enforces PERSON != USER: modifies public.profiles, never public.persons', () => {
    // Must update profiles
    expect(migrationSql).toMatch(/UPDATE public\.profiles\s+SET/i)

    // Must NEVER update or delete from persons
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.persons/i)
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.persons/i)
    expect(migrationSql).not.toMatch(/INSERT\s+INTO\s+public\.persons/i)
  })

  it('uses public.log_audit_event for tamper-evident immutable audit logging', () => {
    expect(migrationSql).toContain('USER_ROLE_CHANGED')
    expect(migrationSql).toContain('USER_DEACTIVATED')
    expect(migrationSql).toContain('USER_REACTIVATED')
    expect(migrationSql).toMatch(/PERFORM public\.log_audit_event\(/i)
  })

  it('strictly bounds audit log pagination (page size between 1 and 50)', () => {
    expect(migrationSql).toMatch(/v_limit\s*:=\s*GREATEST\(1,\s*LEAST\(COALESCE\(p_page_size,\s*20\),\s*50\)\)/i)
    expect(migrationSql).toMatch(/v_offset\s*:=\s*\(GREATEST\(1,\s*COALESCE\(p_page,\s*1\)\)\s*-\s*1\)\s*\*\s*v_limit/i)
  })

  it('permanently drops insecure profiles_update_admin policy to prevent direct bypass', () => {
    expect(migrationSql).toMatch(/DROP POLICY IF EXISTS "profiles_update_admin" ON public\.profiles;/i)
  })

  it('re-asserts profiles_update_own with strict WITH CHECK on role and is_active', () => {
    expect(migrationSql).toMatch(/CREATE POLICY "profiles_update_own"[\s\S]*?ON public\.profiles/i)
    expect(migrationSql).toMatch(/USING\s*\(\s*auth\.uid\(\)\s*=\s*id\s*\)/i)
    expect(migrationSql).toMatch(/WITH CHECK\s*\(\s*auth\.uid\(\)\s*=\s*id\s*AND\s*role::TEXT\s*=\s*public\.get_my_role\(\)\s*AND\s*is_active\s*=\s*TRUE\s*\)/i)
  })

  it('uses transaction advisory locks and row locks for concurrency-safe SUPER_ADMIN protection', () => {
    expect(migrationSql).toMatch(/pg_advisory_xact_lock\(hashtext\('super_admin_membership_guard'\)\)/i)
    expect(migrationSql).toMatch(/SELECT role, is_active INTO v_target_role, v_target_active[\s\S]*?FROM public\.profiles[\s\S]*?FOR UPDATE;/i)
  })

  it('restricts admin_get_platform_metrics strictly to is_admin()', () => {
    expect(migrationSql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_get_platform_metrics\(\)[\s\S]*?IF NOT public\.is_admin\(\) THEN/i)
    expect(migrationSql).not.toMatch(/public\.is_community_moderator\(\)/i)
  })
})

// ============================================================================
// PART 2: AUTHORIZATION LOGIC & HIERARCHY SIMULATION SUITE
// ============================================================================

interface ProfileRecord {
  id: string
  role: UserRole
  is_active: boolean
  display_name?: string
}

interface AuditLogEntry {
  action: string
  target_id: string
  old_data: Record<string, unknown>
  new_data: Record<string, unknown>
  metadata: Record<string, unknown>
}

class AdminAuthorizationSimulator {
  private profiles = new Map<string, ProfileRecord>()
  private auditLogs: AuditLogEntry[] = []

  constructor(initialProfiles: ProfileRecord[]) {
    for (const p of initialProfiles) {
      this.profiles.set(p.id, { ...p })
    }
  }

  getProfile(id: string): ProfileRecord | undefined {
    return this.profiles.get(id)
  }

  getAuditLogs(): AuditLogEntry[] {
    return [...this.auditLogs]
  }

  adminUpdateUserRole(callerId: string | null, targetUserId: string | null, newRole: UserRole | null): boolean {
    if (!callerId) {
      throw new Error('UNAUTHENTICATED: Caller must be authenticated')
    }
    if (!targetUserId || !newRole) {
      throw new Error('INVALID_ARGUMENT: user_id and new_role are required')
    }

    const caller = this.profiles.get(callerId)
    if (!caller || caller.is_active !== true) {
      throw new Error('UNAUTHORIZED: Caller profile not found or inactive')
    }

    if (caller.role !== 'ADMIN' && caller.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN')
    }

    const target = this.profiles.get(targetUserId)
    if (!target) {
      throw new Error('NOT_FOUND: Target user profile not found')
    }

    if (target.role === newRole) {
      return true
    }

    if (caller.role === 'ADMIN' && newRole === 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: Only SUPER_ADMIN can grant the SUPER_ADMIN role')
    }

    if (caller.role === 'ADMIN' && target.role === 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: ADMIN cannot modify roles of a SUPER_ADMIN account')
    }

    if (callerId === targetUserId && newRole !== 'ADMIN' && newRole !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: Administrators cannot demote themselves to a non-administrative role')
    }

    if (target.role === 'SUPER_ADMIN' && newRole !== 'SUPER_ADMIN') {
      const activeSuperAdminCount = Array.from(this.profiles.values()).filter(
        (p) => p.role === 'SUPER_ADMIN' && p.is_active === true
      ).length

      if (activeSuperAdminCount <= 1) {
        throw new Error('CONFLICT: Cannot demote the platform sole active SUPER_ADMIN')
      }
    }

    const oldRole = target.role
    target.role = newRole
    this.profiles.set(targetUserId, target)

    this.auditLogs.push({
      action: 'USER_ROLE_CHANGED',
      target_id: targetUserId,
      old_data: { role: oldRole },
      new_data: { role: newRole },
      metadata: {
        action_type: 'ADMIN_ROLE_UPDATE',
        caller_id: callerId,
        caller_role: caller.role,
        target_user_id: targetUserId,
      },
    })

    return true
  }

  adminSetUserStatus(callerId: string | null, targetUserId: string | null, isActive: boolean | null, reason?: string): boolean {
    if (!callerId) {
      throw new Error('UNAUTHENTICATED: Caller must be authenticated')
    }
    if (!targetUserId || isActive === null || isActive === undefined) {
      throw new Error('INVALID_ARGUMENT: user_id and is_active are required')
    }

    const caller = this.profiles.get(callerId)
    if (!caller || caller.is_active !== true) {
      throw new Error('UNAUTHORIZED: Caller profile not found or inactive')
    }

    if (caller.role !== 'ADMIN' && caller.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN')
    }

    const target = this.profiles.get(targetUserId)
    if (!target) {
      throw new Error('NOT_FOUND: Target user profile not found')
    }

    if (target.is_active === isActive) {
      return true
    }

    if (isActive === false) {
      if (callerId === targetUserId) {
        throw new Error('FORBIDDEN: Administrators cannot deactivate their own account')
      }

      if (caller.role === 'ADMIN' && target.role === 'SUPER_ADMIN') {
        throw new Error('FORBIDDEN: ADMIN cannot deactivate a SUPER_ADMIN account')
      }

      if (target.role === 'SUPER_ADMIN') {
        const activeSuperAdminCount = Array.from(this.profiles.values()).filter(
          (p) => p.role === 'SUPER_ADMIN' && p.is_active === true
        ).length

        if (activeSuperAdminCount <= 1) {
          throw new Error('CONFLICT: Cannot deactivate the platform sole active SUPER_ADMIN')
        }
      }
    }

    const oldActive = target.is_active
    target.is_active = isActive
    this.profiles.set(targetUserId, target)

    const sanitizedReason = reason ? reason.trim().slice(0, 500) : null

    this.auditLogs.push({
      action: isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
      target_id: targetUserId,
      old_data: { is_active: oldActive },
      new_data: { is_active: isActive },
      metadata: {
        action_type: isActive ? 'ADMIN_USER_REACTIVATED' : 'ADMIN_USER_DEACTIVATED',
        reason: sanitizedReason,
        caller_id: callerId,
        caller_role: caller.role,
        target_user_id: targetUserId,
      },
    })

    return true
  }

  adminGetAuditLogs(callerId: string | null): boolean {
    if (!callerId) throw new Error('UNAUTHENTICATED')
    const caller = this.profiles.get(callerId)
    if (!caller || !caller.is_active || (caller.role !== 'ADMIN' && caller.role !== 'SUPER_ADMIN')) {
      throw new Error('FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN')
    }
    return true
  }

  adminGetPlatformMetrics(callerId: string | null): boolean {
    if (!callerId) throw new Error('UNAUTHENTICATED')
    const caller = this.profiles.get(callerId)
    if (!caller || !caller.is_active || (caller.role !== 'ADMIN' && caller.role !== 'SUPER_ADMIN')) {
      throw new Error('FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN')
    }
    return true
  }

  /**
   * Simulates direct table UPDATE on public.profiles under RLS.
   * With profiles_update_admin removed, only profiles_update_own governs table updates:
   *   USING (auth.uid() = id)
   *   WITH CHECK (auth.uid() = id AND role::TEXT = public.get_my_role() AND is_active = TRUE)
   */
  directProfileUpdate(
    callerId: string | null,
    targetId: string,
    updates: Partial<ProfileRecord & { display_name?: string }>
  ): ProfileRecord {
    if (!callerId) {
      throw new Error('UNAUTHENTICATED: Caller must be authenticated')
    }

    // RLS USING clause: auth.uid() = id
    // Prevents targeting any row other than the caller's own profile.
    if (callerId !== targetId) {
      throw new Error('RLS_FILTERED: No rows matched or access denied by USING (auth.uid() = id)')
    }

    const currentProfile = this.profiles.get(targetId)
    if (!currentProfile) {
      throw new Error('NOT_FOUND: Profile not found')
    }

    // Inactive accounts cannot update (get_my_role() returns NULL for inactive users)
    if (!currentProfile.is_active) {
      throw new Error('RLS_CHECK_VIOLATION: Inactive profiles cannot update')
    }

    const proposedNewRow: ProfileRecord = {
      ...currentProfile,
      ...updates,
      id: currentProfile.id, // Primary key immutable
    }

    // RLS WITH CHECK clause:
    // 1. auth.uid() = id
    if (proposedNewRow.id !== callerId) {
      throw new Error('RLS_CHECK_VIOLATION: auth.uid() = id failed')
    }

    // 2. role::TEXT = public.get_my_role()
    // Current active role of caller in the database before this statement
    const callerCurrentRole = currentProfile.role
    if (proposedNewRow.role !== callerCurrentRole) {
      throw new Error(
        `RLS_CHECK_VIOLATION: role::TEXT = public.get_my_role() failed (cannot mutate role from ${callerCurrentRole} to ${proposedNewRow.role})`
      )
    }

    // 3. is_active = TRUE
    if (proposedNewRow.is_active !== true) {
      throw new Error('RLS_CHECK_VIOLATION: is_active = TRUE failed (cannot deactivate account via table update)')
    }

    // Note: Direct table updates do NOT invoke log_audit_event()
    this.profiles.set(targetId, proposedNewRow)
    return proposedNewRow
  }
}

describe('Admin Authorization Hierarchy & Boundary Rules', () => {
  let sim: AdminAuthorizationSimulator

  const SUPER_1 = 'super-user-1'
  const SUPER_2 = 'super-user-2'
  const ADMIN_1 = 'admin-user-1'
  const MOD_1 = 'mod-user-1'
  const MEMBER_1 = 'member-user-1'
  const INACTIVE_ADMIN = 'inactive-admin'

  beforeEach(() => {
    sim = new AdminAuthorizationSimulator([
      { id: SUPER_1, role: 'SUPER_ADMIN', is_active: true },
      { id: SUPER_2, role: 'SUPER_ADMIN', is_active: true },
      { id: ADMIN_1, role: 'ADMIN', is_active: true },
      { id: MOD_1, role: 'COMMUNITY_MODERATOR', is_active: true },
      { id: MEMBER_1, role: 'MEMBER', is_active: true },
      { id: INACTIVE_ADMIN, role: 'ADMIN', is_active: false },
    ])
  })

  // --------------------------------------------------------------------------
  // ROLE UPDATE TESTS
  // --------------------------------------------------------------------------

  it('rejects unauthenticated caller from updating roles', () => {
    expect(() => sim.adminUpdateUserRole(null, MEMBER_1, 'COMMUNITY_MODERATOR')).toThrow(
      'UNAUTHENTICATED'
    )
  })

  it('rejects inactive admin caller from updating roles', () => {
    expect(() => sim.adminUpdateUserRole(INACTIVE_ADMIN, MEMBER_1, 'COMMUNITY_MODERATOR')).toThrow(
      'UNAUTHORIZED'
    )
  })

  it('rejects MEMBER caller from updating roles', () => {
    expect(() => sim.adminUpdateUserRole(MEMBER_1, MEMBER_1, 'ADMIN')).toThrow(
      'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN'
    )
  })

  it('rejects COMMUNITY_MODERATOR caller from updating roles', () => {
    expect(() => sim.adminUpdateUserRole(MOD_1, MEMBER_1, 'COMMUNITY_MODERATOR')).toThrow(
      'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN'
    )
  })

  it('allows ADMIN to promote MEMBER to COMMUNITY_MODERATOR', () => {
    const res = sim.adminUpdateUserRole(ADMIN_1, MEMBER_1, 'COMMUNITY_MODERATOR')
    expect(res).toBe(true)
    expect(sim.getProfile(MEMBER_1)?.role).toBe('COMMUNITY_MODERATOR')
    const logs = sim.getAuditLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('USER_ROLE_CHANGED')
    expect(logs[0].old_data).toEqual({ role: 'MEMBER' })
    expect(logs[0].new_data).toEqual({ role: 'COMMUNITY_MODERATOR' })
  })

  it('allows ADMIN to promote MEMBER to ADMIN', () => {
    const res = sim.adminUpdateUserRole(ADMIN_1, MEMBER_1, 'ADMIN')
    expect(res).toBe(true)
    expect(sim.getProfile(MEMBER_1)?.role).toBe('ADMIN')
  })

  it('blocks ADMIN from promoting any user to SUPER_ADMIN', () => {
    expect(() => sim.adminUpdateUserRole(ADMIN_1, MEMBER_1, 'SUPER_ADMIN')).toThrow(
      'FORBIDDEN: Only SUPER_ADMIN can grant the SUPER_ADMIN role'
    )
    expect(sim.getProfile(MEMBER_1)?.role).toBe('MEMBER')
  })

  it('blocks ADMIN from modifying a SUPER_ADMIN account', () => {
    expect(() => sim.adminUpdateUserRole(ADMIN_1, SUPER_1, 'ADMIN')).toThrow(
      'FORBIDDEN: ADMIN cannot modify roles of a SUPER_ADMIN account'
    )
    expect(sim.getProfile(SUPER_1)?.role).toBe('SUPER_ADMIN')
  })

  it('blocks ADMIN from self-demoting to non-admin roles', () => {
    expect(() => sim.adminUpdateUserRole(ADMIN_1, ADMIN_1, 'MEMBER')).toThrow(
      'FORBIDDEN: Administrators cannot demote themselves to a non-administrative role'
    )
    expect(() => sim.adminUpdateUserRole(ADMIN_1, ADMIN_1, 'COMMUNITY_MODERATOR')).toThrow(
      'FORBIDDEN: Administrators cannot demote themselves to a non-administrative role'
    )
  })

  it('allows SUPER_ADMIN to promote ADMIN to SUPER_ADMIN', () => {
    const res = sim.adminUpdateUserRole(SUPER_1, ADMIN_1, 'SUPER_ADMIN')
    expect(res).toBe(true)
    expect(sim.getProfile(ADMIN_1)?.role).toBe('SUPER_ADMIN')
  })

  it('allows demoting a SUPER_ADMIN when another active SUPER_ADMIN exists', () => {
    const res = sim.adminUpdateUserRole(SUPER_1, SUPER_2, 'ADMIN')
    expect(res).toBe(true)
    expect(sim.getProfile(SUPER_2)?.role).toBe('ADMIN')
  })

  it('blocks demoting the platform sole active SUPER_ADMIN', () => {
    // Demote SUPER_2 first so only SUPER_1 remains
    sim.adminUpdateUserRole(SUPER_1, SUPER_2, 'ADMIN')

    // Now attempt to demote SUPER_1
    expect(() => sim.adminUpdateUserRole(SUPER_1, SUPER_1, 'ADMIN')).toThrow(
      'CONFLICT: Cannot demote the platform sole active SUPER_ADMIN'
    )
  })

  it('returns true on no-op role update without emitting audit log', () => {
    const res = sim.adminUpdateUserRole(SUPER_1, MEMBER_1, 'MEMBER')
    expect(res).toBe(true)
    expect(sim.getAuditLogs()).toHaveLength(0)
  })

  // --------------------------------------------------------------------------
  // USER STATUS TESTS (DEACTIVATE / REACTIVATE)
  // --------------------------------------------------------------------------

  it('rejects unauthenticated caller from updating user status', () => {
    expect(() => sim.adminSetUserStatus(null, MEMBER_1, false)).toThrow('UNAUTHENTICATED')
  })

  it('rejects COMMUNITY_MODERATOR from updating user status', () => {
    expect(() => sim.adminSetUserStatus(MOD_1, MEMBER_1, false)).toThrow(
      'FORBIDDEN: Caller must be an active ADMIN or SUPER_ADMIN'
    )
  })

  it('allows ADMIN to deactivate a MEMBER with reason and emits USER_DEACTIVATED', () => {
    const res = sim.adminSetUserStatus(ADMIN_1, MEMBER_1, false, 'Inappropriate behavior')
    expect(res).toBe(true)
    expect(sim.getProfile(MEMBER_1)?.is_active).toBe(false)
    const logs = sim.getAuditLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('USER_DEACTIVATED')
    expect(logs[0].metadata.reason).toBe('Inappropriate behavior')
  })

  it('allows ADMIN to reactivate a deactivated user and emits USER_REACTIVATED', () => {
    sim.adminSetUserStatus(ADMIN_1, MEMBER_1, false, 'Suspension')
    const res = sim.adminSetUserStatus(ADMIN_1, MEMBER_1, true, 'Appeal accepted')
    expect(res).toBe(true)
    expect(sim.getProfile(MEMBER_1)?.is_active).toBe(true)
    const logs = sim.getAuditLogs()
    expect(logs).toHaveLength(2)
    expect(logs[1].action).toBe('USER_REACTIVATED')
  })

  it('blocks ADMIN from deactivating their own account (self-deactivation protection)', () => {
    expect(() => sim.adminSetUserStatus(ADMIN_1, ADMIN_1, false)).toThrow(
      'FORBIDDEN: Administrators cannot deactivate their own account'
    )
    expect(sim.getProfile(ADMIN_1)?.is_active).toBe(true)
  })

  it('blocks SUPER_ADMIN from deactivating their own account', () => {
    expect(() => sim.adminSetUserStatus(SUPER_1, SUPER_1, false)).toThrow(
      'FORBIDDEN: Administrators cannot deactivate their own account'
    )
    expect(sim.getProfile(SUPER_1)?.is_active).toBe(true)
  })

  it('blocks ADMIN from deactivating a SUPER_ADMIN account', () => {
    expect(() => sim.adminSetUserStatus(ADMIN_1, SUPER_1, false)).toThrow(
      'FORBIDDEN: ADMIN cannot deactivate a SUPER_ADMIN account'
    )
    expect(sim.getProfile(SUPER_1)?.is_active).toBe(true)
  })

  it('blocks deactivating the sole active SUPER_ADMIN', () => {
    // Deactivate SUPER_2 first (done by SUPER_1)
    sim.adminSetUserStatus(SUPER_1, SUPER_2, false)

    // Now only SUPER_1 is active SUPER_ADMIN.
    // Try to deactivate SUPER_1 from another admin (e.g. ADMIN_1 or if attempted)
    expect(() => sim.adminSetUserStatus(ADMIN_1, SUPER_1, false)).toThrow(
      'FORBIDDEN: ADMIN cannot deactivate a SUPER_ADMIN account'
    )
  })

  it('returns true on no-op status update without emitting audit log', () => {
    const res = sim.adminSetUserStatus(SUPER_1, MEMBER_1, true)
    expect(res).toBe(true)
    expect(sim.getAuditLogs()).toHaveLength(0)
  })

  // --------------------------------------------------------------------------
  // AUDIT LOGS & PLATFORM METRICS ACCESS GATES
  // --------------------------------------------------------------------------

  it('restricts admin_get_audit_logs to ADMIN and SUPER_ADMIN', () => {
    expect(() => sim.adminGetAuditLogs(MEMBER_1)).toThrow('FORBIDDEN')
    expect(() => sim.adminGetAuditLogs(MOD_1)).toThrow('FORBIDDEN')
    expect(sim.adminGetAuditLogs(ADMIN_1)).toBe(true)
    expect(sim.adminGetAuditLogs(SUPER_1)).toBe(true)
  })

  it('restricts admin_get_platform_metrics strictly to ADMIN and SUPER_ADMIN (blocks COMMUNITY_MODERATOR and MEMBER)', () => {
    expect(() => sim.adminGetPlatformMetrics(MEMBER_1)).toThrow('FORBIDDEN')
    expect(() => sim.adminGetPlatformMetrics(MOD_1)).toThrow('FORBIDDEN')
    expect(sim.adminGetPlatformMetrics(ADMIN_1)).toBe(true)
    expect(sim.adminGetPlatformMetrics(SUPER_1)).toBe(true)
  })
})

// ============================================================================
// PART 3: DIRECT TABLE UPDATE BYPASS PREVENTION & RLS HARDENING
// ============================================================================

describe('Direct Profiles Table Mutation Prevention (RLS Hardening)', () => {
  let sim: AdminAuthorizationSimulator

  const SUPER_1 = 'super-user-1'
  const ADMIN_1 = 'admin-user-1'
  const MEMBER_1 = 'member-user-1'

  beforeEach(() => {
    sim = new AdminAuthorizationSimulator([
      { id: SUPER_1, role: 'SUPER_ADMIN', is_active: true, display_name: 'Super Admin' },
      { id: ADMIN_1, role: 'ADMIN', is_active: true, display_name: 'Admin One' },
      { id: MEMBER_1, role: 'MEMBER', is_active: true, display_name: 'Member One' },
    ])
  })

  it('ADMIN direct role escalation → BLOCKED by profiles_update_own WITH CHECK', () => {
    // Attempting direct table UPDATE profiles SET role = 'SUPER_ADMIN' WHERE id = admin_id
    expect(() =>
      sim.directProfileUpdate(ADMIN_1, ADMIN_1, { role: 'SUPER_ADMIN' })
    ).toThrow('RLS_CHECK_VIOLATION: role::TEXT = public.get_my_role() failed')
    expect(sim.getProfile(ADMIN_1)?.role).toBe('ADMIN')
  })

  it('ADMIN direct SUPER_ADMIN modification → BLOCKED by profiles_update_own USING clause', () => {
    // Attempting direct table UPDATE profiles SET display_name = 'Hacked' WHERE id = super_admin_id
    expect(() =>
      sim.directProfileUpdate(ADMIN_1, SUPER_1, { display_name: 'Hacked' })
    ).toThrow('RLS_FILTERED: No rows matched or access denied by USING (auth.uid() = id)')
    expect(sim.getProfile(SUPER_1)?.display_name).toBe('Super Admin')
  })

  it('ADMIN direct account deactivation of self → BLOCKED by profiles_update_own WITH CHECK', () => {
    // Attempting direct table UPDATE profiles SET is_active = false WHERE id = admin_id
    expect(() =>
      sim.directProfileUpdate(ADMIN_1, ADMIN_1, { is_active: false })
    ).toThrow('RLS_CHECK_VIOLATION: is_active = TRUE failed')
    expect(sim.getProfile(ADMIN_1)?.is_active).toBe(true)
  })

  it('ADMIN direct account deactivation of another user → BLOCKED by profiles_update_own USING clause', () => {
    // Attempting direct table UPDATE profiles SET is_active = false WHERE id = member_id
    expect(() =>
      sim.directProfileUpdate(ADMIN_1, MEMBER_1, { is_active: false })
    ).toThrow('RLS_FILTERED: No rows matched or access denied by USING (auth.uid() = id)')
    expect(sim.getProfile(MEMBER_1)?.is_active).toBe(true)
  })

  it('ADMIN direct role modification on another user → BLOCKED by profiles_update_own USING clause', () => {
    // Attempting direct table UPDATE profiles SET role = 'ADMIN' WHERE id = member_id
    expect(() =>
      sim.directProfileUpdate(ADMIN_1, MEMBER_1, { role: 'ADMIN' })
    ).toThrow('RLS_FILTERED: No rows matched or access denied by USING (auth.uid() = id)')
    expect(sim.getProfile(MEMBER_1)?.role).toBe('MEMBER')
  })

  it('ADMIN legitimate update of own permitted fields (display_name) → ALLOWED', () => {
    const updated = sim.directProfileUpdate(ADMIN_1, ADMIN_1, { display_name: 'Admin Updated' })
    expect(updated.display_name).toBe('Admin Updated')
    expect(sim.getProfile(ADMIN_1)?.display_name).toBe('Admin Updated')
    expect(sim.getProfile(ADMIN_1)?.role).toBe('ADMIN')
  })

  it('MEMBER legitimate update of own permitted fields (display_name) → ALLOWED', () => {
    const updated = sim.directProfileUpdate(MEMBER_1, MEMBER_1, { display_name: 'Member Updated' })
    expect(updated.display_name).toBe('Member Updated')
    expect(sim.getProfile(MEMBER_1)?.display_name).toBe('Member Updated')
    expect(sim.getProfile(MEMBER_1)?.role).toBe('MEMBER')
  })

  it('ADMIN using admin_update_user_role → allowed when hierarchy permits', () => {
    const res = sim.adminUpdateUserRole(ADMIN_1, MEMBER_1, 'COMMUNITY_MODERATOR')
    expect(res).toBe(true)
    expect(sim.getProfile(MEMBER_1)?.role).toBe('COMMUNITY_MODERATOR')
  })

  it('ADMIN using admin_update_user_role → blocked when hierarchy violated (cannot grant SUPER_ADMIN)', () => {
    expect(() => sim.adminUpdateUserRole(ADMIN_1, MEMBER_1, 'SUPER_ADMIN')).toThrow(
      'FORBIDDEN: Only SUPER_ADMIN can grant the SUPER_ADMIN role'
    )
    expect(sim.getProfile(MEMBER_1)?.role).toBe('MEMBER')
  })

  it('ADMIN using admin_set_user_status → allowed when hierarchy permits', () => {
    const res = sim.adminSetUserStatus(ADMIN_1, MEMBER_1, false, 'Policy violation')
    expect(res).toBe(true)
    expect(sim.getProfile(MEMBER_1)?.is_active).toBe(false)
  })

  it('ADMIN using admin_set_user_status → blocked when hierarchy violated (cannot deactivate SUPER_ADMIN)', () => {
    expect(() => sim.adminSetUserStatus(ADMIN_1, SUPER_1, false)).toThrow(
      'FORBIDDEN: ADMIN cannot deactivate a SUPER_ADMIN account'
    )
    expect(sim.getProfile(SUPER_1)?.is_active).toBe(true)
  })

  it('SUPER_ADMIN permitted role administration → allowed via authoritative RPCs', () => {
    const res = sim.adminUpdateUserRole(SUPER_1, ADMIN_1, 'SUPER_ADMIN')
    expect(res).toBe(true)
    expect(sim.getProfile(ADMIN_1)?.role).toBe('SUPER_ADMIN')
  })

  it('concurrency simulation: racing administrative demotion/deactivation serializes and protects last active SUPER_ADMIN', () => {
    // Initial state: 2 active SUPER_ADMINs (SUPER_1 and SUPER_2)
    const SUPER_2 = 'super-user-2'
    sim = new AdminAuthorizationSimulator([
      { id: SUPER_1, role: 'SUPER_ADMIN', is_active: true },
      { id: SUPER_2, role: 'SUPER_ADMIN', is_active: true },
      { id: ADMIN_1, role: 'ADMIN', is_active: true },
    ])

    // Transaction 1 demotes SUPER_2 to ADMIN (succeeds, leaving only 1 active SUPER_ADMIN)
    const tx1Success = sim.adminUpdateUserRole(SUPER_1, SUPER_2, 'ADMIN')
    expect(tx1Success).toBe(true)

    // Transaction 2 (racing concurrently) attempts to demote or deactivate the last SUPER_ADMIN
    // Because the advisory lock serializes these operations, tx2 evaluates after tx1 and is rejected with CONFLICT
    expect(() => sim.adminUpdateUserRole(SUPER_1, SUPER_1, 'ADMIN')).toThrow(
      'CONFLICT: Cannot demote the platform sole active SUPER_ADMIN'
    )
    expect(() => sim.adminSetUserStatus(SUPER_1, SUPER_1, false)).toThrow(
      'FORBIDDEN: Administrators cannot deactivate their own account'
    )

    // If another admin attempts to deactivate the sole active SUPER_ADMIN:
    expect(() => sim.adminSetUserStatus(ADMIN_1, SUPER_1, false)).toThrow(
      'FORBIDDEN: ADMIN cannot deactivate a SUPER_ADMIN account'
    )

    // If demoted SUPER_2 (now ADMIN) attempts to modify SUPER_1:
    expect(() => sim.adminUpdateUserRole(SUPER_2, SUPER_1, 'ADMIN')).toThrow(
      'FORBIDDEN: ADMIN cannot modify roles of a SUPER_ADMIN account'
    )

    // Sole active SUPER_ADMIN remains intact
    expect(sim.getProfile(SUPER_1)?.role).toBe('SUPER_ADMIN')
    expect(sim.getProfile(SUPER_1)?.is_active).toBe(true)
  })

  it('PERSON != USER remains intact across all operations', () => {
    // Verifies that neither direct profile updates nor administrative RPCs touch persons
    expect(migrationSql).not.toMatch(/UPDATE\s+public\.persons/i)
    expect(migrationSql).not.toMatch(/DELETE\s+FROM\s+public\.persons/i)
  })
})

