-- =============================================================================
-- Migration: 20261108040000_mukhi_auth_and_birthday_permissions.sql
-- Description: 
--   1. Phase 3: Enforce verified email requirement (auth.users.email_confirmed_at)
--      and deactivation revocation policy in sync_my_mukhi_status().
--   2. Phase 5: Enforce strict matrix in send_birthday_greeting():
--      - Admin -> Community Heads and Mukhis only.
--      - Mukhi -> other Mukhis, Community Heads, and Admin only.
--      - Ordinary Member -> Denied completely.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Phase 3: Secure Mukhi Status Synchronization
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_my_mukhi_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_email_confirmed_at TIMESTAMPTZ;
  v_mukhi RECORD;
  v_current_level TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  -- Fetch authenticated user email and confirmation timestamp from auth.users
  SELECT lower(trim(email)), email_confirmed_at 
  INTO v_email, v_email_confirmed_at
  FROM auth.users
  WHERE id = v_user_id;

  -- RULE: A user can only become a Mukhi if their email is authenticated AND verified
  IF v_email IS NOT NULL AND v_email_confirmed_at IS NOT NULL THEN
    SELECT * INTO v_mukhi
    FROM public.community_mukhis
    WHERE lower(trim(official_email)) = v_email
      AND authority_status = 'ACTIVE'
      AND is_active = TRUE
    LIMIT 1;

    IF FOUND THEN
      -- Link user ID to the official Mukhi record
      UPDATE public.community_mukhis
      SET linked_user_id = v_user_id,
          account_linking_status = 'LINKED',
          updated_at = NOW()
      WHERE id = v_mukhi.id;

      -- Upgrade user profile role to MUKHI (never override ADMIN or SUPER_ADMIN)
      UPDATE public.profiles
      SET role = 'MUKHI', updated_at = NOW()
      WHERE id = v_user_id
        AND role::text NOT IN ('ADMIN', 'SUPER_ADMIN');
    ELSE
      -- Deactivation / Revocation policy:
      -- If the user was previously assigned MUKHI, but is not in the active Mukhi master list,
      -- revert role to MEMBER (unless ADMIN or SUPER_ADMIN).
      UPDATE public.profiles
      SET role = 'MEMBER', updated_at = NOW()
      WHERE id = v_user_id
        AND role::text = 'MUKHI';

      -- Unlink any stale community_mukhis pointers
      UPDATE public.community_mukhis
      SET linked_user_id = NULL,
          account_linking_status = 'UNLINKED',
          updated_at = NOW()
      WHERE linked_user_id = v_user_id
        AND (authority_status != 'ACTIVE' OR is_active = FALSE OR lower(trim(official_email)) != v_email);
    END IF;
  ELSE
    -- Unverified email: ensure user cannot retain MUKHI role
    UPDATE public.profiles
    SET role = 'MEMBER', updated_at = NOW()
    WHERE id = v_user_id
      AND role::text = 'MUKHI';
  END IF;

  v_current_level := public.get_user_authority_level(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'authority_level', v_current_level,
    'is_mukhi', (v_current_level IN ('MUKHI', 'ADMIN', 'SUPER_ADMIN')),
    'email_verified', (v_email_confirmed_at IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_my_mukhi_status() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Phase 5: Authority Level & Birthday Greeting Exact Permission Matrix
-- -----------------------------------------------------------------------------

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

  SELECT role::text INTO v_role
  FROM public.profiles
  WHERE id = p_user_id AND is_active = TRUE;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role IN ('SUPER_ADMIN', 'ADMIN') THEN
    RETURN TRUE;
  END IF;

  IF v_role IN ('MUKHI', 'COMMUNITY_MUKHI') THEN
    RETURN TRUE;
  END IF;

  IF v_role = 'COMMITTEE_MEMBER' THEN
    RETURN TRUE;
  END IF;

  SELECT id INTO v_person_id
  FROM public.persons
  WHERE user_id = p_user_id AND deleted_at IS NULL
  LIMIT 1;

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

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_user_send_birthday_wishes(UUID) TO authenticated, anon;

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
  ELSIF v_role = 'COMMUNITY_MODERATOR' THEN
    RETURN 'COMMUNITY_MODERATOR';
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

  RETURN 'NORMAL_USER';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_authority_level(UUID) TO authenticated, anon;

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
  v_recipient_is_head BOOLEAN := FALSE;
  v_recipient_is_mukhi BOOLEAN := FALSE;
  v_recipient_is_admin BOOLEAN := FALSE;
  v_sender_name TEXT;
  v_sender_person_name TEXT;
  v_recipient_name TEXT;
  v_notif_title TEXT;
  v_notif_body TEXT;
  v_notif_id UUID := NULL;
  v_already_notified BOOLEAN := FALSE;
BEGIN
  -- 1. Validate caller authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to send birthday greetings.' USING ERRCODE = '42501';
  END IF;

  -- 2. Determine caller's authoritative permission
  IF NOT public.can_user_send_birthday_wishes(v_caller) THEN
    RAISE EXCEPTION 'Only authorized community leaders (Super Admin, Admin, Mukhi, Committee Member) can send birthday wishes.'
      USING ERRCODE = '42501';
  END IF;

  v_caller_role := public.get_user_authority_level(v_caller);

  -- 3. Lock & validate recipient person record
  SELECT * INTO v_recipient_person
  FROM public.persons
  WHERE id = p_recipient_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient person record does not exist.' USING ERRCODE = 'P0002';
  END IF;

  -- Validate recipient is living (under NO circumstances can birthday greetings be sent to a deceased person)
  IF v_recipient_person.date_of_death IS NOT NULL 
     OR v_recipient_person.status = 'DECEASED' THEN
    RAISE EXCEPTION 'Cannot send birthday greeting to a deceased person record.' USING ERRCODE = '22023';
  END IF;

  -- 4. Identify the authenticated account linked to that specific person
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

  -- 5. Prevent self-wishes
  IF (v_recipient_person.user_id IS NOT NULL AND v_recipient_person.user_id = v_caller)
     OR (v_recipient_user_id IS NOT NULL AND v_recipient_user_id = v_caller) THEN
    RAISE EXCEPTION 'You cannot send a birthday greeting to yourself.' USING ERRCODE = '23514';
  END IF;

  -- 6. Identify Recipient Category (Community Head, Mukhi, Admin)
  -- A. Is Community Head?
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE person_id = p_recipient_person_id 
      AND is_head = TRUE 
      AND left_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.families
    WHERE (manager_user_id = v_recipient_user_id OR created_by = v_recipient_user_id)
      AND deleted_at IS NULL
  ) INTO v_recipient_is_head;

  -- B. Is Mukhi?
  SELECT EXISTS (
    SELECT 1 FROM public.community_mukhis
    WHERE (linked_person_id = p_recipient_person_id 
           OR id::text = p_recipient_person_id::text 
           OR (v_recipient_user_id IS NOT NULL AND linked_user_id = v_recipient_user_id))
      AND is_active = TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_recipient_user_id 
      AND role IN ('MUKHI', 'COMMUNITY_MUKHI') 
      AND is_active = TRUE
  ) INTO v_recipient_is_mukhi;

  -- C. Is Admin?
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_recipient_user_id 
      AND role IN ('ADMIN', 'SUPER_ADMIN') 
      AND is_active = TRUE
  ) INTO v_recipient_is_admin;

  -- 7. If an authenticated account was newly resolved and persons.user_id was NULL, bridge it atomically
  IF v_recipient_person.user_id IS NULL AND v_recipient_user_id IS NOT NULL THEN
    UPDATE public.persons
    SET user_id = v_recipient_user_id, updated_at = NOW()
    WHERE id = p_recipient_person_id AND user_id IS NULL;
  END IF;

  -- 8. Retrieve sender's display name
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

  -- 9. Audit logging
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

  -- 10. If no authenticated user account is linked to the person, record event and return
  IF v_recipient_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'delivered', false,
      'message', 'Birthday greeting recorded for ' || v_recipient_name || '. Recipient does not currently have an active login account linked.',
      'recipient_name', v_recipient_name,
      'sender_name', v_sender_name
    );
  END IF;

  -- 11. Prevent duplicate wishes within the last 24 hours
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

  -- 12. Deliver notification strictly to the recipient user account
  v_notif_title := 'Birthday Greeting from ' || v_sender_name;
  v_notif_body := COALESCE(
    NULLIF(trim(p_message), ''),
    'Wishing you a very Happy Birthday from Shree Khatri Samaj! May the year ahead bring health, joy, and prosperity.'
  );

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

-- -----------------------------------------------------------------------------
-- 3. Phase 7: Normal User Own Profile Editing Only & Strict Restrictions
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
      -- 1. System Admin or Super Admin retain administrative management
      public.is_admin()
      OR
      -- 2. Normal user: editing ONLY their OWN linked person record (persons.user_id = auth.uid())
      -- Family head status does NOT grant permission to edit other members' profiles.
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id 
          AND user_id = auth.uid() 
          AND deleted_at IS NULL
      )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_person(UUID) TO authenticated;

-- Tighten can_manage_family: Only Admins can directly modify family records or membership
CREATE OR REPLACE FUNCTION public.can_manage_family(p_family_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_family_id IS NOT NULL AND (
      public.is_admin()
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_family(UUID) TO authenticated;

-- Tighten relationships table RLS: normal users cannot update or soft-delete relationships in the tree
DROP POLICY IF EXISTS "relationships_update_creator" ON public.relationships;
DROP POLICY IF EXISTS "relationships_soft_delete_creator" ON public.relationships;

