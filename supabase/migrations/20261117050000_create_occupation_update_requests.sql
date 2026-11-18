-- =============================================================================
-- Migration: 20261117050000_create_occupation_update_requests.sql
-- Description:
--   Complete Occupation Update Request Notifications & Admin Approval Workflow.
--   Enforces:
--     1. Authoritative occupation_update_requests table with RLS & unique pending index.
--     2. Append-only occupation_request_audit_logs table.
--     3. Atomic submission RPC validating against official 30 Occupation Categories
--        and automatically dispatching in-app notifications to Admins & Super Admins.
--     4. Atomic approval RPC updating persons.occupation, marking request APPROVED,
--        recording reviewer metadata, and notifying requesting user.
--     5. Atomic rejection RPC requiring non-empty reason, preserving current occupation,
--        recording reviewer metadata, and notifying requesting user.
--     6. Dashboard metrics and query RPCs with multi-filter & search support.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Main Table: public.occupation_update_requests
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.occupation_update_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_occupation TEXT,
  requested_occupation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Partial Unique Index: Prevent duplicate pending requests for the same person
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_occ_request
  ON public.occupation_update_requests(person_id)
  WHERE status = 'PENDING';

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_occ_requests_person_id
  ON public.occupation_update_requests(person_id);

CREATE INDEX IF NOT EXISTS idx_occ_requests_submitted_by
  ON public.occupation_update_requests(submitted_by);

CREATE INDEX IF NOT EXISTS idx_occ_requests_status
  ON public.occupation_update_requests(status);

CREATE INDEX IF NOT EXISTS idx_occ_requests_created_at
  ON public.occupation_update_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.occupation_update_requests ENABLE ROW LEVEL SECURITY;

-- Normal users can view only requests they submitted
CREATE POLICY "Users can view own submitted occupation requests"
  ON public.occupation_update_requests
  FOR SELECT
  TO authenticated
  USING (submitted_by = auth.uid());

-- Admins and Super Admins can view all requests
CREATE POLICY "Admins can view all occupation requests"
  ON public.occupation_update_requests
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. Audit Table: public.occupation_request_audit_logs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.occupation_request_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES public.occupation_update_requests(id) ON DELETE CASCADE,
  person_id UUID REFERENCES public.persons(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_occupation TEXT,
  requested_occupation TEXT,
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_occ_audit_request_id
  ON public.occupation_request_audit_logs(request_id);

CREATE INDEX IF NOT EXISTS idx_occ_audit_person_id
  ON public.occupation_request_audit_logs(person_id);

ALTER TABLE public.occupation_request_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view occupation request audit logs"
  ON public.occupation_request_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. Validation Helper: Check against official 30 Occupation Categories
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_valid_official_occupation(p_occupation TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(p_occupation) IN (
    'Agriculture',
    'Healthcare',
    'Education',
    'Engineering',
    'Information Technology',
    'Science and Research',
    'Business and Entrepreneurship',
    'Finance and Banking',
    'Law and Legal Services',
    'Government Services',
    'Defence and Military',
    'Police and Security',
    'Construction and Real Estate',
    'Manufacturing and Industry',
    'Skilled Trades and Repair',
    'Transport and Logistics',
    'Retail and Trade',
    'Hospitality and Tourism',
    'Food and Catering',
    'Media and Journalism',
    'Arts and Entertainment',
    'Design and Fashion',
    'Beauty and Personal Care',
    'Sports and Fitness',
    'Social Work and NGOs',
    'Energy and Utilities',
    'Telecommunications',
    'Domestic and Household Services',
    'Religious and Cultural Services',
    'Digital and Online Services'
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. User Submission RPC: public.submit_occupation_update_request
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_occupation_update_request(
  p_person_id UUID,
  p_requested_occupation TEXT
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
  v_request_id UUID;
  v_clean_occupation TEXT;
  r_admin RECORD;
  v_can_manage BOOLEAN := FALSE;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit occupation requests.';
  END IF;

  -- 2. Validate requested occupation
  v_clean_occupation := trim(COALESCE(p_requested_occupation, ''));
  IF v_clean_occupation = '' THEN
    RAISE EXCEPTION 'Requested occupation cannot be empty.';
  END IF;

  IF NOT public.is_valid_official_occupation(v_clean_occupation) THEN
    RAISE EXCEPTION 'Invalid occupation "%". Must be one of the 30 official occupation categories.', v_clean_occupation;
  END IF;

  -- 3. Verify person exists and fetch details
  SELECT id, first_name, middle_name, last_name, occupation, user_id, created_by
  INTO v_person
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record does not exist or has been deleted.';
  END IF;

  v_person_full_name := trim(concat_ws(' ', v_person.first_name, v_person.middle_name, v_person.last_name));
  IF v_person_full_name = '' THEN
    v_person_full_name := 'Community Member';
  END IF;

  -- 4. Check user permission to manage this person
  IF public.is_admin() THEN
    v_can_manage := TRUE;
  ELSIF v_person.user_id = auth.uid() OR v_person.created_by = auth.uid() THEN
    v_can_manage := TRUE;
  ELSIF EXISTS (
    SELECT 1
    FROM public.family_members fm1
    JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
    JOIN public.persons p ON p.id = fm1.person_id
    WHERE fm2.person_id = p_person_id
      AND p.user_id = auth.uid()
  ) THEN
    v_can_manage := TRUE;
  END IF;

  IF NOT v_can_manage THEN
    RAISE EXCEPTION 'You are not authorized to manage occupation for this person.';
  END IF;

  -- 5. Duplicate pending check
  IF EXISTS (
    SELECT 1
    FROM public.occupation_update_requests
    WHERE person_id = p_person_id AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'A pending occupation update request already exists for this person. Please wait for Admin approval.';
  END IF;

  -- 6. Resolve primary family ID
  SELECT family_id INTO v_family_id
  FROM public.family_members
  WHERE person_id = p_person_id
  ORDER BY is_head DESC, joined_at ASC
  LIMIT 1;

  -- 7. Insert the pending request
  INSERT INTO public.occupation_update_requests (
    person_id,
    family_id,
    submitted_by,
    current_occupation,
    requested_occupation,
    status
  ) VALUES (
    p_person_id,
    v_family_id,
    auth.uid(),
    COALESCE(v_person.occupation, 'Occupation Pending'),
    v_clean_occupation,
    'PENDING'
  ) RETURNING id INTO v_request_id;

  -- 8. Audit log
  INSERT INTO public.occupation_request_audit_logs (
    request_id,
    person_id,
    action,
    actor_id,
    previous_occupation,
    requested_occupation,
    metadata
  ) VALUES (
    v_request_id,
    p_person_id,
    'SUBMITTED',
    auth.uid(),
    COALESCE(v_person.occupation, 'Occupation Pending'),
    v_clean_occupation,
    jsonb_build_object(
      'person_name', v_person_full_name,
      'family_id', v_family_id
    )
  );

  -- 9. Notify all active Admins & Super Admins
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
        p_type := 'occupation_request_submitted',
        p_title := 'New Occupation Update Request',
        p_body := v_person_full_name || ' has requested an occupation update to ' || v_clean_occupation || '.',
        p_action_url := '/admin/occupation-requests?id=' || v_request_id::text,
        p_entity_type := 'occupation_request',
        p_entity_id := v_request_id,
        p_event_key := 'occ_req_sub_' || v_request_id::text || '_' || r_admin.id::text,
        p_metadata := jsonb_build_object(
          'request_id', v_request_id,
          'person_id', p_person_id,
          'requested_occupation', v_clean_occupation
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- Non-blocking notification safety: ensure request is preserved even if notification delivery has transient issue
        NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'message', 'Your occupation update request has been submitted successfully. It is waiting for Admin approval.'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Admin Approval RPC: public.approve_occupation_update_request
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_occupation_update_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_person RECORD;
  v_person_full_name TEXT;
BEGIN
  -- 1. Authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only platform administrators can approve occupation requests.';
  END IF;

  -- 2. Fetch request with row-level lock
  SELECT *
  INTO v_req
  FROM public.occupation_update_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occupation update request not found.';
  END IF;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Request has already been reviewed (current status: %).', v_req.status;
  END IF;

  -- 3. Verify person exists
  SELECT id, first_name, middle_name, last_name, occupation
  INTO v_person
  FROM public.persons
  WHERE id = v_req.person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated person record no longer exists or was deleted.';
  END IF;

  v_person_full_name := trim(concat_ws(' ', v_person.first_name, v_person.middle_name, v_person.last_name));
  IF v_person_full_name = '' THEN
    v_person_full_name := 'Community Member';
  END IF;

  -- 4. Validate requested occupation against official 30 categories
  IF NOT public.is_valid_official_occupation(v_req.requested_occupation) THEN
    RAISE EXCEPTION 'Cannot approve: "%" is not a valid official occupation category.', v_req.requested_occupation;
  END IF;

  -- 5. Atomic Update: Update person's approved occupation
  UPDATE public.persons
  SET occupation = v_req.requested_occupation,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_req.person_id;

  -- 6. Atomic Update: Mark request approved
  UPDATE public.occupation_update_requests
  SET status = 'APPROVED',
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_request_id;

  -- 7. Audit log
  INSERT INTO public.occupation_request_audit_logs (
    request_id,
    person_id,
    action,
    actor_id,
    reviewer_id,
    previous_occupation,
    requested_occupation,
    metadata
  ) VALUES (
    p_request_id,
    v_req.person_id,
    'APPROVED',
    auth.uid(),
    auth.uid(),
    v_req.current_occupation,
    v_req.requested_occupation,
    jsonb_build_object(
      'person_name', v_person_full_name,
      'reviewed_at', timezone('utc'::text, now())
    )
  );

  -- 8. Notify the requesting user
  BEGIN
    PERFORM public.emit_domain_notification(
      p_recipient_id := v_req.submitted_by,
      p_actor_id := auth.uid(),
      p_category := 'COMMUNITY'::public.notification_category,
      p_type := 'occupation_request_approved',
      p_title := 'Occupation Update Request Approved',
      p_body := 'Your request to update occupation to ' || v_req.requested_occupation || ' for ' || v_person_full_name || ' has been approved.',
      p_action_url := '/people/' || v_req.person_id::text,
      p_entity_type := 'occupation_request',
      p_entity_id := p_request_id,
      p_event_key := 'occ_req_appr_' || p_request_id::text,
      p_metadata := jsonb_build_object(
        'request_id', p_request_id,
        'person_id', v_req.person_id,
        'approved_occupation', v_req.requested_occupation
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Occupation request approved successfully.'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Admin Rejection RPC: public.reject_occupation_update_request
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_occupation_update_request(
  p_request_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_person RECORD;
  v_person_full_name TEXT;
  v_clean_reason TEXT;
BEGIN
  -- 1. Authorization check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only platform administrators can reject occupation requests.';
  END IF;

  -- 2. Validate rejection reason
  v_clean_reason := trim(COALESCE(p_rejection_reason, ''));
  IF v_clean_reason = '' THEN
    RAISE EXCEPTION 'A rejection reason is required.';
  END IF;

  -- 3. Fetch request with row-level lock
  SELECT *
  INTO v_req
  FROM public.occupation_update_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occupation update request not found.';
  END IF;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Request has already been reviewed (current status: %).', v_req.status;
  END IF;

  -- 4. Fetch person details for notification
  SELECT id, first_name, middle_name, last_name, occupation
  INTO v_person
  FROM public.persons
  WHERE id = v_req.person_id;

  v_person_full_name := trim(concat_ws(' ', v_person.first_name, v_person.middle_name, v_person.last_name));
  IF v_person_full_name = '' THEN
    v_person_full_name := 'Community Member';
  END IF;

  -- 5. Atomic Update: Mark request rejected with reason, preserving current occupation
  UPDATE public.occupation_update_requests
  SET status = 'REJECTED',
      rejection_reason = v_clean_reason,
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_request_id;

  -- 6. Audit log
  INSERT INTO public.occupation_request_audit_logs (
    request_id,
    person_id,
    action,
    actor_id,
    reviewer_id,
    previous_occupation,
    requested_occupation,
    rejection_reason,
    metadata
  ) VALUES (
    p_request_id,
    v_req.person_id,
    'REJECTED',
    auth.uid(),
    auth.uid(),
    v_req.current_occupation,
    v_req.requested_occupation,
    v_clean_reason,
    jsonb_build_object(
      'person_name', v_person_full_name,
      'reviewed_at', timezone('utc'::text, now())
    )
  );

  -- 7. Notify the requesting user with the rejection reason
  BEGIN
    PERFORM public.emit_domain_notification(
      p_recipient_id := v_req.submitted_by,
      p_actor_id := auth.uid(),
      p_category := 'COMMUNITY'::public.notification_category,
      p_type := 'occupation_request_rejected',
      p_title := 'Occupation Update Request Rejected',
      p_body := 'Your request to update occupation for ' || v_person_full_name || ' was not approved. Reason: ' || v_clean_reason,
      p_action_url := '/people/' || v_req.person_id::text,
      p_entity_type := 'occupation_request',
      p_entity_id := p_request_id,
      p_event_key := 'occ_req_rej_' || p_request_id::text,
      p_metadata := jsonb_build_object(
        'request_id', p_request_id,
        'person_id', v_req.person_id,
        'rejection_reason', v_clean_reason
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Occupation request rejected.'
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Query RPC: public.get_admin_occupation_requests
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_occupation_requests(
  p_status TEXT DEFAULT 'ALL',
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'NEWEST'
)
RETURNS TABLE (
  id UUID,
  person_id UUID,
  person_name TEXT,
  family_id UUID,
  family_name TEXT,
  current_occupation TEXT,
  requested_occupation TEXT,
  submitted_by UUID,
  submitted_by_name TEXT,
  submitted_by_email TEXT,
  created_at TIMESTAMPTZ,
  status TEXT,
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewer_name TEXT,
  reviewed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.person_id,
    trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name)) AS person_name,
    r.family_id,
    COALESCE(f.family_name, 'No Family Linked') AS family_name,
    COALESCE(r.current_occupation, 'Occupation Pending') AS current_occupation,
    r.requested_occupation,
    r.submitted_by,
    COALESCE(sub_prof.display_name, split_part(sub_prof.email, '@', 1), 'User') AS submitted_by_name,
    sub_prof.email AS submitted_by_email,
    r.created_at,
    r.status,
    r.rejection_reason,
    r.reviewed_by,
    COALESCE(rev_prof.display_name, split_part(rev_prof.email, '@', 1), 'Admin') AS reviewer_name,
    r.reviewed_at
  FROM public.occupation_update_requests r
  JOIN public.persons p ON p.id = r.person_id
  LEFT JOIN public.families f ON f.id = r.family_id
  LEFT JOIN public.profiles sub_prof ON sub_prof.id = r.submitted_by
  LEFT JOIN public.profiles rev_prof ON rev_prof.id = r.reviewed_by
  WHERE (
    p_status IS NULL
    OR upper(trim(p_status)) = 'ALL'
    OR r.status = upper(trim(p_status))
  )
  AND (
    p_category IS NULL
    OR trim(p_category) = ''
    OR upper(trim(p_category)) = 'ALL'
    OR r.requested_occupation = trim(p_category)
  )
  AND (
    p_search IS NULL
    OR trim(p_search) = ''
    OR concat_ws(' ', p.first_name, p.middle_name, p.last_name) ILIKE '%' || trim(p_search) || '%'
    OR f.family_name ILIKE '%' || trim(p_search) || '%'
    OR r.id::text ILIKE '%' || trim(p_search) || '%'
    OR sub_prof.email ILIKE '%' || trim(p_search) || '%'
    OR sub_prof.display_name ILIKE '%' || trim(p_search) || '%'
  )
  ORDER BY
    CASE WHEN upper(trim(p_sort)) = 'OLDEST' THEN r.created_at END ASC,
    CASE WHEN upper(trim(p_sort)) <> 'OLDEST' THEN r.created_at END DESC;
$$;

-- -----------------------------------------------------------------------------
-- 8. Dashboard Counts RPC: public.get_occupation_request_counts
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_occupation_request_counts()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', count(*)::integer,
    'pending', count(*) FILTER (WHERE status = 'PENDING')::integer,
    'approved', count(*) FILTER (WHERE status = 'APPROVED')::integer,
    'rejected', count(*) FILTER (WHERE status = 'REJECTED')::integer
  )
  FROM public.occupation_update_requests;
$$;

-- -----------------------------------------------------------------------------
-- 9. User Tracking RPC: public.get_my_occupation_requests
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_occupation_requests(
  p_person_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  person_id UUID,
  person_name TEXT,
  current_occupation TEXT,
  requested_occupation TEXT,
  status TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.person_id,
    trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name)) AS person_name,
    COALESCE(r.current_occupation, 'Occupation Pending') AS current_occupation,
    r.requested_occupation,
    r.status,
    r.rejection_reason,
    r.created_at,
    r.reviewed_at
  FROM public.occupation_update_requests r
  JOIN public.persons p ON p.id = r.person_id
  WHERE r.submitted_by = auth.uid()
    AND (p_person_id IS NULL OR r.person_id = p_person_id)
  ORDER BY r.created_at DESC;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.is_valid_official_occupation(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.submit_occupation_update_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_occupation_update_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_occupation_update_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_occupation_requests(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_occupation_request_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_occupation_requests(UUID) TO authenticated;
