-- =============================================================================
-- Migration: 20261106070000_mukhi_gotra_nukh_and_serial_seq.sql
-- Description: Add Gotra and Nukh fields to community_mukhis, fix directory view,
--              enable auto-incrementing source_serial_number, and ensure
--              admin_upsert_community_mukhi and send_birthday_greeting RPCs exist.
-- =============================================================================

BEGIN;

-- 1. Add Gotra and Nukh columns to community_mukhis
ALTER TABLE public.community_mukhis
  ADD COLUMN IF NOT EXISTS gotra TEXT,
  ADD COLUMN IF NOT EXISTS nukh TEXT;

CREATE INDEX IF NOT EXISTS idx_community_mukhis_gotra ON public.community_mukhis(gotra);
CREATE INDEX IF NOT EXISTS idx_community_mukhis_nukh ON public.community_mukhis(nukh);

-- 2. Sequence for source_serial_number for new Mukhis (defaults starting after official 118 records)
DO $$
DECLARE
  v_max_serial INTEGER;
BEGIN
  SELECT COALESCE(MAX(source_serial_number), 118) INTO v_max_serial FROM public.community_mukhis;
  CREATE SEQUENCE IF NOT EXISTS public.community_mukhis_serial_seq START WITH 119;
  PERFORM setval('public.community_mukhis_serial_seq', GREATEST(v_max_serial, 118));
  ALTER TABLE public.community_mukhis
    ALTER COLUMN source_serial_number
    SET DEFAULT nextval('public.community_mukhis_serial_seq');
END $$;

-- 3. Update public directory view to include gotra and nukh
-- Note: Must DROP VIEW CASCADE to avoid PostgreSQL error 42P16 when columns change
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
  official_email,
  authority_status,
  account_linking_status,
  linked_user_id,
  linked_person_id,
  is_active,
  created_at,
  updated_at
FROM public.community_mukhis
WHERE is_active = TRUE;

GRANT SELECT ON public.community_mukhis_directory TO authenticated, anon;

-- 4. Admin RPC to atomically upsert Community Mukhis with Gotra and Nukh
CREATE OR REPLACE FUNCTION public.admin_upsert_community_mukhi(
  p_id UUID DEFAULT NULL,
  p_full_name TEXT DEFAULT '',
  p_gram TEXT DEFAULT '',
  p_mobile_number TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_official_email TEXT DEFAULT NULL,
  p_authority_status TEXT DEFAULT 'ACTIVE',
  p_linked_person_id UUID DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS public.community_mukhis
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mukhi public.community_mukhis;
  v_serial INTEGER;
  v_unique_id TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Only ADMIN or SUPER_ADMIN can manage official community Mukhis';
  END IF;

  IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
    RAISE EXCEPTION 'Mukhi full name is mandatory';
  END IF;

  IF p_gram IS NULL OR trim(p_gram) = '' THEN
    RAISE EXCEPTION 'Region / Gram / City is mandatory';
  END IF;

  IF p_id IS NOT NULL THEN
    -- Update existing Mukhi
    UPDATE public.community_mukhis
    SET
      full_name = trim(p_full_name),
      gram = trim(p_gram),
      mobile_number = NULLIF(trim(COALESCE(p_mobile_number, '')), ''),
      gotra = NULLIF(trim(COALESCE(p_gotra, '')), ''),
      nukh = NULLIF(trim(COALESCE(p_nukh, '')), ''),
      official_email = NULLIF(trim(COALESCE(p_official_email, '')), ''),
      authority_status = COALESCE(p_authority_status, authority_status),
      linked_person_id = COALESCE(p_linked_person_id, linked_person_id),
      is_active = p_is_active,
      updated_at = NOW()
    WHERE id = p_id
    RETURNING * INTO v_mukhi;
  ELSE
    -- Calculate next serial number if not present
    SELECT COALESCE(MAX(source_serial_number), 118) + 1 INTO v_serial FROM public.community_mukhis;
    v_unique_id := 'MUK-' || LPAD(v_serial::TEXT, 4, '0');

    INSERT INTO public.community_mukhis (
      source_serial_number,
      mukhi_unique_id,
      full_name,
      gram,
      mobile_number,
      gotra,
      nukh,
      official_email,
      authority_status,
      account_linking_status,
      linked_person_id,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      v_serial,
      v_unique_id,
      trim(p_full_name),
      trim(p_gram),
      NULLIF(trim(COALESCE(p_mobile_number, '')), ''),
      NULLIF(trim(COALESCE(p_gotra, '')), ''),
      NULLIF(trim(COALESCE(p_nukh, '')), ''),
      NULLIF(trim(COALESCE(p_official_email, '')), ''),
      COALESCE(p_authority_status, 'ACTIVE'),
      CASE WHEN p_linked_person_id IS NOT NULL THEN 'LINKED' ELSE 'NOT_REGISTERED' END,
      p_linked_person_id,
      p_is_active,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_mukhi;
  END IF;

  RETURN v_mukhi;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_community_mukhi TO authenticated;

-- 5. User Authority Level Helper (required for birthday greetings & role checking)
CREATE OR REPLACE FUNCTION public.get_user_authority_level(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
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

-- 6. Restricted Birthday Greeting RPC (send_birthday_greeting)
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
  v_is_recipient_mukhi BOOLEAN := FALSE;
  v_is_recipient_community_head BOOLEAN := FALSE;
BEGIN
  -- 1. Validate authentication
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to send birthday greetings.' USING ERRCODE = '42501';
  END IF;

  -- 2. Determine caller's authoritative role
  v_caller_role := public.get_user_authority_level(v_caller);

  -- Matrix Rule 1: Normal User is DENIED from sending birthday greetings
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

  -- Rule: Self-wishes are DENIED
  IF v_recipient_person.user_id = v_caller THEN
    RAISE EXCEPTION 'You cannot send a birthday greeting to yourself.' USING ERRCODE = '23514';
  END IF;

  -- 4. Check if recipient is a Mukhi
  SELECT EXISTS (
    SELECT 1 FROM public.community_mukhis
    WHERE (linked_person_id = p_recipient_person_id OR (linked_user_id IS NOT NULL AND linked_user_id = v_recipient_person.user_id))
      AND authority_status = 'ACTIVE'
      AND is_active = TRUE
  ) INTO v_is_recipient_mukhi;

  -- 5. Check if recipient is a Community Head (e.g. Panchayat / Committee head / Executive committee member)
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE person_id = p_recipient_person_id AND is_head = TRUE AND left_at IS NULL
  ) INTO v_is_recipient_community_head;

  -- Matrix Rule 2: Allowed ONLY for other Mukhis and Community Heads
  IF NOT (v_is_recipient_mukhi OR v_is_recipient_community_head) THEN
    RAISE EXCEPTION 'Birthday greetings can only be sent to Mukhis and Community Heads.'
      USING ERRCODE = '42501';
  END IF;

  -- 6. Send notification if recipient has a linked account
  IF v_recipient_person.user_id IS NOT NULL THEN
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
      v_recipient_person.user_id,
      v_caller,
      'COMMUNITY'::public.notification_category,
      'BIRTHDAY_GREETING',
      'Warm Birthday Wishes!',
      COALESCE(trim(p_message), 'Wishing you a very happy birthday filled with health, joy, and prosperity from the Community Leadership!'),
      '/people/' || p_recipient_person_id::text,
      'persons',
      p_recipient_person_id,
      jsonb_build_object(
        'sender_role', v_caller_role,
        'recipient_person_id', p_recipient_person_id
      )
    );
  END IF;

  -- 7. Record audit log safely
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
        'message', p_message
      ),
      jsonb_build_object('action', 'SEND_BIRTHDAY_GREETING')
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Birthday greeting sent successfully.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_birthday_greeting(UUID, TEXT) TO authenticated;

-- 7. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

COMMIT;
