-- =============================================================================
-- Migration: 20261104120000_fix_family_creation_gotra_nukh_and_cities.sql
-- Purpose:
--   1. Create public.cities table with case-insensitive uniqueness and RLS
--   2. Update public.gotras and public.nukhs with the authoritative 29 Brahm Kshatriya Gotra entries from PDF
--   3. Add RLS policies for family creator on family_members and persons so creators can view their family & members
--   4. Update create_family_with_head RPC with COMMUNITY default privacy and zero Mukhi role confusion
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Cities Registry Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_unique_norm
  ON public.cities (lower(trim(name)), lower(trim(state)), lower(trim(country)));

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cities_select_all ON public.cities;
CREATE POLICY cities_select_all ON public.cities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS cities_insert_authenticated ON public.cities;
CREATE POLICY cities_insert_authenticated ON public.cities
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT ON TABLE public.cities TO authenticated, anon;
GRANT INSERT ON TABLE public.cities TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Creator Access RLS on family_members & persons
--    Guarantees creators can always immediately view their created families & members
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_members_select_creator" ON public.family_members;
CREATE POLICY "family_members_select_creator" ON public.family_members
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      added_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = family_members.family_id
          AND f.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "persons_select_creator" ON public.persons;
CREATE POLICY "persons_select_creator" ON public.persons
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      created_by = auth.uid() OR
      user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = persons.id
          AND f.created_by = auth.uid()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Seed/Update Authoritative 29 Gotras and Nukhs from Brahm Kshatriya PDF
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_gid UUID;
  v_nukh TEXT;
BEGIN
  FOR r IN
    SELECT g.name AS g_name, g.disp_order, g.nukhs
    FROM (VALUES
      ('Agastya', 1, ARRAY['Arora (Arora)', 'Asalavanta (Asalavanta)', 'Gajubha', 'Tatiya']),
      ('Utri', 2, ARRAY['Asara (Asara)', 'Mamalutara', 'Dingama', 'Baval', 'Dungana']),
      ('Badarayana', 3, ARRAY['Bariya (Bungadiya)', 'Boradiya', 'Rakhuna', 'Rakhana']),
      ('Bhamaraya', 4, ARRAY['Vesamiya (Vesamiya, Bosamiya)', 'Barva', 'Papor iya', 'Parya (Padiya)']),
      ('Bharadwaj', 5, ARRAY['Bhut (Nirmal)', 'Bheva', 'Bhudda', 'Kakar (Kokil)', 'Bhedan (Bheda)', 'Bhul', 'Bhadar (Bhadar)']),
      ('Tandira', 6, ARRAY['Tadad Otha', 'Dhora', 'Ida', 'Dadiya', 'Dangana']),
      ('Parashar', 7, ARRAY['Panjabhut', 'Padhar', 'Mamata (Mamatara)', 'Bhitar Mehera']),
      ('Jamadagni', 8, ARRAY['Godhiya (Godiya)', 'Joshihaar (Joshihaar)', 'Joshihar', 'Jajal', 'Jogi', 'Jariya', 'Jagar', 'Lulla']),
      ('Dhananjaya', 9, ARRAY['Dhanga', 'Dhare', 'Dhanadiya (Dhanadiya)', 'Bara (Bada)', 'Hans Jamat (Hans Jamat)']),
      ('Darvashayana (Dayavahana)', 10, ARRAY['Dubal (Dubdan)', 'Kosara', 'Dadhara (Dadariya)', 'Dulera', 'Damariya (Damariya)', 'Dhariya', 'Gadya']),
      ('Raghuna', 11, ARRAY['Rasputara', 'Raspoda', 'Raja', 'Khara (Kharara)', 'Sasiya']),
      ('Sudarshan', 12, ARRAY['Sonisher (Soniser Soniser)', 'Sita (Sota)', 'Sodiya (Sodiya)', 'Damara (Damara)', 'Chava Jamavara']),
      ('Shandilya', 13, ARRAY['Sanicharya (Sanicharya)', 'Sonapar (Sonapar)', 'Sidhava', 'Sodhi (Sodha)']),
      ('Shankhpal', 14, ARRAY['Sorathiya', 'Soneji (Soneja)', 'Dangara (Dangara)', 'Desar', 'Gadiya']),
      ('Kashyap (Kashyapa)', 15, ARRAY['Kathambhan (Kath Vada, Kathiya)', 'Kandhara', 'Harun (Majhadiya)', 'Hanja (Hanjadiya)']),
      ('Kamuk', 16, ARRAY['Keshari', 'Kariya (Kidiya)', 'Tokala (Tikli)', 'Tangara', 'Daka']),
      ('Krishna (Shishan)', 17, ARRAY['Karotala', 'Karbaliya', 'Khubhar (Khubadiya)', 'Khuba (Khuda)', 'Khubhariya']),
      ('Karna', 18, ARRAY['Kidi (Kiri)', 'Vaniya (Vagiya)', 'Davani', 'Dand (Dandana)']),
      ('Kaushik', 19, ARRAY['Kakadya', 'Kaku (Kakava, Kakupota)', 'Kakara', 'Lakhanhar', 'Katakiya']),
      ('Gargya', 20, ARRAY['Gajkaran (Gaj Karan)', 'Gumara', 'Vankala', 'Chhuchha (Chhuchha)']),
      ('Gautam', 21, ARRAY['Shirach', 'Goratola', 'Gila', 'Madhur', 'Madhu']),
      ('Mandhata', 22, ARRAY['Mamudar', 'Mavariya (Mavarda)', 'Mavadiya (Mavadasya)', 'Mayadhak', 'Mayadhara', 'Mohanvacha']),
      ('Mudgal', 23, ARRAY['Makariya (Makadiya, Manak)', 'Makori', 'Medhiya (Medhya)', 'Mahhar', 'Ranara', 'Meher (Mera)']),
      ('Naradijana', 24, ARRAY['Nansi', 'Nemana', 'Naisar', 'Neno', 'Nan (Nayan)']),
      ('Vaman', 25, ARRAY['Vadhala', 'Davadiya', 'Dod (Doshara)', 'Dadiya']),
      ('Vamdev', 26, ARRAY['Khede (Vare)', 'Lamariya', 'Leya', 'Luladiya']),
      ('Vatsa', 27, ARRAY['Vama', 'Vajari', 'Kidi', 'Vali (Veli)', 'Chamariya']),
      ('Vashishtha', 28, ARRAY['Valin (Valara)', 'Chhapara', 'Dangana', 'Mel (Meri)', 'Jil Jhina']),
      ('Gotra not known', 29, ARRAY['Acharya', 'Pipaliya', 'Gana', 'Gondi Odha', 'Saraya', 'Harasaya', 'Chhatakpur', 'Gungava'])
    ) AS g(name, disp_order, nukhs)
  LOOP
    INSERT INTO public.gotras (name, display_order)
    VALUES (r.g_name, r.disp_order)
    ON CONFLICT ((lower(name))) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order;

    SELECT id INTO v_gid
    FROM public.gotras
    WHERE lower(name) = lower(r.g_name);

    IF v_gid IS NOT NULL THEN
      FOREACH v_nukh IN ARRAY r.nukhs
      LOOP
        INSERT INTO public.nukhs (gotra_id, name)
        VALUES (v_gid, v_nukh)
        ON CONFLICT (gotra_id, (lower(name))) DO UPDATE
        SET name = EXCLUDED.name;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Transactional create_family_with_head RPC Update
--    - COMMUNITY default privacy (ensures family census records appear in census)
--    - Family Head is linked to family_members with role='HEAD' and is_head=TRUE
--    - ZERO Mukhi role assignment (Family Head != Mukhi)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_family_with_head(
  p_family_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_gotra TEXT DEFAULT NULL,
  p_nukh TEXT DEFAULT NULL,
  p_profile_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_members_privacy public.privacy_level DEFAULT 'COMMUNITY',
  p_existing_person_id UUID DEFAULT NULL,
  p_new_person_first_name TEXT DEFAULT NULL,
  p_new_person_middle_name TEXT DEFAULT NULL,
  p_new_person_last_name TEXT DEFAULT NULL,
  p_new_person_maiden_name TEXT DEFAULT NULL,
  p_new_person_gender public.gender DEFAULT 'MALE',
  p_new_person_dob DATE DEFAULT NULL,
  p_new_person_birth_place TEXT DEFAULT NULL
)
RETURNS TABLE (
  family_id UUID,
  head_person_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_family_id UUID;
  v_head_person_id UUID;
  v_clean_fam_name TEXT;
  v_clean_first_name TEXT;
  v_clean_last_name TEXT;
  v_eff_privacy public.privacy_level;
BEGIN
  -- 1. Caller Authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: A valid session is required to create a family.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_caller_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: User account is inactive, suspended, or does not exist.' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Family Name
  v_clean_fam_name := NULLIF(trim(p_family_name), '');
  IF v_clean_fam_name IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Family name is required.' USING ERRCODE = '22023';
  END IF;

  v_eff_privacy := COALESCE(p_profile_privacy, 'COMMUNITY'::public.privacy_level);

  -- 3. Resolve or Create Head Person
  IF p_existing_person_id IS NOT NULL THEN
    SELECT p.id INTO v_head_person_id
    FROM public.persons p
    WHERE p.id = p_existing_person_id
      AND p.deleted_at IS NULL;

    IF v_head_person_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: The specified person does not exist.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    v_clean_first_name := NULLIF(trim(p_new_person_first_name), '');
    v_clean_last_name := NULLIF(trim(p_new_person_last_name), '');

    IF v_clean_first_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: First name is required for new family head.' USING ERRCODE = '22023';
    END IF;
    IF v_clean_last_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Last name is required for new family head.' USING ERRCODE = '22023';
    END IF;

    -- PERSON != USER Invariant: user_id is explicitly NULL for census records
    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      birth_place,
      gotra,
      nukh,
      profile_privacy,
      contact_privacy,
      dob_privacy,
      created_by,
      user_id
    )
    VALUES (
      v_clean_first_name,
      NULLIF(trim(p_new_person_middle_name), ''),
      v_clean_last_name,
      NULLIF(trim(p_new_person_maiden_name), ''),
      COALESCE(p_new_person_gender, 'MALE'::public.gender),
      p_new_person_dob,
      COALESCE(NULLIF(trim(p_new_person_birth_place), ''), NULLIF(trim(p_city), '')),
      NULLIF(trim(p_gotra), ''),
      NULLIF(trim(p_nukh), ''),
      v_eff_privacy,
      'PRIVATE',
      'PRIVATE',
      v_caller_id,
      NULL
    )
    RETURNING id INTO v_head_person_id;
  END IF;

  -- 4. Insert Family Record
  INSERT INTO public.families (
    family_name,
    description,
    city,
    state,
    country,
    gotra,
    nukh,
    profile_privacy,
    members_privacy,
    created_by
  )
  VALUES (
    v_clean_fam_name,
    NULLIF(trim(p_description), ''),
    NULLIF(trim(p_city), ''),
    NULLIF(trim(p_state), ''),
    COALESCE(NULLIF(trim(p_country), ''), 'India'),
    NULLIF(trim(p_gotra), ''),
    NULLIF(trim(p_nukh), ''),
    v_eff_privacy,
    COALESCE(p_members_privacy, v_eff_privacy),
    v_caller_id
  )
  RETURNING id INTO v_family_id;

  -- 5. Insert Family Head Member Record (Head of household strictly, NEVER Mukhi)
  INSERT INTO public.family_members (
    family_id,
    person_id,
    role,
    is_head,
    added_by
  )
  VALUES (
    v_family_id,
    v_head_person_id,
    'HEAD'::public.family_role,
    TRUE,
    v_caller_id
  );

  family_id := v_family_id;
  head_person_id := v_head_person_id;
  RETURN NEXT;
END;
$$;

COMMIT;
