/**
 * Admin Service — Administrative operations & metrics (Phase 13)
 *
 * Security & Architectural Invariants:
 * - Server-Authoritative: All administrative queries and operations route through
 *   security-definer PostgreSQL RPCs with role verification (is_admin()).
 * - PERSON != USER:
 *   * Accounts are users (public.profiles).
 *   * Census records are persons (public.persons).
 *   * Platform metrics clearly distinguish authentication accounts from census records.
 * - No privileged keys or bypasses exist in client-side code.
 */

import { supabase } from '@/lib/supabase'
import type { UserRole } from '@/types'
import type {
  PlatformMetrics,
  AdminUserItem,
  AdminUserFilterParams,
  AdminUserListResponse,
  AdminAuditLogItem,
  AdminAuditFilterParams,
  AdminAuditListResponse,
  DuplicateEntityType,
  DuplicateConfidence,
  DuplicateFlagStatus,
  SafeDuplicateRecordPreview,
  AdminDuplicateItem,
  AdminDuplicateFilterParams,
  AdminDuplicateListResponse,
  ResolveAdminDuplicateInput,
} from '../types'

/**
 * Fetches platform-wide aggregate KPIs via security-definer RPC `admin_get_platform_metrics`.
 *
 * Caller must be an authenticated platform administrator (SUPER_ADMIN or ADMIN).
 * Returns real-time aggregate counts for users, census records, and moderation queues.
 *
 * @throws {Error} If caller is unauthenticated, unauthorized, or RPC execution fails.
 */
export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const { data, error } = await (supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: { message: string } | null }>)('admin_get_platform_metrics')

  if (error) {
    throw new Error(error.message || 'Failed to fetch platform metrics from the server.')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid platform metrics payload received from server.')
  }

  const raw = data as Record<string, unknown>

  return {
    total_users: Number(raw.total_users ?? 0),
    active_users: Number(raw.active_users ?? 0),
    total_persons: Number(raw.total_persons ?? 0),
    total_families: Number(raw.total_families ?? 0),
    pending_claims: Number(raw.pending_claims ?? 0),
    pending_verifications: Number(raw.pending_verifications ?? 0),
    open_duplicates: Number(raw.open_duplicates ?? 0),
    generated_at: typeof raw.generated_at === 'string' ? raw.generated_at : new Date().toISOString(),
  }
}

/**
 * Queries platform user accounts from public.profiles with bounded server-side pagination and filters.
 *
 * Invariant: PERSON != USER.
 * This reads from public.profiles (protected by RLS `profiles_select_admin`).
 * It NEVER reads from auth.users or public.persons.
 *
 * @param params Filter and pagination options
 * @returns Paginated list of platform users
 */
export async function listAdminUsers(
  params: AdminUserFilterParams = {}
): Promise<AdminUserListResponse> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 15))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('profiles')
    .select(
      'id, email, display_name, avatar_url, role, is_active, email_verified, created_at, updated_at',
      { count: 'exact' }
    )

  if (params.search && params.search.trim()) {
    const term = params.search.trim()
    const sanitized = term.replace(/[%_,()]/g, '')
    if (sanitized) {
      query = query.or(`display_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`)
    }
  }

  if (params.role && params.role !== 'ALL') {
    query = query.eq('role', params.role)
  }

  if (params.status === 'active') {
    query = query.eq('is_active', true)
  } else if (params.status === 'inactive') {
    query = query.eq('is_active', false)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(error.message || 'Failed to fetch user list from server.')
  }

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  return {
    users: (data ?? []) as AdminUserItem[],
    totalCount,
    page,
    pageSize,
    totalPages,
  }
}

/**
 * Updates a user role via server-authoritative RPC `admin_update_user_role`.
 *
 * Enforces role hierarchy rules:
 * - ADMIN cannot grant SUPER_ADMIN
 * - ADMIN cannot modify SUPER_ADMIN accounts
 * - Self-demotion is blocked
 * - Concurrency-safe sole active SUPER_ADMIN lockout protection
 * - Automatic audit logging
 *
 * @param userId Target user ID (auth.users UUID / public.profiles.id)
 * @param newRole Proposed role
 * @returns true if update succeeded
 */
export async function updateUserRole(
  userId: string,
  newRole: UserRole
): Promise<boolean> {
  const { data, error } = await (
    supabase.rpc as unknown as (
      name: string,
      params: { p_user_id: string; p_new_role: UserRole }
    ) => Promise<{ data: boolean | null; error: { message: string; code?: string } | null }>
  )('admin_update_user_role', {
    p_user_id: userId,
    p_new_role: newRole,
  })

  if (error) {
    throw new Error(error.message || 'Failed to update user role.')
  }

  return Boolean(data)
}

/**
 * Updates a user account active status via server-authoritative RPC `admin_set_user_status`.
 *
 * Enforces safety and lockout rules:
 * - Deactivating requires a valid reason
 * - Self-deactivation is blocked
 * - ADMIN cannot deactivate SUPER_ADMIN
 * - Concurrency-safe sole active SUPER_ADMIN lockout protection
 * - Automatic audit logging
 *
 * @param userId Target user ID
 * @param isActive Target status (true = active, false = deactivated)
 * @param reason Mandatory reason when deactivating
 * @returns true if status updated
 */
export async function setUserStatus(
  userId: string,
  isActive: boolean,
  reason?: string
): Promise<boolean> {
  const { data, error } = await (
    supabase.rpc as unknown as (
      name: string,
      params: { p_user_id: string; p_is_active: boolean; p_reason: string | null }
    ) => Promise<{ data: boolean | null; error: { message: string; code?: string } | null }>
  )('admin_set_user_status', {
    p_user_id: userId,
    p_is_active: isActive,
    p_reason: reason?.trim() || null,
  })

  if (error) {
    throw new Error(error.message || 'Failed to update user status.')
  }

  return Boolean(data)
}

/**
 * Fetches filtered and paginated audit logs via server-authoritative RPC `admin_get_audit_logs`.
 *
 * Bounded pagination enforced on server (clamped 1-50 page size).
 * Restricted to active ADMIN and SUPER_ADMIN callers.
 *
 * @param params Filter and pagination options
 * @returns Paginated audit log records
 */
export async function getAuditLogs(
  params: AdminAuditFilterParams = {}
): Promise<AdminAuditListResponse> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20))

  const rpcParams: Record<string, unknown> = {
    p_page: page,
    p_page_size: pageSize,
    p_action: params.action && params.action !== 'ALL' ? params.action : null,
    p_actor_id: params.actor_id || null,
    p_target_type: params.target_type || null,
    p_target_id: params.target_id || null,
    p_start_date: params.start_date || null,
    p_end_date: params.end_date || null,
  }

  const { data, error } = await (
    supabase.rpc as unknown as (
      name: string,
      params: Record<string, unknown>
    ) => Promise<{ data: AdminAuditLogItem[] | null; error: { message: string; code?: string } | null }>
  )('admin_get_audit_logs', rpcParams)

  if (error) {
    throw new Error(error.message || 'Failed to fetch audit logs from server.')
  }

  const logs = data ?? []
  const totalCount = logs.length > 0 ? Number(logs[0].total_count) : 0
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  return {
    logs,
    totalCount,
    page,
    pageSize,
    totalPages,
  }
}

/**
 * Queries duplicate flags from public.duplicate_flags with bounded server-side pagination,
 * filters, and enrichment with safe comparison previews.
 *
 * Invariants:
 * - DETECT != MERGE: Only inspects flags; never alters or deletes records.
 * - PERSON != USER: Selects census preview attributes only; never exposes auth account data.
 * - Bounded pagination: Max 50 items per page.
 */
export async function listAdminDuplicates(
  params: AdminDuplicateFilterParams = {}
): Promise<AdminDuplicateListResponse> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 10))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase.from as any)('duplicate_flags')
    .select('*', { count: 'exact' })

  if (params.status && params.status !== 'ALL') {
    query = query.eq('status', params.status)
  }

  if (params.entityType && params.entityType !== 'ALL') {
    query = query.eq('entity_type', params.entityType)
  }

  if (params.confidence && params.confidence !== 'ALL') {
    query = query.eq('confidence', params.confidence)
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(error.message || 'Failed to fetch duplicate review queue.')
  }

  const rawFlags = (data ?? []) as Array<{
    id: string
    entity_type: DuplicateEntityType
    record_a_id: string
    record_b_id: string
    confidence: DuplicateConfidence
    status: DuplicateFlagStatus
    match_signals: unknown
    notes: string | null
    resolution_notes: string | null
    flagged_by: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    created_at: string
    updated_at: string
  }>

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  if (rawFlags.length === 0) {
    return {
      items: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 1,
    }
  }

  // Collect candidate IDs for safe preview projection
  const personIds = new Set<string>()
  const familyIds = new Set<string>()

  for (const flag of rawFlags) {
    if (flag.entity_type === 'PERSON') {
      personIds.add(flag.record_a_id)
      personIds.add(flag.record_b_id)
    } else {
      familyIds.add(flag.record_a_id)
      familyIds.add(flag.record_b_id)
    }
  }

  const personMap = new Map<string, SafeDuplicateRecordPreview>()
  const familyMap = new Map<string, SafeDuplicateRecordPreview>()

  if (personIds.size > 0) {
    // Select ONLY safe comparison fields
    // Primary: community_persons security barrier view
    const { data: persons, error: pErr } = await supabase
      .from('community_persons')
      .select('id, first_name, middle_name, last_name, gender, dob_year, birth_place, gotra, nukh, kul, status, date_of_death, verification_status')
      .in('id', Array.from(personIds))

    let personRows = persons as unknown as SafeDuplicateRecordPreview[] | null
    if (pErr && (pErr.code === 'PGRST205' || pErr.code === '42P01' || pErr.code === '42703')) {
      const fallback = await supabase
        .from('persons')
        .select('id, first_name, middle_name, last_name, gender, dob_year, birth_place, gotra, nukh, kul, status, date_of_death, verification_status')
        .in('id', Array.from(personIds))
      personRows = fallback.data as unknown as SafeDuplicateRecordPreview[] | null
    }

    if (personRows) {
      for (const p of personRows) {
        const fullName = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')
        personMap.set(p.id, {
          ...p,
          label: fullName || `Person #${p.id.slice(0, 8)}`,
        })
      }
    }
  }

  if (familyIds.size > 0) {
    // Select ONLY safe family comparison fields
    const { data: families } = await supabase
      .from('families')
      .select('id, family_name, gotra, nukh, kul, city, state, country, description, verification_status')
      .in('id', Array.from(familyIds))

    if (families) {
      for (const f of families) {
        familyMap.set(f.id, {
          id: f.id,
          label: f.family_name || `Family #${f.id.slice(0, 8)}`,
          family_name: f.family_name,
          gotra: f.gotra,
          nukh: f.nukh,
          kul: f.kul,
          city: f.city,
          state: f.state,
          country: f.country,
          description: f.description,
          verification_status: f.verification_status,
        })
      }
    }
  }

  const items: AdminDuplicateItem[] = rawFlags.map((flag) => {
    const isPerson = flag.entity_type === 'PERSON'
    const previewA = isPerson ? personMap.get(flag.record_a_id) : familyMap.get(flag.record_a_id)
    const previewB = isPerson ? personMap.get(flag.record_b_id) : familyMap.get(flag.record_b_id)

    return {
      id: flag.id,
      entity_type: flag.entity_type,
      record_a_id: flag.record_a_id,
      record_b_id: flag.record_b_id,
      confidence: flag.confidence,
      status: flag.status,
      match_signals: Array.isArray(flag.match_signals)
        ? (flag.match_signals as string[])
        : [],
      notes: flag.notes,
      resolution_notes: flag.resolution_notes,
      flagged_by: flag.flagged_by,
      reviewed_by: flag.reviewed_by,
      reviewed_at: flag.reviewed_at,
      created_at: flag.created_at,
      updated_at: flag.updated_at,
      record_a_preview: previewA ?? null,
      record_b_preview: previewB ?? null,
    }
  })

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
  }
}

/**
 * Resolves an open duplicate flag via server-authoritative RPC `resolve_duplicate_flag`.
 *
 * Invariants:
 * - Strictly one-way terminal lifecycle: only OPEN flags can be resolved.
 * - Stale review protection: If already resolved, detects concurrent resolution and throws informative error.
 * - Non-destructive: NEVER triggers record merges or deletions.
 *
 * @param input Flag ID, resolution status ('CONFIRMED_DUPLICATE' | 'NOT_DUPLICATE'), optional resolution notes.
 * @returns boolean indicating success.
 * @throws {Error} If caller unauthorized or flag was already resolved.
 */
export async function resolveAdminDuplicate(
  input: ResolveAdminDuplicateInput
): Promise<boolean> {
  const { data, error } = await (
    supabase.rpc as unknown as (
      name: string,
      params: { p_flag_id: string; p_resolution: string; p_resolution_notes: string | null }
    ) => Promise<{ data: boolean | null; error: { message: string; code?: string } | null }>
  )('resolve_duplicate_flag', {
    p_flag_id: input.flagId,
    p_resolution: input.resolution,
    p_resolution_notes: input.resolutionNotes?.trim() || null,
  })

  if (error) {
    if (error.message && error.message.toLowerCase().includes('already been resolved')) {
      const err = new Error('This duplicate flag has already been resolved by another administrator.')
      ;(err as unknown as { isStale?: boolean }).isStale = true
      throw err
    }
    throw new Error(error.message || 'Failed to resolve duplicate flag.')
  }

  return Boolean(data)
}
