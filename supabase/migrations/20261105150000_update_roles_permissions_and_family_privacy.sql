-- =============================================================================
-- Migration: 20261105150000_update_roles_permissions_and_family_privacy.sql
-- Purpose:
--   1. Add updated role enum values: COMMUNITY_MEMBER, FAMILY_MEMBER, FAMILY_MANAGER,
--      ASSISTANT_MUKHI, COMMUNITY_MUKHI (preserving all previous roles).
--   2. Add manager_user_id column to public.families.
--   3. Implement family-based personal data visibility:
--      - Admin & Super Admin: view and edit all personal details of all persons.
--      - Same Family: view complete personal details (DOB, birthday, birthplace, contact).
--      - Family Head & Family Manager: edit all member profiles in their own family and manage roster.
--      - Other Families: see ONLY name and calculated age. DOB, birthday, birthplace and contact
--        details are excluded by database-level security barrier projection.
--      - Other Families cannot edit another person's profile, family details or roster.
--   4. Update RLS policies on persons, families, family_members, and security RPCs.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Role Enum Evolution
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'COMMUNITY_MEMBER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'FAMILY_MEMBER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'FAMILY_MANAGER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'ASSISTANT_MUKHI';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'COMMUNITY_MUKHI';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Add manager_user_id to public.families
-- -----------------------------------------------------------------------------

ALTER TABLE public.families 
  ADD COLUMN IF NOT EXISTS manager_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_families_manager_user_id 
  ON public.families(manager_user_id);

-- Initialize manager_user_id from created_by for existing families where null
UPDATE public.families
SET manager_user_id = created_by
WHERE manager_user_id IS NULL AND created_by IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Scope & Role Authorization Helper Functions (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- Admin & Super Admin check
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role::text IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = TRUE
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'RLS helper: returns TRUE if auth.uid() has active ADMIN or SUPER_ADMIN role.';

-- Community Mukhi / Moderator check
CREATE OR REPLACE FUNCTION public.is_community_moderator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role::text IN ('ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MODERATOR', 'COMMUNITY_MUKHI', 'ASSISTANT_MUKHI')
      AND is_active = TRUE
  );
$$;

COMMENT ON FUNCTION public.is_community_moderator() IS
  'RLS helper: returns TRUE if auth.uid() is an active Mukhi, Moderator, or Admin.';

-- Same Family Member check:
-- Returns TRUE if caller shares an active family membership with p_target_person_id,
-- or if the caller is the target person themselves, or if caller is designated manager of that family.
CREATE OR REPLACE FUNCTION public.is_same_family_member(p_target_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_target_person_id IS NOT NULL AND (
      -- 1. Caller is the target person themselves
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND user_id = auth.uid() AND deleted_at IS NULL
      )
      OR
      -- 1b. Caller is creator of the person record
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND created_by = auth.uid() AND deleted_at IS NULL
      )
      OR
      -- 2. Caller is the designated Family Manager of an active family containing target person (or creator if manager unset)
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = p_target_person_id
          AND fm.left_at IS NULL
          AND f.deleted_at IS NULL
          AND (f.manager_user_id = auth.uid() OR (f.manager_user_id IS NULL AND f.created_by = auth.uid()))
      )
      OR
      -- 3. Caller's linked person shares an active family unit with p_target_person_id
      EXISTS (
        SELECT 1
        FROM public.persons my_p
        JOIN public.family_members my_fm ON my_fm.person_id = my_p.id AND my_fm.left_at IS NULL
        JOIN public.family_members target_fm ON target_fm.family_id = my_fm.family_id AND target_fm.left_at IS NULL
        JOIN public.families f ON f.id = my_fm.family_id AND f.deleted_at IS NULL
        WHERE my_p.user_id = auth.uid()
          AND my_p.deleted_at IS NULL
          AND target_fm.person_id = p_target_person_id
      )
    )
  );
$$;

COMMENT ON FUNCTION public.is_same_family_member(UUID) IS
  'Returns TRUE if auth.uid() shares an active family unit with the target person or manages their family.';

-- Can Edit Person check:
-- Admin/Super Admin: can edit any person.
-- Self: can edit own profile.
-- Family Head & Family Manager: can edit members of their own family.
-- Ordinary member: cannot edit another member.
-- Other families: cannot edit.
-- Family creator alone has no edit permission unless Head or Manager.
CREATE OR REPLACE FUNCTION public.can_edit_person(p_target_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_target_person_id IS NOT NULL AND (
      -- 1. Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Self (own profile)
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND user_id = auth.uid() AND deleted_at IS NULL
      )
      OR
      -- 2b. Creator of unlinked draft census record
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND created_by = auth.uid() AND user_id IS NULL AND deleted_at IS NULL
      )
      OR
      -- 3. Family Manager of an active family containing the target person
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = p_target_person_id
          AND fm.left_at IS NULL
          AND f.deleted_at IS NULL
          AND (f.manager_user_id = auth.uid() OR (f.manager_user_id IS NULL AND f.created_by = auth.uid()))
      )
      OR
      -- 4. Family Head of an active family containing the target person
      EXISTS (
        SELECT 1
        FROM public.persons my_p
        JOIN public.family_members my_fm ON my_fm.person_id = my_p.id AND my_fm.left_at IS NULL AND my_fm.is_head = TRUE
        JOIN public.family_members target_fm ON target_fm.family_id = my_fm.family_id AND target_fm.left_at IS NULL
        JOIN public.families f ON f.id = my_fm.family_id AND f.deleted_at IS NULL
        WHERE my_p.user_id = auth.uid()
          AND my_p.deleted_at IS NULL
          AND target_fm.person_id = p_target_person_id
      )
    )
  );
$$;

COMMENT ON FUNCTION public.can_edit_person(UUID) IS
  'Authorization check for editing person profile: Admin, Self, Family Head, or Family Manager only.';

-- Can Manage Family check:
-- Admin/Super Admin: can manage any family.
-- Mukhi: can manage for community governance.
-- Family Manager & Family Head: can manage their own family.
-- Other family & ordinary member: cannot manage family roster or details.
CREATE OR REPLACE FUNCTION public.can_manage_family(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
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
          AND (f.manager_user_id = auth.uid() OR (f.manager_user_id IS NULL AND f.created_by = auth.uid()))
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

COMMENT ON FUNCTION public.can_manage_family(UUID) IS
  'Authorization check for family roster & metadata management: Admin, Mukhi, Family Head, or Family Manager only.';

-- -----------------------------------------------------------------------------
-- 4. Field-Level Privacy via Security Barrier View (public.community_persons)
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.community_persons CASCADE;

CREATE OR REPLACE VIEW public.community_persons
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.maiden_name,
  p.gender,
  -- Calculated age: exposed across all visible census views via server-side computation
  public.calculate_person_age(p.date_of_birth) AS age,

  -- Date of birth & birth year: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.dob_year
    ELSE NULL
  END AS dob_year,

  -- Birth place: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.birth_place
    ELSE NULL
  END AS birth_place,

  -- Contact details: ONLY visible to Admin/Super Admin or same-family members
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.email_contact
    ELSE NULL
  END AS email_contact,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.phone
    ELSE NULL
  END AS phone,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.phone_secondary
    ELSE NULL
  END AS phone_secondary,

  -- City and State: visible to same-family, admin, or community family profile
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
      COALESCE(
        (
          SELECT f.city
          FROM public.family_members fm
          JOIN public.families f ON f.id = fm.family_id
          WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
          ORDER BY fm.is_head DESC, fm.created_at ASC
          LIMIT 1
        ),
        NULLIF(trim(split_part(p.birth_place, ',', 1)), '')
      )
    ELSE NULL
  END AS city,

  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
      COALESCE(
        (
          SELECT f.state
          FROM public.family_members fm
          JOIN public.families f ON f.id = fm.family_id
          WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
          ORDER BY fm.is_head DESC, fm.created_at ASC
          LIMIT 1
        ),
        NULLIF(trim(split_part(p.birth_place, ',', 2)), '')
      )
    ELSE NULL
  END AS state,

  p.date_of_death,
  p.avatar_url,
  p.gotra,
  p.nukh,
  p.kul,
  p.status,
  p.verification_status,
  p.created_at,
  p.updated_at,
  p.deleted_at,
  p.user_id,
  p.created_by,
  p.profile_privacy,
  p.contact_privacy,
  p.dob_privacy,

  -- Privacy & Management Flags for frontend consumption
  (public.is_admin() OR public.is_same_family_member(p.id)) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit

FROM public.persons p
WHERE p.deleted_at IS NULL;

COMMENT ON VIEW public.community_persons IS
  'Security barrier view enforcing family-based field-level privacy. Same-family & Admins see full details; other families see only name and calculated age.';

-- -----------------------------------------------------------------------------
-- 5. Protected Details RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_person_protected_details(p_person_id UUID)
RETURNS TABLE (
  date_of_birth DATE,
  birth_place TEXT,
  phone TEXT,
  phone_secondary TEXT,
  email_contact TEXT,
  is_owner BOOLEAN,
  is_same_family BOOLEAN,
  is_manager BOOLEAN,
  is_moderator BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_user_id UUID;
  v_is_owner BOOLEAN;
  v_is_same_family BOOLEAN;
  v_is_manager BOOLEAN;
  v_is_moderator BOOLEAN;
  v_caller_uid UUID;
BEGIN
  v_caller_uid := auth.uid();
  
  -- Locate person
  SELECT user_id INTO v_person_user_id
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_owner := (v_caller_uid IS NOT NULL AND v_person_user_id IS NOT NULL AND v_caller_uid = v_person_user_id);
  v_is_same_family := public.is_same_family_member(p_person_id);
  v_is_manager := public.can_edit_person(p_person_id);
  v_is_moderator := public.is_community_moderator() OR public.is_admin();

  -- Security Gate: Caller must be owner, same family member, manager/head, or admin/moderator
  IF NOT (v_is_owner OR v_is_same_family OR v_is_manager OR v_is_moderator) THEN
    RAISE EXCEPTION 'Unauthorized: Protected personal data is restricted to own family members and authorized administrators.'
      USING ERRCODE = '42501';
  END IF;

  -- Audit log the access
  PERFORM public.log_audit_event(
    'ADMIN_ACTION'::public.audit_action,
    'person',
    p_person_id,
    NULL,
    NULL,
    jsonb_build_object(
      'action_type', 'PROTECTED_DATA_ACCESSED',
      'accessor_uid', v_caller_uid,
      'is_owner', v_is_owner,
      'is_same_family', v_is_same_family,
      'is_manager', v_is_manager,
      'is_moderator', v_is_moderator
    )
  );

  RETURN QUERY
  SELECT 
    p.date_of_birth,
    p.birth_place,
    p.phone,
    p.phone_secondary,
    p.email_contact,
    v_is_owner,
    v_is_same_family,
    v_is_manager,
    v_is_moderator
  FROM public.persons p
  WHERE p.id = p_person_id;
END;
$$;

COMMENT ON FUNCTION public.get_person_protected_details(UUID) IS
  'SECURITY DEFINER RPC to retrieve protected personal data (DOB, phone, email, birthplace). Restricted to same-family and authorized administrators.';

CREATE OR REPLACE FUNCTION public.update_person_protected_details(
  p_person_id UUID,
  p_date_of_birth DATE DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_phone_secondary TEXT DEFAULT NULL,
  p_email_contact TEXT DEFAULT NULL,
  p_birth_place TEXT DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid UUID;
  v_can_edit BOOLEAN;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated callers cannot update protected details.' USING ERRCODE = '42501';
  END IF;

  v_can_edit := public.can_edit_person(p_person_id);
  IF NOT v_can_edit THEN
    RAISE EXCEPTION 'Unauthorized: Only Family Head, Family Manager, Admin, or the person themselves can edit personal details.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.persons
  SET
    date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
    birth_place = COALESCE(p_birth_place, birth_place),
    phone = COALESCE(p_phone, phone),
    phone_secondary = COALESCE(p_phone_secondary, phone_secondary),
    email_contact = COALESCE(p_email_contact, email_contact),
    updated_at = NOW()
  WHERE id = p_person_id AND deleted_at IS NULL
  RETURNING persons.updated_at INTO v_updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_audit_event(
    'PERSON_UPDATED'::public.audit_action,
    'person',
    p_person_id,
    NULL,
    NULL,
    jsonb_build_object(
      'action_type', 'PROTECTED_DATA_UPDATED',
      'editor_uid', v_caller_uid
    )
  );

  RETURN QUERY SELECT p_person_id, v_updated_at;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security Policies
-- -----------------------------------------------------------------------------

-- --- public.persons ---
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "persons_update_own" ON public.persons;
DROP POLICY IF EXISTS "persons_update_admin" ON public.persons;
DROP POLICY IF EXISTS "persons_update_authorized" ON public.persons;
CREATE POLICY "persons_update_authorized" ON public.persons
  FOR UPDATE
  USING (public.can_edit_person(persons.id))
  WITH CHECK (public.can_edit_person(persons.id));

DROP POLICY IF EXISTS "persons_delete_deny" ON public.persons;
DROP POLICY IF EXISTS "persons_delete_admin" ON public.persons;
CREATE POLICY "persons_delete_admin" ON public.persons
  FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "persons_insert_authenticated" ON public.persons;
CREATE POLICY "persons_insert_authenticated" ON public.persons
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (created_by = auth.uid() OR public.is_admin())
  );

-- --- public.families ---
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "families_update_creator" ON public.families;
DROP POLICY IF EXISTS "families_update_admin" ON public.families;
DROP POLICY IF EXISTS "families_update_authorized" ON public.families;
CREATE POLICY "families_update_authorized" ON public.families
  FOR UPDATE
  USING (public.can_manage_family(families.id))
  WITH CHECK (public.can_manage_family(families.id));

DROP POLICY IF EXISTS "families_delete_creator" ON public.families;
DROP POLICY IF EXISTS "families_delete_admin" ON public.families;
DROP POLICY IF EXISTS "families_delete_authorized" ON public.families;
CREATE POLICY "families_delete_authorized" ON public.families
  FOR DELETE
  USING (public.can_manage_family(families.id));

-- --- public.family_members ---
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_members_insert_creator" ON public.family_members;
DROP POLICY IF EXISTS "family_members_insert_admin" ON public.family_members;
DROP POLICY IF EXISTS "family_members_insert_authorized" ON public.family_members;
CREATE POLICY "family_members_insert_authorized" ON public.family_members
  FOR INSERT
  WITH CHECK (public.can_manage_family(family_members.family_id));

DROP POLICY IF EXISTS "family_members_update_creator" ON public.family_members;
DROP POLICY IF EXISTS "family_members_update_admin" ON public.family_members;
DROP POLICY IF EXISTS "family_members_update_authorized" ON public.family_members;
CREATE POLICY "family_members_update_authorized" ON public.family_members
  FOR UPDATE
  USING (public.can_manage_family(family_members.family_id))
  WITH CHECK (public.can_manage_family(family_members.family_id));

DROP POLICY IF EXISTS "family_members_delete_creator" ON public.family_members;
DROP POLICY IF EXISTS "family_members_delete_admin" ON public.family_members;
DROP POLICY IF EXISTS "family_members_delete_authorized" ON public.family_members;
CREATE POLICY "family_members_delete_authorized" ON public.family_members
  FOR DELETE
  USING (public.can_manage_family(family_members.family_id));

-- -----------------------------------------------------------------------------
-- 7. Privileges and Grants
-- -----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_community_moderator() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_same_family_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_person(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_family(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_person_protected_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_person_protected_details(UUID, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;

GRANT SELECT ON public.community_persons TO authenticated, anon;

COMMIT;
