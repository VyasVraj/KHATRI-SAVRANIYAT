-- =============================================================================
-- Migration: 20261117060000_contact_through_admin_and_request_workflow.sql
-- Description:
--   Add "Contact Through Admin" alongside "Contact Through Mukhi" in Occupation Directory.
--   Enforces:
--     1. Enhances public.occupation_contact_requests with channel ('MUKHI', 'ADMIN'),
--        requester_user_id, family_id, admin_note, rejection_reason, reviewed_by, reviewed_at.
--     2. Expands status constraint: PENDING, UNDER_REVIEW, APPROVED, REJECTED, RESOLVED, FORWARDED.
--     3. Preserves existing Contact Through Mukhi completely.
--     4. Enforces strict administrative authorization:
--        Mukhis CANNOT view or manage Admin-channeled contact requests.
--        Only Admins & Super Admins can review and manage Admin contact requests.
--     5. RPC public.submit_occupation_admin_contact_request for submission & admin notification.
--     6. RPC public.update_occupation_contact_status for workflow transitions & requester notification.
--     7. RPC public.get_admin_occupation_contact_requests and counts for Admin Panel.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Table Schema Enhancements
-- -----------------------------------------------------------------------------

-- Add channel column ('MUKHI' or 'ADMIN')
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'MUKHI';

-- Add requester user id for authenticated tracking
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add family id
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE SET NULL;

-- Add admin note
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- Add rejection reason
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add reviewer metadata
ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.occupation_contact_requests
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Update constraints
ALTER TABLE public.occupation_contact_requests
  DROP CONSTRAINT IF EXISTS occupation_contact_requests_channel_check;

ALTER TABLE public.occupation_contact_requests
  ADD CONSTRAINT occupation_contact_requests_channel_check
  CHECK (channel IN ('MUKHI', 'ADMIN'));

ALTER TABLE public.occupation_contact_requests
  DROP CONSTRAINT IF EXISTS occupation_contact_requests_status_check;

ALTER TABLE public.occupation_contact_requests
  ADD CONSTRAINT occupation_contact_requests_status_check
  CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED', 'FORWARDED'));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_occ_contact_channel
  ON public.occupation_contact_requests(channel);

CREATE INDEX IF NOT EXISTS idx_occ_contact_status
  ON public.occupation_contact_requests(status);

CREATE INDEX IF NOT EXISTS idx_occ_contact_requester
  ON public.occupation_contact_requests(requester_user_id);

CREATE INDEX IF NOT EXISTS idx_occ_contact_created_at
  ON public.occupation_contact_requests(created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. Row Level Security Policies
-- -----------------------------------------------------------------------------

-- Drop existing policies to refresh
DROP POLICY IF EXISTS "occupation_contact_requests_insert_policy" ON public.occupation_contact_requests;
DROP POLICY IF EXISTS "occupation_contact_requests_select_policy" ON public.occupation_contact_requests;
DROP POLICY IF EXISTS "occupation_contact_requests_update_policy" ON public.occupation_contact_requests;

-- INSERT: Allowed for anon visitors and authenticated users with valid non-empty fields
CREATE POLICY "occupation_contact_requests_insert_policy"
  ON public.occupation_contact_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(TRIM(visitor_name)) > 0 AND
    char_length(TRIM(visitor_contact)) > 0 AND
    char_length(TRIM(purpose)) > 0
  );

-- SELECT:
-- 1. Platform Admins and Super Admins can view ALL requests.
-- 2. Mukhis can ONLY view MUKHI requests associated with their active Mukhi ID. (Mukhis NEVER see Admin requests).
-- 3. Authenticated Requesters can view requests they submitted.
CREATE POLICY "occupation_contact_requests_select_policy"
  ON public.occupation_contact_requests
  FOR SELECT
  TO authenticated
  USING (
    -- Admins and Super Admins
    public.is_admin()
    OR
    -- Assigned Mukhi (Strictly restricted to MUKHI channel only)
    (
      channel = 'MUKHI'
      AND associated_mukhi_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.community_mukhis cm
        WHERE cm.id = associated_mukhi_id
          AND cm.linked_user_id = auth.uid()
          AND cm.is_active = TRUE
      )
    )
    OR
    -- Requesters viewing their own submissions
    (
      requester_user_id IS NOT NULL
      AND requester_user_id = auth.uid()
    )
  );

-- UPDATE:
-- 1. Admins and Super Admins can update any request.
-- 2. Mukhis can update only their own MUKHI channel requests.
CREATE POLICY "occupation_contact_requests_update_policy"
  ON public.occupation_contact_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR
    (
      channel = 'MUKHI'
      AND associated_mukhi_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.community_mukhis cm
        WHERE cm.id = associated_mukhi_id
          AND cm.linked_user_id = auth.uid()
          AND cm.is_active = TRUE
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR
    (
      channel = 'MUKHI'
      AND associated_mukhi_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.community_mukhis cm
        WHERE cm.id = associated_mukhi_id
          AND cm.linked_user_id = auth.uid()
          AND cm.is_active = TRUE
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. RPC: Submit Contact Request Through Admin
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_occupation_admin_contact_request(
  p_person_id UUID,
  p_visitor_name TEXT,
  p_visitor_email TEXT,
  p_purpose TEXT,
  p_message TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person RECORD;
  v_person_full_name TEXT;
  v_family_id UUID;
  v_associated_mukhi_id UUID;
  v_request_id UUID;
  r_admin RECORD;
  v_clean_name TEXT;
  v_clean_email TEXT;
  v_clean_purpose TEXT;
  v_clean_message TEXT;
BEGIN
  -- 1. Validate inputs
  v_clean_name := TRIM(COALESCE(p_visitor_name, ''));
  v_clean_email := TRIM(COALESCE(p_visitor_email, ''));
  v_clean_purpose := TRIM(COALESCE(p_purpose, ''));
  v_clean_message := TRIM(COALESCE(p_message, ''));

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

  -- 2. Verify target person exists
  SELECT id, first_name, middle_name, last_name, occupation
  INTO v_person
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target community person does not exist or has been removed.';
  END IF;

  v_person_full_name := trim(concat_ws(' ', v_person.first_name, v_person.middle_name, v_person.last_name));
  IF v_person_full_name = '' THEN
    v_person_full_name := 'Community Member';
  END IF;

  -- 3. Resolve associated family & family-level Mukhi
  SELECT fm.family_id, f.selected_mukhi_id
  INTO v_family_id, v_associated_mukhi_id
  FROM public.family_members fm
  JOIN public.families f ON f.id = fm.family_id AND f.deleted_at IS NULL
  WHERE fm.person_id = p_person_id AND fm.left_at IS NULL
  ORDER BY fm.is_head DESC, fm.joined_at ASC
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
    p_person_id,
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
    SELECT id
    FROM public.profiles
    WHERE role IN ('ADMIN', 'SUPER_ADMIN')
      AND is_active = TRUE
  LOOP
    BEGIN
      PERFORM public.emit_domain_notification(
        p_recipient_id := r_admin.id,
        p_actor_id := auth.uid(),
        p_category := 'COMMUNITY'::public.notification_category,
        p_type := 'occupation_admin_contact_submitted',
        p_title := 'New Occupation Contact Request',
        p_body := v_clean_name || ' requested contact with ' || v_person_full_name || ' (' || COALESCE(v_person.occupation, 'Professional') || ').',
        p_action_url := '/admin/occupation-contact-requests?id=' || v_request_id::text,
        p_entity_type := 'occupation_contact_request',
        p_entity_id := v_request_id,
        p_event_key := 'occ_adm_req_' || v_request_id::text || '_' || r_admin.id::text,
        p_metadata := jsonb_build_object(
          'request_id', v_request_id,
          'person_id', p_person_id,
          'channel', 'ADMIN'
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'request_id', v_request_id,
    'message', 'Your contact request has been submitted successfully. The administration team will review your request and assist you.'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC: Update Contact Request Status & Admin Workflow
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
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_clean_status TEXT;
BEGIN
  -- 1. Authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only platform administrators can manage occupation contact requests.';
  END IF;

  v_clean_status := upper(trim(COALESCE(p_status, '')));
  IF v_clean_status NOT IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED') THEN
    RAISE EXCEPTION 'Invalid status "%". Must be one of PENDING, UNDER_REVIEW, APPROVED, REJECTED, RESOLVED.', p_status;
  END IF;

  -- 2. Fetch request with row lock
  SELECT *
  INTO v_req
  FROM public.occupation_contact_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact request not found.';
  END IF;

  -- 3. Update request
  UPDATE public.occupation_contact_requests
  SET status = v_clean_status,
      admin_note = COALESCE(trim(p_admin_note), admin_note),
      rejection_reason = CASE
        WHEN v_clean_status = 'REJECTED' THEN COALESCE(trim(p_rejection_reason), rejection_reason)
        ELSE rejection_reason
      END,
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_request_id;

  -- 4. Notify requester if authenticated account exists
  IF v_req.requester_user_id IS NOT NULL THEN
    BEGIN
      PERFORM public.emit_domain_notification(
        p_recipient_id := v_req.requester_user_id,
        p_actor_id := auth.uid(),
        p_category := 'COMMUNITY'::public.notification_category,
        p_type := 'occupation_contact_status_updated',
        p_title := 'Contact Request Update: ' || replace(v_clean_status, '_', ' '),
        p_body := 'Your contact request regarding ' || v_req.person_name || ' is now ' || replace(v_clean_status, '_', ' ') || '.',
        p_action_url := '/occupations',
        p_entity_type := 'occupation_contact_request',
        p_entity_id := p_request_id,
        p_event_key := 'occ_cont_stat_' || p_request_id::text || '_' || v_clean_status,
        p_metadata := jsonb_build_object(
          'request_id', p_request_id,
          'status', v_clean_status
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Contact request updated successfully to ' || replace(v_clean_status, '_', ' ') || '.'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Query RPC: Admin Panel Requests List
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_occupation_contact_requests(
  p_status TEXT DEFAULT 'ALL',
  p_search TEXT DEFAULT NULL,
  p_channel TEXT DEFAULT 'ADMIN',
  p_sort TEXT DEFAULT 'NEWEST'
)
RETURNS TABLE (
  id UUID,
  channel TEXT,
  person_id UUID,
  person_name TEXT,
  occupation TEXT,
  family_id UUID,
  family_name TEXT,
  associated_mukhi_id UUID,
  associated_mukhi_name TEXT,
  requester_user_id UUID,
  visitor_name TEXT,
  visitor_contact TEXT,
  purpose TEXT,
  message TEXT,
  status TEXT,
  admin_note TEXT,
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewer_name TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.channel,
    r.person_id,
    r.person_name,
    COALESCE(p.occupation, 'Occupation Not Listed') AS occupation,
    r.family_id,
    COALESCE(f.family_name, 'No Family Linked') AS family_name,
    r.associated_mukhi_id,
    COALESCE(cm.full_name, 'Mukhi Not Assigned') AS associated_mukhi_name,
    r.requester_user_id,
    r.visitor_name,
    r.visitor_contact,
    r.purpose,
    r.message,
    r.status,
    r.admin_note,
    r.rejection_reason,
    r.reviewed_by,
    COALESCE(rev_prof.display_name, split_part(rev_prof.email, '@', 1), 'Admin') AS reviewer_name,
    r.reviewed_at,
    r.created_at
  FROM public.occupation_contact_requests r
  JOIN public.persons p ON p.id = r.person_id
  LEFT JOIN public.families f ON f.id = r.family_id
  LEFT JOIN public.community_mukhis cm ON cm.id = r.associated_mukhi_id
  LEFT JOIN public.profiles rev_prof ON rev_prof.id = r.reviewed_by
  WHERE (
    p_channel IS NULL
    OR upper(trim(p_channel)) = 'ALL'
    OR r.channel = upper(trim(p_channel))
  )
  AND (
    p_status IS NULL
    OR upper(trim(p_status)) = 'ALL'
    OR r.status = upper(trim(p_status))
  )
  AND (
    p_search IS NULL
    OR trim(p_search) = ''
    OR r.person_name ILIKE '%' || trim(p_search) || '%'
    OR r.visitor_name ILIKE '%' || trim(p_search) || '%'
    OR r.visitor_contact ILIKE '%' || trim(p_search) || '%'
    OR r.purpose ILIKE '%' || trim(p_search) || '%'
    OR f.family_name ILIKE '%' || trim(p_search) || '%'
    OR cm.full_name ILIKE '%' || trim(p_search) || '%'
    OR r.id::text ILIKE '%' || trim(p_search) || '%'
  )
  ORDER BY
    CASE WHEN upper(trim(p_sort)) = 'OLDEST' THEN r.created_at END ASC,
    CASE WHEN upper(trim(p_sort)) <> 'OLDEST' THEN r.created_at END DESC;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC: KPI Counts for Admin Panel
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_occupation_contact_request_counts(
  p_channel TEXT DEFAULT 'ADMIN'
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', count(*)::integer,
    'pending', count(*) FILTER (WHERE status = 'PENDING')::integer,
    'under_review', count(*) FILTER (WHERE status = 'UNDER_REVIEW')::integer,
    'approved', count(*) FILTER (WHERE status = 'APPROVED')::integer,
    'rejected', count(*) FILTER (WHERE status = 'REJECTED')::integer,
    'resolved', count(*) FILTER (WHERE status = 'RESOLVED')::integer
  )
  FROM public.occupation_contact_requests
  WHERE (
    p_channel IS NULL
    OR upper(trim(p_channel)) = 'ALL'
    OR channel = upper(trim(p_channel))
  );
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.submit_occupation_admin_contact_request(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_occupation_contact_status(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_occupation_contact_requests(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_occupation_contact_request_counts(TEXT) TO authenticated;

COMMIT;
