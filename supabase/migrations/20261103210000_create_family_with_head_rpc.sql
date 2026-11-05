-- =============================================================================
-- Migration: 20261103210000_create_family_with_head_rpc.sql
-- Purpose:   Transactional atomic RPC for Family + Head creation.
-- Security:  SECURITY DEFINER with strict search_path, caller authentication,
--            active profile status verification (Rule A: any active authenticated user),
--            sanitized inputs, PERSON != USER adherence, strict privacy boundary
--            on existing-person selection, and zero headless family states.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_family_with_head(
  p_family_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_profile_privacy public.privacy_level DEFAULT 'PRIVATE',
  p_members_privacy public.privacy_level DEFAULT 'PRIVATE',
  -- Option B: Existing Person ID
  p_existing_person_id UUID DEFAULT NULL,
  -- Option A: New Person Details (used only if p_existing_person_id is NULL)
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
BEGIN
  -- 1. Authentication & Active Status Check (Rule A: Any active authenticated user)
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

  -- 3. Resolve Head Person ID (Option B: Existing vs Option A: New)
  IF p_existing_person_id IS NOT NULL THEN
    -- Verify existing person exists, is not soft-deleted, and caller has legitimate access to select them
    -- (Strict privacy boundary matching exact production RLS policies: persons_select_admin,
    --  persons_select_own, persons_select_public, persons_select_community, persons_select_connections.
    --  NOTE: Production RLS contains NO persons_select_family policy and NO unlinked creator policy.
    --  The SECURITY DEFINER RPC must strictly mirror production visibility without inventing permissions.)
    --
    -- DOMAIN INVARIANT ON DELETED_AT IS NULL FOR ALL CALLERS (INCLUDING ADMIN / MODERATORS):
    -- While administrative roles possess read access to soft-deleted records for archival audit
    -- purposes in persons_select_admin, designating a person as the HEAD of a newly created active
    -- family strictly requires an active, living census identity. A soft-deleted person cannot head an
    -- active family unit. Thus, `p.deleted_at IS NULL` is enforced across all roles without exception.
    SELECT p.id INTO v_head_person_id
    FROM public.persons p
    WHERE p.id = p_existing_person_id
      AND p.deleted_at IS NULL
      AND (
        -- 1. Administrative access (persons_select_admin: ADMIN, SUPER_ADMIN, COMMUNITY_MODERATOR)
        public.is_community_moderator()
        -- 2. Self-access (persons_select_own: caller is linked to this person record)
        OR p.user_id = v_caller_id
        -- 3. Public or Community visibility (persons_select_public and persons_select_community)
        OR (p.profile_privacy IN ('COMMUNITY', 'PUBLIC') AND p.status != 'ARCHIVED')
        -- 4. Connections visibility (persons_select_connections: requires mutual accepted connection)
        OR (
          p.profile_privacy = 'CONNECTIONS'
          AND p.user_id IS NOT NULL
          AND p.status != 'ARCHIVED'
          AND public.are_users_connected(v_caller_id, p.user_id)
        )
      );

    IF v_head_person_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: The specified person does not exist or you do not have permission to select them.' USING ERRCODE = 'P0002';
    END IF;

    -- NOTE: Invariant confirmation: If the person is already head/member in another family,
    -- ALLOW WITH CONFIRMATION. Existing family memberships remain untouched (no demotion, no transfer).
  ELSE
    -- Option A: Validate and create a new canonical census person
    v_clean_first_name := NULLIF(trim(p_new_person_first_name), '');
    v_clean_last_name := NULLIF(trim(p_new_person_last_name), '');

    IF v_clean_first_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: First name is required for new family head.' USING ERRCODE = '22023';
    END IF;
    IF v_clean_last_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Last name is required for new family head.' USING ERRCODE = '22023';
    END IF;

    -- PERSON != USER Invariant: user_id is explicitly NULL for census records created via family flow
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
      NULLIF(trim(p_new_person_birth_place), ''),
      NULLIF(trim(p_gotra), ''),
      NULLIF(trim(p_nukh), ''),
      'PRIVATE',
      'PRIVATE',
      'PRIVATE',
      v_caller_id,
      NULL -- Strict census separation
    )
    RETURNING id INTO v_head_person_id;
  END IF;

  -- 4. Insert Family Record
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
    created_by
  )
  VALUES (
    v_clean_fam_name,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_city), ''),
    NULLIF(trim(p_state), ''),
    NULLIF(trim(p_country), ''),
    NULLIF(trim(p_gotra), ''),
    NULLIF(trim(p_nukh), ''),
    COALESCE(p_profile_privacy, 'PRIVATE'),
    COALESCE(p_members_privacy, 'PRIVATE'),
    v_caller_id
  )
  RETURNING id INTO v_family_id;

  -- 5. Insert Family Head Member Record (Exactly one initial head enforced by partial unique index)
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

  -- 6. Return Identifiers (No PII / personal data exposed)
  family_id := v_family_id;
  head_person_id := v_head_person_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.create_family_with_head(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  public.privacy_level, public.privacy_level,
  UUID, TEXT, TEXT, TEXT, TEXT, public.gender, DATE, TEXT
) IS
  'Atomically creates a family record and links its designated head in a single transaction, preventing headless families.';

-- Explicitly revoke from PUBLIC and anon; grant exclusively to authenticated
REVOKE ALL ON FUNCTION public.create_family_with_head(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.privacy_level, public.privacy_level, UUID, TEXT, TEXT, TEXT, TEXT, public.gender, DATE, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_family_with_head(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.privacy_level, public.privacy_level, UUID, TEXT, TEXT, TEXT, TEXT, public.gender, DATE, TEXT
) TO authenticated;

COMMIT;
