/**
 * Profile service — CRUD operations on public.profiles
 *
 * These functions operate on the user's OWN profile row.
 * The profiles table has RLS: users can only read/update their own row.
 *
 * DOMAIN RULE: profiles = the USER identity (display prefs, role).
 * This is NOT the person census record (that's public.persons).
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse, ProfileRow } from '@/types'

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------

/**
 * Fetch a profile by user ID.
 * RLS enforces that regular users can only fetch their own profile.
 * Admins can fetch any profile.
 *
 * @param userId - The auth.users UUID
 */
export async function getProfile(userId: string): Promise<ApiResponse<ProfileRow>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: 'Could not load profile. Please try again.',
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------

/**
 * Update the current user's profile.
 * Users can update: display_name, avatar_url.
 * Role and is_active changes require admin workflow — not permitted here.
 *
 * @param userId - Must match auth.uid() — enforced by RLS
 * @param update - Fields to update (only safe fields accepted)
 */
export async function updateProfile(
  userId: string,
  update: { display_name: string }
): Promise<ApiResponse<ProfileRow>> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: update.display_name })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: 'Could not update profile. Please try again.',
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}
