-- =============================================================================
-- Migration: 20261117190000_fix_family_head_editing_and_occupation_display.sql
-- Description:
--   1. Authorizes Family Head & Family Creator to edit all details of members in their family.
--   2. Recreates public.community_persons view with occupation, country, and is_deceased.
--   3. Recreates public.get_public_occupation_directory & public.public_occupation_directory
--      with exact display rules (no false "Occupation Pending" without pending request).
--   4. Creates transactional RPC update_family_member_complete for atomic member updates.
--   5. Reloads PostgREST schema cache.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure persons table has all columns safely
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN DEFAULT false;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS occupation_category TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS city TEXT;

-- -----------------------------------------------------------------------------
-- 2. Update can_edit_person() authorization function
--    Allows:
--    - Admin / Super Admin
--    - Self (own profile)
--    - Creator of unlinked person record
--    - Family Head or Family Manager of the family containing the target person
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_edit_person(p_target_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_target_person_id IS NOT NULL AND (
      -- 1. Admin or Super Admin
      public.is_admin()
      OR
      -- 2. Self (own linked person record)
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id
          AND user_id = auth.uid()
          AND deleted_at IS NULL
      )
      OR
      -- 3. Creator of unlinked person record
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id
          AND created_by = auth.uid()
          AND user_id IS NULL
          AND deleted_at IS NULL
      )
      OR
      -- 4. Authorized Family Head or Family Manager of the active family containing the person
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = p_target_person_id
          AND fm.left_at IS NULL
          AND f.deleted_at IS NULL
          AND (
            f.created_by = auth.uid()
            OR f.manager_user_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.family_members head_m
              JOIN public.persons head_p ON head_p.id = head_m.person_id
              WHERE head_m.family_id = f.id
                AND head_m.is_head = TRUE
                AND head_m.left_at IS NULL
                AND head_p.user_id = auth.uid()
            )
          )
      )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_person(UUID) TO authenticated, anon;

-- Ensure RLS on public.persons enforces can_edit_person
DROP POLICY IF EXISTS "persons_update_authorized" ON public.persons;
CREATE POLICY "persons_update_authorized" ON public.persons
  FOR UPDATE
  USING (public.can_edit_person(persons.id))
  WITH CHECK (public.can_edit_person(persons.id));

-- -----------------------------------------------------------------------------
-- 3. Recreate public.community_persons View with occupation, country & is_deceased
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.community_persons CASCADE;

CREATE VIEW public.community_persons
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.maiden_name,
  p.gender,
  CASE
    WHEN p.date_of_birth IS NOT NULL THEN
      date_part('year', age(CURRENT_DATE, p.date_of_birth))::int
    ELSE NULL
  END AS age,
  p.date_of_birth,
  CASE
    WHEN p.date_of_birth IS NOT NULL THEN
      date_part('year', p.date_of_birth)::int
    ELSE NULL
  END AS dob_year,
  p.birth_place,
  p.blood_group,
  p.email_contact,
  p.phone,
  p.phone_secondary,
  p.city,
  p.state,
  p.country,
  p.date_of_death,
  COALESCE(p.is_deceased, p.date_of_death IS NOT NULL OR p.status = 'DECEASED', FALSE) AS is_deceased,
  p.occupation,
  p.occupation_category,
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
  (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.family_members fm1
    JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
    JOIN public.persons p2 ON p2.id = fm2.person_id
    WHERE fm1.person_id = p.id
      AND p2.user_id = auth.uid()
      AND fm1.left_at IS NULL
      AND fm2.left_at IS NULL
  )) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit
FROM public.persons p
WHERE p.deleted_at IS NULL;

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. Recreate get_public_occupation_directory and public_occupation_directory
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.public_occupation_directory CASCADE;
DROP FUNCTION IF EXISTS public.get_public_occupation_directory(TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.get_public_occupation_directory();

CREATE OR REPLACE FUNCTION public.get_public_occupation_directory(
  p_search TEXT DEFAULT NULL,
  p_occupation TEXT DEFAULT NULL,
  p_mukhi_id UUID DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  occupation TEXT,
  occupation_status TEXT,
  associated_mukhi_name TEXT,
  associated_mukhi_region TEXT,
  associated_mukhi_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH active_family_mukhis AS (
    SELECT DISTINCT ON (fm.person_id)
      fm.person_id,
      cm.id AS mukhi_id,
      cm.full_name AS mukhi_name,
      cm.gram AS mukhi_gram
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id AND f.deleted_at IS NULL
    JOIN public.community_mukhis cm ON cm.id = f.selected_mukhi_id
    WHERE fm.left_at IS NULL
      AND cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
    ORDER BY fm.person_id, fm.created_at DESC
  ),
  latest_requests AS (
    SELECT DISTINCT ON (our.person_id)
      our.person_id,
      our.status,
      our.requested_occupation,
      our.created_at
    FROM public.occupation_update_requests our
    ORDER BY our.person_id, our.created_at DESC
  ),
  directory_records AS (
    SELECT
      p.id AS d_person_id,
      TRIM(CONCAT_WS(' ', p.first_name, NULLIF(p.middle_name, ''), p.last_name)) AS d_full_name,
      CASE
        -- When latest update request is APPROVED: display requested occupation
        WHEN lr.status = 'APPROVED' THEN
          COALESCE(NULLIF(TRIM(lr.requested_occupation), ''), NULLIF(TRIM(p.occupation), ''), 'Occupation Not Provided')

        -- When latest update request is PENDING:
        WHEN lr.status = 'PENDING' THEN
          CASE
            WHEN p.occupation IS NOT NULL
              AND TRIM(p.occupation) != ''
              AND TRIM(p.occupation) NOT IN ('Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')
            THEN TRIM(p.occupation)
            ELSE 'Occupation Pending'
          END

        -- When latest update request was REJECTED:
        WHEN lr.status = 'REJECTED' THEN
          CASE
            WHEN p.occupation IS NOT NULL
              AND TRIM(p.occupation) != ''
              AND TRIM(p.occupation) NOT IN ('Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')
            THEN TRIM(p.occupation)
            ELSE 'Occupation Rejected'
          END

        -- No update request submitted:
        -- If an approved/valid occupation is saved in person record, display it.
        -- If empty or legacy default 'Occupation Pending', display 'Occupation Not Provided'
        ELSE
          CASE
            WHEN p.occupation IS NOT NULL
              AND TRIM(p.occupation) != ''
              AND TRIM(p.occupation) NOT IN ('Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided', 'Occupation Rejected')
            THEN TRIM(p.occupation)
            ELSE 'Occupation Not Provided'
          END
      END AS d_occupation,

      CASE
        WHEN lr.status = 'APPROVED' THEN 'APPROVED'
        WHEN lr.status = 'PENDING' AND (p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')) THEN 'PENDING'
        WHEN lr.status = 'PENDING' THEN 'APPROVED'
        WHEN lr.status = 'REJECTED' AND (p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')) THEN 'REJECTED'
        WHEN lr.status = 'REJECTED' THEN 'APPROVED'
        WHEN p.occupation IS NOT NULL AND TRIM(p.occupation) NOT IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided', 'Occupation Rejected') THEN 'APPROVED'
        ELSE 'NOT_PROVIDED'
      END AS d_occupation_status,

      afm.mukhi_name AS d_mukhi_name,
      afm.mukhi_gram AS d_mukhi_region,
      afm.mukhi_id AS d_mukhi_id
    FROM public.persons p
    LEFT JOIN active_family_mukhis afm ON afm.person_id = p.id
    LEFT JOIN latest_requests lr ON lr.person_id = p.id
    WHERE p.deleted_at IS NULL
      AND (p.status IS NULL OR p.status != 'DECEASED')
      AND p.date_of_death IS NULL
  )
  SELECT
    dr.d_person_id AS person_id,
    dr.d_full_name AS full_name,
    dr.d_occupation AS occupation,
    dr.d_occupation_status AS occupation_status,
    dr.d_mukhi_name AS associated_mukhi_name,
    dr.d_mukhi_region AS associated_mukhi_region,
    dr.d_mukhi_id AS associated_mukhi_id
  FROM directory_records dr
  WHERE (
    p_search IS NULL OR TRIM(p_search) = '' OR
    dr.d_full_name ILIKE '%' || TRIM(p_search) || '%' OR
    dr.d_occupation ILIKE '%' || TRIM(p_search) || '%' OR
    (dr.d_mukhi_name IS NOT NULL AND dr.d_mukhi_name ILIKE '%' || TRIM(p_search) || '%')
  )
  AND (
    p_occupation IS NULL OR TRIM(p_occupation) = '' OR
    dr.d_occupation ILIKE '%' || TRIM(p_occupation) || '%'
  )
  AND (
    p_mukhi_id IS NULL OR
    dr.d_mukhi_id = p_mukhi_id
  )
  ORDER BY dr.d_full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_occupation_directory(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_occupation_directory(TEXT, TEXT, UUID) TO anon, authenticated;

CREATE OR REPLACE VIEW public.public_occupation_directory AS
  SELECT * FROM public.get_public_occupation_directory();

GRANT SELECT ON public.public_occupation_directory TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Transactional RPC for Family Head to edit all details of a family member
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_family_member_complete(
  p_member_id UUID,
  p_person_id UUID,
  p_family_id UUID,
  p_person_data JSONB,
  p_membership_data JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_authorized BOOLEAN;
  v_person_rec RECORD;
  v_is_deceased BOOLEAN;
  v_dod DATE;
  v_status public.person_status;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to edit family members.' USING ERRCODE = '42501';
  END IF;

  -- 1. Verify authorization using can_edit_person
  v_is_authorized := public.can_edit_person(p_person_id);
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to edit this member.' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify person belongs to the given family
  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE id = p_member_id AND person_id = p_person_id AND family_id = p_family_id AND left_at IS NULL
  ) THEN
    -- If p_member_id might be person_id fallback
    IF NOT EXISTS (
      SELECT 1 FROM public.family_members
      WHERE person_id = p_person_id AND family_id = p_family_id AND left_at IS NULL
    ) THEN
      RAISE EXCEPTION 'INVALID_TARGET: Target member does not belong to the specified family.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 3. Compute deceased status
  v_is_deceased := COALESCE((p_person_data->>'is_deceased')::BOOLEAN, FALSE);
  IF NULLIF(TRIM(p_person_data->>'date_of_death'), '') IS NOT NULL THEN
    v_dod := (p_person_data->>'date_of_death')::DATE;
    v_is_deceased := TRUE;
  ELSE
    v_dod := NULL;
  END IF;

  IF v_is_deceased THEN
    v_status := 'DECEASED'::public.person_status;
  ELSE
    v_status := 'ACTIVE'::public.person_status;
  END IF;

  -- 4. Update public.persons
  UPDATE public.persons
  SET
    first_name = COALESCE(NULLIF(TRIM(p_person_data->>'first_name'), ''), first_name),
    middle_name = NULLIF(TRIM(p_person_data->>'middle_name'), ''),
    last_name = COALESCE(NULLIF(TRIM(p_person_data->>'last_name'), ''), last_name),
    gender = CASE
      WHEN NULLIF(TRIM(p_person_data->>'gender'), '') IS NOT NULL THEN (p_person_data->>'gender')::public.gender
      ELSE gender
    END,
    date_of_birth = CASE
      WHEN NULLIF(TRIM(p_person_data->>'date_of_birth'), '') IS NOT NULL THEN (p_person_data->>'date_of_birth')::DATE
      ELSE date_of_birth
    END,
    date_of_death = v_dod,
    is_deceased = v_is_deceased,
    status = v_status,
    birth_place = COALESCE(NULLIF(TRIM(p_person_data->>'birth_place'), ''), birth_place),
    city = COALESCE(NULLIF(TRIM(p_person_data->>'city'), ''), city),
    state = COALESCE(NULLIF(TRIM(p_person_data->>'state'), ''), state),
    country = COALESCE(NULLIF(TRIM(p_person_data->>'country'), ''), country),
    phone = CASE WHEN p_person_data ? 'phone' THEN NULLIF(TRIM(p_person_data->>'phone'), '') ELSE phone END,
    phone_secondary = CASE WHEN p_person_data ? 'phone_secondary' THEN NULLIF(TRIM(p_person_data->>'phone_secondary'), '') ELSE phone_secondary END,
    email_contact = CASE WHEN p_person_data ? 'email_contact' THEN NULLIF(TRIM(p_person_data->>'email_contact'), '') ELSE email_contact END,
    gotra = COALESCE(NULLIF(TRIM(p_person_data->>'gotra'), ''), gotra),
    nukh = COALESCE(NULLIF(TRIM(p_person_data->>'nukh'), ''), nukh),
    blood_group = CASE WHEN p_person_data ? 'blood_group' THEN NULLIF(TRIM(p_person_data->>'blood_group'), '') ELSE blood_group END,
    occupation = CASE WHEN p_person_data ? 'occupation' THEN NULLIF(TRIM(p_person_data->>'occupation'), '') ELSE occupation END,
    occupation_category = CASE WHEN p_person_data ? 'occupation_category' THEN NULLIF(TRIM(p_person_data->>'occupation_category'), '') ELSE occupation_category END,
    updated_at = NOW()
  WHERE id = p_person_id;

  -- 5. Update public.family_members if membership updates provided
  IF p_membership_data IS NOT NULL AND p_membership_data != '{}'::JSONB THEN
    UPDATE public.family_members
    SET
      relationship_to_head = COALESCE(NULLIF(TRIM(p_membership_data->>'relationship_to_head'), ''), relationship_to_head),
      role = CASE
        WHEN NULLIF(TRIM(p_membership_data->>'role'), '') IS NOT NULL THEN (p_membership_data->>'role')::public.family_role
        ELSE role
      END
    WHERE person_id = p_person_id AND family_id = p_family_id AND left_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'person_id', p_person_id,
    'family_id', p_family_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_family_member_complete(UUID, UUID, UUID, JSONB, JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Family Member Management & 30-Day Restoration Authorization
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_members_update_creator" ON public.family_members;
CREATE POLICY "family_members_update_creator"
  ON public.family_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_members.family_id
        AND f.deleted_at IS NULL
        AND (
          f.created_by = auth.uid()
          OR f.manager_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.family_members head_m
            JOIN public.persons head_p ON head_p.id = head_m.person_id
            WHERE head_m.family_id = f.id
              AND head_m.is_head = TRUE
              AND head_m.left_at IS NULL
              AND head_p.user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.families f
      WHERE f.id = family_members.family_id
        AND f.deleted_at IS NULL
        AND (
          f.created_by = auth.uid()
          OR f.manager_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.family_members head_m
            JOIN public.persons head_p ON head_p.id = head_m.person_id
            WHERE head_m.family_id = f.id
              AND head_m.is_head = TRUE
              AND head_m.left_at IS NULL
              AND head_p.user_id = auth.uid()
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.restore_family_member(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_family_id UUID;
  v_person_id UUID;
  v_can_manage BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT family_id, person_id INTO v_family_id, v_person_id
  FROM public.family_members
  WHERE id = p_member_id;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = v_family_id
        AND f.deleted_at IS NULL
        AND (
          f.created_by = v_caller_id
          OR f.manager_user_id = v_caller_id
          OR EXISTS (
            SELECT 1 FROM public.family_members head_m
            JOIN public.persons head_p ON head_p.id = head_m.person_id
            WHERE head_m.family_id = f.id
              AND head_m.is_head = TRUE
              AND head_m.left_at IS NULL
              AND head_p.user_id = v_caller_id
          )
        )
    )
  ) INTO v_can_manage;

  IF NOT v_can_manage THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.family_members
  SET left_at = NULL
  WHERE id = p_member_id;

  RETURN jsonb_build_object('success', TRUE, 'member_id', p_member_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_family_member(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Reload PostgREST schema cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
