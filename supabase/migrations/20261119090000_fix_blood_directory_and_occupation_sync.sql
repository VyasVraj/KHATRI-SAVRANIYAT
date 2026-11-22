-- =============================================================================
-- Migration: 20261119090000_fix_blood_directory_and_occupation_sync.sql
-- Description:
--   1. Ensures blood_group_consent and show_in_blood_directory exist on public.persons.
--   2. Recreates public.community_persons view exposing blood_group_consent,
--      show_in_blood_directory, occupation, and occupation_category.
--   3. Creates public.get_public_blood_group_directory RPC for secure, privacy-first
--      emergency directory queries (only consented, non-deceased, active members).
--   4. Updates public.update_family_member_complete RPC to reliably save
--      blood_group_consent, show_in_blood_directory, and occupation fields.
--   5. Creates public.custom_occupations master table for community reusable professions.
--   6. Recreates public.get_public_occupation_directory RPC to display actual saved
--      occupations (official or custom) with APPROVED status.
--   7. Reloads PostgREST schema cache.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure columns exist on public.persons safely
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS blood_group_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS show_in_blood_directory BOOLEAN DEFAULT FALSE;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS show_blood_group_in_directory BOOLEAN DEFAULT FALSE;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS occupation_category TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS custom_occupation TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN DEFAULT FALSE;

-- Synchronize consent flags across legacy names safely
UPDATE public.persons
SET 
  blood_group_consent = COALESCE(blood_group_consent, FALSE),
  show_in_blood_directory = COALESCE(blood_group_consent, FALSE),
  show_blood_group_in_directory = COALESCE(blood_group_consent, FALSE);

-- -----------------------------------------------------------------------------
-- 2. Recreate public.community_persons View with blood group consent & occupation
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
  COALESCE(p.blood_group_consent, FALSE) AS show_in_blood_directory,
  COALESCE(p.blood_group_consent, FALSE) AS blood_group_consent,
  COALESCE(p.blood_group_consent, FALSE) AS show_blood_group_in_directory,
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

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 3. Custom Occupations Master Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_occupations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occupation_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category_name TEXT NOT NULL DEFAULT 'Other',
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_approved BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  usage_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT custom_occupations_name_not_empty CHECK (length(trim(occupation_name)) >= 2),
  CONSTRAINT custom_occupations_normalized_unique UNIQUE (normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_custom_occupations_lookup
  ON public.custom_occupations(normalized_name)
  WHERE is_active = TRUE AND is_approved = TRUE;

ALTER TABLE public.custom_occupations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_occupations_select_public" ON public.custom_occupations;
CREATE POLICY "custom_occupations_select_public"
  ON public.custom_occupations
  FOR SELECT
  USING (is_active = TRUE AND is_approved = TRUE);

DROP POLICY IF EXISTS "custom_occupations_insert_authenticated" ON public.custom_occupations;
CREATE POLICY "custom_occupations_insert_authenticated"
  ON public.custom_occupations
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 4. RPC: get_public_blood_group_directory
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_public_blood_group_directory(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_blood_group_directory(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_blood_group_directory() CASCADE;

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH head_mapping AS (
    SELECT DISTINCT ON (fm.family_id)
      fm.family_id,
      fm.person_id AS h_person_id,
      TRIM(CONCAT_WS(' ', hp.first_name, NULLIF(hp.middle_name, ''), hp.last_name)) AS h_name
    FROM public.family_members fm
    JOIN public.persons hp ON hp.id = fm.person_id AND hp.deleted_at IS NULL
    WHERE fm.is_head = TRUE
      AND fm.left_at IS NULL
    ORDER BY fm.family_id, fm.created_at ASC
  ),
  person_family_map AS (
    SELECT DISTINCT ON (fm.person_id)
      fm.person_id,
      f.id AS fam_id,
      f.family_name AS fam_name,
      hm.h_person_id,
      hm.h_name
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id AND f.deleted_at IS NULL
    LEFT JOIN head_mapping hm ON hm.family_id = f.id
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
    pfm.fam_id AS family_id,
    pfm.fam_name AS family_name,
    pfm.h_name AS family_head_name,
    pfm.h_person_id AS family_head_person_id
  FROM public.persons p
  LEFT JOIN person_family_map pfm ON pfm.person_id = p.id
  WHERE p.deleted_at IS NULL
    AND COALESCE(p.is_deceased, p.date_of_death IS NOT NULL OR p.status = 'DECEASED', FALSE) = FALSE
    AND p.blood_group IS NOT NULL
    AND TRIM(p.blood_group) NOT IN ('', 'UNKNOWN')
    AND (
      COALESCE(p.blood_group_consent, FALSE) = TRUE
      OR COALESCE(p.show_in_blood_directory, FALSE) = TRUE
      OR COALESCE(p.show_blood_group_in_directory, FALSE) = TRUE
    )
    AND (
      p_blood_group IS NULL
      OR p_blood_group = 'ALL'
      OR p.blood_group = p_blood_group
    )
    AND (
      p_search IS NULL
      OR TRIM(p_search) = ''
      OR (
        p.first_name ILIKE '%' || TRIM(p_search) || '%'
        OR p.last_name ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.city, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(p.state, '') ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(pfm.fam_name, '') ILIKE '%' || TRIM(p_search) || '%'
      )
    )
  ORDER BY p.first_name ASC, p.last_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_blood_group_directory(TEXT, TEXT) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5. RPC: get_public_occupation_directory
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.public_occupation_directory CASCADE;
DROP FUNCTION IF EXISTS public.get_public_occupation_directory(TEXT, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_occupation_directory(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_occupation_directory(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_public_occupation_directory() CASCADE;

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
        WHEN lr.status = 'APPROVED' THEN
          COALESCE(NULLIF(TRIM(lr.requested_occupation), ''), NULLIF(TRIM(p.occupation), ''), 'Occupation Not Provided')
        WHEN lr.status = 'PENDING' THEN
          CASE
            WHEN p.occupation IS NOT NULL
              AND TRIM(p.occupation) != ''
              AND TRIM(p.occupation) NOT IN ('Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided', 'Occupation Rejected')
            THEN TRIM(p.occupation)
            ELSE 'Occupation Pending'
          END
        WHEN lr.status = 'REJECTED' THEN
          CASE
            WHEN p.occupation IS NOT NULL
              AND TRIM(p.occupation) != ''
              AND TRIM(p.occupation) NOT IN ('Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided', 'Occupation Rejected')
            THEN TRIM(p.occupation)
            ELSE 'Occupation Rejected'
          END
        ELSE
          CASE
            WHEN p.occupation IS NOT NULL
              AND TRIM(p.occupation) != ''
              AND TRIM(p.occupation) NOT IN ('Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided', 'Occupation Rejected')
            THEN TRIM(p.occupation)
            WHEN p.occupation_category IS NOT NULL
              AND TRIM(p.occupation_category) != ''
            THEN TRIM(p.occupation_category)
            ELSE 'Occupation Not Provided'
          END
      END AS d_occupation,

      CASE
        WHEN lr.status = 'APPROVED' THEN 'APPROVED'
        WHEN lr.status = 'PENDING' AND (p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')) THEN 'PENDING'
        WHEN lr.status = 'PENDING' THEN 'APPROVED'
        WHEN lr.status = 'REJECTED' AND (p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')) THEN 'REJECTED'
        WHEN (p.occupation IS NOT NULL AND TRIM(p.occupation) NOT IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided', 'Occupation Rejected'))
          OR (p.occupation_category IS NOT NULL AND TRIM(p.occupation_category) != '') THEN 'APPROVED'
        ELSE 'NOT_PROVIDED'
      END AS d_occupation_status,

      afm.mukhi_name AS d_associated_mukhi_name,
      afm.mukhi_gram AS d_associated_mukhi_region,
      afm.mukhi_id AS d_associated_mukhi_id
    FROM public.persons p
    LEFT JOIN active_family_mukhis afm ON afm.person_id = p.id
    LEFT JOIN latest_requests lr ON lr.person_id = p.id
    WHERE p.deleted_at IS NULL
      AND COALESCE(p.is_deceased, p.date_of_death IS NOT NULL OR p.status = 'DECEASED', FALSE) = FALSE
  )
  SELECT
    d.d_person_id,
    d.d_full_name,
    d.d_occupation,
    d.d_occupation_status,
    d.d_associated_mukhi_name,
    d.d_associated_mukhi_region,
    d.d_associated_mukhi_id
  FROM directory_records d
  WHERE
    (
      p_search IS NULL
      OR TRIM(p_search) = ''
      OR (
        d.d_full_name ILIKE '%' || TRIM(p_search) || '%'
        OR d.d_occupation ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(d.d_associated_mukhi_name, '') ILIKE '%' || TRIM(p_search) || '%'
      )
    )
    AND (
      p_occupation IS NULL
      OR TRIM(p_occupation) = ''
      OR TRIM(p_occupation) = 'ALL'
      OR d.d_occupation ILIKE '%' || TRIM(p_occupation) || '%'
    )
    AND (
      p_mukhi_id IS NULL
      OR d.d_associated_mukhi_id = p_mukhi_id
    )
  ORDER BY d.d_full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_occupation_directory(TEXT, TEXT, UUID) TO authenticated, anon;

-- Recreate public_occupation_directory View for backwards compatibility
CREATE OR REPLACE VIEW public.public_occupation_directory AS
  SELECT * FROM public.get_public_occupation_directory(NULL::TEXT, NULL::TEXT, NULL::UUID);

GRANT SELECT ON public.public_occupation_directory TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 6. RPC: update_family_member_complete
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_family_member_complete(UUID, UUID, UUID, JSONB, JSONB) CASCADE;

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
  v_is_authorized BOOLEAN := FALSE;
  v_consent BOOLEAN;
  v_occ TEXT;
  v_cat TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to edit family members.'
      USING ERRCODE = '42501';
  END IF;

  -- Verify caller authority
  SELECT (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = p_family_id
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
    OR EXISTS (
      SELECT 1 FROM public.persons p
      WHERE p.id = p_person_id
        AND (p.user_id = v_caller_id OR (p.created_by = v_caller_id AND p.user_id IS NULL))
        AND p.deleted_at IS NULL
    )
    OR public.can_edit_person(p_person_id)
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to edit this family member.'
      USING ERRCODE = '42501';
  END IF;

  -- Extract consent
  IF p_person_data ? 'show_in_blood_directory' THEN
    v_consent := COALESCE((p_person_data->>'show_in_blood_directory')::BOOLEAN, FALSE);
  ELSIF p_person_data ? 'blood_group_consent' THEN
    v_consent := COALESCE((p_person_data->>'blood_group_consent')::BOOLEAN, FALSE);
  ELSIF p_person_data ? 'show_blood_group_in_directory' THEN
    v_consent := COALESCE((p_person_data->>'show_blood_group_in_directory')::BOOLEAN, FALSE);
  ELSE
    v_consent := NULL;
  END IF;

  -- Extract occupation
  v_occ := NULLIF(TRIM(p_person_data->>'occupation'), '');
  IF v_occ IN ('Occupation Pending', 'Occupation Not Provided', 'Occupation Not Available', 'Occupation Rejected') THEN
    v_occ := NULL;
  END IF;
  v_cat := NULLIF(TRIM(p_person_data->>'occupation_category'), '');
  IF v_occ IS NULL AND v_cat IS NOT NULL THEN
    v_occ := v_cat;
  END IF;

  -- Update public.persons
  UPDATE public.persons
  SET
    first_name = CASE WHEN p_person_data ? 'first_name' THEN COALESCE(NULLIF(TRIM(p_person_data->>'first_name'), ''), first_name) ELSE first_name END,
    middle_name = CASE WHEN p_person_data ? 'middle_name' THEN NULLIF(TRIM(p_person_data->>'middle_name'), '') ELSE middle_name END,
    last_name = CASE WHEN p_person_data ? 'last_name' THEN COALESCE(NULLIF(TRIM(p_person_data->>'last_name'), ''), last_name) ELSE last_name END,
    gender = CASE WHEN p_person_data ? 'gender' AND NULLIF(TRIM(p_person_data->>'gender'), '') IS NOT NULL THEN (p_person_data->>'gender')::public.gender ELSE gender END,
    date_of_birth = CASE WHEN p_person_data ? 'date_of_birth' THEN NULLIF(TRIM(p_person_data->>'date_of_birth'), '')::DATE ELSE date_of_birth END,
    date_of_death = CASE WHEN p_person_data ? 'date_of_death' THEN NULLIF(TRIM(p_person_data->>'date_of_death'), '')::DATE ELSE date_of_death END,
    is_deceased = CASE
      WHEN p_person_data ? 'is_deceased' THEN COALESCE((p_person_data->>'is_deceased')::BOOLEAN, FALSE)
      WHEN p_person_data ? 'date_of_death' AND NULLIF(TRIM(p_person_data->>'date_of_death'), '') IS NOT NULL THEN TRUE
      ELSE is_deceased
    END,
    status = CASE
      WHEN (p_person_data ? 'is_deceased' AND (p_person_data->>'is_deceased')::BOOLEAN = TRUE)
        OR (p_person_data ? 'date_of_death' AND NULLIF(TRIM(p_person_data->>'date_of_death'), '') IS NOT NULL) THEN 'DECEASED'::public.person_status
      ELSE status
    END,
    birth_place = CASE WHEN p_person_data ? 'birth_place' THEN NULLIF(TRIM(p_person_data->>'birth_place'), '') ELSE birth_place END,
    city = CASE WHEN p_person_data ? 'city' THEN NULLIF(TRIM(p_person_data->>'city'), '') ELSE city END,
    state = CASE WHEN p_person_data ? 'state' THEN NULLIF(TRIM(p_person_data->>'state'), '') ELSE state END,
    country = CASE WHEN p_person_data ? 'country' THEN NULLIF(TRIM(p_person_data->>'country'), '') ELSE country END,
    phone = CASE WHEN p_person_data ? 'phone' THEN NULLIF(TRIM(p_person_data->>'phone'), '') ELSE phone END,
    email_contact = CASE WHEN p_person_data ? 'email_contact' THEN NULLIF(TRIM(p_person_data->>'email_contact'), '') ELSE email_contact END,
    gotra = CASE WHEN p_person_data ? 'gotra' THEN NULLIF(TRIM(p_person_data->>'gotra'), '') ELSE gotra END,
    nukh = CASE WHEN p_person_data ? 'nukh' THEN NULLIF(TRIM(p_person_data->>'nukh'), '') ELSE nukh END,
    blood_group = CASE WHEN p_person_data ? 'blood_group' THEN NULLIF(TRIM(p_person_data->>'blood_group'), '') ELSE blood_group END,
    blood_group_consent = CASE WHEN v_consent IS NOT NULL THEN v_consent ELSE blood_group_consent END,
    show_in_blood_directory = CASE WHEN v_consent IS NOT NULL THEN v_consent ELSE show_in_blood_directory END,
    show_blood_group_in_directory = CASE WHEN v_consent IS NOT NULL THEN v_consent ELSE show_blood_group_in_directory END,
    occupation = CASE WHEN (p_person_data ? 'occupation' OR p_person_data ? 'occupation_category') THEN v_occ ELSE occupation END,
    occupation_category = CASE WHEN p_person_data ? 'occupation_category' THEN v_cat ELSE occupation_category END,
    updated_at = NOW()
  WHERE id = p_person_id;

  -- Update public.family_members if membership updates provided
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

COMMIT;

NOTIFY pgrst, 'reload schema';
