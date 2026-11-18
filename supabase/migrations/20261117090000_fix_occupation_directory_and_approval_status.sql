-- =============================================================================
-- Migration: 20261117090000_fix_occupation_directory_and_approval_status.sql
-- Description:
--   1. Ensures is_deceased column exists safely on public.persons and synchronizes it.
--   2. Updates register_complete_family() RPC to persist selected occupation for
--      family head and all family members on family creation.
--   3. Recreates get_public_occupation_directory() RPC and public_occupation_directory view:
--      - Left-joins latest occupation_update_requests.
--      - Correctly maps approved, pending, rejected, and unprovided occupation statuses.
--      - Filters deceased members without schema dependencies.
--      - Granted to authenticated and anon with SECURITY DEFINER.
--   4. Updates public.community_persons view to include occupation and is_deceased.
--   5. Reloads PostgREST schema cache.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure is_deceased column exists on public.persons
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.persons
SET is_deceased = TRUE
WHERE (date_of_death IS NOT NULL OR status = 'DECEASED') AND is_deceased IS NOT TRUE;

-- -----------------------------------------------------------------------------
-- 2. Update register_complete_family() to persist occupation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_complete_family(
  p_family JSONB,
  p_head JSONB,
  p_members JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_has_linked_person BOOLEAN;
  v_family_id UUID;
  v_head_person_id UUID;
  v_head_user_id UUID;
  v_member_person_id UUID;
  v_member_record JSONB;
  v_member_count INT := 0;

  -- Family variables
  v_family_name TEXT;
  v_mukhi_id UUID;
  v_family_city TEXT;
  v_family_state TEXT;
  v_family_country TEXT;
  v_family_gotra TEXT;
  v_family_nukh TEXT;
  v_gotra_id UUID;
  v_nukh_id UUID;

  -- Head variables
  v_head_is_existing BOOLEAN;
  v_head_first_name TEXT;
  v_head_middle_name TEXT;
  v_head_last_name TEXT;
  v_head_gender_str TEXT;
  v_head_blood_group TEXT;
  v_head_birth_place TEXT;
  v_head_dob_str TEXT;
  v_head_dob DATE;
  v_head_dod_str TEXT;
  v_head_dod DATE;
  v_head_city TEXT;
  v_head_state TEXT;
  v_head_country TEXT;
  v_head_gotra TEXT;
  v_head_nukh TEXT;
  v_head_occupation TEXT;
  v_head_phone TEXT;
  v_head_email TEXT;

  -- Member variables
  v_member_is_existing BOOLEAN;
  v_member_rel TEXT;
  v_member_role_str TEXT;
  v_member_role public.family_role;
  v_m_first TEXT;
  v_m_middle TEXT;
  v_m_last TEXT;
  v_m_gender TEXT;
  v_m_blood_group TEXT;
  v_m_birth_place TEXT;
  v_m_dob_str TEXT;
  v_m_dob DATE;
  v_m_dod_str TEXT;
  v_m_dod DATE;
  v_m_city TEXT;
  v_m_state TEXT;
  v_m_country TEXT;
  v_m_gotra TEXT;
  v_m_nukh TEXT;
  v_m_occupation TEXT;
  v_m_phone TEXT;
  v_m_email TEXT;
BEGIN
  -- 1. Authentication Check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: A valid session is required to register a family.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: User account is inactive, suspended, or does not exist.' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Family Details
  IF p_family IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Family details are required.' USING ERRCODE = '22023';
  END IF;

  v_family_name := NULLIF(trim(p_family->>'family_name'), '');
  IF v_family_name IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Family name is required.' USING ERRCODE = '22023';
  END IF;

  IF p_family->>'selected_mukhi_id' IS NULL OR trim(p_family->>'selected_mukhi_id') = '' THEN
    RAISE EXCEPTION 'INVALID_MUKHI: Mukhi must be selected from the approved 118 Mukhi records.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_mukhi_id := (p_family->>'selected_mukhi_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_MUKHI: Invalid Mukhi identifier format.' USING ERRCODE = '22023';
  END;

  IF NOT EXISTS (SELECT 1 FROM public.community_mukhis WHERE id = v_mukhi_id) THEN
    RAISE EXCEPTION 'INVALID_MUKHI: Mukhi must be selected from the approved master list.' USING ERRCODE = '22023';
  END IF;

  v_family_city := NULLIF(trim(p_family->>'city'), '');
  IF v_family_city IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: City / Gaon is required.' USING ERRCODE = '22023';
  END IF;

  v_family_state := NULLIF(trim(p_family->>'state'), '');
  IF v_family_state IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: State / Province is required.' USING ERRCODE = '22023';
  END IF;

  v_family_country := COALESCE(NULLIF(trim(p_family->>'country'), ''), 'India');

  v_family_gotra := NULLIF(trim(p_family->>'gotra'), '');
  IF v_family_gotra IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Gotra is required.' USING ERRCODE = '22023';
  END IF;

  v_family_nukh := NULLIF(trim(p_family->>'nukh'), '');
  IF v_family_nukh IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Nukh is required.' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_gotra_id
  FROM public.gotras
  WHERE lower(trim(name)) = lower(trim(v_family_gotra))
     OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(v_family_gotra, ' (', 1)))
  LIMIT 1;

  IF v_gotra_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_GOTRA: "%" is not an approved Gotra.', v_family_gotra USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_nukh_id
  FROM public.nukhs
  WHERE lower(trim(name)) = lower(trim(v_family_nukh))
     OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(v_family_nukh, ' (', 1)))
  LIMIT 1;

  IF v_nukh_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_NUKH: "%" is not an approved Nukh.', v_family_nukh USING ERRCODE = '22023';
  END IF;

  -- 3. Resolve Head of Family
  v_head_is_existing := COALESCE((p_head->>'is_existing')::BOOLEAN, FALSE);

  IF v_head_is_existing OR (p_head ? 'person_id' AND NULLIF(trim(p_head->>'person_id'), '') IS NOT NULL) THEN
    BEGIN
      v_head_person_id := (p_head->>'person_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid person_id for Head: %', p_head->>'person_id' USING ERRCODE = '22023';
    END;

    IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = v_head_person_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'NOT_FOUND: Head person record does not exist: %', v_head_person_id USING ERRCODE = 'P0002';
    END IF;

    SELECT phone, email_contact, city, state, country
    INTO v_head_phone, v_head_email, v_head_city, v_head_state, v_head_country
    FROM public.persons WHERE id = v_head_person_id;
  ELSE
    -- Mandatory fields for new Head
    v_head_first_name := NULLIF(trim(p_head->>'first_name'), '');
    v_head_middle_name := NULLIF(trim(p_head->>'middle_name'), '');
    v_head_last_name := NULLIF(trim(p_head->>'last_name'), '');
    v_head_gender_str := NULLIF(trim(p_head->>'gender'), '');
    v_head_blood_group := NULLIF(trim(p_head->>'blood_group'), '');
    v_head_birth_place := COALESCE(NULLIF(trim(p_head->>'birth_place'), ''), NULLIF(trim(p_head->>'city'), ''), v_family_city);
    v_head_dob_str := NULLIF(trim(p_head->>'date_of_birth'), '');
    v_head_city := COALESCE(NULLIF(trim(p_head->>'city'), ''), v_family_city);
    v_head_state := COALESCE(NULLIF(trim(p_head->>'state'), ''), v_family_state);
    v_head_country := COALESCE(NULLIF(trim(p_head->>'country'), ''), v_family_country);
    v_head_gotra := COALESCE(NULLIF(trim(p_head->>'gotra'), ''), v_family_gotra);
    v_head_nukh := COALESCE(NULLIF(trim(p_head->>'nukh'), ''), v_family_nukh);
    v_head_occupation := NULLIF(trim(p_head->>'occupation'), '');
    v_head_phone := NULLIF(trim(p_head->>'phone'), '');
    v_head_email := NULLIF(trim(COALESCE(p_head->>'email', p_head->>'email_contact')), '');

    IF v_head_first_name IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head First Name is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_last_name IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Last Name is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_gender_str IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Gender is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_blood_group IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Blood Group is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_birth_place IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Birthplace is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_dob_str IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Date of Birth is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_city IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head City is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_state IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head State is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_gotra IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Gotra is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_nukh IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Nukh is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_phone IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Phone Number is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_email IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Email Address is required.' USING ERRCODE = '22023'; END IF;

    BEGIN
      v_head_dob := v_head_dob_str::DATE;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for Head date of birth.' USING ERRCODE = '22023';
    END;

    IF v_head_dob > CURRENT_DATE THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Head Date of Birth cannot be in the future.' USING ERRCODE = '22023';
    END IF;

    v_head_dod_str := NULLIF(trim(p_head->>'date_of_death'), '');
    IF v_head_dod_str IS NOT NULL THEN
      BEGIN
        v_head_dod := v_head_dod_str::DATE;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for Head date of death.' USING ERRCODE = '22023';
      END;

      IF v_head_dod < v_head_dob THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Death cannot be earlier than Date of Birth for Head.' USING ERRCODE = '22023';
      END IF;
    ELSE
      v_head_dod := NULL;
    END IF;

    -- PERSON != USER Enforcement
    SELECT EXISTS (
      SELECT 1 FROM public.persons
      WHERE user_id = v_caller_id
        AND deleted_at IS NULL
    ) INTO v_caller_has_linked_person;

    IF NOT v_caller_has_linked_person AND COALESCE((p_head->>'link_to_user')::BOOLEAN, FALSE) THEN
      v_head_user_id := v_caller_id;
    ELSE
      v_head_user_id := NULL;
    END IF;

    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      date_of_death,
      is_deceased,
      birth_place,
      city,
      state,
      country,
      gotra,
      nukh,
      occupation,
      phone,
      phone_secondary,
      email_contact,
      blood_group,
      blood_group_consent,
      kul,
      profile_privacy,
      contact_privacy,
      dob_privacy,
      created_by,
      user_id
    ) VALUES (
      v_head_first_name,
      v_head_middle_name,
      v_head_last_name,
      NULLIF(trim(p_head->>'maiden_name'), ''),
      v_head_gender_str::public.gender,
      v_head_dob,
      v_head_dod,
      (v_head_dod IS NOT NULL),
      v_head_birth_place,
      v_head_city,
      v_head_state,
      v_head_country,
      v_head_gotra,
      v_head_nukh,
      COALESCE(v_head_occupation, 'Occupation Pending'),
      v_head_phone,
      NULLIF(trim(p_head->>'phone_secondary'), ''),
      v_head_email,
      v_head_blood_group,
      COALESCE((p_head->>'blood_group_consent')::BOOLEAN, FALSE),
      NULLIF(trim(p_head->>'kul'), ''),
      'COMMUNITY',
      'PRIVATE',
      'PRIVATE',
      v_caller_id,
      v_head_user_id
    ) RETURNING id INTO v_head_person_id;
  END IF;

  -- 4. Create Family Record
  INSERT INTO public.families (
    family_name,
    selected_mukhi_id,
    city,
    state,
    country,
    gotra,
    nukh,
    kul,
    description,
    created_by
  ) VALUES (
    v_family_name,
    v_mukhi_id,
    v_family_city,
    v_family_state,
    v_family_country,
    v_family_gotra,
    v_family_nukh,
    NULLIF(trim(p_family->>'kul'), ''),
    NULLIF(trim(p_family->>'description'), ''),
    v_caller_id
  ) RETURNING id INTO v_family_id;

  -- 5. Add Head as Family Member
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    relationship_to_head,
    is_head
  ) VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    'Self (Family Head)',
    TRUE
  );

  v_member_count := 1;

  -- 6. Process Additional Family Members
  IF p_members IS NOT NULL AND jsonb_typeof(p_members) = 'array' THEN
    FOR v_member_record IN SELECT * FROM jsonb_array_elements(p_members)
    LOOP
      v_member_rel := COALESCE(NULLIF(trim(v_member_record->>'relationship_to_head'), ''), 'Other');
      v_member_role_str := upper(trim(COALESCE(v_member_record->>'role', '')));

      CASE
        WHEN v_member_role_str = 'SPOUSE' OR v_member_role_str LIKE '%WIFE%' OR v_member_role_str LIKE '%HUSBAND%' THEN
          v_member_role := 'SPOUSE'::public.family_role;
        WHEN v_member_role_str = 'CHILD' OR v_member_role_str LIKE '%SON%' OR v_member_role_str LIKE '%DAUGHTER%' THEN
          v_member_role := 'CHILD'::public.family_role;
        WHEN v_member_role_str = 'PARENT' OR v_member_role_str LIKE '%FATHER%' OR v_member_role_str LIKE '%MOTHER%' THEN
          v_member_role := 'PARENT'::public.family_role;
        WHEN v_member_role_str = 'SIBLING' OR v_member_role_str LIKE '%BROTHER%' OR v_member_role_str LIKE '%SISTER%' THEN
          v_member_role := 'SIBLING'::public.family_role;
        WHEN v_member_role_str LIKE '%GRANDFATHER%' OR v_member_role_str LIKE '%GRANDMOTHER%' OR v_member_role_str LIKE '%GRANDPARENT%' OR v_member_role_str = 'ANCESTOR' THEN
          v_member_role := 'GRANDPARENT'::public.family_role;
        WHEN v_member_role_str LIKE '%GRANDSON%' OR v_member_role_str LIKE '%GRANDDAUGHTER%' OR v_member_role_str LIKE '%GRANDCHILD%' OR v_member_role_str = 'DESCENDANT' THEN
          v_member_role := 'GRANDCHILD'::public.family_role;
        WHEN v_member_role_str = 'HEAD' THEN
          v_member_role := 'HEAD'::public.family_role;
        ELSE
          v_member_role := 'EXTENDED'::public.family_role;
      END CASE;

      v_member_is_existing := COALESCE((v_member_record->>'is_existing')::BOOLEAN, FALSE);

      IF v_member_is_existing OR (v_member_record ? 'person_id' AND NULLIF(trim(v_member_record->>'person_id'), '') IS NOT NULL) THEN
        BEGIN
          v_member_person_id := (v_member_record->>'person_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid person_id for member (%): %', v_member_rel, v_member_record->>'person_id' USING ERRCODE = '22023';
        END;

        IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = v_member_person_id AND deleted_at IS NULL) THEN
          RAISE EXCEPTION 'NOT_FOUND: Member person record does not exist: %', v_member_person_id USING ERRCODE = 'P0002';
        END IF;
      ELSE
        -- Mandatory fields for member
        v_m_first := NULLIF(trim(v_member_record->>'first_name'), '');
        v_m_middle := NULLIF(trim(v_member_record->>'middle_name'), '');
        v_m_last := NULLIF(trim(v_member_record->>'last_name'), '');
        v_m_gender := NULLIF(trim(v_member_record->>'gender'), '');
        v_m_blood_group := NULLIF(trim(v_member_record->>'blood_group'), '');
        v_m_birth_place := COALESCE(NULLIF(trim(v_member_record->>'birth_place'), ''), NULLIF(trim(v_member_record->>'city'), ''), v_family_city);
        v_m_dob_str := NULLIF(trim(v_member_record->>'date_of_birth'), '');
        v_m_city := COALESCE(NULLIF(trim(v_member_record->>'city'), ''), v_family_city);
        v_m_state := COALESCE(NULLIF(trim(v_member_record->>'state'), ''), v_family_state);
        v_m_country := COALESCE(NULLIF(trim(v_member_record->>'country'), ''), v_family_country);
        v_m_gotra := COALESCE(NULLIF(trim(v_member_record->>'gotra'), ''), v_family_gotra);
        v_m_nukh := COALESCE(NULLIF(trim(v_member_record->>'nukh'), ''), v_family_nukh);
        v_m_occupation := NULLIF(trim(v_member_record->>'occupation'), '');
        v_m_phone := COALESCE(NULLIF(trim(v_member_record->>'phone'), ''), v_head_phone);
        v_m_email := COALESCE(NULLIF(trim(COALESCE(v_member_record->>'email', v_member_record->>'email_contact')), ''), v_head_email);

        IF v_m_first IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: First Name is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_last IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Last Name is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_gender IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gender is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_blood_group IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Blood Group is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_birth_place IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Birthplace is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_dob_str IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Birth is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_gotra IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gotra is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_nukh IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Nukh is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_phone IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Phone Number is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_email IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Email Address is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;

        BEGIN
          v_m_dob := v_m_dob_str::DATE;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for member (%) date of birth.', v_member_rel USING ERRCODE = '22023';
        END;

        IF v_m_dob > CURRENT_DATE THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Birth cannot be in the future for member: %', v_member_rel USING ERRCODE = '22023';
        END IF;

        v_m_dod_str := NULLIF(trim(v_member_record->>'date_of_death'), '');
        IF v_m_dod_str IS NOT NULL THEN
          BEGIN
            v_m_dod := v_m_dod_str::DATE;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for member (%) date of death.', v_member_rel USING ERRCODE = '22023';
          END;

          IF v_m_dod < v_m_dob THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Death cannot be earlier than Date of Birth for member: %', v_member_rel USING ERRCODE = '22023';
          END IF;
        ELSE
          v_m_dod := NULL;
        END IF;

        INSERT INTO public.persons (
          first_name,
          middle_name,
          last_name,
          maiden_name,
          gender,
          date_of_birth,
          date_of_death,
          is_deceased,
          birth_place,
          city,
          state,
          country,
          gotra,
          nukh,
          occupation,
          phone,
          phone_secondary,
          email_contact,
          blood_group,
          blood_group_consent,
          kul,
          profile_privacy,
          contact_privacy,
          dob_privacy,
          created_by,
          user_id
        ) VALUES (
          v_m_first,
          v_m_middle,
          v_m_last,
          NULLIF(trim(v_member_record->>'maiden_name'), ''),
          v_m_gender::public.gender,
          v_m_dob,
          v_m_dod,
          (v_m_dod IS NOT NULL),
          v_m_birth_place,
          v_m_city,
          v_m_state,
          v_m_country,
          v_m_gotra,
          v_m_nukh,
          COALESCE(v_m_occupation, 'Occupation Pending'),
          v_m_phone,
          NULLIF(trim(v_member_record->>'phone_secondary'), ''),
          v_m_email,
          v_m_blood_group,
          COALESCE((v_member_record->>'blood_group_consent')::BOOLEAN, FALSE),
          NULLIF(trim(v_member_record->>'kul'), ''),
          'COMMUNITY',
          'PRIVATE',
          'PRIVATE',
          v_caller_id,
          NULL
        ) RETURNING id INTO v_member_person_id;
      END IF;

      INSERT INTO public.family_members (
        family_id,
        person_id,
        role,
        relationship_to_head,
        is_head
      ) VALUES (
        v_family_id,
        v_member_person_id,
        v_member_role,
        v_member_rel,
        FALSE
      );

      v_member_count := v_member_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'family_id', v_family_id,
    'head_person_id', v_head_person_id,
    'member_count', v_member_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_complete_family(JSONB, JSONB, JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Robust, status-aware get_public_occupation_directory RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_occupation_directory(
  p_search TEXT DEFAULT NULL,
  p_occupation TEXT DEFAULT NULL,
  p_mukhi_id UUID DEFAULT NULL
)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  occupation TEXT,
  occupation_status TEXT,
  associated_mukhi_name TEXT,
  associated_mukhi_region TEXT,
  associated_mukhi_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH active_family_mukhis AS (
    SELECT DISTINCT ON (fm.person_id)
      fm.person_id,
      cm.id AS mukhi_id,
      cm.full_name AS mukhi_name,
      cm.gram AS mukhi_gram
    FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id AND f.deleted_at IS NULL
    JOIN public.community_mukhis cm ON cm.id = f.selected_mukhi_id
    WHERE fm.left_at IS NULL
      AND cm.is_active = TRUE
      AND (cm.authority_status = 'ACTIVE' OR cm.authority_status IS NULL)
    ORDER BY fm.person_id, fm.created_at DESC
  ),
  latest_requests AS (
    SELECT DISTINCT ON (our.person_id)
      our.person_id,
      our.status,
      our.requested_occupation,
      our.rejection_reason,
      our.created_at
    FROM public.occupation_update_requests our
    ORDER BY our.person_id, our.created_at DESC
  ),
  directory_records AS (
    SELECT
      p.id AS d_person_id,
      TRIM(CONCAT_WS(' ', p.first_name, NULLIF(p.middle_name, ''), p.last_name)) AS d_full_name,
      CASE
        -- When latest update request is APPROVED: display requested occupation
        WHEN lr.status = 'APPROVED' THEN
          COALESCE(NULLIF(TRIM(lr.requested_occupation), ''), NULLIF(TRIM(p.occupation), ''), 'Occupation Not Provided')
        -- When latest update request is PENDING:
        WHEN lr.status = 'PENDING' THEN
          CASE
            WHEN p.occupation IS NOT NULL
              AND TRIM(p.occupation) != ''
              AND TRIM(p.occupation) NOT IN ('Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')
            THEN TRIM(p.occupation)
            ELSE 'Occupation Pending'
          END
        -- When latest update request was REJECTED:
        WHEN lr.status = 'REJECTED' THEN
          CASE
            WHEN p.occupation IS NOT NULL
              AND TRIM(p.occupation) != ''
              AND TRIM(p.occupation) NOT IN ('Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')
            THEN TRIM(p.occupation)
            ELSE 'Occupation Rejected'
          END
        -- No update request submitted:
        ELSE
          CASE
            WHEN p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Not Available', 'Occupation Not Provided') THEN
              'Occupation Not Provided'
            WHEN TRIM(p.occupation) = 'Occupation Pending' THEN
              'Occupation Pending'
            ELSE
              TRIM(p.occupation)
          END
      END AS d_occupation,
      CASE
        WHEN lr.status = 'APPROVED' THEN 'APPROVED'
        WHEN lr.status = 'PENDING' AND (p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')) THEN 'PENDING'
        WHEN lr.status = 'PENDING' THEN 'APPROVED'
        WHEN lr.status = 'REJECTED' AND (p.occupation IS NULL OR TRIM(p.occupation) IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided')) THEN 'REJECTED'
        WHEN lr.status = 'REJECTED' THEN 'APPROVED'
        WHEN p.occupation IS NOT NULL AND TRIM(p.occupation) NOT IN ('', 'Occupation Pending', 'Occupation Not Available', 'Occupation Not Provided') THEN 'APPROVED'
        WHEN TRIM(p.occupation) = 'Occupation Pending' THEN 'PENDING'
        ELSE 'NOT_PROVIDED'
      END AS d_occupation_status,
      afm.mukhi_name AS d_mukhi_name,
      afm.mukhi_gram AS d_mukhi_region,
      afm.mukhi_id AS d_mukhi_id
    FROM public.persons p
    LEFT JOIN active_family_mukhis afm ON afm.person_id = p.id
    LEFT JOIN latest_requests lr ON lr.person_id = p.id
    WHERE p.deleted_at IS NULL
      AND (p.status IS NULL OR p.status != 'DECEASED')
      AND p.date_of_death IS NULL
  )
  SELECT
    dr.d_person_id AS person_id,
    dr.d_full_name AS full_name,
    dr.d_occupation AS occupation,
    dr.d_occupation_status AS occupation_status,
    dr.d_mukhi_name AS associated_mukhi_name,
    dr.d_mukhi_region AS associated_mukhi_region,
    dr.d_mukhi_id AS associated_mukhi_id
  FROM directory_records dr
  WHERE (
    p_search IS NULL OR TRIM(p_search) = '' OR
    dr.d_full_name ILIKE '%' || TRIM(p_search) || '%' OR
    dr.d_occupation ILIKE '%' || TRIM(p_search) || '%' OR
    (dr.d_mukhi_name IS NOT NULL AND dr.d_mukhi_name ILIKE '%' || TRIM(p_search) || '%')
  )
  AND (
    p_occupation IS NULL OR TRIM(p_occupation) = '' OR
    dr.d_occupation ILIKE '%' || TRIM(p_occupation) || '%'
  )
  AND (
    p_mukhi_id IS NULL OR
    dr.d_mukhi_id = p_mukhi_id
  )
  ORDER BY dr.d_full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_occupation_directory FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_occupation_directory TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Recreate public.public_occupation_directory View
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.public_occupation_directory CASCADE;
CREATE VIEW public.public_occupation_directory AS
  SELECT * FROM public.get_public_occupation_directory();

GRANT SELECT ON public.public_occupation_directory TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Recreate public.community_persons Security Barrier View
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.community_persons CASCADE;

CREATE VIEW public.community_persons
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.maiden_name,
  p.gender,
  CASE
    WHEN p.date_of_birth IS NOT NULL THEN
      date_part('year', age(CURRENT_DATE, p.date_of_birth))::int
    ELSE NULL
  END AS age,
  p.date_of_birth,
  CASE
    WHEN p.date_of_birth IS NOT NULL THEN
      date_part('year', p.date_of_birth)::int
    ELSE NULL
  END AS dob_year,
  p.birth_place,
  p.blood_group,
  p.email_contact,
  p.phone,
  p.phone_secondary,
  p.city,
  p.state,
  p.date_of_death,
  COALESCE(p.date_of_death IS NOT NULL OR p.status = 'DECEASED', FALSE) AS is_deceased,
  p.occupation,
  p.avatar_url,
  p.gotra,
  p.nukh,
  p.kul,
  p.status,
  p.verification_status,
  p.created_at,
  p.updated_at,
  p.deleted_at,
  p.user_id,
  p.created_by,
  p.profile_privacy,
  p.contact_privacy,
  p.dob_privacy,
  (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.family_members fm1
    JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
    JOIN public.persons p2 ON p2.id = fm2.person_id
    WHERE fm1.person_id = p.id
      AND p2.user_id = auth.uid()
      AND fm1.left_at IS NULL
      AND fm2.left_at IS NULL
  )) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit
FROM public.persons p
WHERE p.deleted_at IS NULL;

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 6. Reload PostgREST Schema Cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
