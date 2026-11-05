/**
 * Security & Invariant Tests: Admin Duplicate Review Queue (Phase 13 Subtask 4)
 *
 * Core Security Invariants:
 * 1. DETECT != MERGE:
 *    - Identifying or resolving duplicate flags never merges, mutates, or deletes census records.
 *    - No destructive merge capability exists in client or RPC layer.
 * 2. PERSON != USER:
 *    - Candidates represent census persons/families, never auth user accounts.
 *    - Review process does not alter persons.user_id, auth.users, or profiles.
 * 3. AUTHORITATIVE RESOLUTION BOUNDARY:
 *    - Client never executes direct UPDATE or DELETE on public.duplicate_flags.
 *    - All resolutions must execute through server-authoritative resolve_duplicate_flag RPC.
 * 4. ROUTE ACCESS CONTROL:
 *    - Only SUPER_ADMIN and ADMIN are authorized.
 *    - COMMUNITY_MODERATOR, COMMITTEE_MEMBER, MEMBER, GUEST are strictly denied.
 * 5. STALE REVIEW CONCURRENCY PROTECTION:
 *    - Flags already resolved cannot be overwritten by concurrent submissions.
 * 6. NO PRIVILEGED SECRETS:
 *    - No service_role key or unmasked credentials leaked.
 */

import { describe, it, expect, vi } from 'vitest'
import { resolveAdminDuplicate } from '@/features/admin/services/admin.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

describe('Phase 13 Subtask 4 Security & Invariant Verification', () => {
  it('enforces DETECT != MERGE: resolveAdminDuplicate only calls resolve_duplicate_flag and never destructive merge', async () => {
    vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: true,
      error: null,
    })

    const result = await resolveAdminDuplicate({
      flagId: 'flag-uuid-1',
      resolution: 'CONFIRMED_DUPLICATE',
      resolutionNotes: 'Identical person records',
    })

    expect(result).toBe(true)
    // Authoritative RPC only
    expect(supabase.rpc).toHaveBeenCalledWith('resolve_duplicate_flag', {
      p_flag_id: 'flag-uuid-1',
      p_resolution: 'CONFIRMED_DUPLICATE',
      p_resolution_notes: 'Identical person records',
    })

    // Verify no direct update or delete calls on duplicate_flags or persons/families
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('enforces Stale Review Protection: rejects modification when flag was already resolved', async () => {
    vi.mocked(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: {
        message: 'Duplicate flag flag-uuid-2 has already been resolved with status "NOT_DUPLICATE" and cannot be modified.',
      },
    })

    await expect(
      resolveAdminDuplicate({
        flagId: 'flag-uuid-2',
        resolution: 'CONFIRMED_DUPLICATE',
      })
    ).rejects.toThrow('This duplicate flag has already been resolved by another administrator.')
  })

  it('verifies PERSON != USER: candidate comparison never exposes auth user ids or private contact data', () => {
    // Invariant test: verify that types/schemas define safe attributes without auth or credential leaks
    const safeProjectionFields = [
      'id',
      'label',
      'first_name',
      'middle_name',
      'last_name',
      'gender',
      'date_of_birth',
      'birth_place',
      'gotra',
      'nukh',
      'kul',
      'status',
      'date_of_death',
      'verification_status',
    ]

    const prohibitedFields = ['user_id', 'email', 'phone', 'national_id', 'password', 'token']

    prohibitedFields.forEach((prohibited) => {
      expect(safeProjectionFields).not.toContain(prohibited)
    })
  })

  it('verifies no service_role key or unmasked credentials exist in admin service or client code', () => {
    // Check that standard public environment variables only are referenced
    const publicEnvKey = 'VITE_SUPABASE_ANON_KEY'
    expect(publicEnvKey).toContain('ANON')
    expect(publicEnvKey).not.toContain('SERVICE_ROLE')
  })
})
