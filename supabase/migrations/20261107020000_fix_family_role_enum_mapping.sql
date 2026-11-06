-- =============================================================================
-- Migration: 20261107020000_fix_family_role_enum_mapping.sql
-- Description: Correct family_role enum mapping in register_complete_family RPC.
--              Maps member relationship to valid public.family_role enum values:
--              ('HEAD', 'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'GRANDPARENT',
--               'GRANDCHILD', 'EXTENDED') and eliminates invalid 'MEMBER' casting.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.register_complete_family(
  p_family JSONB,
  p_head JSONB,
  p_members JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_family_id UUID;
  v_head_person_id UUID;
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
  v_head_city TEXT;
  v_head_state TEXT;
  v_head_country TEXT;
  v_head_gotra TEXT;
  v_head_nukh TEXT;
  v_head_phone TEXT;
  v_head_email TEXT;
  v_head_dod_str TEXT;
  v_head_dod DATE;

  -- Member iteration variables
  v_member_record JSONB;
  v_member_person_id UUID;
  v_member_rel TEXT;
  v_member_role public.family_role;
  v_member_role_str TEXT;
  v_member_is_existing BOOLEAN;
  v_m_first TEXT;
  v_m_middle TEXT;
  v_m_last TEXT;
  v_m_gender TEXT;
  v_m_blood_group TEXT;
  v_m_birth_place TEXT;
  v_m_dob_str TEXT;
  v_m_dob DATE;
  v_m_city TEXT;
  v_m_state TEXT;
  v_m_country TEXT;
  v_m_gotra TEXT;
  v_m_nukh TEXT;
  v_m_phone TEXT;
  v_m_email TEXT;
  v_m_dod_str TEXT;
  v_m_dod DATE;
  v_member_count INT := 0;
BEGIN
  -- 1. Caller Authentication and Active Profile Verification
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
  WHERE gotra_id = v_gotra_id
    AND (
      lower(trim(name)) = lower(trim(v_family_nukh))
      OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(v_family_nukh, ' (', 1)))
      OR lower(name) LIKE '%' || lower(trim(v_family_nukh)) || '%'
    )
  LIMIT 1;

  IF v_nukh_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_NUKH: "%" is not an approved Nukh for Gotra "%".', v_family_nukh, v_family_gotra USING ERRCODE = '22023';
  END IF;

  -- 3. Validate Family Head
  IF p_head IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Family Head details are required.' USING ERRCODE = '22023';
  END IF;

  v_head_is_existing := COALESCE((p_head->>'is_existing')::BOOLEAN, FALSE);

  IF v_head_is_existing OR (p_head ? 'person_id' AND NULLIF(trim(p_head->>'person_id'), '') IS NOT NULL) THEN
    BEGIN
      v_head_person_id := (p_head->>'person_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid person_id for existing Head.' USING ERRCODE = '22023';
    END;

    IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = v_head_person_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'NOT_FOUND: Designated Head person record does not exist: %', v_head_person_id USING ERRCODE = 'P0002';
    END IF;

    SELECT phone, email_contact, city, state, country
    INTO v_head_phone, v_head_email, v_head_city, v_head_state, v_head_country
    FROM public.persons WHERE id = v_head_person_id;
  ELSE
    -- 10 Mandatory fields for new Head
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

    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      date_of_death,
      birth_place,
      city,
      state,
      country,
      gotra,
      nukh,
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
      v_head_birth_place,
      v_head_city,
      v_head_state,
      v_head_country,
      v_head_gotra,
      v_head_nukh,
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
      v_caller_id
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
    profile_privacy,
    members_privacy,
    status,
    created_by,
    manager_user_id
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
    'COMMUNITY',
    'COMMUNITY',
    'ACTIVE',
    v_caller_id,
    v_caller_id
  ) RETURNING id INTO v_family_id;

  -- Link Head in family_members
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    relationship_to_head,
    is_head,
    added_by
  ) VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    'Self',
    TRUE,
    v_caller_id
  );

  v_member_count := 1;

  -- 5. Process Additional Family Members
  IF p_members IS NOT NULL AND jsonb_typeof(p_members) = 'array' THEN
    FOR v_member_record IN SELECT * FROM jsonb_array_elements(p_members)
    LOOP
      v_member_rel := COALESCE(NULLIF(trim(v_member_record->>'relationship_to_head'), ''), 'Other');
      v_member_role_str := UPPER(COALESCE(NULLIF(trim(v_member_record->>'role'), ''), ''));
      IF v_member_role_str = '' OR v_member_role_str = 'MEMBER' THEN
        v_member_role_str := UPPER(v_member_rel);
      END IF;

      -- Safe mapping to valid public.family_role enum
      CASE
        WHEN v_member_role_str IN ('SPOUSE', 'WIFE', 'HUSBAND', 'PARTNER') THEN
          v_member_role := 'SPOUSE'::public.family_role;
        WHEN v_member_role_str IN ('CHILD', 'SON', 'DAUGHTER', 'KID') THEN
          v_member_role := 'CHILD'::public.family_role;
        WHEN v_member_role_str IN ('PARENT', 'FATHER', 'MOTHER') THEN
          v_member_role := 'PARENT'::public.family_role;
        WHEN v_member_role_str IN ('SIBLING', 'BROTHER', 'SISTER') THEN
          v_member_role := 'SIBLING'::public.family_role;
        WHEN v_member_role_str IN ('GRANDPARENT', 'GRANDFATHER', 'GRANDMOTHER') THEN
          v_member_role := 'GRANDPARENT'::public.family_role;
        WHEN v_member_role_str IN ('GRANDCHILD', 'GRANDSON', 'GRANDDAUGHTER') THEN
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
        -- 10 Mandatory fields for member
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
          birth_place,
          city,
          state,
          country,
          gotra,
          nukh,
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
          v_m_birth_place,
          v_m_city,
          v_m_state,
          v_m_country,
          v_m_gotra,
          v_m_nukh,
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
        is_head,
        added_by
      ) VALUES (
        v_family_id,
        v_member_person_id,
        v_member_role,
        v_member_rel,
        FALSE,
        v_caller_id
      );

      v_member_count := v_member_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'family_id', v_family_id,
    'head_person_id', v_head_person_id,
    'member_count', v_member_count,
    'message', 'Family registered successfully with Head and members.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_complete_family(JSONB, JSONB, JSONB) TO authenticated;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
