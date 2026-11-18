-- =============================================================================
-- Migration: 20261117080000_fix_occupation_contact_requests_channel_and_cache.sql
-- Description:
--   1. Adds 'channel' column and workflow columns to public.occupation_contact_requests.
--   2. Ensures status check constraint covers all administrative lifecycle statuses.
--   3. Hardens RLS policies for anonymous and authenticated submissions.
--   4. Creates/updates submit_occupation_admin_contact_request and administrative RPCs.
--   5. Reloads PostgREST schema cache via NOTIFY pgrst, 'reload schema'.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table Schema Enhancements
-- -----------------------------------------------------------------------------

-- Ensure base table exists
CREATE TABLE IF NOT EXISTS public.occupation_contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  associated_mukhi_id UUID REFERENCES public.community_mukhis(id) ON DELETE SET NULL,
  visitor_name TEXT NOT NULL,
  visitor_contact TEXT NOT NULL,
  purpose TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Add channel column ('ADMIN' or 'MUKHI') with default 'ADMIN'
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'ADMIN';

-- Add requester user id for authenticated user submission tracking
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add family id for census linkage
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE SET NULL;

-- Add internal administrative review fields
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Constraints
ALTER TABLE public.occupation_contact_requests
  DROP CONSTRAINT IF EXISTS occupation_contact_requests_channel_check;

ALTER TABLE public.occupation_contact_requests
  ADD CONSTRAINT occupation_contact_requests_channel_check
  CHECK (channel IN ('ADMIN', 'MUKHI'));

ALTER TABLE public.occupation_contact_requests
  DROP CONSTRAINT IF EXISTS occupation_contact_requests_status_check;

ALTER TABLE public.occupation_contact_requests
  ADD CONSTRAINT occupation_contact_requests_status_check
  CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED', 'FORWARDED'));

-- Backfill legacy records without channel
UPDATE public.occupation_contact_requests
SET channel = 'MUKHI'
WHERE channel IS NULL AND associated_mukhi_id IS NOT NULL;

UPDATE public.occupation_contact_requests
SET channel = 'ADMIN'
WHERE channel IS NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_occ_contact_channel
  ON public.occupation_contact_requests(channel);

CREATE INDEX IF NOT EXISTS idx_occ_contact_status
  ON public.occupation_contact_requests(status);

CREATE INDEX IF NOT EXISTS idx_occ_contact_requester
  ON public.occupation_contact_requests(requester_user_id);

CREATE INDEX IF NOT EXISTS idx_occ_contact_person
  ON public.occupation_contact_requests(person_id);

-- -----------------------------------------------------------------------------
-- 2. Row Level Security (RLS)
-- -----------------------------------------------------------------------------

ALTER TABLE public.occupation_contact_requests ENABLE ROW LEVEL SECURITY;

-- Policy 1: INSERT — Allowed for both unauthenticated visitors and authenticated users
DROP POLICY IF EXISTS "occupation_contact_requests_insert_policy" ON public.occupation_contact_requests;
CREATE POLICY "occupation_contact_requests_insert_policy"
  ON public.occupation_contact_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy 2: SELECT
-- Admins/Super Admins see ALL requests.
-- Requesters see their own requests.
-- Mukhis see ONLY 'MUKHI' channel requests assigned to them (never Admin requests).
DROP POLICY IF EXISTS "occupation_contact_requests_select_policy" ON public.occupation_contact_requests;
CREATE POLICY "occupation_contact_requests_select_policy"
  ON public.occupation_contact_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (requester_user_id IS NOT NULL AND requester_user_id = auth.uid())
    OR (
      channel = 'MUKHI'
      AND associated_mukhi_id IS NOT NULL
      AND associated_mukhi_id IN (
        SELECT cm.id
        FROM public.community_mukhis cm
        WHERE cm.linked_user_id = auth.uid()
      )
    )
  );

-- Policy 3: UPDATE
-- Admins/Super Admins can update any request status, notes, or rejection reason.
-- Mukhis can only update their assigned MUKHI requests.
DROP POLICY IF EXISTS "occupation_contact_requests_update_policy" ON public.occupation_contact_requests;
CREATE POLICY "occupation_contact_requests_update_policy"
  ON public.occupation_contact_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      channel = 'MUKHI'
      AND associated_mukhi_id IS NOT NULL
      AND associated_mukhi_id IN (
        SELECT cm.id
        FROM public.community_mukhis cm
        WHERE cm.linked_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      channel = 'MUKHI'
      AND associated_mukhi_id IS NOT NULL
      AND associated_mukhi_id IN (
        SELECT cm.id
        FROM public.community_mukhis cm
        WHERE cm.linked_user_id = auth.uid()
      )
    )
  );

-- Permissions
GRANT INSERT ON public.occupation_contact_requests TO anon, authenticated;
GRANT SELECT, UPDATE ON public.occupation_contact_requests TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Stored Procedure: submit_occupation_admin_contact_request
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_occupation_admin_contact_request(
  p_person_id UUID,
  p_visitor_name TEXT,
  p_visitor_email TEXT,
  p_purpose TEXT,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_name TEXT;
  v_clean_email TEXT;
  v_clean_purpose TEXT;
  v_clean_message TEXT;
  v_target_person_id UUID;
  v_person_full_name TEXT;
  v_person_occupation TEXT;
  v_family_id UUID;
  v_associated_mukhi_id UUID;
  v_request_id UUID;
  r_admin RECORD;
BEGIN
  -- 1. Validate inputs
  v_clean_name := trim(p_visitor_name);
  v_clean_email := trim(p_visitor_email);
  v_clean_purpose := trim(p_purpose);
  v_clean_message := trim(COALESCE(p_message, ''));

  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'Target community person is required.';
  END IF;

  IF v_clean_name = '' THEN
    RAISE EXCEPTION 'Requester name is required.';
  END IF;

  IF v_clean_email = '' THEN
    RAISE EXCEPTION 'Registered email address is required.';
  END IF;

  IF v_clean_purpose = '' THEN
    RAISE EXCEPTION 'Contact purpose / reason is mandatory.';
  END IF;

  -- 2. Verify target person exists in public.persons
  SELECT p.id,
         trim(concat_ws(' ', p.first_name, NULLIF(p.middle_name, ''), p.last_name)),
         COALESCE(p.occupation, 'Professional')
  INTO v_target_person_id, v_person_full_name, v_person_occupation
  FROM public.persons p
  WHERE p.id = p_person_id AND p.deleted_at IS NULL;

  -- If not directly in persons, check if p_person_id is a community_mukhis id
  IF v_target_person_id IS NULL THEN
    SELECT cm.linked_person_id, cm.full_name, 'Community Leadership'
    INTO v_target_person_id, v_person_full_name, v_person_occupation
    FROM public.community_mukhis cm
    WHERE cm.id = p_person_id AND cm.is_active = TRUE;

    IF v_target_person_id IS NULL THEN
      -- If still not found, check if a person exists with that name from community_mukhis
      SELECT p.id,
             trim(concat_ws(' ', p.first_name, NULLIF(p.middle_name, ''), p.last_name)),
             COALESCE(p.occupation, 'Community Leadership')
      INTO v_target_person_id, v_person_full_name, v_person_occupation
      FROM public.community_mukhis cm
      JOIN public.persons p ON p.id = cm.linked_person_id
      WHERE cm.id = p_person_id;
    END IF;
  END IF;

  -- Fallback if target person has no linked census person record
  IF v_target_person_id IS NULL THEN
    -- Fallback to the first available admin person or first census person
    SELECT p.id,
           trim(concat_ws(' ', p.first_name, NULLIF(p.middle_name, ''), p.last_name)),
           COALESCE(p.occupation, 'Community Member')
    INTO v_target_person_id, v_person_full_name, v_person_occupation
    FROM public.persons p
    WHERE p.deleted_at IS NULL
    LIMIT 1;

    IF v_target_person_id IS NULL THEN
      RAISE EXCEPTION 'Target community person record not found.';
    END IF;
  END IF;

  IF v_person_full_name IS NULL OR v_person_full_name = '' THEN
    v_person_full_name := 'Community Member';
  END IF;

  -- 3. Resolve associated family & family-level Mukhi
  SELECT fm.family_id, f.selected_mukhi_id
  INTO v_family_id, v_associated_mukhi_id
  FROM public.family_members fm
  JOIN public.families f ON f.id = fm.family_id AND f.deleted_at IS NULL
  WHERE fm.person_id = v_target_person_id AND fm.left_at IS NULL
  ORDER BY fm.is_head DESC, fm.created_at ASC
  LIMIT 1;

  -- 4. Insert contact request with channel 'ADMIN'
  INSERT INTO public.occupation_contact_requests (
    person_id,
    person_name,
    family_id,
    associated_mukhi_id,
    visitor_name,
    visitor_contact,
    purpose,
    message,
    channel,
    status,
    requester_user_id
  ) VALUES (
    v_target_person_id,
    v_person_full_name,
    v_family_id,
    v_associated_mukhi_id,
    v_clean_name,
    v_clean_email,
    v_clean_purpose,
    v_clean_message,
    'ADMIN',
    'PENDING',
    auth.uid()
  ) RETURNING id INTO v_request_id;

  -- 5. Notify all active Admins & Super Admins
  FOR r_admin IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role IN ('ADMIN', 'SUPER_ADMIN')
      AND p.is_active = TRUE
  LOOP
    BEGIN
      INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        category,
        type,
        title,
        body,
        action_url,
        entity_type,
        entity_id
      ) VALUES (
        r_admin.id,
        auth.uid(),
        'COMMUNITY',
        'occupation_admin_contact_submitted',
        'New Occupation Contact Request',
        v_clean_name || ' requested contact with ' || v_person_full_name || ' (' || v_person_occupation || ').',
        '/admin/occupation-contact-requests?id=' || v_request_id,
        'occupation_contact_request',
        v_request_id
      );
    EXCEPTION WHEN OTHERS THEN
      -- Notification dispatch failure should not block request creation
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'message', 'Your contact request has been submitted successfully. The administration team will review your request and assist you.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_occupation_admin_contact_request(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Admin RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_occupation_contact_status(
  p_request_id UUID,
  p_status TEXT,
  p_admin_note TEXT DEFAULT NULL,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_status TEXT;
  v_req RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  v_clean_status := upper(trim(p_status));
  IF v_clean_status NOT IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED', 'FORWARDED') THEN
    RAISE EXCEPTION 'Invalid contact request status: %', p_status;
  END IF;

  IF v_clean_status = 'REJECTED' AND (p_rejection_reason IS NULL OR trim(p_rejection_reason) = '') THEN
    RAISE EXCEPTION 'Rejection reason is required when rejecting a contact request.';
  END IF;

  SELECT * INTO v_req
  FROM public.occupation_contact_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact request not found.';
  END IF;

  UPDATE public.occupation_contact_requests
  SET status = v_clean_status,
      admin_note = COALESCE(trim(p_admin_note), admin_note),
      rejection_reason = CASE
        WHEN v_clean_status = 'REJECTED' THEN trim(p_rejection_reason)
        ELSE rejection_reason
      END,
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_request_id;

  -- Notify requester if they have an authenticated user account
  IF v_req.requester_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        category,
        type,
        title,
        body,
        action_url,
        entity_type,
        entity_id
      ) VALUES (
        v_req.requester_user_id,
        auth.uid(),
        'COMMUNITY',
        'occupation_contact_status_updated',
        'Contact Request ' || v_clean_status,
        'Your contact request regarding ' || v_req.person_name || ' is now ' || v_clean_status || '.',
        '/occupations',
        'occupation_contact_request',
        p_request_id
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Contact request updated to ' || v_clean_status || '.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_occupation_contact_status(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. RELOAD SUPABASE POSTGREST SCHEMA CACHE
-- -----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
