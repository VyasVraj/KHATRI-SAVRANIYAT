-- =============================================================================
-- Migration: 20261108050000_fix_birthday_rpc_user_id_error.sql
-- Description:
--   1. Resolve "column user_id does not exist" error in public.notifications:
--      In public.notifications, recipient column is recipient_id (NOT user_id),
--      and content column is body (NOT message), with category notification_category.
--   2. Enforce strict birthday-wishing role-based access:
--      - ONLY Super Admin, Admin, all authorized Mukhis, and all officially assigned Committee Members.
--      - Normal users and Family Heads without an authorized role are strictly DENIED.
--      - Prohibit sending wishes to deceased persons (date_of_death IS NOT NULL OR status = 'DECEASED').
--      - Prohibit sending wishes to oneself.
-- =============================================================================

-- 1. Authoritative Birthday Wishing Authorization Function
CREATE OR REPLACE FUNCTION public.can_user_send_birthday_wishes(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_is_authorized BOOLEAN := FALSE;
  v_person_id UUID := NULL;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Fetch user profile role
  SELECT role::text INTO v_role
  FROM public.profiles
  WHERE id = p_user_id AND is_active = TRUE;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. Super Admin & Admin
  IF v_role IN ('SUPER_ADMIN', 'ADMIN') THEN
    RETURN TRUE;
  END IF;

  -- 2. Mukhi by role
  IF v_role IN ('MUKHI', 'COMMUNITY_MUKHI') THEN
    RETURN TRUE;
  END IF;

  -- 3. Committee Member by role
  IF v_role = 'COMMITTEE_MEMBER' THEN
    RETURN TRUE;
  END IF;

  -- Find person_id linked to this user (if any)
  SELECT id INTO v_person_id
  FROM public.persons
  WHERE user_id = p_user_id AND deleted_at IS NULL
  LIMIT 1;

  -- 4. Authorized Mukhi by official community_mukhis record
  SELECT EXISTS (
    SELECT 1 FROM public.community_mukhis
    WHERE (
      linked_user_id = p_user_id
      OR (v_person_id IS NOT NULL AND linked_person_id = v_person_id)
    )
      AND is_active = TRUE
      AND authority_status = 'ACTIVE'
  ) INTO v_is_authorized;

  IF v_is_authorized THEN
    RETURN TRUE;
  END IF;

  -- 5. Officially assigned Committee Member by executive_committee_members record
  SELECT EXISTS (
    SELECT 1 FROM public.executive_committee_members
    WHERE (
      linked_user_id = p_user_id
      OR (v_person_id IS NOT NULL AND linked_person_id = v_person_id)
    )
      AND is_active = TRUE
  ) INTO v_is_authorized;

  IF v_is_authorized THEN
    RETURN TRUE;
  END IF;

  -- 6. Officially assigned Committee Member by committee group_members record
  SELECT EXISTS (
    SELECT 1 FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = p_user_id
      AND g.group_type = 'COMMITTEE'
      AND g.deleted_at IS NULL
  ) INTO v_is_authorized;

  IF v_is_authorized THEN
    RETURN TRUE;
  END IF;

  -- Normal users, Family Heads without an authorized role, etc. -> strictly FALSE
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_user_send_birthday_wishes(UUID) TO authenticated, anon;

-- 2. Helper function: Authority Level Resolver
CREATE OR REPLACE FUNCTION public.get_user_authority_level(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_is_mukhi BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'ANONYMOUS';
  END IF;

  SELECT role::text INTO v_role
  FROM public.profiles
  WHERE id = p_user_id AND is_active = TRUE;

  IF v_role = 'SUPER_ADMIN' THEN
    RETURN 'SUPER_ADMIN';
  ELSIF v_role = 'ADMIN' THEN
    RETURN 'ADMIN';
  ELSIF v_role IN ('MUKHI', 'COMMUNITY_MUKHI') THEN
    RETURN 'MUKHI';
  ELSIF v_role IN ('COMMITTEE_MEMBER') THEN
    RETURN 'COMMITTEE_MEMBER';
  END IF;

  -- Check if actively linked in community_mukhis
  SELECT EXISTS (
    SELECT 1 FROM public.community_mukhis
    WHERE (linked_user_id = p_user_id OR linked_person_id IN (
      SELECT id FROM public.persons WHERE user_id = p_user_id
    ))
      AND is_active = TRUE
      AND authority_status = 'ACTIVE'
  ) INTO v_is_mukhi;

  IF v_is_mukhi THEN
    RETURN 'MUKHI';
  END IF;

  -- Check if actively linked in executive_committee_members
  IF EXISTS (
    SELECT 1 FROM public.executive_committee_members
    WHERE (linked_user_id = p_user_id OR linked_person_id IN (
      SELECT id FROM public.persons WHERE user_id = p_user_id
    ))
      AND is_active = TRUE
  ) THEN
    RETURN 'COMMITTEE_MEMBER';
  END IF;

  RETURN 'NORMAL_USER';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_authority_level(UUID) TO authenticated, anon;

-- 3. Fixed send_birthday_greeting RPC
CREATE OR REPLACE FUNCTION public.send_birthday_greeting(
  p_recipient_person_id UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID;
  v_caller_role TEXT;
  v_recipient_person RECORD;
  v_recipient_user_id UUID := NULL;
  v_sender_name TEXT;
  v_sender_person_name TEXT;
  v_recipient_name TEXT;
  v_notif_title TEXT;
  v_notif_body TEXT;
  v_notif_id UUID := NULL;
  v_already_notified BOOLEAN := FALSE;
BEGIN
  -- Step 1: Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to send birthday greetings.' USING ERRCODE = '42501';
  END IF;

  -- Step 2: Determine caller's authoritative permission
  IF NOT public.can_user_send_birthday_wishes(v_caller) THEN
    RAISE EXCEPTION 'Only authorized community leaders (Super Admin, Admin, Mukhi, Committee Member) can send birthday wishes.'
      USING ERRCODE = '42501';
  END IF;

  v_caller_role := public.get_user_authority_level(v_caller);

  -- Step 3: Fetch & validate recipient person record
  SELECT * INTO v_recipient_person
  FROM public.persons
  WHERE id = p_recipient_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient person record does not exist.' USING ERRCODE = 'P0002';
  END IF;

  -- Step 4: Prevent sending birthday greetings to a deceased member
  IF v_recipient_person.date_of_death IS NOT NULL 
     OR v_recipient_person.status = 'DECEASED' THEN
    RAISE EXCEPTION 'Cannot send birthday greeting to a deceased person record.' USING ERRCODE = '22023';
  END IF;

  -- Step 5: Identify the authenticated account linked to the person
  v_recipient_user_id := v_recipient_person.user_id;

  IF v_recipient_user_id IS NULL THEN
    SELECT linked_user_id INTO v_recipient_user_id
    FROM public.community_mukhis
    WHERE (linked_person_id = p_recipient_person_id OR id::text = p_recipient_person_id::text)
      AND linked_user_id IS NOT NULL
      AND is_active = TRUE
    LIMIT 1;
  END IF;

  IF v_recipient_user_id IS NULL AND v_recipient_person.email_contact IS NOT NULL THEN
    SELECT id INTO v_recipient_user_id
    FROM auth.users
    WHERE lower(email) = lower(trim(v_recipient_person.email_contact))
    LIMIT 1;
  END IF;

  -- Step 6: Prevent wishing oneself
  IF (v_recipient_person.user_id IS NOT NULL AND v_recipient_person.user_id = v_caller)
     OR (v_recipient_user_id IS NOT NULL AND v_recipient_user_id = v_caller) THEN
    RAISE EXCEPTION 'You cannot send a birthday greeting to yourself.' USING ERRCODE = '23514';
  END IF;

  -- Step 7: Atomically link person record if newly discovered
  IF v_recipient_person.user_id IS NULL AND v_recipient_user_id IS NOT NULL THEN
    UPDATE public.persons
    SET user_id = v_recipient_user_id, updated_at = NOW()
    WHERE id = p_recipient_person_id AND user_id IS NULL;
  END IF;

  -- Step 8: Retrieve sender's display name
  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Community Leader')
  INTO v_sender_name
  FROM public.profiles
  WHERE id = v_caller;

  IF v_sender_name = 'Community Leader' THEN
    SELECT trim(concat_ws(' ', first_name, last_name)) INTO v_sender_person_name
    FROM public.persons
    WHERE user_id = v_caller AND deleted_at IS NULL
    LIMIT 1;

    IF v_sender_person_name IS NOT NULL AND length(v_sender_person_name) > 0 THEN
      v_sender_name := v_sender_person_name;
    END IF;
  END IF;

  v_recipient_name := trim(concat_ws(' ', v_recipient_person.first_name, v_recipient_person.last_name));

  -- Step 9: Log audit event
  BEGIN
    PERFORM public.log_audit_event(
      'INSERT'::public.audit_action,
      'persons',
      p_recipient_person_id,
      NULL,
      NULL,
      jsonb_build_object(
        'action_type', 'BIRTHDAY_GREETING_SENT',
        'sender_id', v_caller,
        'sender_role', v_caller_role,
        'sender_name', v_sender_name,
        'recipient_person_id', p_recipient_person_id,
        'recipient_user_id', v_recipient_user_id,
        'recipient_name', v_recipient_name
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Step 10: If recipient has no login account, return success
  IF v_recipient_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'delivered', false,
      'message', 'Birthday greeting recorded for ' || v_recipient_name || '. Recipient does not currently have an active login account linked.',
      'recipient_name', v_recipient_name,
      'sender_name', v_sender_name
    );
  END IF;

  -- Step 11: Prevent duplicate wishes within the last 24 hours (uses recipient_id, NOT user_id)
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE recipient_id = v_recipient_user_id
      AND actor_id = v_caller
      AND type = 'BIRTHDAY_GREETING'
      AND entity_id = p_recipient_person_id
      AND created_at >= (timezone('utc', now()) - INTERVAL '24 hours')
      AND deleted_at IS NULL
  ) INTO v_already_notified;

  IF v_already_notified THEN
    RETURN jsonb_build_object(
      'success', true,
      'delivered', true,
      'already_sent', true,
      'message', 'You have already sent a birthday greeting to ' || v_recipient_name || ' today.',
      'recipient_name', v_recipient_name,
      'sender_name', v_sender_name
    );
  END IF;

  -- Step 12: Format notification text
  v_notif_title := 'Birthday Greeting from ' || v_sender_name;
  v_notif_body := COALESCE(
    NULLIF(trim(p_message), ''),
    'Wishing you a very Happy Birthday from Shree Khatri Samaj! May the year ahead bring health, joy, and prosperity.'
  );

  -- Step 13: Insert into public.notifications using recipient_id and body (NOT user_id or message)
  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    category,
    type,
    title,
    body,
    action_url,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    v_recipient_user_id,
    v_caller,
    'COMMUNITY'::public.notification_category,
    'BIRTHDAY_GREETING',
    v_notif_title,
    v_notif_body,
    '/people/' || p_recipient_person_id::text,
    'persons',
    p_recipient_person_id,
    jsonb_build_object(
      'sub_type', 'BIRTHDAY_WISH',
      'sender_id', v_caller,
      'sender_role', v_caller_role,
      'sender_name', v_sender_name,
      'recipient_person_id', p_recipient_person_id,
      'recipient_name', v_recipient_name
    )
  )
  RETURNING id INTO v_notif_id;

  RETURN jsonb_build_object(
    'success', true,
    'delivered', true,
    'notification_id', v_notif_id,
    'message', 'Birthday greeting successfully delivered to ' || v_recipient_name || '!',
    'recipient_name', v_recipient_name,
    'sender_name', v_sender_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_birthday_greeting(UUID, TEXT) TO authenticated;
