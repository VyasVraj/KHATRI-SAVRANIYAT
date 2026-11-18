-- =============================================================================
-- Migration: 20261117020000_public_occupation_directory_and_photo_restrictions.sql
-- Description:
--   1. Public Occupation Directory:
--      - Creates secure RPC public.get_public_occupation_directory() returning ONLY:
--        person_id, full_name, occupation, associated_mukhi_name,
--        associated_mukhi_region, associated_mukhi_id.
--      - Publicly accessible to anonymous visitors and authenticated users alike.
--      - Zero private data (phone, email, dob, gender, blood group, address,
--        gotra, nukh, family trees) is exposed over the network.
--      - Implements controlled contact routing via public.occupation_contact_requests
--        and public.submit_occupation_contact_request().
--
--   2. Profile Photo Upload & Change Restrictions:
--      - Disables all avatar uploads and updates in Supabase Storage.
--      - Replaces set_person_avatar and set_profile_avatar RPCs with disabled exception stubs.
--      - Preserves existing photos and read access (avatars_select_policy).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CONTROLLED CONTACT REQUESTS TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.occupation_contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  associated_mukhi_id UUID REFERENCES public.community_mukhis(id) ON DELETE SET NULL,
  visitor_name TEXT NOT NULL,
  visitor_contact TEXT NOT NULL,
  purpose TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'FORWARDED', 'RESOLVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.occupation_contact_requests ENABLE ROW LEVEL SECURITY;

-- Allow anonymous visitors and authenticated users to insert contact requests
DROP POLICY IF EXISTS "occupation_contact_requests_insert_policy" ON public.occupation_contact_requests;
CREATE POLICY "occupation_contact_requests_insert_policy"
  ON public.occupation_contact_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(TRIM(visitor_name)) > 0 AND
    char_length(TRIM(visitor_contact)) > 0 AND
    char_length(TRIM(message)) > 0
  );

-- Only platform admins and the assigned Mukhi can read contact requests
DROP POLICY IF EXISTS "occupation_contact_requests_select_policy" ON public.occupation_contact_requests;
CREATE POLICY "occupation_contact_requests_select_policy"
  ON public.occupation_contact_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('ADMIN', 'SUPER_ADMIN')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.community_mukhis cm
      WHERE cm.id = associated_mukhi_id
        AND cm.linked_user_id = auth.uid()
        AND cm.is_active = TRUE
    )
  );

GRANT INSERT ON public.occupation_contact_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON public.occupation_contact_requests TO authenticated;

-- RPC to submit a controlled contact request without exposing personal details
CREATE OR REPLACE FUNCTION public.submit_occupation_contact_request(
  p_person_id UUID,
  p_person_name TEXT,
  p_associated_mukhi_id UUID,
  p_visitor_name TEXT,
  p_visitor_contact TEXT,
  p_purpose TEXT,
  p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
BEGIN
  IF p_person_id IS NULL OR TRIM(COALESCE(p_person_name, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Target person details are required.';
  END IF;

  IF TRIM(COALESCE(p_visitor_name, '')) = '' OR TRIM(COALESCE(p_visitor_contact, '')) = '' OR TRIM(COALESCE(p_message, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Visitor name, contact, and message are required.';
  END IF;

  INSERT INTO public.occupation_contact_requests (
    person_id,
    person_name,
    associated_mukhi_id,
    visitor_name,
    visitor_contact,
    purpose,
    message,
    status
  ) VALUES (
    p_person_id,
    TRIM(p_person_name),
    p_associated_mukhi_id,
    TRIM(p_visitor_name),
    TRIM(p_visitor_contact),
    COALESCE(NULLIF(TRIM(p_purpose), ''), 'Professional Inquiry'),
    TRIM(p_message),
    'PENDING'
  ) RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'request_id', v_request_id,
    'message', 'Your contact request has been received and routed securely to community leadership.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_occupation_contact_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_occupation_contact_request TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. PUBLIC OCCUPATION DIRECTORY RPC (ZERO PRIVATE DATA EXPOSURE)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_occupation_directory(
  p_search TEXT DEFAULT NULL,
  p_occupation TEXT DEFAULT NULL,
  p_mukhi_id UUID DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  occupation TEXT,
  associated_mukhi_name TEXT,
  associated_mukhi_region TEXT,
  associated_mukhi_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    JOIN public.families f ON f.id = fm.family_id
    JOIN public.community_mukhis cm ON cm.id = f.selected_mukhi_id
    WHERE fm.left_at IS NULL
      AND cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
    ORDER BY fm.person_id, fm.created_at DESC
  ),
  active_mukhis_geo AS (
    SELECT
      cm.id AS mukhi_id,
      cm.full_name AS mukhi_name,
      cm.gram AS mukhi_gram
    FROM public.community_mukhis cm
    WHERE cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
  ),
  directory_records AS (
    SELECT
      p.id AS d_person_id,
      TRIM(CONCAT_WS(' ', p.first_name, NULLIF(p.middle_name, ''), p.last_name)) AS d_full_name,
      COALESCE(NULLIF(TRIM(p.occupation), ''), 'Occupation Not Available') AS d_occupation,
      COALESCE(afm.mukhi_name, (
        SELECT geo.mukhi_name FROM active_mukhis_geo geo
        WHERE (p.birth_place IS NOT NULL AND geo.mukhi_gram ILIKE '%' || p.birth_place || '%')
           OR (p.city IS NOT NULL AND geo.mukhi_gram ILIKE '%' || p.city || '%')
        LIMIT 1
      )) AS d_mukhi_name,
      COALESCE(afm.mukhi_gram, (
        SELECT geo.mukhi_gram FROM active_mukhis_geo geo
        WHERE (p.birth_place IS NOT NULL AND geo.mukhi_gram ILIKE '%' || p.birth_place || '%')
           OR (p.city IS NOT NULL AND geo.mukhi_gram ILIKE '%' || p.city || '%')
        LIMIT 1
      )) AS d_mukhi_region,
      COALESCE(afm.mukhi_id, (
        SELECT geo.mukhi_id FROM active_mukhis_geo geo
        WHERE (p.birth_place IS NOT NULL AND geo.mukhi_gram ILIKE '%' || p.birth_place || '%')
           OR (p.city IS NOT NULL AND geo.mukhi_gram ILIKE '%' || p.city || '%')
        LIMIT 1
      )) AS d_mukhi_id
    FROM public.persons p
    LEFT JOIN active_family_mukhis afm ON afm.person_id = p.id
    WHERE p.deleted_at IS NULL
      AND (p.status IS NULL OR p.status != 'DECEASED')
      AND (p.is_deceased IS NULL OR p.is_deceased = FALSE)
      AND p.date_of_death IS NULL
  )
  SELECT
    dr.d_person_id AS person_id,
    dr.d_full_name AS full_name,
    dr.d_occupation AS occupation,
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
    dr.d_occupation = TRIM(p_occupation)
  )
  AND (
    p_mukhi_id IS NULL OR dr.d_mukhi_id = p_mukhi_id
  )
  ORDER BY dr.d_full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_occupation_directory FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_occupation_directory TO anon, authenticated;

-- Also create a standard secure View for direct queries
CREATE OR REPLACE VIEW public.public_occupation_directory AS
  SELECT * FROM public.get_public_occupation_directory();

GRANT SELECT ON public.public_occupation_directory TO anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. DISABLE PROFILE PHOTO UPLOADS & UPDATES (STORAGE & RPC LOCK)
-- -----------------------------------------------------------------------------

-- Lock down avatar upload storage policy
DROP POLICY IF EXISTS "avatars_insert_policy" ON storage.objects;
CREATE POLICY "avatars_insert_policy"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (
    bucket_id != 'avatars'
  );

DROP POLICY IF EXISTS "avatars_update_policy" ON storage.objects;
CREATE POLICY "avatars_update_policy"
  ON storage.objects
  FOR UPDATE
  TO public
  USING (
    bucket_id != 'avatars'
  )
  WITH CHECK (
    bucket_id != 'avatars'
  );

-- Replace RPC functions with disabled exception stubs
CREATE OR REPLACE FUNCTION public.set_person_avatar(
  p_person_id UUID,
  p_avatar_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'PERMISSION_DENIED: Profile photo uploads and changes have been disabled.';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_avatar(
  p_avatar_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'PERMISSION_DENIED: Profile photo uploads and changes have been disabled.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_person_avatar(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_profile_avatar(TEXT) FROM PUBLIC, anon, authenticated;

COMMIT;
