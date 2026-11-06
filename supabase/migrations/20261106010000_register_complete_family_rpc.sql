-- =============================================================================
-- Migration: 20261106010000_register_complete_family_rpc.sql
-- Description: Complete Family Registration & Add Person Workflow Atomic RPC
--              Creates family, designated head, and additional members with relationships
--              in a single atomic transaction.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure required columns on public.persons
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS blood_group_consent BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.persons.city IS 'Current or residential city of the person.';
COMMENT ON COLUMN public.persons.state IS 'Current or residential state of the person.';
COMMENT ON COLUMN public.persons.country IS 'Current or residential country of the person (default India).';
COMMENT ON COLUMN public.persons.blood_group_consent IS 'Explicit user consent to share blood group within the community.';

-- -----------------------------------------------------------------------------
-- 2. Ensure relationship_to_head column on public.family_members & kul on families
-- -----------------------------------------------------------------------------
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS kul TEXT;

ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS relationship_to_head TEXT;

COMMENT ON COLUMN public.family_members.relationship_to_head IS
  'Descriptive interpersonal relationship to the family head (e.g., Wife, Son, Mother, Brother).';

-- -----------------------------------------------------------------------------
-- 3. Atomic Registration RPC: register_complete_family
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

  -- Mukhi Validation: Must be selected from approved 118 records
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

  -- Location Validation
  v_family_city := NULLIF(trim(p_family->>'city'), '');
  IF v_family_city IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: City / Gaon is required.' USING ERRCODE = '22023';
  END IF;

  v_family_state := NULLIF(trim(p_family->>'state'), '');
  IF v_family_state IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: State / Province is required.' USING ERRCODE = '22023';
  END IF;

  v_family_country := COALESCE(NULLIF(trim(p_family->>'country'), ''), 'India');

  -- Gotra & Nukh Validation
  v_family_gotra := NULLIF(trim(p_family->>'gotra'), '');
  IF v_family_gotra IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Gotra is required.' USING ERRCODE = '22023';
  END IF;

  v_family_nukh := NULLIF(trim(p_family->>'nukh'), '');
  IF v_family_nukh IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Nukh is required.' USING ERRCODE = '22023';
  END IF;

  -- Verify Gotra in master table
  SELECT id INTO v_gotra_id
  FROM public.gotras
  WHERE lower(trim(name)) = lower(trim(v_family_gotra))
     OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(v_family_gotra, ' (', 1)))
  LIMIT 1;

  IF v_gotra_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_GOTRA: "%" is not an approved Gotra.', v_family_gotra USING ERRCODE = '22023';
  END IF;

  -- Verify Nukh belongs to selected Gotra
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
    RAISE EXCEPTION 'INVALID_NUKH: "%" does not belong to the selected Gotra "%".', v_family_nukh, v_family_gotra USING ERRCODE = '22023';
  END IF;

  -- 3. Insert Family Record
  INSERT INTO public.families (
    family_name,
    selected_mukhi_id,
    city,
    state,
    country,
    gotra,
    nukh,
    description,
    kul,
    profile_privacy,
    members_privacy,
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
    NULLIF(trim(p_family->>'description'), ''),
    NULLIF(trim(p_family->>'kul'), ''),
    'COMMUNITY',
    'COMMUNITY',
    v_caller_id,
    v_caller_id
  ) RETURNING id INTO v_family_id;

  -- 4. Process Family Head
  IF p_head IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Family head details are required.' USING ERRCODE = '22023';
  END IF;

  v_head_is_existing := COALESCE((p_head->>'is_existing')::BOOLEAN, FALSE);
  IF v_head_is_existing OR (p_head ? 'person_id' AND NULLIF(trim(p_head->>'person_id'), '') IS NOT NULL) THEN
    -- Option B: Existing Person
    BEGIN
      v_head_person_id := (p_head->>'person_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid person_id for existing Family Head.' USING ERRCODE = '22023';
    END;

    IF NOT EXISTS (
      SELECT 1 FROM public.persons
      WHERE id = v_head_person_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'NOT_FOUND: Designated Family Head does not exist or has been deleted.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    -- Option A: New Person (Validate 12 mandatory fields in exact order)
    v_head_first_name := NULLIF(trim(p_head->>'first_name'), '');
    v_head_middle_name := NULLIF(trim(p_head->>'middle_name'), '');
    v_head_last_name := NULLIF(trim(p_head->>'last_name'), '');
    v_head_gender_str := NULLIF(trim(p_head->>'gender'), '');
    v_head_dob_str := NULLIF(trim(p_head->>'date_of_birth'), '');
    v_head_city := COALESCE(NULLIF(trim(p_head->>'city'), ''), v_family_city);
    v_head_state := COALESCE(NULLIF(trim(p_head->>'state'), ''), v_family_state);
    v_head_country := COALESCE(NULLIF(trim(p_head->>'country'), ''), v_family_country);
    v_head_gotra := COALESCE(NULLIF(trim(p_head->>'gotra'), ''), v_family_gotra);
    v_head_nukh := COALESCE(NULLIF(trim(p_head->>'nukh'), ''), v_family_nukh);
    v_head_phone := NULLIF(trim(p_head->>'phone'), '');
    v_head_email := NULLIF(trim(COALESCE(p_head->>'email', p_head->>'email_contact')), '');

    IF v_head_first_name IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: First Name is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_middle_name IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Middle Name is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_last_name IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Last Name / Surname is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_gender_str IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gender is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_dob_str IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Birth is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_city IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: City / Town / Gaon is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_state IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: State / Province is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_country IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Country is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_gotra IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gotra is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_nukh IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Nukh is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_phone IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Primary Phone Number is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_email IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Email Address is required for Family Head.' USING ERRCODE = '22023'; END IF;

    -- DOB validation
    BEGIN
      v_head_dob := v_head_dob_str::DATE;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for Family Head date of birth.' USING ERRCODE = '22023';
    END;

    IF v_head_dob > CURRENT_DATE THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Birth cannot be in the future.' USING ERRCODE = '22023';
    END IF;

    -- Optional Date of Death validation
    v_head_dod_str := NULLIF(trim(p_head->>'date_of_death'), '');
    IF v_head_dod_str IS NOT NULL THEN
      BEGIN
        v_head_dod := v_head_dod_str::DATE;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for Family Head date of death.' USING ERRCODE = '22023';
      END;

      IF v_head_dod < v_head_dob THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Death cannot be earlier than Date of Birth.' USING ERRCODE = '22023';
      END IF;
    ELSE
      v_head_dod := NULL;
    END IF;

    -- Insert Head Person record (PERSON != USER boundary: user_id is NULL)
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
      NULLIF(trim(p_head->>'birth_place'), ''),
      v_head_city,
      v_head_state,
      v_head_country,
      v_head_gotra,
      v_head_nukh,
      v_head_phone,
      NULLIF(trim(p_head->>'phone_secondary'), ''),
      v_head_email,
      NULLIF(trim(p_head->>'blood_group'), ''),
      COALESCE((p_head->>'blood_group_consent')::BOOLEAN, FALSE),
      NULLIF(trim(p_head->>'kul'), ''),
      'COMMUNITY',
      'PRIVATE',
      'PRIVATE',
      v_caller_id,
      NULL
    ) RETURNING id INTO v_head_person_id;
  END IF;

  -- Insert Family Head membership
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    is_head,
    relationship_to_head,
    added_by
  ) VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    TRUE,
    'Self (Head)',
    v_caller_id
  );

  v_member_count := 1;

  -- 5. Process Additional Family Members
  IF p_members IS NOT NULL AND jsonb_typeof(p_members) = 'array' THEN
    FOR v_member_record IN SELECT * FROM jsonb_array_elements(p_members)
    LOOP
      v_member_rel := NULLIF(trim(v_member_record->>'relationship_to_head'), '');
      IF v_member_rel IS NULL THEN
        v_member_rel := 'Other';
      END IF;

      -- Map role to canonical enum
      v_member_role_str := UPPER(COALESCE(NULLIF(trim(v_member_record->>'role'), ''), v_member_rel));
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
        ELSE
          v_member_role := 'EXTENDED'::public.family_role;
      END CASE;

      v_member_is_existing := COALESCE((v_member_record->>'is_existing')::BOOLEAN, FALSE);
      IF v_member_is_existing OR (v_member_record ? 'person_id' AND NULLIF(trim(v_member_record->>'person_id'), '') IS NOT NULL) THEN
        -- Option B: Existing Member
        BEGIN
          v_member_person_id := (v_member_record->>'person_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid person_id for existing member.' USING ERRCODE = '22023';
        END;

        IF NOT EXISTS (
          SELECT 1 FROM public.persons
          WHERE id = v_member_person_id AND deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION 'NOT_FOUND: Existing member person % does not exist or has been deleted.', (v_member_record->>'person_id') USING ERRCODE = 'P0002';
        END IF;
      ELSE
        -- Option A: New Member (Validate 12 mandatory fields)
        v_m_first := NULLIF(trim(v_member_record->>'first_name'), '');
        v_m_middle := NULLIF(trim(v_member_record->>'middle_name'), '');
        v_m_last := NULLIF(trim(v_member_record->>'last_name'), '');
        v_m_gender := NULLIF(trim(v_member_record->>'gender'), '');
        v_m_dob_str := NULLIF(trim(v_member_record->>'date_of_birth'), '');
        v_m_city := COALESCE(NULLIF(trim(v_member_record->>'city'), ''), v_family_city);
        v_m_state := COALESCE(NULLIF(trim(v_member_record->>'state'), ''), v_family_state);
        v_m_country := COALESCE(NULLIF(trim(v_member_record->>'country'), ''), v_family_country);
        v_m_gotra := COALESCE(NULLIF(trim(v_member_record->>'gotra'), ''), v_family_gotra);
        v_m_nukh := COALESCE(NULLIF(trim(v_member_record->>'nukh'), ''), v_family_nukh);
        v_m_phone := NULLIF(trim(v_member_record->>'phone'), '');
        v_m_email := NULLIF(trim(COALESCE(v_member_record->>'email', v_member_record->>'email_contact')), '');

        IF v_m_first IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: First Name is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_middle IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Middle Name is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_last IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Last Name / Surname is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_gender IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gender is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_dob_str IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Birth is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_city IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: City / Town / Gaon is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_state IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: State / Province is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_country IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Country is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_gotra IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gotra is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_nukh IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Nukh is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_phone IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Primary Phone Number is required for member.' USING ERRCODE = '22023'; END IF;
        IF v_m_email IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Email Address is required for member.' USING ERRCODE = '22023'; END IF;

        BEGIN
          v_m_dob := v_m_dob_str::DATE;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for member date of birth.' USING ERRCODE = '22023';
        END;

        IF v_m_dob > CURRENT_DATE THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: Member date of birth cannot be in the future.' USING ERRCODE = '22023';
        END IF;

        v_m_dod_str := NULLIF(trim(v_member_record->>'date_of_death'), '');
        IF v_m_dod_str IS NOT NULL THEN
          BEGIN
            v_m_dod := v_m_dod_str::DATE;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for member date of death.' USING ERRCODE = '22023';
          END;

          IF v_m_dod < v_m_dob THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: Member date of death cannot be earlier than date of birth.' USING ERRCODE = '22023';
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
          NULLIF(trim(v_member_record->>'birth_place'), ''),
          v_m_city,
          v_m_state,
          v_m_country,
          v_m_gotra,
          v_m_nukh,
          v_m_phone,
          NULLIF(trim(v_member_record->>'phone_secondary'), ''),
          v_m_email,
          NULLIF(trim(v_member_record->>'blood_group'), ''),
          COALESCE((v_member_record->>'blood_group_consent')::BOOLEAN, FALSE),
          NULLIF(trim(v_member_record->>'kul'), ''),
          'COMMUNITY',
          'PRIVATE',
          'PRIVATE',
          v_caller_id,
          NULL
        ) RETURNING id INTO v_member_person_id;
      END IF;

      -- Check duplicate if member is head
      IF v_member_person_id = v_head_person_id THEN
        RAISE EXCEPTION 'DUPLICATE_MEMBER: Family Head cannot also be added as an additional member.' USING ERRCODE = '23505';
      END IF;

      -- Check duplicate if member is already registered in this family
      IF EXISTS (
        SELECT 1 FROM public.family_members
        WHERE family_id = v_family_id AND person_id = v_member_person_id AND left_at IS NULL
      ) THEN
        RAISE EXCEPTION 'DUPLICATE_MEMBER: Person is already a member of this family.' USING ERRCODE = '23505';
      END IF;

      -- Insert into family_members
      INSERT INTO public.family_members (
        family_id,
        person_id,
        role,
        is_head,
        relationship_to_head,
        added_by
      ) VALUES (
        v_family_id,
        v_member_person_id,
        v_member_role,
        FALSE,
        v_member_rel,
        v_caller_id
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

COMMENT ON FUNCTION public.register_complete_family(JSONB, JSONB, JSONB) IS
  'Atomically creates a family, its designated head, and all additional members with interpersonal relationships in a single rollback-safe transaction.';

-- Revoke from public/anon, grant to authenticated
REVOKE ALL ON FUNCTION public.register_complete_family(JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_complete_family(JSONB, JSONB, JSONB) TO authenticated;

COMMIT;
