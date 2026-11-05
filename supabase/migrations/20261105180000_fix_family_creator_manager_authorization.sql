-- =============================================================================
-- Migration: 20261105180000_fix_family_creator_manager_authorization.sql
-- Purpose:
--   1. Ensure family creators are automatically designated as initial Family Manager
--      (manager_user_id) upon creation by default, across both RPC and direct INSERTs.
--   2. Safely initialize manager_user_id from created_by for any existing families
--      where manager_user_id is currently NULL, restoring creator management rights.
--   3. Attach BEFORE INSERT/UPDATE trigger on public.families to guarantee manager_user_id
--      defaults to created_by and prevent unauthorized tampering with provenance.
--   4. Refine families_update_authorized and families_delete_authorized RLS policies
--      to evaluate manager_user_id and created_by directly and prevent self-referential subquery lock.
--   5. Update create_family_with_head RPC to explicitly set manager_user_id to the caller.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Initialize manager_user_id for existing families where null
-- -----------------------------------------------------------------------------
UPDATE public.families
SET manager_user_id = created_by
WHERE manager_user_id IS NULL AND created_by IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Trigger Function: Enforce manager_user_id & created_by Defaults & Guard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_family_manager_and_creator_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- On INSERT:
  IF TG_OP = 'INSERT' THEN
    -- Ensure created_by is set to authenticated caller if null
    IF NEW.created_by IS NULL THEN
      NEW.created_by := auth.uid();
    END IF;

    -- Default manager_user_id to the creator or authenticated caller if null
    IF NEW.manager_user_id IS NULL THEN
      NEW.manager_user_id := COALESCE(NEW.created_by, auth.uid());
    END IF;
  END IF;

  -- On UPDATE:
  IF TG_OP = 'UPDATE' THEN
    -- Preserve immutability of created_by and id
    NEW.created_by := OLD.created_by;
    NEW.id := OLD.id;

    -- If manager_user_id was null and remains null, initialize to created_by
    IF NEW.manager_user_id IS NULL AND OLD.manager_user_id IS NULL THEN
      NEW.manager_user_id := OLD.created_by;
    END IF;

    -- Enforce that only current manager or platform admin can reassign manager_user_id
    IF NEW.manager_user_id IS DISTINCT FROM OLD.manager_user_id AND NOT public.is_admin() THEN
      IF OLD.manager_user_id IS DISTINCT FROM auth.uid()
         AND (OLD.manager_user_id IS NOT NULL OR OLD.created_by IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'FORBIDDEN: Only the current family manager or platform administrator can reassign family manager.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_manager_and_creator_defaults ON public.families;
CREATE TRIGGER trg_family_manager_and_creator_defaults
  BEFORE INSERT OR UPDATE ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_family_manager_and_creator_defaults();

-- -----------------------------------------------------------------------------
-- 3. Update create_family_with_head RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_with_head(
  p_family_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_profile_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_members_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_existing_person_id UUID DEFAULT NULL,
  p_new_person_first_name TEXT DEFAULT NULL,
  p_new_person_middle_name TEXT DEFAULT NULL,
  p_new_person_last_name TEXT DEFAULT NULL,
  p_new_person_maiden_name TEXT DEFAULT NULL,
  p_new_person_gender public.gender DEFAULT 'MALE',
  p_new_person_dob DATE DEFAULT NULL,
  p_new_person_birth_place TEXT DEFAULT NULL
)
RETURNS TABLE (
  family_id UUID,
  head_person_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_family_id UUID;
  v_head_person_id UUID;
  v_clean_fam_name TEXT;
  v_clean_first_name TEXT;
  v_clean_last_name TEXT;
  v_eff_privacy public.privacy_level;
BEGIN
  -- 1. Caller Authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: A valid session is required to create a family.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: User account is inactive, suspended, or does not exist.' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Family Name
  v_clean_fam_name := NULLIF(trim(p_family_name), '');
  IF v_clean_fam_name IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Family name is required.' USING ERRCODE = '22023';
  END IF;

  v_eff_privacy := COALESCE(p_profile_privacy, 'COMMUNITY'::public.privacy_level);

  -- 3. Resolve or Create Head Person
  IF p_existing_person_id IS NOT NULL THEN
    SELECT p.id INTO v_head_person_id
    FROM public.persons p
    WHERE p.id = p_existing_person_id
      AND p.deleted_at IS NULL;

    IF v_head_person_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: The specified person does not exist.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_clean_first_name := NULLIF(trim(p_new_person_first_name), '');
    v_clean_last_name := NULLIF(trim(p_new_person_last_name), '');

    IF v_clean_first_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: First name is required for new family head.' USING ERRCODE = '22023';
    END IF;
    IF v_clean_last_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Last name is required for new family head.' USING ERRCODE = '22023';
    END IF;

    -- PERSON != USER Invariant: user_id is explicitly NULL for census records
    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      birth_place,
      gotra,
      nukh,
      profile_privacy,
      contact_privacy,
      dob_privacy,
      created_by,
      user_id
    )
    VALUES (
      v_clean_first_name,
      NULLIF(trim(p_new_person_middle_name), ''),
      v_clean_last_name,
      NULLIF(trim(p_new_person_maiden_name), ''),
      COALESCE(p_new_person_gender, 'MALE'::public.gender),
      p_new_person_dob,
      COALESCE(NULLIF(trim(p_new_person_birth_place), ''), NULLIF(trim(p_city), '')),
      NULLIF(trim(p_gotra), ''),
      NULLIF(trim(p_nukh), ''),
      v_eff_privacy,
      'PRIVATE',
      'PRIVATE',
      v_caller_id,
      NULL
    )
    RETURNING id INTO v_head_person_id;
  END IF;

  -- 4. Insert Family Record (Explicitly setting manager_user_id to caller)
  INSERT INTO public.families (
    family_name,
    description,
    city,
    state,
    country,
    gotra,
    nukh,
    profile_privacy,
    members_privacy,
    created_by,
    manager_user_id
  )
  VALUES (
    v_clean_fam_name,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_city), ''),
    NULLIF(trim(p_state), ''),
    COALESCE(NULLIF(trim(p_country), ''), 'India'),
    NULLIF(trim(p_gotra), ''),
    NULLIF(trim(p_nukh), ''),
    v_eff_privacy,
    COALESCE(p_members_privacy, v_eff_privacy),
    v_caller_id,
    v_caller_id
  )
  RETURNING id INTO v_family_id;

  -- 5. Insert Family Head Member Record
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    is_head,
    added_by
  )
  VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    TRUE,
    v_caller_id
  );

  RETURN QUERY SELECT v_family_id, v_head_person_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Update can_manage_family Helper Function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_family(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_family_id IS NOT NULL AND (
      -- 1. Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Mukhi (for moderation)
      public.is_community_moderator()
      OR
      -- 3. Designated Family Manager (or Creator if manager unset)
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = p_family_id
          AND f.deleted_at IS NULL
          AND (
            f.manager_user_id = auth.uid()
            OR (f.manager_user_id IS NULL AND f.created_by = auth.uid())
          )
      )
      OR
      -- 4. Designated Family Head
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.persons p ON p.id = fm.person_id
        WHERE fm.family_id = p_family_id
          AND fm.left_at IS NULL
          AND fm.is_head = TRUE
          AND p.user_id = auth.uid()
          AND p.deleted_at IS NULL
      )
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- 5. Row-Level Security Policies for public.families
-- -----------------------------------------------------------------------------
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "families_update_authorized" ON public.families;
CREATE POLICY "families_update_authorized" ON public.families
  FOR UPDATE
  USING (
    public.is_admin()
    OR public.is_community_moderator()
    OR manager_user_id = auth.uid()
    OR (manager_user_id IS NULL AND created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = families.id
        AND fm.left_at IS NULL
        AND fm.is_head = TRUE
        AND p.user_id = auth.uid()
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_community_moderator()
    OR manager_user_id = auth.uid()
    OR (manager_user_id IS NULL AND created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = families.id
        AND fm.left_at IS NULL
        AND fm.is_head = TRUE
        AND p.user_id = auth.uid()
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "families_delete_authorized" ON public.families;
CREATE POLICY "families_delete_authorized" ON public.families
  FOR DELETE
  USING (
    public.is_admin()
    OR manager_user_id = auth.uid()
    OR (manager_user_id IS NULL AND created_by = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 6. Grants
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.can_manage_family(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_family_with_head TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_family_manager_and_creator_defaults() TO authenticated, anon;

COMMIT;
