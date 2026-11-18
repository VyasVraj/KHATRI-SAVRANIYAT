-- =============================================================================
-- Migration: 20261108030000_audit_remediation_and_security_hardening.sql
-- Description: Comprehensive resolution of audit findings:
--   1. ISS-RBAC-001: Ensure 'MUKHI' role is supported in public.user_role enum
--   2. ISS-SEC-001: Restrict direct SELECT on public.persons to owner, same-family,
--                   creator, and admin. Public/anon reads route strictly through
--                   the secure security-barrier view public.community_persons.
--   3. ISS-SEC-002: Secure public.community_mukhis table by restricting direct
--                   SELECT to admins; update public.community_mukhis_directory
--                   view to exclude internal admin tracking columns and grant
--                   read access to authenticated and anon.
--   4. ISS-DATA-001: Create public.community_birthdays security-barrier view
--                   providing birth_day and birth_month without exposing birth year
--                   to unauthorized users, strictly excluding deceased persons.
--   5. ISS-RPC-001: Enforce living-person validation in send_birthday_greeting RPC
--                   (rejecting greetings for persons where date_of_death IS NOT NULL).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ISS-RBAC-001: Enum Support for MUKHI
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'MUKHI';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. ISS-SEC-001: Person Table Personal Information Security
-- -----------------------------------------------------------------------------

-- Revoke all table-level access from anon on public.persons
REVOKE ALL ON TABLE public.persons FROM anon, PUBLIC;

-- Drop wide public and community SELECT policies on public.persons that bypassed view masking
DROP POLICY IF EXISTS "persons_select_public" ON public.persons;
DROP POLICY IF EXISTS "persons_select_community" ON public.persons;
DROP POLICY IF EXISTS "persons_select_connections" ON public.persons;
DROP POLICY IF EXISTS "persons_select_own" ON public.persons;
DROP POLICY IF EXISTS "persons_select_admin" ON public.persons;
DROP POLICY IF EXISTS "persons_select_creator" ON public.persons;
DROP POLICY IF EXISTS "persons_select_same_family" ON public.persons;

-- Create hardened RLS policies on public.persons:
-- Only owner, creator, same-family member, or admin can select directly from public.persons table.
-- All other community/public reading is enforced through public.community_persons view.

-- 2a. Self / Owner access
CREATE POLICY "persons_select_own"
  ON public.persons
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND deleted_at IS NULL
  );

-- 2b. Record Creator & Family Creator access
CREATE POLICY "persons_select_creator"
  ON public.persons
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      created_by = auth.uid()
      OR public.is_person_in_my_created_family(persons.id)
    )
    AND deleted_at IS NULL
  );

-- 2c. Same Family Member access
CREATE POLICY "persons_select_same_family"
  ON public.persons
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND public.is_same_family_member(persons.id)
    AND deleted_at IS NULL
  );

-- 2d. Administrator & Community Moderator access
CREATE POLICY "persons_select_admin"
  ON public.persons
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR public.is_community_moderator()
  );

-- Table privileges for authenticated users (strictly governed by the 4 RLS policies above)
GRANT SELECT, INSERT, UPDATE ON TABLE public.persons TO authenticated;

-- Ensure public.community_persons security barrier view is accessible
GRANT SELECT ON public.community_persons TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 3. ISS-SEC-002: Mukhi Directory Internal Data Security
-- -----------------------------------------------------------------------------

-- Drop permissive public policy on public.community_mukhis table
DROP POLICY IF EXISTS "community_mukhis_select_all" ON public.community_mukhis;
DROP POLICY IF EXISTS "community_mukhis_select_authenticated" ON public.community_mukhis;
DROP POLICY IF EXISTS "community_mukhis_select_admin" ON public.community_mukhis;

-- Restrict direct table SELECT on public.community_mukhis to Platform Admins & Moderators
CREATE POLICY "community_mukhis_select_admin"
  ON public.community_mukhis
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR public.is_community_moderator()
  );

REVOKE SELECT ON TABLE public.community_mukhis FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.community_mukhis TO authenticated;

-- Recreate public.community_mukhis_directory view with ONLY approved public fields
-- Excludes: password_given_status, form_received_status, online_updated_status, official_email
DROP VIEW IF EXISTS public.community_mukhis_directory CASCADE;

CREATE VIEW public.community_mukhis_directory AS
SELECT
  id,
  source_serial_number,
  full_name,
  gram,
  mobile_number,
  gotra,
  nukh,
  mukhi_unique_id,
  authority_status,
  account_linking_status,
  linked_user_id,
  linked_person_id,
  is_active,
  created_at,
  updated_at
FROM public.community_mukhis
WHERE is_active = TRUE;

COMMENT ON VIEW public.community_mukhis_directory IS
  'Public-safe directory view of official community Mukhis. Omits internal onboarding flags and email.';

GRANT SELECT ON public.community_mukhis_directory TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. ISS-DATA-001: Community Birthdays Secure View
-- -----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.community_birthdays CASCADE;

CREATE OR REPLACE VIEW public.community_birthdays
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.avatar_url,
  EXTRACT(DAY FROM p.date_of_birth)::INTEGER AS birth_day,
  EXTRACT(MONTH FROM p.date_of_birth)::INTEGER AS birth_month,
  -- Full date of birth is masked to NULL for non-family members to protect privacy
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,
  p.dob_privacy,
  p.profile_privacy,
  p.status,
  p.date_of_death,
  p.user_id,
  p.created_by,
  p.deleted_at
FROM public.persons p
WHERE p.deleted_at IS NULL
  AND p.status != 'DECEASED'
  AND p.date_of_death IS NULL
  AND p.date_of_birth IS NOT NULL
  AND (
    -- Authenticated community members see COMMUNITY & PUBLIC birthdays
    (auth.uid() IS NOT NULL AND p.dob_privacy IN ('COMMUNITY', 'PUBLIC'))
    -- Public visitors see PUBLIC birthdays
    OR p.dob_privacy = 'PUBLIC'
    -- Record owner & creator see their own record
    OR (auth.uid() IS NOT NULL AND (p.user_id = auth.uid() OR p.created_by = auth.uid()))
    -- Family members see their family records
    OR public.is_same_family_member(p.id)
    -- Administrators and Mukhis see all community birthdays
    OR public.is_admin()
    OR public.is_community_moderator()
  );

COMMENT ON VIEW public.community_birthdays IS
  'Security barrier view for community birthday celebrations. Conceals birth year and strictly excludes deceased individuals.';

GRANT SELECT ON public.community_birthdays TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5. ISS-RPC-001: Birthday Greeting Deceased Person Validation
-- -----------------------------------------------------------------------------

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

  -- 3b. ISS-RPC-001: Validate person is living (strictly deny greetings for deceased persons)
  IF v_recipient_person.date_of_death IS NOT NULL OR v_recipient_person.status = 'DECEASED' THEN
    RAISE EXCEPTION 'Cannot send birthday greeting to a deceased person record.' USING ERRCODE = '22023';
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
      NULL,
      jsonb_build_object(
        'action_type', 'BIRTHDAY_GREETING_SENT',
        'sender_id', v_caller,
        'sender_name', v_sender_name,
        'recipient_person_id', p_recipient_person_id,
        'recipient_user_id', v_recipient_user_id,
        'message_length', length(COALESCE(p_message, ''))
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Non-blocking audit failure
  END;

  -- 8. If no authenticated user account is linked to the person, record successful event and return
  IF v_recipient_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'delivered', false,
      'message', 'Birthday greeting recorded for ' || v_recipient_name || '. Recipient does not currently have an active login account linked.',
      'recipient_name', v_recipient_name,
      'sender_name', v_sender_name
    );
  END IF;

  -- 9. Check if already greeted today to prevent spamming
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

  -- 10. Deliver notification strictly to the recipient user account
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
    'recipient_user_id', v_recipient_user_id,
    'recipient_name', v_recipient_name,
    'sender_name', v_sender_name,
    'message', 'Birthday greeting successfully sent to ' || v_recipient_name || '.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_birthday_greeting(UUID, TEXT) TO authenticated;

COMMIT;
