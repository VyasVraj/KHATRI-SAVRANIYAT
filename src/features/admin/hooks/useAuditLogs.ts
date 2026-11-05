/**
 * useAuditLogs — TanStack Query hook for administrative audit logs
 *
 * Phase 13 — Subtask 3: User Administration & Audit Viewer
 *
 * Invariants:
 * - Reads via server-authoritative RPC `admin_get_audit_logs`.
 * - Bounded pagination (clamped 1-50 on server).
 * - Read-only query hook.
 */

import { useQuery } from '@tanstack/react-query'
import type { AdminAuditFilterParams, AdminAuditListResponse } from '../types'
import { getAuditLogs } from '../services/admin.service'

/**
 * Hook to fetch paginated audit logs with administrative filters.
 */
export function useAuditLogs(params: AdminAuditFilterParams = {}) {
  return useQuery<AdminAuditListResponse, Error>({
    queryKey: ['admin', 'audit-logs', params],
    queryFn: () => getAuditLogs(params),
    staleTime: 15_000,
  })
}
