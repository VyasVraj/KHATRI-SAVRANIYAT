-- =============================================================================
-- Migration: 20261106030000_enforce_person_field_validation.sql
-- Description: Implement strict 10 mandatory and 4 optional field validation
--              across public.persons, triggers, constraints and registration RPCs.
--
-- SPECIFICATION:
-- 10 MANDATORY FIELDS:
--   1. First Name (non-empty, trimmed)
--   2. Last Name / Surname (non-empty, trimmed)
--   3. Gender (MALE, FEMALE, OTHER)
--   4. Blood Group (A+, A-, B+, B-, AB+, AB-, O+, O-)
--   5. Birthplace (non-empty, trimmed)
--   6. Date of Birth (valid date <= CURRENT_DATE)
--   7. Gotra (must match approved master Gotra)
--   8. Nukh (must belong to selected master Gotra)
--   9. Email (valid email format)
--  10. Primary Phone (valid phone format)
--
-- 4 OPTIONAL FIELDS (Never block submission when empty):
--   1. Middle Name (nullable)
--   2. Maiden Name (nullable)
--   3. Date of Death (nullable; if provided, must be >= date_of_birth and <= CURRENT_DATE)
--   4. Secondary Phone (nullable)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure Columns Exist with Proper Types on public.persons
-- -----------------------------------------------------------------------------
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS birth_place TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS email_contact TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS phone_secondary TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS maiden_name TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS middle_name TEXT;

-- -----------------------------------------------------------------------------
-- 2. Add or Update Safe Check Constraints on public.persons
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- First Name non-empty check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_first_name_not_empty') THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_first_name_not_empty
      CHECK (first_name != '' AND length(trim(first_name)) > 0);
  END IF;

  -- Last Name non-empty check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_last_name_not_empty') THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_last_name_not_empty
      CHECK (last_name != '' AND length(trim(last_name)) > 0);
  END IF;

  -- Gender valid options check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_gender_valid') THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_gender_valid
      CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE', 'OTHER'));
  END IF;

  -- Blood group valid options check
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_blood_group') THEN
    ALTER TABLE public.persons DROP CONSTRAINT chk_persons_blood_group;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_blood_group_valid') THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_blood_group_valid
      CHECK (blood_group IS NULL OR blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));
  END IF;

  -- Date of birth not in future check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_dob_valid') THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_dob_valid
      CHECK (date_of_birth IS NULL OR (date_of_birth BETWEEN '1800-01-01' AND CURRENT_DATE));
  END IF;

  -- Date of death >= date of birth check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_dod_valid') THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_dod_valid
      CHECK (date_of_death IS NULL OR date_of_birth IS NULL OR date_of_death >= date_of_birth);
  END IF;

  -- Email format check
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_email_format') THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_email_format
      CHECK (email_contact IS NULL OR email_contact ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;

  -- Primary phone format check (allows digits, +, -, spaces, parentheses, at least 7 chars)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_persons_phone_format') THEN
    ALTER TABLE public.persons
      ADD CONSTRAINT chk_persons_phone_format
      CHECK (phone IS NULL OR length(trim(phone)) >= 7);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Database Validation Trigger Guard: validate_person_mandatory_fields_guard
-- -----------------------------------------------------------------------------
-- Enforces all 10 mandatory fields on INSERT and UPDATE of active person records.
-- Preserves existing soft-deleted records or records being marked deleted.
-- Ensures Gotra & Nukh relationship integrity against public.gotras & public.nukhs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_person_mandatory_fields_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gotra_id UUID;
  v_nukh_id UUID;
BEGIN
  -- If record is soft-deleted, allow without blocking deletion/cleanup
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Normalize empty strings to NULL for optional fields
  NEW.middle_name := NULLIF(trim(NEW.middle_name), '');
  NEW.maiden_name := NULLIF(trim(NEW.maiden_name), '');
  NEW.phone_secondary := NULLIF(trim(NEW.phone_secondary), '');

  -- 1. First Name (MANDATORY)
  IF NEW.first_name IS NULL OR length(trim(NEW.first_name)) = 0 THEN
    RAISE EXCEPTION 'First Name is required.' USING ERRCODE = '22023';
  END IF;
  NEW.first_name := trim(NEW.first_name);

  -- 2. Last Name / Surname (MANDATORY)
  IF NEW.last_name IS NULL OR length(trim(NEW.last_name)) = 0 THEN
    RAISE EXCEPTION 'Last Name is required.' USING ERRCODE = '22023';
  END IF;
  NEW.last_name := trim(NEW.last_name);

  -- 3. Gender (MANDATORY)
  IF NEW.gender IS NULL OR NEW.gender::TEXT NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
    RAISE EXCEPTION 'Please select Gender.' USING ERRCODE = '22023';
  END IF;

  -- 4. Blood Group (MANDATORY)
  IF NEW.blood_group IS NULL OR length(trim(NEW.blood_group)) = 0 OR trim(NEW.blood_group) NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') THEN
    RAISE EXCEPTION 'Please select Blood Group.' USING ERRCODE = '22023';
  END IF;
  NEW.blood_group := trim(NEW.blood_group);

  -- 5. Birthplace (MANDATORY)
  IF NEW.birth_place IS NULL OR length(trim(NEW.birth_place)) = 0 THEN
    RAISE EXCEPTION 'Birthplace is required.' USING ERRCODE = '22023';
  END IF;
  NEW.birth_place := trim(NEW.birth_place);

  -- 6. Date of Birth (MANDATORY)
  IF NEW.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Date of Birth is required.' USING ERRCODE = '22023';
  END IF;

  IF NEW.date_of_birth > CURRENT_DATE THEN
    RAISE EXCEPTION 'Date of birth cannot be in the future.' USING ERRCODE = '22023';
  END IF;

  -- Optional Date of Death validation
  IF NEW.date_of_death IS NOT NULL THEN
    IF NEW.date_of_death > CURRENT_DATE THEN
      RAISE EXCEPTION 'Date of death cannot be in the future.' USING ERRCODE = '22023';
    END IF;

    IF NEW.date_of_death < NEW.date_of_birth THEN
      RAISE EXCEPTION 'Date of death cannot be earlier than date of birth.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 7. Gotra (MANDATORY)
  IF NEW.gotra IS NULL OR length(trim(NEW.gotra)) = 0 THEN
    RAISE EXCEPTION 'Please select Gotra.' USING ERRCODE = '22023';
  END IF;
  NEW.gotra := trim(NEW.gotra);

  SELECT id INTO v_gotra_id
  FROM public.gotras
  WHERE lower(trim(name)) = lower(trim(NEW.gotra))
     OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(NEW.gotra, ' (', 1)))
  LIMIT 1;

  IF v_gotra_id IS NULL THEN
    RAISE EXCEPTION 'Please select an approved Gotra from the master list.' USING ERRCODE = '22023';
  END IF;

  -- 8. Nukh (MANDATORY)
  IF NEW.nukh IS NULL OR length(trim(NEW.nukh)) = 0 THEN
    RAISE EXCEPTION 'Please select Nukh.' USING ERRCODE = '22023';
  END IF;
  NEW.nukh := trim(NEW.nukh);

  SELECT id INTO v_nukh_id
  FROM public.nukhs
  WHERE gotra_id = v_gotra_id
    AND (
      lower(trim(name)) = lower(trim(NEW.nukh))
      OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(NEW.nukh, ' (', 1)))
      OR lower(name) LIKE '%' || lower(trim(NEW.nukh)) || '%'
    )
  LIMIT 1;

  IF v_nukh_id IS NULL THEN
    RAISE EXCEPTION 'Nukh "%" does not belong to the selected Gotra "%".', NEW.nukh, NEW.gotra USING ERRCODE = '22023';
  END IF;

  -- 9. Email (MANDATORY)
  IF NEW.email_contact IS NULL OR length(trim(NEW.email_contact)) = 0 THEN
    RAISE EXCEPTION 'Valid Email Address is required.' USING ERRCODE = '22023';
  END IF;
  NEW.email_contact := lower(trim(NEW.email_contact));

  IF NOT (NEW.email_contact ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') THEN
    RAISE EXCEPTION 'Valid Email Address is required.' USING ERRCODE = '22023';
  END IF;

  -- 10. Primary Phone (MANDATORY)
  IF NEW.phone IS NULL OR length(trim(NEW.phone)) = 0 THEN
    RAISE EXCEPTION 'Valid Primary Phone Number is required.' USING ERRCODE = '22023';
  END IF;
  NEW.phone := trim(NEW.phone);

  IF length(NEW.phone) < 7 THEN
    RAISE EXCEPTION 'Valid Primary Phone Number is required.' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_person_mandatory_fields_guard() IS
  'Trigger guard strictly validating the 10 mandatory and 4 optional person fields on insert/update.';

DROP TRIGGER IF EXISTS trg_validate_person_mandatory_fields ON public.persons;
CREATE TRIGGER trg_validate_person_mandatory_fields
  BEFORE INSERT OR UPDATE ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_person_mandatory_fields_guard();

-- -----------------------------------------------------------------------------
-- 4. Audit View & Function for Incomplete Existing Records
-- -----------------------------------------------------------------------------
-- Enables administrators to safely identify historical records requiring completion
-- without deleting or breaking them.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_incomplete_person_records()
RETURNS TABLE (
  person_id UUID,
  first_name TEXT,
  last_name TEXT,
  missing_fields TEXT[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id AS person_id,
    p.first_name,
    p.last_name,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN p.first_name IS NULL OR length(trim(p.first_name)) = 0 THEN 'first_name' ELSE NULL END,
      CASE WHEN p.last_name IS NULL OR length(trim(p.last_name)) = 0 THEN 'last_name' ELSE NULL END,
      CASE WHEN p.gender IS NULL THEN 'gender' ELSE NULL END,
      CASE WHEN p.blood_group IS NULL OR length(trim(p.blood_group)) = 0 THEN 'blood_group' ELSE NULL END,
      CASE WHEN p.birth_place IS NULL OR length(trim(p.birth_place)) = 0 THEN 'birth_place' ELSE NULL END,
      CASE WHEN p.date_of_birth IS NULL THEN 'date_of_birth' ELSE NULL END,
      CASE WHEN p.gotra IS NULL OR length(trim(p.gotra)) = 0 THEN 'gotra' ELSE NULL END,
      CASE WHEN p.nukh IS NULL OR length(trim(p.nukh)) = 0 THEN 'nukh' ELSE NULL END,
      CASE WHEN p.email_contact IS NULL OR length(trim(p.email_contact)) = 0 THEN 'email_contact' ELSE NULL END,
      CASE WHEN p.phone IS NULL OR length(trim(p.phone)) = 0 THEN 'phone' ELSE NULL END
    ], NULL) AS missing_fields
  FROM public.persons p
  WHERE p.deleted_at IS NULL
    AND (
      p.first_name IS NULL OR length(trim(p.first_name)) = 0
      OR p.last_name IS NULL OR length(trim(p.last_name)) = 0
      OR p.gender IS NULL
      OR p.blood_group IS NULL OR length(trim(p.blood_group)) = 0
      OR p.birth_place IS NULL OR length(trim(p.birth_place)) = 0
      OR p.date_of_birth IS NULL
      OR p.gotra IS NULL OR length(trim(p.gotra)) = 0
      OR p.nukh IS NULL OR length(trim(p.nukh)) = 0
      OR p.email_contact IS NULL OR length(trim(p.email_contact)) = 0
      OR p.phone IS NULL OR length(trim(p.phone)) = 0
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_incomplete_person_records() TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Update Atomic register_complete_family() RPC
-- -----------------------------------------------------------------------------
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
    -- 10 MANDATORY Person Fields
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

    IF v_head_first_name IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: First Name is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_last_name IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Last Name / Surname is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_gender_str IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gender is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_blood_group IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Blood Group is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_birth_place IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Birthplace is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_dob_str IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Date of Birth is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_gotra IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Gotra is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_nukh IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Nukh is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_phone IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Primary Phone Number is required for Family Head.' USING ERRCODE = '22023'; END IF;
    IF v_head_email IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: Email Address is required for Family Head.' USING ERRCODE = '22023'; END IF;

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

    -- Insert Head Person record
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
      NULL
    ) RETURNING id INTO v_head_person_id;
  END IF;

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
    'HEAD',
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

COMMIT;
