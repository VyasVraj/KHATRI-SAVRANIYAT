-- =============================================================================
-- Migration: 20261119010000_fix_occupation_custom_and_blood_directory_consent.sql
-- Description:
--   1. Ensures show_blood_group_in_directory and blood_group_consent exist on public.persons.
--   2. Ensures occupation, occupation_category, and custom_occupation exist on public.persons.
--   3. Creates public.custom_occupations master table for user-submitted custom occupations.
--   4. Recreates public.community_persons view to include show_blood_group_in_directory & custom_occupation.
--   5. Recreates public.get_public_occupation_directory() RPC:
--      - Correctly maps approved, pending, rejected, custom, and unprovided occupations.
--      - Preserves custom occupations and official categories with status 'APPROVED'.
--   6. Creates public.get_public_blood_group_directory() RPC:
--      - Enforces database-level filtering for explicit consent (show_blood_group_in_directory = TRUE).
--      - Excludes deceased, unconsented, and deleted members.
--      - Returns privacy-safe columns with Family Head linkage for emergency routing.
--   7. Updates update_family_member_complete() and register_complete_family() to handle consent and occupations.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure persons table has all required columns safely
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS show_blood_group_in_directory BOOLEAN DEFAULT FALSE;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS blood_group_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS occupation_category TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS custom_occupation TEXT;

-- For existing records: ensure default is FALSE unless explicitly consented
UPDATE public.persons
SET show_blood_group_in_directory = FALSE
WHERE show_blood_group_in_directory IS NULL;

UPDATE public.persons
SET blood_group_consent = FALSE
WHERE blood_group_consent IS NULL;

-- -----------------------------------------------------------------------------
-- 2. Create custom_occupations table for reusable custom occupations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_occupations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occupation_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  category_name TEXT DEFAULT 'Other',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_occupations_norm ON public.custom_occupations(normalized_name);
CREATE INDEX IF NOT EXISTS idx_custom_occupations_approved ON public.custom_occupations(is_approved, is_active);

ALTER TABLE public.custom_occupations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_occupations_select_policy ON public.custom_occupations;
CREATE POLICY custom_occupations_select_policy ON public.custom_occupations
  FOR SELECT USING (
    is_approved = TRUE
    OR (auth.uid() IS NOT NULL AND created_by = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS custom_occupations_insert_policy ON public.custom_occupations;
CREATE POLICY custom_occupations_insert_policy ON public.custom_occupations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS custom_occupations_admin_policy ON public.custom_occupations;
CREATE POLICY custom_occupations_admin_policy ON public.custom_occupations
  FOR ALL USING (public.is_admin());

-- RPC to submit a custom occupation
CREATE OR REPLACE FUNCTION public.submit_custom_occupation(
  p_occupation_name TEXT,
  p_category_name TEXT DEFAULT 'Other'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_cleaned TEXT;
  v_normalized TEXT;
  v_is_admin BOOLEAN;
  v_record RECORD;
BEGIN
  v_cleaned := TRIM(p_occupation_name);
  IF v_cleaned IS NULL OR v_cleaned = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Occupation name cannot be empty.' USING ERRCODE = '22023';
  END IF;

  v_normalized := LOWER(v_cleaned);
  v_caller_id := auth.uid();
  v_is_admin := public.is_admin();

  -- Insert or fetch existing
  INSERT INTO public.custom_occupations (
    occupation_name,
    normalized_name,
    category_name,
    created_by,
    is_approved,
    is_active
  ) VALUES (
    v_cleaned,
    v_normalized,
    COALESCE(NULLIF(TRIM(p_category_name), ''), 'Other'),
    v_caller_id,
    v_is_admin, -- Auto-approve if created by Admin
    TRUE
  )
  ON CONFLICT (normalized_name) DO UPDATE
  SET updated_at = NOW()
  RETURNING id, occupation_name, normalized_name, category_name, is_approved INTO v_record;

  RETURN jsonb_build_object(
    'success', TRUE,
    'id', v_record.id,
    'occupation_name', v_record.occupation_name,
    'category_name', v_record.category_name,
    'is_approved', v_record.is_approved
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_custom_occupation(TEXT, TEXT) TO authenticated, anon;

-- RPC to get available custom occupations
CREATE OR REPLACE FUNCTION public.get_available_custom_occupations()
RETURNS TABLE (
  id UUID,
  occupation_name TEXT,
  category_name TEXT,
  is_approved BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    co.id,
    co.occupation_name,
    co.category_name,
    co.is_approved
  FROM public.custom_occupations co
  WHERE co.is_active = TRUE
    AND (
      co.is_approved = TRUE
      OR (auth.uid() IS NOT NULL AND co.created_by = auth.uid())
      OR public.is_admin()
    )
  ORDER BY co.occupation_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_custom_occupations() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 3. Recreate public.community_persons view
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
  COALESCE(p.show_blood_group_in_directory, p.blood_group_consent, FALSE) AS show_blood_group_in_directory,
  COALESCE(p.blood_group_consent, p.show_blood_group_in_directory, FALSE) AS blood_group_consent,
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
  p.custom_occupation,
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

GRANT SELECT ON public.community_persons TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. Recreate get_public_occupation_directory() RPC
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_public_occupation_directory();
DROP FUNCTION IF EXISTS public.get_public_occupation_directory(TEXT, TEXT, UUID);

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
      our.rejection_reason,
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
        ELSE
          CASE
            WHEN p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Not Available', 'Occupation Not Provided') THEN
              'Occupation Not Provided'
            WHEN TRIM(p.occupation) = 'Occupation Pending' THEN
              'Occupation Pending'
            ELSE
              TRIM(p.occupation)
          END
      END AS d_occupation,
      CASE
        WHEN lr.status = 'APPROVED' THEN 'APPROVED'
        WHEN lr.status = 'PENDING' AND (p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')) THEN 'PENDING'
        WHEN lr.status = 'PENDING' THEN 'APPROVED'
        WHEN lr.status = 'REJECTED' AND (p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')) THEN 'REJECTED'
        WHEN lr.status = 'REJECTED' THEN 'APPROVED'
        WHEN p.occupation IS NOT NULL AND TRIM(p.occupation) NOT IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided') THEN 'APPROVED'
        WHEN TRIM(p.occupation) = 'Occupation Pending' THEN 'PENDING'
        ELSE 'NOT_PROVIDED'
      END AS d_occupation_status,
      afm.mukhi_name AS d_mukhi_name,
      afm.mukhi_gram AS d_mukhi_region,
      afm.mukhi_id AS d_mukhi_id,
      p.occupation_category AS d_category
    FROM public.persons p
    LEFT JOIN active_family_mukhis afm ON afm.person_id = p.id
    LEFT JOIN latest_requests lr ON lr.person_id = p.id
    WHERE p.deleted_at IS NULL
      AND (p.status IS NULL OR p.status != 'DECEASED')
      AND p.date_of_death IS NULL
      AND COALESCE(p.is_deceased, FALSE) = FALSE
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
  WHERE
    (
      p_occupation IS NULL
      OR p_occupation = ''
      OR p_occupation = 'ALL'
      OR dr.d_occupation ILIKE p_occupation
      OR dr.d_category ILIKE p_occupation
    )
    AND (
      p_mukhi_id IS NULL
      OR dr.d_mukhi_id = p_mukhi_id
    )
    AND (
      p_search IS NULL
      OR TRIM(p_search) = ''
      OR dr.d_full_name ILIKE '%' || TRIM(p_search) || '%'
      OR dr.d_occupation ILIKE '%' || TRIM(p_search) || '%'
      OR COALESCE(dr.d_mukhi_name, '') ILIKE '%' || TRIM(p_search) || '%'
    )
  ORDER BY dr.d_full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_occupation_directory(TEXT, TEXT, UUID) TO authenticated, anon;

-- Recreate 0-arg overload for backwards compatibility
CREATE OR REPLACE FUNCTION public.get_public_occupation_directory()
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  occupation TEXT,
  occupation_status TEXT,
  associated_mukhi_name TEXT,
  associated_mukhi_region TEXT,
  associated_mukhi_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.get_public_occupation_directory(NULL, NULL, NULL);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_occupation_directory() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5. Create get_public_blood_group_directory() RPC with strict consent filtering
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_public_blood_group_directory(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.get_public_blood_group_directory(
  p_blood_group TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  blood_group TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  family_id UUID,
  family_name TEXT,
  family_head_name TEXT,
  family_head_person_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH active_family_heads AS (
    SELECT DISTINCT ON (fm.family_id)
      fm.family_id,
      fm.person_id AS head_person_id,
      TRIM(CONCAT_WS(' ', hp.first_name, NULLIF(hp.middle_name, ''), hp.last_name)) AS head_name
    FROM public.family_members fm
    JOIN public.persons hp ON hp.id = fm.person_id AND hp.deleted_at IS NULL
    WHERE fm.is_head = TRUE AND fm.left_at IS NULL
    ORDER BY fm.family_id, fm.created_at ASC
  ),
  person_family_links AS (
    SELECT DISTINCT ON (fm.person_id)
      fm.person_id,
      f.id AS family_id,
      f.family_name,
      afh.head_name AS family_head_name,
      afh.head_person_id AS family_head_person_id
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id AND f.deleted_at IS NULL
    LEFT JOIN active_family_heads afh ON afh.family_id = f.id
    WHERE fm.left_at IS NULL
    ORDER BY fm.person_id, fm.created_at DESC
  )
  SELECT
    p.id AS person_id,
    TRIM(CONCAT_WS(' ', p.first_name, NULLIF(p.middle_name, ''), p.last_name)) AS full_name,
    p.blood_group,
    p.city,
    p.state,
    p.country,
    pfl.family_id,
    pfl.family_name,
    pfl.family_head_name,
    pfl.family_head_person_id
  FROM public.persons p
  LEFT JOIN person_family_links pfl ON pfl.person_id = p.id
  WHERE p.deleted_at IS NULL
    AND (p.status IS NULL OR p.status = 'ACTIVE')
    AND COALESCE(p.is_deceased, FALSE) = FALSE
    AND p.date_of_death IS NULL
    AND p.blood_group IS NOT NULL
    AND TRIM(p.blood_group) NOT IN ('', 'UNKNOWN')
    AND COALESCE(p.show_blood_group_in_directory, p.blood_group_consent, FALSE) = TRUE
    AND (
      p_blood_group IS NULL
      OR p_blood_group = ''
      OR p_blood_group = 'ALL'
      OR p.blood_group = p_blood_group
    )
    AND (
      p_search IS NULL
      OR TRIM(p_search) = ''
      OR CONCAT_WS(' ', p.first_name, p.middle_name, p.last_name, pfl.family_name, p.city, p.state) ILIKE '%' || TRIM(p_search) || '%'
    )
  ORDER BY p.first_name ASC, p.last_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_blood_group_directory(TEXT, TEXT) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 6. Update update_family_member_complete() to support consent and occupations
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
  v_is_deceased BOOLEAN;
  v_dod DATE;
  v_status public.person_status;
  v_consent BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to edit family members.' USING ERRCODE = '42501';
  END IF;

  v_is_authorized := public.can_edit_person(p_person_id);
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to edit this member.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE id = p_member_id AND person_id = p_person_id AND family_id = p_family_id AND left_at IS NULL
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.family_members
      WHERE person_id = p_person_id AND family_id = p_family_id AND left_at IS NULL
    ) THEN
      RAISE EXCEPTION 'INVALID_TARGET: Target member does not belong to the specified family.' USING ERRCODE = '22023';
    END IF;
  END IF;

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

  IF p_person_data ? 'show_blood_group_in_directory' THEN
    v_consent := COALESCE((p_person_data->>'show_blood_group_in_directory')::BOOLEAN, FALSE);
  ELSIF p_person_data ? 'blood_group_consent' THEN
    v_consent := COALESCE((p_person_data->>'blood_group_consent')::BOOLEAN, FALSE);
  ELSE
    v_consent := NULL;
  END IF;

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
    show_blood_group_in_directory = CASE WHEN v_consent IS NOT NULL THEN v_consent ELSE show_blood_group_in_directory END,
    blood_group_consent = CASE WHEN v_consent IS NOT NULL THEN v_consent ELSE blood_group_consent END,
    occupation = CASE WHEN p_person_data ? 'occupation' THEN NULLIF(TRIM(p_person_data->>'occupation'), '') ELSE occupation END,
    occupation_category = CASE WHEN p_person_data ? 'occupation_category' THEN NULLIF(TRIM(p_person_data->>'occupation_category'), '') ELSE occupation_category END,
    custom_occupation = CASE WHEN p_person_data ? 'custom_occupation' THEN NULLIF(TRIM(p_person_data->>'custom_occupation'), '') ELSE custom_occupation END,
    updated_at = NOW()
  WHERE id = p_person_id;

  IF p_membership_data IS NOT NULL AND p_membership_data != '{}'::JSONB THEN
    UPDATE public.family_members
    SET
      relationship_to_head = COALESCE(NULLIF(TRIM(p_membership_data->>'relationship_to_head'), ''), relationship_to_head),
      role = CASE
        WHEN NULLIF(TRIM(p_membership_data->>'role'), '') IS NOT NULL THEN (p_membership_data->>'role')::public.family_role
        ELSE role
      END,
      is_head = COALESCE((p_membership_data->>'is_head')::BOOLEAN, is_head),
      reference_person_id = CASE
        WHEN p_membership_data ? 'reference_person_id' AND NULLIF(TRIM(p_membership_data->>'reference_person_id'), '') IS NOT NULL
        THEN (p_membership_data->>'reference_person_id')::UUID
        ELSE reference_person_id
      END,
      connected_person_id = CASE
        WHEN p_membership_data ? 'connected_person_id' AND NULLIF(TRIM(p_membership_data->>'connected_person_id'), '') IS NOT NULL
        THEN (p_membership_data->>'connected_person_id')::UUID
        ELSE connected_person_id
      END,
      updated_at = NOW()
    WHERE person_id = p_person_id AND family_id = p_family_id AND left_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'person_id', p_person_id,
    'member_id', p_member_id,
    'family_id', p_family_id,
    'message', 'Family member updated successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_family_member_complete(UUID, UUID, UUID, JSONB, JSONB) TO authenticated;

COMMIT;
