-- =============================================================================
-- Migration: 20261105140000_fix_database_grants_and_permissions.sql
-- Purpose:
--   1. Fix "permission denied for function are_users_connected" error on public.persons
--   2. Grant EXECUTE on all RLS helper functions to authenticated and anon so Postgres
--      query planner can evaluate RLS policies without 42501 permission crashes
--   3. Grant table permissions on persons, families, family_members, relationships
--      to authenticated and anon, protected strictly by database Row Level Security
--   4. Grant SELECT on community_persons view to authenticated and anon
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Helper Function Execution Privileges
-- -----------------------------------------------------------------------------

-- are_users_connected: internally returns FALSE for unauthenticated callers safely
GRANT EXECUTE ON FUNCTION public.are_users_connected(UUID, UUID) TO authenticated, anon;

-- is_own_person & is_person_in_my_created_family: SECURITY DEFINER helpers
GRANT EXECUTE ON FUNCTION public.is_own_person(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_person_in_my_created_family(UUID) TO authenticated, anon;

-- Role and moderation helpers
GRANT EXECUTE ON FUNCTION public.is_community_moderator() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_privacy_settings() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.validate_gotra_nukh() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 2. Table Privileges (Governed strictly by RLS policies)
-- -----------------------------------------------------------------------------

-- Ensure RLS is active on all core tables
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- Grant table-level access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.persons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.families TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.family_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.relationships TO authenticated;

-- Grant SELECT to anon for tables with public / community RLS policies
GRANT SELECT ON TABLE public.persons TO anon;
GRANT SELECT ON TABLE public.families TO anon;
GRANT SELECT ON TABLE public.family_members TO anon;
GRANT SELECT ON TABLE public.relationships TO anon;

-- -----------------------------------------------------------------------------
-- 3. Security Barrier Views
-- -----------------------------------------------------------------------------

GRANT SELECT ON public.community_persons TO authenticated, anon;

COMMIT;
