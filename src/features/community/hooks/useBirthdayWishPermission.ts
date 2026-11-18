/**
 * Hook to verify birthday wishing authorization.
 *
 * ONLY the following roles/memberships can send birthday wishes:
 * 1. Super Admin
 * 2. Admin
 * 3. All Authorized Mukhis (by role or active record in community_mukhis)
 * 4. All Officially Assigned Committee Members (by role, active record in executive_committee_members, or committee group membership)
 *
 * Normal users, Family Heads (without authorized role), and ordinary family members are strictly NOT authorized.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { supabase } from '@/lib/supabase'

export function useBirthdayWishPermission() {
  const { user, profile, isAuthenticated } = useAuthContext()

  return useQuery({
    queryKey: ['birthday-wish-permission', user?.id, profile?.role],
    queryFn: async (): Promise<boolean> => {
      if (!user?.id || !isAuthenticated) {
        return false
      }

      const role = profile?.role?.toUpperCase()

      // 1. Direct role checks: Super Admin and Admin
      if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
        return true
      }

      // 2. Direct Mukhi role
      if (role === 'MUKHI' || role === 'COMMUNITY_MUKHI') {
        return true
      }

      // 3. Direct Committee Member role
      if (role === 'COMMITTEE_MEMBER') {
        return true
      }

      // 4. Authoritative Database RPC verification
      try {
        const client = supabase as unknown as {
          rpc?: (name: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>
        }
        if (typeof client.rpc === 'function') {
          const { data, error } = await client.rpc('can_user_send_birthday_wishes', {
            p_user_id: user.id,
          })
          if (!error && typeof data === 'boolean') {
            return data
          }
        }
      } catch {
        // Fallback to table queries below if RPC is not yet loaded in database
      }

      // 5. Fallback verification against database records:
      try {
        const fromTable = (table: string) =>
          (supabase as unknown as { from: (t: string) => { select: (cols: string) => { eq: (col: string, val: unknown) => { eq: (col2: string, val2: unknown) => { limit: (n: number) => Promise<{ data: unknown[] | null }> } } } } }).from(table)

        // A. Check active community_mukhis record
        const { data: mukhiData } = await fromTable('community_mukhis')
          .select('id')
          .eq('linked_user_id', user.id)
          .eq('is_active', true)
          .limit(1)

        if (mukhiData && mukhiData.length > 0) {
          return true
        }

        // B. Check active executive_committee_members record
        const { data: execData } = await fromTable('executive_committee_members')
          .select('id')
          .eq('linked_user_id', user.id)
          .eq('is_active', true)
          .limit(1)

        if (execData && execData.length > 0) {
          return true
        }

        // C. Check active membership in a committee group
        const { data: groupData } = await fromTable('group_members')
          .select('id, groups!inner(group_type)')
          .eq('user_id', user.id)
          .eq('groups.group_type', 'COMMITTEE')
          .limit(1)

        if (groupData && groupData.length > 0) {
          return true
        }
      } catch {
        // On error or unauthorized, deny by default
        return false
      }

      return false
    },
    initialData: () => {
      const role = profile?.role?.toUpperCase()
      if (role && ['SUPER_ADMIN', 'ADMIN', 'MUKHI', 'COMMUNITY_MUKHI', 'COMMITTEE_MEMBER'].includes(role)) {
        return true
      }
      return false
    },
    enabled: Boolean(user?.id && isAuthenticated),
    staleTime: 5 * 60 * 1000,
  })
}
