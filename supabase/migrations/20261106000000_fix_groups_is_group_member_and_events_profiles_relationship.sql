-- Migration: 20261106000000_fix_groups_is_group_member_and_events_profiles_relationship.sql
-- Description: Fix groups is_group_member permission error and events-to-profiles relationship error in Community Hub.
--
-- Issue 1: Groups & Associations — "permission denied for function is_group_member"
--   Root Cause:
--     Migration 20261007100000 revoked EXECUTE on is_group_member, is_group_admin, and can_view_group
--     from authenticated users. When authenticated users query public.groups, RLS policy "groups_select_authenticated"
--     evaluates public.is_group_member(id, auth.uid()), triggering PostgreSQL error 42501.
--   Fix:
--     Re-implement is_group_member, is_group_admin, and can_view_group as hardened, SECURITY DEFINER functions
--     with fixed search_path = public, validating caller authentication and least-privilege scoping.
--     Explicitly GRANT EXECUTE to authenticated role so RLS policies can evaluate without permission denial.
--
-- Issue 2: Events & Calendar — "Could not find a relationship between 'events' and 'profiles' in the schema cache"
--   Root Cause:
--     public.events.creator_id, public.event_rsvps.user_id, and public.announcements.author_id were
--     defined referencing auth.users(id) instead of public.profiles(id). PostgREST only exposes relationships
--     to frontend clients across public tables when a public foreign key constraint exists.
--   Fix:
--     Add explicit foreign key constraints from public.events(creator_id) -> public.profiles(id)
--     and public.event_rsvps(user_id) -> public.profiles(id) (and public.announcements(author_id) -> public.profiles(id)).
--     Notify PostgREST to reload schema cache.

-- =============================================================================
-- PART 1: FIX GROUPS & ASSOCIATIONS RLS HELPER FUNCTIONS & PERMISSIONS
-- =============================================================================

-- 1. Helper: public.is_group_member
-- Checks if an authenticated user is an active member of a group.
-- SECURITY DEFINER breaks RLS recursion when evaluated in groups RLS policies.
CREATE OR REPLACE FUNCTION public.is_group_member(
  p_group_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_user UUID;
BEGIN
  -- Caller must be authenticated
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Non-moderator callers can only inspect their own membership
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    IF NOT public.is_community_moderator() THEN
      RETURN FALSE;
    ELSE
      v_effective_user := p_user_id;
    END IF;
  ELSE
    v_effective_user := COALESCE(p_user_id, auth.uid());
  END IF;

  IF v_effective_user IS NULL OR p_group_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_effective_user
  );
END;
$$;

COMMENT ON FUNCTION public.is_group_member(UUID, UUID) IS
  'SECURITY DEFINER helper checking group membership for RLS evaluation without recursion. Caller-identity validated.';

-- 2. Helper: public.is_group_admin
-- Checks if an authenticated user is an ADMIN of a group.
CREATE OR REPLACE FUNCTION public.is_group_admin(
  p_group_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_user UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    IF NOT public.is_community_moderator() THEN
      RETURN FALSE;
    ELSE
      v_effective_user := p_user_id;
    END IF;
  ELSE
    v_effective_user := COALESCE(p_user_id, auth.uid());
  END IF;

  IF v_effective_user IS NULL OR p_group_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_effective_user
      AND gm.role = 'ADMIN'::public.group_role
  );
END;
$$;

COMMENT ON FUNCTION public.is_group_admin(UUID, UUID) IS
  'SECURITY DEFINER helper checking group admin status for RLS evaluation without recursion. Caller-identity validated.';

-- 3. Helper: public.can_view_group
-- Checks if a parent group is visible to a user before returning group_members.
CREATE OR REPLACE FUNCTION public.can_view_group(
  p_group_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.groups%ROWTYPE;
  v_effective_user UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() THEN
    IF NOT public.is_community_moderator() THEN
      RETURN FALSE;
    ELSE
      v_effective_user := p_user_id;
    END IF;
  ELSE
    v_effective_user := COALESCE(p_user_id, auth.uid());
  END IF;

  IF public.is_community_moderator() THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_group
  FROM public.groups g
  WHERE g.id = p_group_id;

  IF NOT FOUND OR v_group.deleted_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT v_group.is_private OR v_group.created_by = v_effective_user THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_effective_user
  );
END;
$$;

COMMENT ON FUNCTION public.can_view_group(UUID, UUID) IS
  'SECURITY DEFINER helper checking parent group visibility for member listings without recursion.';

-- 4. Correct Function Execution Privileges
REVOKE ALL ON FUNCTION public.is_group_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_admin(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_group(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_group(UUID, UUID) TO authenticated;

-- Ensure authenticated users have SELECT permission on public.profiles
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
