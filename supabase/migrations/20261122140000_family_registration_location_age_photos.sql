-- =============================================================================
-- Migration: 20261122140000_family_registration_location_age_photos.sql
-- Description:
--   1. Schema extensions for Age Storage:
--      - Adds current_age and age_as_of_date to public.persons.
--      - Recreates public.community_persons view to compute age from DOB or current_age.
--   2. Authoritative Location Reference:
--      - Creates public.worldwide_locations view mapping cities, states, countries.
--   3. Family Registration Update:
--      - Updates register_complete_family RPC to make Date of Birth and Birthplace optional.
--      - Accepts current_age when Date of Birth is unknown.
--      - Validates that selected Mukhi must be active and approved.
--      - Removes required dependencies on kul and secondary phone.
--      - Accepts avatar_url for head and members.
--   4. Profile Photo Restoration:
--      - Re-enables avatar storage policies on storage.objects for 'avatars'.
--      - Restores set_person_avatar and set_profile_avatar RPCs.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. SCHEMA EXTENSION ON public.persons FOR AGE STORAGE
-- -----------------------------------------------------------------------------

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS current_age INT,
  ADD COLUMN IF NOT EXISTS age_as_of_date DATE DEFAULT CURRENT_DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_persons_current_age'
      AND conrelid = 'public.persons'::regclass
  ) THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_current_age
      CHECK (current_age IS NULL OR (current_age >= 0 AND current_age <= 130));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. RECREATE public.community_persons VIEW WITH CURRENT AGE SUPPORT
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
    WHEN p.current_age IS NOT NULL THEN
      p.current_age
    ELSE NULL
  END AS age,
  p.current_age,
  p.age_as_of_date,
  p.date_of_birth,
  CASE
    WHEN p.date_of_birth IS NOT NULL THEN
      date_part('year', p.date_of_birth)::int
    ELSE NULL
  END AS dob_year,
  p.birth_place,
  p.blood_group,
  COALESCE(p.show_blood_group_in_directory, p.blood_group_consent, FALSE) AS show_blood_group_in_directory,
  COALESCE(p.blood_group_consent, p.show_blood_group_in_directory, FALSE) AS blood_group_consent,
  p.email_contact,
  p.phone,
  p.phone_secondary,
  p.city,
  p.state,
  p.country,
  p.date_of_death,
  COALESCE(p.is_deceased, p.date_of_death IS NOT NULL OR p.status = 'DECEASED', FALSE) AS is_deceased,
  p.occupation,
  p.occupation_category,
  p.custom_occupation,
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
    JOIN public.families f ON f.id = fm1.family_id
    JOIN public.family_members fm2 ON fm1.family_id = fm2.family_id
    JOIN public.persons p_caller ON p_caller.id = fm2.person_id
    WHERE fm1.person_id = p.id
      AND fm1.left_at IS NULL
      AND fm2.left_at IS NULL
      AND f.deleted_at IS NULL
      AND f.status = 'ACTIVE'
      AND p_caller.user_id = auth.uid()
      AND p_caller.deleted_at IS NULL
      AND p_caller.status != 'ARCHIVED'
  )) AS is_same_family_member,
  (auth.uid() IS NOT NULL AND (
    p.user_id = auth.uid()
    OR p.created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.families f
      JOIN public.family_members fm ON fm.family_id = f.id
      WHERE fm.person_id = p.id
        AND fm.left_at IS NULL
        AND f.deleted_at IS NULL
        AND (
          f.created_by = auth.uid()
          OR f.manager_user_id = auth.uid()
          OR (fm.is_head = TRUE AND fm.person_id IN (SELECT id FROM public.persons WHERE user_id = auth.uid()))
        )
    )
  )) AS can_edit
FROM public.persons p
WHERE p.deleted_at IS NULL
  AND p.status != 'ARCHIVED';

GRANT SELECT ON public.community_persons TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 3. CREATE public.worldwide_locations AUTHORITATIVE REFERENCE VIEW
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.worldwide_locations AS
SELECT
  c.id,
  c.name AS city_name,
  c.state,
  c.country,
  c.is_custom,
  s.id AS state_id,
  s.state_name,
  co.id AS country_id,
  co.country_name,
  co.country_code
FROM public.cities c
LEFT JOIN public.states s ON c.state_id = s.id
LEFT JOIN public.countries co ON c.country_id = co.id;

GRANT SELECT ON public.worldwide_locations TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 4. UPDATE register_complete_family RPC
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
  v_head_current_age INT;
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
  v_head_avatar_url TEXT;

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
  v_m_current_age INT;
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
  v_m_avatar_url TEXT;
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
    RAISE EXCEPTION 'INVALID_MUKHI: Mukhi must be selected from the approved Mukhi records.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_mukhi_id := (p_family->>'selected_mukhi_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_MUKHI: Invalid Mukhi identifier format.' USING ERRCODE = '22023';
  END;

  -- Enforce active & approved Mukhi restriction
  IF NOT EXISTS (
    SELECT 1 FROM public.community_mukhis
    WHERE id = v_mukhi_id
      AND is_active = TRUE
      AND (authority_status = 'ACTIVE' OR authority_status IS NULL)
  ) THEN
    RAISE EXCEPTION 'INVALID_MUKHI: Selected Mukhi must be an active, approved representative from the verified directory.' USING ERRCODE = '22023';
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
    -- Fields for new Head
    v_head_first_name := NULLIF(trim(p_head->>'first_name'), '');
    v_head_middle_name := NULLIF(trim(p_head->>'middle_name'), '');
    v_head_last_name := NULLIF(trim(p_head->>'last_name'), '');
    v_head_gender_str := NULLIF(trim(p_head->>'gender'), '');
    v_head_blood_group := NULLIF(trim(p_head->>'blood_group'), '');
    v_head_birth_place := NULLIF(trim(p_head->>'birth_place'), ''); -- OPTIONAL per Section 5
    v_head_dob_str := NULLIF(trim(p_head->>'date_of_birth'), '');
    v_head_city := COALESCE(NULLIF(trim(p_head->>'city'), ''), v_family_city);
    v_head_state := COALESCE(NULLIF(trim(p_head->>'state'), ''), v_family_state);
    v_head_country := COALESCE(NULLIF(trim(p_head->>'country'), ''), v_family_country);
    v_head_gotra := COALESCE(NULLIF(trim(p_head->>'gotra'), ''), v_family_gotra);
    v_head_nukh := COALESCE(NULLIF(trim(p_head->>'nukh'), ''), v_family_nukh);
    v_head_occupation := NULLIF(trim(p_head->>'occupation'), '');
    v_head_phone := NULLIF(trim(p_head->>'phone'), '');
    v_head_email := NULLIF(trim(COALESCE(p_head->>'email', p_head->>'email_contact')), '');
    v_head_avatar_url := NULLIF(trim(p_head->>'avatar_url'), '');

    IF v_head_first_name IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head First Name is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_last_name IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Last Name is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_gender_str IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Gender is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_blood_group IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Blood Group is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_city IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head City is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_state IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head State is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_gotra IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Gotra is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_nukh IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Nukh is required.' USING ERRCODE = '22023'; END IF;
    IF v_head_phone IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Head Phone Number is required.' USING ERRCODE = '22023'; END IF;

    -- Process Date of Birth or Current Age
    IF v_head_dob_str IS NOT NULL THEN
      BEGIN
        v_head_dob := v_head_dob_str::DATE;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for Head date of birth.' USING ERRCODE = '22023';
      END;

      IF v_head_dob > CURRENT_DATE THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Head Date of Birth cannot be in the future.' USING ERRCODE = '22023';
      END IF;
      v_head_current_age := NULL;
    ELSE
      v_head_dob := NULL;
      -- Check if current_age was provided
      IF p_head ? 'current_age' AND NULLIF(trim(p_head->>'current_age'), '') IS NOT NULL THEN
        BEGIN
          v_head_current_age := (p_head->>'current_age')::INT;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid integer format for Head current age.' USING ERRCODE = '22023';
        END;
        IF v_head_current_age < 0 OR v_head_current_age > 130 THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: Head current age must be between 0 and 130.' USING ERRCODE = '22023';
        END IF;
      ELSE
        v_head_current_age := NULL;
      END IF;
    END IF;

    v_head_dod_str := NULLIF(trim(p_head->>'date_of_death'), '');
    IF v_head_dod_str IS NOT NULL THEN
      BEGIN
        v_head_dod := v_head_dod_str::DATE;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for Head date of death.' USING ERRCODE = '22023';
      END;

      IF v_head_dob IS NOT NULL AND v_head_dod < v_head_dob THEN
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
      current_age,
      age_as_of_date,
      date_of_death,
      is_deceased,
      birth_place,
      city,
      state,
      country,
      gotra,
      nukh,
      occupation,
      occupation_category,
      custom_occupation,
      avatar_url,
      phone,
      email_contact,
      blood_group,
      blood_group_consent,
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
      v_head_current_age,
      CASE WHEN v_head_current_age IS NOT NULL THEN CURRENT_DATE ELSE NULL END,
      v_head_dod,
      COALESCE((p_head->>'is_deceased')::BOOLEAN, v_head_dod IS NOT NULL, FALSE),
      v_head_birth_place,
      v_head_city,
      v_head_state,
      v_head_country,
      v_head_gotra,
      v_head_nukh,
      v_head_occupation,
      NULLIF(trim(p_head->>'occupation_category'), ''),
      NULLIF(trim(p_head->>'custom_occupation'), ''),
      v_head_avatar_url,
      v_head_phone,
      v_head_email,
      v_head_blood_group,
      COALESCE((p_head->>'blood_group_consent')::BOOLEAN, FALSE),
      COALESCE(NULLIF(trim(p_head->>'profile_privacy'), '')::public.privacy_level, 'PRIVATE'::public.privacy_level),
      COALESCE(NULLIF(trim(p_head->>'contact_privacy'), '')::public.privacy_level, 'PRIVATE'::public.privacy_level),
      COALESCE(NULLIF(trim(p_head->>'dob_privacy'), '')::public.privacy_level, 'PRIVATE'::public.privacy_level),
      v_caller_id,
      v_head_user_id
    )
    RETURNING id INTO v_head_person_id;
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
    description,
    created_by,
    manager_user_id,
    profile_privacy,
    members_privacy,
    status
  ) VALUES (
    v_family_name,
    v_mukhi_id,
    v_family_city,
    v_family_state,
    v_family_country,
    v_family_gotra,
    v_family_nukh,
    NULLIF(trim(p_family->>'description'), ''),
    v_caller_id,
    v_caller_id,
    'PRIVATE'::public.privacy_level,
    'PRIVATE'::public.privacy_level,
    'ACTIVE'::public.family_status
  )
  RETURNING id INTO v_family_id;

  -- 5. Attach Head of Family
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    relationship_to_head,
    is_head,
    joined_at,
    added_by
  ) VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    'Head of Family',
    TRUE,
    NOW(),
    v_caller_id
  );

  -- 6. Attach Additional Members
  IF p_members IS NOT NULL AND jsonb_array_length(p_members) > 0 THEN
    FOR v_member_record IN SELECT * FROM jsonb_array_elements(p_members)
    LOOP
      v_member_rel := NULLIF(trim(v_member_record->>'relationship_to_head'), '');
      IF v_member_rel IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Relationship to Head is required for all additional members.' USING ERRCODE = '22023';
      END IF;

      v_member_role_str := UPPER(trim(COALESCE(v_member_record->>'role', v_member_rel)));

      CASE
        WHEN v_member_role_str = 'SPOUSE' OR v_member_role_str LIKE '%HUSBAND%' OR v_member_role_str LIKE '%WIFE%' THEN
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
        -- Fields for member
        v_m_first := NULLIF(trim(v_member_record->>'first_name'), '');
        v_m_middle := NULLIF(trim(v_member_record->>'middle_name'), '');
        v_m_last := NULLIF(trim(v_member_record->>'last_name'), '');
        v_m_gender := NULLIF(trim(v_member_record->>'gender'), '');
        v_m_blood_group := NULLIF(trim(v_member_record->>'blood_group'), '');
        v_m_birth_place := NULLIF(trim(v_member_record->>'birth_place'), ''); -- OPTIONAL per Section 5
        v_m_dob_str := NULLIF(trim(v_member_record->>'date_of_birth'), '');
        v_m_city := COALESCE(NULLIF(trim(v_member_record->>'city'), ''), v_family_city);
        v_m_state := COALESCE(NULLIF(trim(v_member_record->>'state'), ''), v_family_state);
        v_m_country := COALESCE(NULLIF(trim(v_member_record->>'country'), ''), v_family_country);
        v_m_gotra := COALESCE(NULLIF(trim(v_member_record->>'gotra'), ''), v_family_gotra);
        v_m_nukh := COALESCE(NULLIF(trim(v_member_record->>'nukh'), ''), v_family_nukh);
        v_m_occupation := NULLIF(trim(v_member_record->>'occupation'), '');
        v_m_phone := COALESCE(NULLIF(trim(v_member_record->>'phone'), ''), v_head_phone);
        v_m_email := COALESCE(NULLIF(trim(COALESCE(v_member_record->>'email', v_member_record->>'email_contact')), ''), v_head_email);
        v_m_avatar_url := NULLIF(trim(v_member_record->>'avatar_url'), '');

        IF v_m_first IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: First Name is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_last IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Last Name is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_gender IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gender is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_blood_group IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Blood Group is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_gotra IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gotra is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;
        IF v_m_nukh IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Nukh is required for member: %', v_member_rel USING ERRCODE = '22023'; END IF;

        -- Process Date of Birth or Current Age
        IF v_m_dob_str IS NOT NULL THEN
          BEGIN
            v_m_dob := v_m_dob_str::DATE;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for member (%) date of birth.', v_member_rel USING ERRCODE = '22023';
          END;

          IF v_m_dob > CURRENT_DATE THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Birth cannot be in the future for member: %', v_member_rel USING ERRCODE = '22023';
          END IF;
          v_m_current_age := NULL;
        ELSE
          v_m_dob := NULL;
          IF v_member_record ? 'current_age' AND NULLIF(trim(v_member_record->>'current_age'), '') IS NOT NULL THEN
            BEGIN
              v_m_current_age := (v_member_record->>'current_age')::INT;
            EXCEPTION WHEN OTHERS THEN
              RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid integer format for member (%) current age.', v_member_rel USING ERRCODE = '22023';
            END;
            IF v_m_current_age < 0 OR v_m_current_age > 130 THEN
              RAISE EXCEPTION 'INVALID_ARGUMENT: Current age for member (%) must be between 0 and 130.', v_member_rel USING ERRCODE = '22023';
            END IF;
          ELSE
            v_m_current_age := NULL;
          END IF;
        END IF;

        v_m_dod_str := NULLIF(trim(v_member_record->>'date_of_death'), '');
        IF v_m_dod_str IS NOT NULL THEN
          BEGIN
            v_m_dod := v_m_dod_str::DATE;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid date format for member (%) date of death.', v_member_rel USING ERRCODE = '22023';
          END;

          IF v_m_dob IS NOT NULL AND v_m_dod < v_m_dob THEN
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
          current_age,
          age_as_of_date,
          date_of_death,
          is_deceased,
          birth_place,
          city,
          state,
          country,
          gotra,
          nukh,
          occupation,
          occupation_category,
          custom_occupation,
          avatar_url,
          phone,
          email_contact,
          blood_group,
          blood_group_consent,
          profile_privacy,
          contact_privacy,
          dob_privacy,
          created_by
        ) VALUES (
          v_m_first,
          v_m_middle,
          v_m_last,
          NULLIF(trim(v_member_record->>'maiden_name'), ''),
          v_m_gender::public.gender,
          v_m_dob,
          v_m_current_age,
          CASE WHEN v_m_current_age IS NOT NULL THEN CURRENT_DATE ELSE NULL END,
          v_m_dod,
          COALESCE((v_member_record->>'is_deceased')::BOOLEAN, v_m_dod IS NOT NULL, FALSE),
          v_m_birth_place,
          v_m_city,
          v_m_state,
          v_m_country,
          v_m_gotra,
          v_m_nukh,
          v_m_occupation,
          NULLIF(trim(v_member_record->>'occupation_category'), ''),
          NULLIF(trim(v_member_record->>'custom_occupation'), ''),
          v_m_avatar_url,
          v_m_phone,
          v_m_email,
          v_m_blood_group,
          COALESCE((v_member_record->>'blood_group_consent')::BOOLEAN, FALSE),
          'PRIVATE'::public.privacy_level,
          'PRIVATE'::public.privacy_level,
          'PRIVATE'::public.privacy_level,
          v_caller_id
        )
        RETURNING id INTO v_member_person_id;
      END IF;

      INSERT INTO public.family_members (
        family_id,
        person_id,
        role,
        relationship_to_head,
        is_head,
        joined_at,
        added_by
      ) VALUES (
        v_family_id,
        v_member_person_id,
        v_member_role,
        v_member_rel,
        FALSE,
        NOW(),
        v_caller_id
      );

      v_member_count := v_member_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'family_id', v_family_id,
    'head_person_id', v_head_person_id,
    'members_count', v_member_count + 1,
    'message', 'Family registered successfully with designated Head and members'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_complete_family(JSONB, JSONB, JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. RESTORE AVATAR STORAGE AND MUTATION RPCS
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "avatars_insert_policy" ON storage.objects;
CREATE POLICY "avatars_insert_policy"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
  );

DROP POLICY IF EXISTS "avatars_update_policy" ON storage.objects;
CREATE POLICY "avatars_update_policy"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
  )
  WITH CHECK (
    bucket_id = 'avatars'
  );

DROP POLICY IF EXISTS "avatars_delete_policy" ON storage.objects;
CREATE POLICY "avatars_delete_policy"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
  );

CREATE OR REPLACE FUNCTION public.set_person_avatar(
  p_person_id UUID,
  p_avatar_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_old_url TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT avatar_url INTO v_old_url
  FROM public.persons
  WHERE id = p_person_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Person record does not exist or has been deleted'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.persons
  SET avatar_url = p_avatar_url,
      updated_at = NOW()
  WHERE id = p_person_id;

  RETURN jsonb_build_object('success', TRUE, 'person_id', p_person_id, 'avatar_url', p_avatar_url);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_avatar(
  p_avatar_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User must be authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
  SET avatar_url = p_avatar_url,
      updated_at = NOW()
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', TRUE, 'user_id', v_user_id, 'avatar_url', p_avatar_url);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_person_avatar(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_avatar(TEXT) TO authenticated;

COMMIT;
