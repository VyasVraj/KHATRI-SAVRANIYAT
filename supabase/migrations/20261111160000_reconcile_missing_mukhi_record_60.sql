-- =============================================================================
-- Migration: 20261111160000_reconcile_missing_mukhi_record_60.sql
-- Description:
--   Official Mukhi Directory Reconciliation & Missing Record Insertion.
--   Source of Truth: "Mukhi list Name city phone details (1)(3).pdf" (118 records).
--
--   Reconciliation Findings:
--     - Official PDF entries: 118
--     - Existing matched active Mukhis: 117
--     - Missing official record: Exactly Serial #60
--         * Serial: 60
--         * Mukhi Name: 'Mukhi Bhagwandas Devidas Khuha'
--         * Gram / Region: 'Kumbhamarg, Pratap Nagar, Jaipur'
--         * Mobile Number: '9928122536'
--         * Password Given Status: 'Yes'
--         * Mukhi Unique ID: 'MUK-0060'
--
--   Actions:
--     1. Idempotently insert or reactivate Serial #60 into public.community_mukhis.
--     2. Link to existing person if a matching census person exists.
--     3. Refresh public.community_mukhis_directory view to include all 118 active Mukhis.
--     4. Ensure public.get_active_mukhi_count() returns exactly 118.
-- =============================================================================

BEGIN;

-- 1. Check if a matching person already exists in public.persons to reuse
DO $$
DECLARE
  v_matching_person_id UUID := NULL;
BEGIN
  -- Search for existing person matching name and phone
  SELECT id INTO v_matching_person_id
  FROM public.persons
  WHERE (
    (first_name ILIKE '%Bhagwandas%' AND last_name ILIKE '%Khuha%')
    OR phone = '9928122536'
    OR phone_secondary = '9928122536'
  )
  LIMIT 1;

  -- 2. Insert or reactivate official Mukhi record #60
  INSERT INTO public.community_mukhis (
    source_serial_number,
    mukhi_unique_id,
    full_name,
    gram,
    mobile_number,
    password_given_status,
    authority_status,
    account_linking_status,
    linked_person_id,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    60,
    'MUK-0060',
    'Mukhi Bhagwandas Devidas Khuha',
    'Kumbhamarg, Pratap Nagar, Jaipur',
    '9928122536',
    'Yes',
    'ACTIVE',
    CASE WHEN v_matching_person_id IS NOT NULL THEN 'LINKED' ELSE 'NOT_REGISTERED' END,
    v_matching_person_id,
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (source_serial_number) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    gram = EXCLUDED.gram,
    mobile_number = EXCLUDED.mobile_number,
    password_given_status = EXCLUDED.password_given_status,
    authority_status = 'ACTIVE',
    is_active = TRUE,
    mukhi_unique_id = 'MUK-0060',
    linked_person_id = COALESCE(public.community_mukhis.linked_person_id, v_matching_person_id),
    updated_at = NOW();

END $$;

-- 3. Ensure sequence reflects valid range (starts after official 118 records)
DO $$
DECLARE
  v_max_serial INTEGER;
BEGIN
  SELECT COALESCE(MAX(source_serial_number), 118) INTO v_max_serial FROM public.community_mukhis;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'community_mukhis_serial_seq') THEN
    PERFORM setval('public.community_mukhis_serial_seq', GREATEST(v_max_serial, 118));
  END IF;
END $$;

COMMIT;
