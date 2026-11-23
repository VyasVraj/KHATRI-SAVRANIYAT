/**
 * Hook: useActiveMukhiAuthority
 *
 * Authoritatively verifies whether the currently logged-in user possesses
 * genuinely active Mukhi authority or community leadership permissions.
 *
 * Respects strict security matrix:
 * 1. Admin/Super Admin -> Leadership authorized.
 * 2. Active Mukhi authority record in public.community_mukhis -> Authorized.
 * 3. Deactivated Mukhi record -> Explicitly NOT authorized.
 * 4. Normal member -> NOT authorized.
 */

import { useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AuthContext } from '@/features/auth/context/AuthContext'

export interface MukhiAuthorityResult {
  /** True if the user is a confirmed active Mukhi */
  isActiveMukhi: boolean
  /** True if the user has community leadership access (Admin, Super Admin, or Active Mukhi) */
  isLeadership: boolean
  /** True if the user is a system Admin or Super Admin */
  isAdmin: boolean
  /** True while the authority check is resolving */
  isLoading: boolean
}

export function useActiveMukhiAuthority(): {
  data: MukhiAuthorityResult
  isLoading: boolean
  refetch: () => void
} {
  const auth = useContext(AuthContext)
  const user = auth?.user
  const profile = auth?.profile
  const isAuthLoading = auth?.isLoading ?? false

  const query = useQuery({
    queryKey: ['active-mukhi-authority', user?.id, profile?.role, profile?.is_active],
    queryFn: async (): Promise<MukhiAuthorityResult> => {
      if (!user) {
        return { isActiveMukhi: false, isLeadership: false, isAdmin: false, isLoading: false }
      }

      const isAdmin = Boolean(
        profile?.is_active &&
        profile?.role &&
        ['ADMIN', 'SUPER_ADMIN'].includes(profile.role)
      )

      if (isAdmin) {
        return { isActiveMukhi: false, isLeadership: true, isAdmin: true, isLoading: false }
      }

      // 1. Authoritative check via RPC if deployed
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = supabase as any
        if (typeof client.rpc === 'function') {
          const { data: rpcResult, error: rpcErr } = await client.rpc('is_active_mukhi', {
            p_user_id: user.id,
          })
          if (!rpcErr && typeof rpcResult === 'boolean') {
            return {
              isActiveMukhi: rpcResult,
              isLeadership: rpcResult,
              isAdmin: false,
              isLoading: false,
            }
          }
        }
      } catch {
        // Fallback to table queries below
      }

      // 2. Authoritative check on public.community_mukhis table by linked_user_id
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: mukhiRow, error: mukhiErr } = await (supabase.from as any)('community_mukhis')
          .select('id, is_active, authority_status')
          .eq('linked_user_id', user.id)
          .maybeSingle()

        if (!mukhiErr && mukhiRow) {
          const isActive = Boolean(
            mukhiRow.is_active &&
            (!mukhiRow.authority_status || mukhiRow.authority_status === 'ACTIVE')
          )
          return {
            isActiveMukhi: isActive,
            isLeadership: isActive,
            isAdmin: false,
            isLoading: false,
          }
        }
      } catch {
        // Fallback
      }

      // 3. Fallback: check if linked through person record
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: personRow } = await (supabase.from as any)('persons')
          .select('id')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .maybeSingle()

        if (personRow?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: personMukhi } = await (supabase.from as any)('community_mukhis')
            .select('id, is_active, authority_status')
            .eq('linked_person_id', personRow.id)
            .maybeSingle()

          if (personMukhi) {
            const isActive = Boolean(
              personMukhi.is_active &&
              (!personMukhi.authority_status || personMukhi.authority_status === 'ACTIVE')
            )
            return {
              isActiveMukhi: isActive,
              isLeadership: isActive,
              isAdmin: false,
              isLoading: false,
            }
          }
        }
      } catch {
        // Fallback
      }

      // 4. Role-based fallback: check if profile role is Mukhi
      const hasMukhiRole = Boolean(
        profile?.is_active &&
        profile?.role &&
        ['MUKHI', 'COMMUNITY_MUKHI', 'ASSISTANT_MUKHI'].includes(profile.role)
      )

      return {
        isActiveMukhi: hasMukhiRole,
        isLeadership: hasMukhiRole,
        isAdmin: false,
        isLoading: false,
      }
    },
    enabled: Boolean(user?.id),
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  })

  const fallbackResult: MukhiAuthorityResult = {
    isActiveMukhi: Boolean(
      profile?.is_active &&
      profile?.role &&
      ['MUKHI', 'COMMUNITY_MUKHI', 'ASSISTANT_MUKHI'].includes(profile.role)
    ),
    isLeadership: Boolean(
      profile?.is_active &&
      profile?.role &&
      ['ADMIN', 'SUPER_ADMIN', 'MUKHI', 'COMMUNITY_MUKHI', 'ASSISTANT_MUKHI'].includes(profile.role)
    ),
    isAdmin: Boolean(
      profile?.is_active &&
      profile?.role &&
      ['ADMIN', 'SUPER_ADMIN'].includes(profile.role)
    ),
    isLoading: isAuthLoading || query.isLoading,
  }

  return {
    data: query.data || fallbackResult,
    isLoading: isAuthLoading || query.isLoading,
    refetch: query.refetch,
  }
}
