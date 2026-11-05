-- =============================================================================
-- Migration: 20261105123000_fix_persons_family_members_rls_recursion.sql
-- Purpose:   Break mutual RLS recursion between public.persons and public.family_members
--
-- CAUSE OF RECURSION:
-- 1. persons_select_creator evaluated: EXISTS (SELECT 1 FROM family_members ...)
-- 2. family_members_select_own evaluated: EXISTS (SELECT 1 FROM persons ...)
-- 3. In PostgreSQL, this mutual cross-table subquery inside RLS policies triggers:
--    ERROR: 42P17: infinite recursion detected in policy for relation "persons"
--
-- SOLUTION:
-- Wrap the subqueries in SECURITY DEFINER helper functions (is_own_person and
-- is_person_in_my_created_family). As SECURITY DEFINER functions with SET search_path = public,
-- their internal table reads bypass row security on the target relation, eliminating
-- the cyclical RLS policy cascade while preserving exact authorization logic.
-- =============================================================================

BEGIN;

-- 1. Helper function: check if a person record belongs to auth.uid()
CREATE OR REPLACE FUNCTION public.is_own_person(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.persons
    WHERE id = p_person_id
      AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_own_person(UUID) IS
  'SECURITY DEFINER helper: checks if person record belongs to auth.uid() without triggering RLS recursion.';

-- 2. Helper function: check if person is in a family created by auth.uid()
CREATE OR REPLACE FUNCTION public.is_person_in_my_created_family(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.person_id = p_person_id
      AND f.created_by = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_person_in_my_created_family(UUID) IS
  'SECURITY DEFINER helper: checks if person is in a family created by auth.uid() without triggering RLS recursion.';

-- 3. Replace family_members_select_own policy using the SECURITY DEFINER helper
DROP POLICY IF EXISTS "family_members_select_own" ON public.family_members;
CREATE POLICY "family_members_select_own"
  ON public.family_members
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND public.is_own_person(family_members.person_id)
  );

-- 4. Replace persons_select_creator policy using the SECURITY DEFINER helper
DROP POLICY IF EXISTS "persons_select_creator" ON public.persons;
CREATE POLICY "persons_select_creator"
  ON public.persons
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      created_by = auth.uid() OR
      user_id = auth.uid() OR
      public.is_person_in_my_created_family(persons.id)
    )
  );

-- 5. Explicitly grant SELECT to authenticated and anon roles for core census tables
GRANT SELECT ON TABLE public.persons TO anon, authenticated;
GRANT SELECT ON TABLE public.families TO anon, authenticated;
GRANT SELECT ON TABLE public.family_members TO anon, authenticated;
GRANT SELECT ON TABLE public.relationships TO anon, authenticated;
GRANT SELECT ON TABLE public.gotras TO anon, authenticated;
GRANT SELECT ON TABLE public.nukhs TO anon, authenticated;
GRANT SELECT ON TABLE public.cities TO anon, authenticated;

COMMIT;
