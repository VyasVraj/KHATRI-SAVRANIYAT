-- ============================================================================
-- Migration: 20261107030000_fix_birthday_notification_delivery.sql
-- Description: Fix birthday wish notification delivery to the exact birthday person.
--              Resolves recipient authenticated user ID via persons.user_id,
--              community_mukhis.linked_user_id, or matching account email in auth.users.
--              Delivers notification strictly to the recipient (never to sender or
--              arbitrary family members).
--              Handles unlinked community members gracefully without phantom notifications.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.send_birthday_greeting(
  p_recipient_person_id UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- 1. Validate authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to send birthday greetings.' USING ERRCODE = '42501';
  END IF;

  -- 2. Determine caller's authoritative role
  v_caller_role := public.get_user_authority_level(v_caller);

  -- Matrix Rule 1: Normal User is DENIED from sending birthday greetings
  -- Only Mukhis, Admins, and Super Admins may send official greetings
  IF v_caller_role = 'NORMAL_USER' THEN
    RAISE EXCEPTION 'Normal Users are not permitted to send birthday greetings. Only Mukhis, Admins, and Super Admins may send official greetings.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Lock & validate recipient person
  SELECT * INTO v_recipient_person
  FROM public.persons
  WHERE id = p_recipient_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient person record does not exist.' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Identify the authenticated account linked to that specific person
  -- Priority 1: Direct link on public.persons.user_id
  v_recipient_user_id := v_recipient_person.user_id;

  -- Priority 2: Mukhi link in public.community_mukhis
  IF v_recipient_user_id IS NULL THEN
    SELECT linked_user_id INTO v_recipient_user_id
    FROM public.community_mukhis
    WHERE (linked_person_id = p_recipient_person_id OR id::text = p_recipient_person_id::text)
      AND linked_user_id IS NOT NULL
      AND is_active = TRUE
    LIMIT 1;
  END IF;

  -- Priority 3: Registered account email match in auth.users
  IF v_recipient_user_id IS NULL AND v_recipient_person.email_contact IS NOT NULL THEN
    SELECT id INTO v_recipient_user_id
    FROM auth.users
    WHERE lower(email) = lower(trim(v_recipient_person.email_contact))
    LIMIT 1;
  END IF;

  -- 5. Rule: Self-wishes are strictly DENIED
  IF (v_recipient_person.user_id IS NOT NULL AND v_recipient_person.user_id = v_caller)
     OR (v_recipient_user_id IS NOT NULL AND v_recipient_user_id = v_caller) THEN
    RAISE EXCEPTION 'You cannot send a birthday greeting to yourself.' USING ERRCODE = '23514';
  END IF;

  -- If an authenticated account was newly resolved and persons.user_id was NULL, bridge it atomically
  IF v_recipient_person.user_id IS NULL AND v_recipient_user_id IS NOT NULL THEN
    UPDATE public.persons
    SET user_id = v_recipient_user_id, updated_at = NOW()
    WHERE id = p_recipient_person_id AND user_id IS NULL;
  END IF;

  -- 6. Retrieve sender's display name
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

  -- 7. Record birthday greeting audit log safely
  BEGIN
    PERFORM public.log_audit_event(
      'INSERT'::public.audit_action,
      'persons',
      p_recipient_person_id,
      NULL,
      jsonb_build_object(
        'sender_user_id', v_caller,
        'sender_role', v_caller_role,
        'recipient_person_id', p_recipient_person_id,
        'recipient_user_id', v_recipient_user_id,
        'message', p_message
      ),
      jsonb_build_object('action', 'SEND_BIRTHDAY_GREETING')
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 8. Recipient-specific notification delivery
  IF v_recipient_user_id IS NOT NULL THEN
    -- Check for duplicate greeting notification delivered to this recipient within the last 24 hours
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
        'recipient_linked', true,
        'notification_delivered', true,
        'already_sent', true,
        'recipient_user_id', v_recipient_user_id,
        'message', 'Birthday greeting already sent today.'
      );
    END IF;

    -- Format notification title and body per Section 3
    v_notif_title := 'Birthday Wishes!';
    IF p_message IS NOT NULL AND trim(p_message) != '' AND trim(p_message) != 'Warm birthday wishes from community leadership!' THEN
      v_notif_body := format('%s has sent you birthday wishes: "%s"', v_sender_name, trim(p_message));
    ELSE
      v_notif_body := format('%s has sent you birthday wishes.', v_sender_name);
    END IF;

    -- Insert into public.notifications strictly targeting recipient_id = v_recipient_user_id
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
        'sender_name', v_sender_name,
        'sender_role', v_caller_role,
        'recipient_person_id', p_recipient_person_id,
        'recipient_name', v_recipient_name
      )
    ) RETURNING id INTO v_notif_id;

    RETURN jsonb_build_object(
      'success', true,
      'recipient_linked', true,
      'notification_delivered', true,
      'notification_id', v_notif_id,
      'recipient_user_id', v_recipient_user_id,
      'message', 'Birthday greeting delivered to recipient.'
    );
  ELSE
    -- Section 5: Person has no linked login account
    RETURN jsonb_build_object(
      'success', true,
      'recipient_linked', false,
      'notification_delivered', false,
      'recipient_person_id', p_recipient_person_id,
      'message', 'Birthday greeting recorded. Recipient has not linked a login account yet.'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_birthday_greeting(UUID, TEXT) TO authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
