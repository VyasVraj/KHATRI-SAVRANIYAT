-- =============================================================================
-- Migration: 20261105123000_fix_persons_family_members_rls_recursion.sql
-- Purpose:
--   1. Fix mutual RLS recursion between public.persons and public.family_members
--   2. Reset and seed master public.gotras and public.nukhs to exactly match the
--      authoritative 29 Brahm Kshatriya Gotras and 147 Nukhs from the PDF.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER Authorization Helpers to Break RLS Mutual Recursion
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_own_person(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.persons
    WHERE id = p_person_id
      AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_own_person(UUID) IS
  'SECURITY DEFINER helper: checks if person record belongs to auth.uid() without triggering RLS recursion.';

CREATE OR REPLACE FUNCTION public.is_person_in_my_created_family(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members fm
    JOIN public.families f ON f.id = fm.family_id
    WHERE fm.person_id = p_person_id
      AND f.created_by = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_person_in_my_created_family(UUID) IS
  'SECURITY DEFINER helper: checks if person is in a family created by auth.uid() without triggering RLS recursion.';

-- -----------------------------------------------------------------------------
-- 2. Update Policies on family_members & persons
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "family_members_select_own" ON public.family_members;
CREATE POLICY "family_members_select_own"
  ON public.family_members
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND public.is_own_person(family_members.person_id)
  );

DROP POLICY IF EXISTS "persons_select_creator" ON public.persons;
CREATE POLICY "persons_select_creator"
  ON public.persons
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      created_by = auth.uid() OR
      user_id = auth.uid() OR
      public.is_person_in_my_created_family(persons.id)
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Reset and Populate Authoritative 29 Brahm Kshatriya Gotras & 147 Nukhs
-- -----------------------------------------------------------------------------

-- Temporarily drop or update foreign keys if needed
DELETE FROM public.nukhs;
DELETE FROM public.gotras;

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
    RETURNING id INTO v_gid;

    FOREACH v_nukh IN ARRAY r.nukhs
    LOOP
      INSERT INTO public.nukhs (gotra_id, name)
      VALUES (v_gid, v_nukh);
    END LOOP;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Grants on Core Tables
-- -----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.persons TO anon, authenticated;
GRANT SELECT ON TABLE public.families TO anon, authenticated;
GRANT SELECT ON TABLE public.family_members TO anon, authenticated;
GRANT SELECT ON TABLE public.relationships TO anon, authenticated;
GRANT SELECT ON TABLE public.gotras TO anon, authenticated;
GRANT SELECT ON TABLE public.nukhs TO anon, authenticated;
GRANT SELECT ON TABLE public.cities TO anon, authenticated;

COMMIT;
