-- =============================================================================
-- Migration: 20261121223000_fix_birthday_greeting_unique_constraint.sql
-- Description:
--   1. Fixes public.send_birthday_greeting RPC so it NEVER attempts to illegally
--      mutate public.persons.user_id when family members share a contact email.
--   2. Preserves PERSON != USER core architectural boundary (AGENTS.md Section 5).
--   3. When the recipient person is an unlinked census member (persons.user_id IS NULL),
--      it logs the audit event and optionally delivers an in-app notification to the
--      family head or creator without violating idx_persons_user_id_unique.
--   4. Grants execute to authenticated users.
--   5. Reloads PostgREST schema cache.
-- =============================================================================

BEGIN;

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
  v_family_notify_user_id UUID := NULL;
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
     OR v_recipient_person.status = 'DECEASED'
     OR COALESCE(v_recipient_person.is_deceased, FALSE) = TRUE THEN
    RAISE EXCEPTION 'Cannot send birthday greeting to a deceased person record.' USING ERRCODE = '22023';
  END IF;

  -- Step 5: Identify the authenticated account linked to the person (if already linked)
  v_recipient_user_id := v_recipient_person.user_id;

  -- If not directly linked on persons, check if the person is an active Mukhi with linked user
  IF v_recipient_user_id IS NULL THEN
    SELECT cm.linked_user_id INTO v_recipient_user_id
    FROM public.community_mukhis cm
    WHERE (cm.linked_person_id = p_recipient_person_id OR cm.id::text = p_recipient_person_id::text)
      AND cm.linked_user_id IS NOT NULL
      AND cm.is_active = TRUE
      -- Only use if that user account is NOT already linked to another person
      AND NOT EXISTS (
        SELECT 1 FROM public.persons p2 
        WHERE p2.user_id = cm.linked_user_id AND p2.id != p_recipient_person_id
      )
    LIMIT 1;
  END IF;

  -- Step 6: Prevent wishing oneself
  IF (v_recipient_person.user_id IS NOT NULL AND v_recipient_person.user_id = v_caller)
     OR (v_recipient_user_id IS NOT NULL AND v_recipient_user_id = v_caller) THEN
    RAISE EXCEPTION 'You cannot send a birthday greeting to yourself.' USING ERRCODE = '23514';
  END IF;

  -- NOTE: NEVER update public.persons.user_id here!
  -- Person records must NOT be arbitrarily linked or hijacked by shared contact emails.
  -- Profile linking is strictly handled by claiming and invitation flows.

  -- Step 7: Retrieve sender's display name
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

  -- Step 8: Log audit event safely
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

  -- Step 9: Resolve notification target user
  -- If recipient has a linked account, deliver to them directly.
  -- Otherwise, notify the family head or creator on behalf of the family member.
  IF v_recipient_user_id IS NOT NULL THEN
    v_family_notify_user_id := v_recipient_user_id;
  ELSE
    SELECT head_p.user_id INTO v_family_notify_user_id
    FROM public.family_members m
    JOIN public.family_members head_m ON head_m.family_id = m.family_id AND head_m.is_head = TRUE AND head_m.left_at IS NULL
    JOIN public.persons head_p ON head_p.id = head_m.person_id AND head_p.user_id IS NOT NULL
    WHERE m.person_id = p_recipient_person_id AND m.left_at IS NULL
    LIMIT 1;

    IF v_family_notify_user_id IS NULL THEN
      v_family_notify_user_id := v_recipient_person.created_by;
    END IF;

    -- Avoid notifying sender if sender is the family head/creator
    IF v_family_notify_user_id = v_caller THEN
      v_family_notify_user_id := NULL;
    END IF;
  END IF;

  -- If no user account is eligible for notification, return success cleanly
  IF v_family_notify_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'delivered', false,
      'recipient_linked', false,
      'notification_delivered', false,
      'message', 'Birthday greeting recorded for ' || v_recipient_name || '. Recipient has not linked a login account yet.',
      'recipient_name', v_recipient_name,
      'sender_name', v_sender_name
    );
  END IF;

  -- Step 10: Prevent duplicate wishes within the last 24 hours
  SELECT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE recipient_id = v_family_notify_user_id
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
      'recipient_linked', (v_recipient_user_id IS NOT NULL),
      'message', 'You have already sent a birthday greeting to ' || v_recipient_name || ' today.',
      'recipient_name', v_recipient_name,
      'sender_name', v_sender_name
    );
  END IF;

  -- Step 11: Format notification text
  v_notif_title := 'Birthday Greeting from ' || v_sender_name;
  IF v_recipient_user_id IS NOT NULL THEN
    v_notif_body := COALESCE(
      NULLIF(trim(p_message), ''),
      'Wishing you a very Happy Birthday from Shree Khatri Samaj! May the year ahead bring health, joy, and prosperity.'
    );
  ELSE
    v_notif_body := 'Warm birthday wishes from community leadership have been sent to ' || v_recipient_name || '!';
  END IF;

  -- Step 12: Insert into public.notifications
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
    v_family_notify_user_id,
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
      'recipient_name', v_recipient_name,
      'recipient_is_family_member', (v_recipient_user_id IS NULL)
    )
  )
  RETURNING id INTO v_notif_id;

  RETURN jsonb_build_object(
    'success', true,
    'delivered', true,
    'notification_id', v_notif_id,
    'recipient_linked', (v_recipient_user_id IS NOT NULL),
    'notification_delivered', true,
    'message', 'Birthday greeting successfully sent to ' || v_recipient_name || '!',
    'recipient_name', v_recipient_name,
    'sender_name', v_sender_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_birthday_greeting(UUID, TEXT) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
