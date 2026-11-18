-- =============================================================================
-- Migration: 20261109160000_comprehensive_family_relationship_system.sql
-- Purpose:
--   1. Centralized Family Relationships Master System:
--      - Extends public.family_relationships_master with standardized columns:
--        relationship_code (stable UPPERCASE), relationship_direction,
--        relationship_group, is_derived, is_selectable, is_active, display_order.
--      - Covers all 13 categories from KHATRI_SARVANIYAT_Comprehensive_Family_Relationship_Reference(1).pdf
--      - Includes extended nephew/niece branches, in-laws, cousins, and derived relations.
--   2. Custom Community Relationships Table (Other / Specify):
--      - public.custom_family_relationships for regional and specific terms.
--   3. Centralized RPC public.save_member_structured_relationship:
--      - Handles reference person, connecting spouse, and bidirectional links.
--   4. Canonical 10-Person Vyas Validation Family Setup:
--      - Includes Rajvi Harsh Vyas (Nephew's Wife / Daughter-in-law).
-- =============================================================================

BEGIN;

-- 1. Extend public.family_relationships_master table
ALTER TABLE IF EXISTS public.family_relationships_master
  ADD COLUMN IF NOT EXISTS relationship_code TEXT,
  ADD COLUMN IF NOT EXISTS relationship_direction TEXT DEFAULT 'BIDIRECTIONAL',
  ADD COLUMN IF NOT EXISTS relationship_group TEXT DEFAULT 'IMMEDIATE',
  ADD COLUMN IF NOT EXISTS is_derived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_selectable BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Unique constraint on relationship_code if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_family_relationships_master_code'
  ) THEN
    ALTER TABLE public.family_relationships_master
      ADD CONSTRAINT uq_family_relationships_master_code UNIQUE (relationship_code);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Create custom_family_relationships table for "Other / Specify"
CREATE TABLE IF NOT EXISTS public.custom_family_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
  source_person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,
  target_person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,
  name_en TEXT NOT NULL,
  name_hi TEXT,
  definition TEXT,
  relationship_direction TEXT DEFAULT 'DIRECT',
  is_approved BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT custom_rel_no_self CHECK (source_person_id <> target_person_id)
);

ALTER TABLE public.custom_family_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read custom relationships" ON public.custom_family_relationships;
CREATE POLICY "Public read custom relationships"
  ON public.custom_family_relationships
  FOR SELECT TO PUBLIC
  USING (true);

DROP POLICY IF EXISTS "Authenticated create custom relationships" ON public.custom_family_relationships;
CREATE POLICY "Authenticated create custom relationships"
  ON public.custom_family_relationships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Manage custom relationships" ON public.custom_family_relationships;
CREATE POLICY "Manage custom relationships"
  ON public.custom_family_relationships
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid() OR
    public.is_admin()
  );

DROP POLICY IF EXISTS "Delete custom relationships" ON public.custom_family_relationships;
CREATE POLICY "Delete custom relationships"
  ON public.custom_family_relationships
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid() OR
    public.is_admin()
  );

-- 3. Upsert Comprehensive 13-Category Kinship Catalog from Official PDF
-- Using INSERT ... ON CONFLICT (canonical_key) DO UPDATE
INSERT INTO public.family_relationships_master (
  canonical_key, category_number, category_name, english_label, hindi_label, display_label,
  meaning, gender_applicability, family_role, reciprocal_key_male, reciprocal_key_female, reciprocal_key_neutral,
  relationship_code, relationship_direction, relationship_group, is_derived, is_selectable, is_active, display_order
) VALUES
-- Category 1: Immediate family and spouse
('father', 1, 'Immediate family and spouse', 'Father', 'पिता', 'Father (पिता)', 'A person''s male parent.', 'MALE', 'PARENT', 'son', 'daughter', 'child', 'FATHER', 'INVERSE', 'IMMEDIATE', false, true, true, 10),
('mother', 1, 'Immediate family and spouse', 'Mother', 'माता', 'Mother (माता)', 'A person''s female parent.', 'FEMALE', 'PARENT', 'son', 'daughter', 'child', 'MOTHER', 'INVERSE', 'IMMEDIATE', false, true, true, 20),
('parent', 1, 'Immediate family and spouse', 'Parent', 'माता या पिता', 'Parent (माता या पिता)', 'Gender-neutral parent.', 'NEUTRAL', 'PARENT', 'son', 'daughter', 'child', 'PARENT', 'INVERSE', 'IMMEDIATE', false, true, true, 30),
('son', 1, 'Immediate family and spouse', 'Son', 'बेटा', 'Son (बेटा)', 'A person''s male child.', 'MALE', 'CHILD', 'father', 'mother', 'parent', 'SON', 'DIRECT', 'IMMEDIATE', false, true, true, 40),
('daughter', 1, 'Immediate family and spouse', 'Daughter', 'बेटी', 'Daughter (बेटी)', 'A person''s female child.', 'FEMALE', 'CHILD', 'father', 'mother', 'parent', 'DAUGHTER', 'DIRECT', 'IMMEDIATE', false, true, true, 50),
('child', 1, 'Immediate family and spouse', 'Child', 'संतान', 'Child (संतान)', 'Gender-neutral child.', 'NEUTRAL', 'CHILD', 'father', 'mother', 'parent', 'CHILD', 'DIRECT', 'IMMEDIATE', false, true, true, 60),
('husband', 1, 'Immediate family and spouse', 'Husband', 'पति', 'Husband (पति)', 'Male spouse.', 'MALE', 'SPOUSE', 'husband', 'wife', 'spouse', 'HUSBAND', 'SYMMETRIC', 'IMMEDIATE', false, true, true, 70),
('wife', 1, 'Immediate family and spouse', 'Wife', 'पत्नी', 'Wife (पत्नी)', 'Female spouse.', 'FEMALE', 'SPOUSE', 'husband', 'wife', 'spouse', 'WIFE', 'SYMMETRIC', 'IMMEDIATE', false, true, true, 80),
('spouse', 1, 'Immediate family and spouse', 'Spouse', 'जीवनसाथी', 'Spouse (जीवनसाथी)', 'Gender-neutral spouse.', 'NEUTRAL', 'SPOUSE', 'husband', 'wife', 'spouse', 'SPOUSE', 'SYMMETRIC', 'IMMEDIATE', false, true, true, 90),
('partner', 1, 'Immediate family and spouse', 'Partner', 'साथी', 'Partner (साथी)', 'Partner where legally/socially applicable.', 'NEUTRAL', 'SPOUSE', 'partner', 'partner', 'partner', 'PARTNER', 'SYMMETRIC', 'IMMEDIATE', false, true, true, 100),

-- Category 2: Grandparents, grandchildren and ancestors
('paternal_grandfather', 2, 'Grandparents, grandchildren and ancestors', 'Paternal grandfather', 'दादा', 'Paternal grandfather (दादा)', 'Father''s father.', 'MALE', 'GRANDPARENT', 'grandson', 'granddaughter', 'grandchild', 'PATERNAL_GRANDFATHER', 'INVERSE', 'ANCESTOR', false, true, true, 200),
('paternal_grandmother', 2, 'Grandparents, grandchildren and ancestors', 'Paternal grandmother', 'दादी', 'Paternal grandmother (दादी)', 'Father''s mother.', 'FEMALE', 'GRANDPARENT', 'grandson', 'granddaughter', 'grandchild', 'PATERNAL_GRANDMOTHER', 'INVERSE', 'ANCESTOR', false, true, true, 210),
('maternal_grandfather', 2, 'Grandparents, grandchildren and ancestors', 'Maternal grandfather', 'नाना', 'Maternal grandfather (नाना)', 'Mother''s father.', 'MALE', 'GRANDPARENT', 'grandson', 'granddaughter', 'grandchild', 'MATERNAL_GRANDFATHER', 'INVERSE', 'ANCESTOR', false, true, true, 220),
('maternal_grandmother', 2, 'Grandparents, grandchildren and ancestors', 'Maternal grandmother', 'नानी', 'Maternal grandmother (नानी)', 'Mother''s mother.', 'FEMALE', 'GRANDPARENT', 'grandson', 'granddaughter', 'grandchild', 'MATERNAL_GRANDMOTHER', 'INVERSE', 'ANCESTOR', false, true, true, 230),
('grandfather', 2, 'Grandparents, grandchildren and ancestors', 'Grandfather', 'दादा / नाना', 'Grandfather (दादा / नाना)', 'Grandfather; side unspecified.', 'MALE', 'GRANDPARENT', 'grandson', 'granddaughter', 'grandchild', 'GRANDFATHER', 'INVERSE', 'ANCESTOR', false, true, true, 240),
('grandmother', 2, 'Grandparents, grandchildren and ancestors', 'Grandmother', 'दादी / नानी', 'Grandmother (दादी / नानी)', 'Grandmother; side unspecified.', 'FEMALE', 'GRANDPARENT', 'grandson', 'granddaughter', 'grandchild', 'GRANDMOTHER', 'INVERSE', 'ANCESTOR', false, true, true, 250),
('grandparent', 2, 'Grandparents, grandchildren and ancestors', 'Grandparent', 'दादा-दादी / नाना-नानी', 'Grandparent (दादा-दादी / नाना-नानी)', 'Gender-neutral grandparent.', 'NEUTRAL', 'GRANDPARENT', 'grandson', 'granddaughter', 'grandchild', 'GRANDPARENT', 'INVERSE', 'ANCESTOR', false, true, true, 260),
('grandson', 2, 'Grandparents, grandchildren and ancestors', 'Grandson', 'पोता / नाती', 'Grandson (पोता / नाती)', 'Male grandchild; exact side depends on child.', 'MALE', 'GRANDCHILD', 'grandfather', 'grandmother', 'grandparent', 'GRANDSON', 'DIRECT', 'DESCENDANT', false, true, true, 270),
('granddaughter', 2, 'Grandparents, grandchildren and ancestors', 'Granddaughter', 'पोती / नातिन', 'Granddaughter (पोती / नातिन)', 'Female grandchild; exact side depends on child.', 'FEMALE', 'GRANDCHILD', 'grandfather', 'grandmother', 'grandparent', 'GRANDDAUGHTER', 'DIRECT', 'DESCENDANT', false, true, true, 280),
('grandchild', 2, 'Grandparents, grandchildren and ancestors', 'Grandchild', 'पोता / पोती / नाती / नातिन', 'Grandchild (पोता / पोती / नाती / नातिन)', 'Gender-neutral grandchild.', 'NEUTRAL', 'GRANDCHILD', 'grandfather', 'grandmother', 'grandparent', 'GRANDCHILD', 'DIRECT', 'DESCENDANT', false, true, true, 290),
('great_grandfather', 2, 'Grandparents, grandchildren and ancestors', 'Great-grandfather', 'परदादा / परनाना', 'Great-grandfather (परदादा / परनाना)', 'Parent''s grandfather.', 'MALE', 'GRANDPARENT', 'great_grandson', 'great_granddaughter', 'great_grandchild', 'GREAT_GRANDFATHER', 'INVERSE', 'ANCESTOR', false, true, true, 300),
('great_grandmother', 2, 'Grandparents, grandchildren and ancestors', 'Great-grandmother', 'परदादी / परनानी', 'Great-grandmother (परदादी / परनानी)', 'Parent''s grandmother.', 'FEMALE', 'GRANDPARENT', 'great_grandson', 'great_granddaughter', 'great_grandchild', 'GREAT_GRANDMOTHER', 'INVERSE', 'ANCESTOR', false, true, true, 310),
('great_grandparent', 2, 'Grandparents, grandchildren and ancestors', 'Great-grandparent', 'परदादा-परदादी / परनाना-परनानी', 'Great-grandparent (परदादा-परदादी / परनाना-परनानी)', 'Gender-neutral great-grandparent.', 'NEUTRAL', 'GRANDPARENT', 'great_grandson', 'great_granddaughter', 'great_grandchild', 'GREAT_GRANDPARENT', 'INVERSE', 'ANCESTOR', false, true, true, 320),
('great_grandson', 2, 'Grandparents, grandchildren and ancestors', 'Great-grandson', 'परपोता / परनाती', 'Great-grandson (परपोता / परनाती)', 'Great-grandchild who is male.', 'MALE', 'GRANDCHILD', 'great_grandfather', 'great_grandmother', 'great_grandparent', 'GREAT_GRANDSON', 'DIRECT', 'DESCENDANT', false, true, true, 330),
('great_granddaughter', 2, 'Grandparents, grandchildren and ancestors', 'Great-granddaughter', 'परपोती / परनातिन', 'Great-granddaughter (परपोती / परनातिन)', 'Great-grandchild who is female.', 'FEMALE', 'GRANDCHILD', 'great_grandfather', 'great_grandmother', 'great_grandparent', 'GREAT_GRANDDAUGHTER', 'DIRECT', 'DESCENDANT', false, true, true, 340),
('great_grandchild', 2, 'Grandparents, grandchildren and ancestors', 'Great-grandchild', 'परपोता / परपोती / परनाती / परनातिन', 'Great-grandchild (परपोता / परपोती / परनाती / परनातिन)', 'Gender-neutral great-grandchild.', 'NEUTRAL', 'GRANDCHILD', 'great_grandfather', 'great_grandmother', 'great_grandparent', 'GREAT_GRANDCHILD', 'DIRECT', 'DESCENDANT', false, true, true, 350),
('ancestor', 2, 'Grandparents, grandchildren and ancestors', 'Ancestor', 'पूर्वज', 'Ancestor (पूर्वज)', 'Earlier-generation relative; exact relation unspecified.', 'NEUTRAL', 'GRANDPARENT', 'descendant', 'descendant', 'descendant', 'ANCESTOR', 'INVERSE', 'ANCESTOR', false, true, true, 360),
('descendant', 2, 'Grandparents, grandchildren and ancestors', 'Descendant', 'वंशज', 'Descendant (वंशज)', 'Any later-generation descendant.', 'NEUTRAL', 'GRANDCHILD', 'ancestor', 'ancestor', 'ancestor', 'DESCENDANT', 'DIRECT', 'DESCENDANT', false, true, true, 370),

-- Category 3: Siblings and half/step siblings
('brother', 3, 'Siblings and half/step siblings', 'Brother', 'भाई', 'Brother (भाई)', 'Male sibling.', 'MALE', 'SIBLING', 'brother', 'sister', 'sibling', 'BROTHER', 'SYMMETRIC', 'SIBLING', false, true, true, 400),
('sister', 3, 'Siblings and half/step siblings', 'Sister', 'बहन', 'Sister (बहन)', 'Female sibling.', 'FEMALE', 'SIBLING', 'brother', 'sister', 'sibling', 'SISTER', 'SYMMETRIC', 'SIBLING', false, true, true, 410),
('sibling', 3, 'Siblings and half/step siblings', 'Sibling', 'भाई या बहन', 'Sibling (भाई या बहन)', 'Gender-neutral sibling.', 'NEUTRAL', 'SIBLING', 'brother', 'sister', 'sibling', 'SIBLING', 'SYMMETRIC', 'SIBLING', false, true, true, 420),
('elder_brother', 3, 'Siblings and half/step siblings', 'Elder brother', 'बड़ा भाई', 'Elder brother (बड़ा भाई)', 'Older male sibling.', 'MALE', 'SIBLING', 'younger_brother', 'younger_sister', 'sibling', 'ELDER_BROTHER', 'SYMMETRIC', 'SIBLING', false, true, true, 430),
('younger_brother', 3, 'Siblings and half/step siblings', 'Younger brother', 'छोटा भाई', 'Younger brother (छोटा भाई)', 'Younger male sibling.', 'MALE', 'SIBLING', 'elder_brother', 'elder_sister', 'sibling', 'YOUNGER_BROTHER', 'SYMMETRIC', 'SIBLING', false, true, true, 440),
('elder_sister', 3, 'Siblings and half/step siblings', 'Elder sister', 'बड़ी बहन', 'Elder sister (बड़ी बहन)', 'Older female sibling.', 'FEMALE', 'SIBLING', 'younger_brother', 'younger_sister', 'sibling', 'ELDER_SISTER', 'SYMMETRIC', 'SIBLING', false, true, true, 450),
('younger_sister', 3, 'Siblings and half/step siblings', 'Younger sister', 'छोटी बहन', 'Younger sister (छोटी बहन)', 'Younger female sibling.', 'FEMALE', 'SIBLING', 'elder_brother', 'elder_sister', 'sibling', 'YOUNGER_SISTER', 'SYMMETRIC', 'SIBLING', false, true, true, 460),
('twin_brother', 3, 'Siblings and half/step siblings', 'Twin brother', 'जुड़वाँ भाई', 'Twin brother (जुड़वाँ भाई)', 'Male twin sibling.', 'MALE', 'SIBLING', 'twin_brother', 'twin_sister', 'twin_sibling', 'TWIN_BROTHER', 'SYMMETRIC', 'SIBLING', false, true, true, 470),
('twin_sister', 3, 'Siblings and half/step siblings', 'Twin sister', 'जुड़वाँ बहन', 'Twin sister (जुड़वाँ बहन)', 'Female twin sibling.', 'FEMALE', 'SIBLING', 'twin_brother', 'twin_sister', 'twin_sibling', 'TWIN_SISTER', 'SYMMETRIC', 'SIBLING', false, true, true, 480),
('twin_sibling', 3, 'Siblings and half/step siblings', 'Twin sibling', 'जुड़वाँ भाई या बहन', 'Twin sibling (जुड़वाँ भाई या बहन)', 'Gender-neutral twin sibling.', 'NEUTRAL', 'SIBLING', 'twin_brother', 'twin_sister', 'twin_sibling', 'TWIN_SIBLING', 'SYMMETRIC', 'SIBLING', false, true, true, 490),
('half_brother', 3, 'Siblings and half/step siblings', 'Half-brother', 'सौतेला भाई (एक जैविक माता या पिता समान)', 'Half-brother (सौतेला भाई (एक जैविक माता या पिता समान))', 'Sibling sharing one biological parent.', 'MALE', 'SIBLING', 'half_brother', 'half_sister', 'half_sibling', 'HALF_BROTHER', 'SYMMETRIC', 'SIBLING', false, true, true, 500),
('half_sister', 3, 'Siblings and half/step siblings', 'Half-sister', 'सौतेली बहन (एक जैविक माता या पिता समान)', 'Half-sister (सौतेली बहन (एक जैविक माता या पिता समान))', 'Sibling sharing one biological parent.', 'FEMALE', 'SIBLING', 'half_brother', 'half_sister', 'half_sibling', 'HALF_SISTER', 'SYMMETRIC', 'SIBLING', false, true, true, 510),
('half_sibling', 3, 'Siblings and half/step siblings', 'Half-sibling', 'सौतेला भाई या बहन', 'Half-sibling (सौतेला भाई या बहन)', 'Gender-neutral half sibling.', 'NEUTRAL', 'SIBLING', 'half_brother', 'half_sister', 'half_sibling', 'HALF_SIBLING', 'SYMMETRIC', 'SIBLING', false, true, true, 520),
('stepbrother', 3, 'Siblings and half/step siblings', 'Stepbrother', 'सौतेला भाई', 'Stepbrother (सौतेला भाई)', 'Step-parent''s child; not automatically a biological sibling.', 'MALE', 'EXTENDED', 'stepbrother', 'stepsister', 'stepsibling', 'STEPBROTHER', 'SYMMETRIC', 'STEP_FAMILY', false, true, true, 530),
('stepsister', 3, 'Siblings and half/step siblings', 'Stepsister', 'सौतेली बहन', 'Stepsister (सौतेली बहन)', 'Step-parent''s child; not automatically a biological sibling.', 'FEMALE', 'EXTENDED', 'stepbrother', 'stepsister', 'stepsibling', 'STEPSISTER', 'SYMMETRIC', 'STEP_FAMILY', false, true, true, 540),
('stepsibling', 3, 'Siblings and half/step siblings', 'Stepsibling', 'सौतेला भाई या बहन', 'Stepsibling (सौतेला भाई या बहन)', 'Gender-neutral step-sibling.', 'NEUTRAL', 'EXTENDED', 'stepbrother', 'stepsister', 'stepsibling', 'STEPSIBLING', 'SYMMETRIC', 'STEP_FAMILY', false, true, true, 550),

-- Category 4: Aunts, uncles and their spouses
('paternal_uncle', 4, 'Aunts, uncles and their spouses', 'Paternal uncle', 'चाचा / ताऊ', 'Paternal uncle (चाचा / ताऊ)', 'Father''s brother; younger/older distinction may be used.', 'MALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'PATERNAL_UNCLE', 'INVERSE', 'COLLATERAL', false, true, true, 600),
('paternal_aunt', 4, 'Aunts, uncles and their spouses', 'Paternal aunt', 'बुआ', 'Paternal aunt (बुआ)', 'Father''s sister.', 'FEMALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'PATERNAL_AUNT', 'INVERSE', 'COLLATERAL', false, true, true, 610),
('maternal_uncle', 4, 'Aunts, uncles and their spouses', 'Maternal uncle', 'मामा', 'Maternal uncle (मामा)', 'Mother''s brother.', 'MALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'MATERNAL_UNCLE', 'INVERSE', 'COLLATERAL', false, true, true, 620),
('maternal_aunt', 4, 'Aunts, uncles and their spouses', 'Maternal aunt', 'मौसी', 'Maternal aunt (मौसी)', 'Mother''s sister.', 'FEMALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'MATERNAL_AUNT', 'INVERSE', 'COLLATERAL', false, true, true, 630),
('uncle', 4, 'Aunts, uncles and their spouses', 'Uncle', 'चाचा / ताऊ / मामा', 'Uncle (चाचा / ताऊ / मामा)', 'Parent''s brother; side unspecified.', 'MALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'UNCLE', 'INVERSE', 'COLLATERAL', false, true, true, 640),
('aunt', 4, 'Aunts, uncles and their spouses', 'Aunt', 'बुआ / मौसी', 'Aunt (बुआ / मौसी)', 'Parent''s sister; side unspecified.', 'FEMALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'AUNT', 'INVERSE', 'COLLATERAL', false, true, true, 650),
('uncle_by_marriage', 4, 'Aunts, uncles and their spouses', 'Uncle by marriage', 'विवाह से बने चाचा / मामा', 'Uncle by marriage (विवाह से बने चाचा / मामा)', 'Uncle through marriage.', 'MALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'UNCLE_BY_MARRIAGE', 'INVERSE', 'COLLATERAL', false, true, true, 660),
('aunt_by_marriage', 4, 'Aunts, uncles and their spouses', 'Aunt by marriage', 'विवाह से बनी बुआ / मौसी', 'Aunt by marriage (विवाह से बनी बुआ / मौसी)', 'Aunt through marriage.', 'FEMALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'AUNT_BY_MARRIAGE', 'INVERSE', 'COLLATERAL', false, true, true, 670),
('uncles_wife', 4, 'Aunts, uncles and their spouses', 'Uncle''s wife', 'चाची / ताई / मामी', 'Uncle''s wife (चाची / ताई / मामी)', 'Wife of an uncle; exact Hindi term depends on side/age.', 'FEMALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'UNCLES_WIFE', 'INVERSE', 'COLLATERAL', false, true, true, 680),
('aunts_husband', 4, 'Aunts, uncles and their spouses', 'Aunt''s husband', 'फूफा / मौसा', 'Aunt''s husband (फूफा / मौसा)', 'Husband of an aunt.', 'MALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'AUNTS_HUSBAND', 'INVERSE', 'COLLATERAL', false, true, true, 690),
('paternal_uncles_son', 4, 'Aunts, uncles and their spouses', 'Paternal uncle''s son', 'चचेरा भाई', 'Paternal uncle''s son (चचेरा भाई)', 'Male child of father''s brother.', 'MALE', 'SIBLING', 'first_cousin', 'first_cousin', 'first_cousin', 'PATERNAL_UNCLES_SON', 'SYMMETRIC', 'COLLATERAL', false, true, true, 700),
('paternal_uncles_daughter', 4, 'Aunts, uncles and their spouses', 'Paternal uncle''s daughter', 'चचेरी बहन', 'Paternal uncle''s daughter (चचेरी बहन)', 'Female child of father''s brother.', 'FEMALE', 'SIBLING', 'first_cousin', 'first_cousin', 'first_cousin', 'PATERNAL_UNCLES_DAUGHTER', 'SYMMETRIC', 'COLLATERAL', false, true, true, 710),
('paternal_aunts_child', 4, 'Aunts, uncles and their spouses', 'Paternal aunt''s child', 'फुफेरा भाई / फुफेरी बहन', 'Paternal aunt''s child (फुफेरा भाई / फुफेरी बहन)', 'Child of father''s sister.', 'NEUTRAL', 'SIBLING', 'first_cousin', 'first_cousin', 'first_cousin', 'PATERNAL_AUNTS_CHILD', 'SYMMETRIC', 'COLLATERAL', false, true, true, 720),
('maternal_uncles_child', 4, 'Aunts, uncles and their spouses', 'Maternal uncle''s child', 'ममेरा भाई / ममेरी बहन', 'Maternal uncle''s child (ममेरा भाई / ममेरी बहन)', 'Child of mother''s brother.', 'NEUTRAL', 'SIBLING', 'first_cousin', 'first_cousin', 'first_cousin', 'MATERNAL_UNCLES_CHILD', 'SYMMETRIC', 'COLLATERAL', false, true, true, 730),
('maternal_aunts_child', 4, 'Aunts, uncles and their spouses', 'Maternal aunt''s child', 'मौसेरा भाई / मौसेरी बहन', 'Maternal aunt''s child (मौसेरा भाई / मौसेरी बहन)', 'Child of mother''s sister.', 'NEUTRAL', 'SIBLING', 'first_cousin', 'first_cousin', 'first_cousin', 'MATERNAL_AUNTS_CHILD', 'SYMMETRIC', 'COLLATERAL', false, true, true, 740),

-- Category 5: Cousins and cousin-side relations
('first_cousin', 5, 'Cousins and cousin-side relations', 'First cousin', 'चचेरा / ममेरा / फुफेरा / मौसेरा भाई-बहन', 'First cousin (चचेरा / ममेरा / फुफेरा / मौसेरा भाई-बहन)', 'Child of a parent''s sibling.', 'NEUTRAL', 'EXTENDED', 'first_cousin', 'first_cousin', 'first_cousin', 'FIRST_COUSIN', 'SYMMETRIC', 'COUSIN', false, true, true, 800),
('male_first_cousin', 5, 'Cousins and cousin-side relations', 'Male first cousin', 'चचेरा / ममेरा / फुफेरा / मौसेरा भाई', 'Male first cousin (चचेरा / ममेरा / फुफेरा / मौसेरा भाई)', 'Male child of a parent''s sibling.', 'MALE', 'EXTENDED', 'first_cousin', 'first_cousin', 'first_cousin', 'MALE_FIRST_COUSIN', 'SYMMETRIC', 'COUSIN', false, true, true, 810),
('female_first_cousin', 5, 'Cousins and cousin-side relations', 'Female first cousin', 'चचेरी / ममेरी / फुफेरी / मौसेरी बहन', 'Female first cousin (चचेरी / ममेरी / फुफेरी / मौसेरी बहन)', 'Female child of a parent''s sibling.', 'FEMALE', 'EXTENDED', 'first_cousin', 'first_cousin', 'first_cousin', 'FEMALE_FIRST_COUSIN', 'SYMMETRIC', 'COUSIN', false, true, true, 820),
('paternal_cousin', 5, 'Cousins and cousin-side relations', 'Paternal cousin', 'पिता की ओर का चचेरा / फुफेरा संबंधी', 'Paternal cousin (पिता की ओर का चचेरा / फुफेरा संबंधी)', 'Cousin from father''s side.', 'NEUTRAL', 'EXTENDED', 'first_cousin', 'first_cousin', 'first_cousin', 'PATERNAL_COUSIN', 'SYMMETRIC', 'COUSIN', false, true, true, 830),
('maternal_cousin', 5, 'Cousins and cousin-side relations', 'Maternal cousin', 'माँ की ओर का ममेरा / मौसेरा संबंधी', 'Maternal cousin (माँ की ओर का ममेरा / मौसेरा संबंधी)', 'Cousin from mother''s side.', 'NEUTRAL', 'EXTENDED', 'first_cousin', 'first_cousin', 'first_cousin', 'MATERNAL_COUSIN', 'SYMMETRIC', 'COUSIN', false, true, true, 840),
('cousin', 5, 'Cousins and cousin-side relations', 'Cousin', 'चचेरा / ममेरा / फुफेरा / मौसेरा संबंधी', 'Cousin (चचेरा / ममेरा / फुफेरा / मौसेरा संबंधी)', 'Gender-neutral cousin.', 'NEUTRAL', 'EXTENDED', 'cousin', 'cousin', 'cousin', 'COUSIN', 'SYMMETRIC', 'COUSIN', false, true, true, 850),
('first_cousin_once_removed', 5, 'Cousins and cousin-side relations', 'First cousin once removed', 'माता-पिता का चचेरा/ममेरा संबंधी या चचेरे/ममेरे भाई-बहन की संतान', 'First cousin once removed (माता-पिता का चचेरा/ममेरा संबंधी या चचेरे/ममेरे भाई-बहन की संतान)', 'Parent''s cousin or cousin''s child.', 'NEUTRAL', 'EXTENDED', 'first_cousin_once_removed', 'first_cousin_once_removed', 'first_cousin_once_removed', 'FIRST_COUSIN_ONCE_REMOVED', 'BIDIRECTIONAL', 'COUSIN', false, true, true, 860),
('second_cousin', 5, 'Cousins and cousin-side relations', 'Second cousin', 'दूर का चचेरा / ममेरा संबंधी', 'Second cousin (दूर का चचेरा / ममेरा संबंधी)', 'Shares great-grandparents.', 'NEUTRAL', 'EXTENDED', 'second_cousin', 'second_cousin', 'second_cousin', 'SECOND_COUSIN', 'SYMMETRIC', 'COUSIN', false, true, true, 870),
('third_cousin', 5, 'Cousins and cousin-side relations', 'Third cousin', 'तीसरी पीढ़ी का दूर का संबंधी', 'Third cousin (तीसरी पीढ़ी का दूर का संबंधी)', 'Shares great-great-grandparents.', 'NEUTRAL', 'EXTENDED', 'third_cousin', 'third_cousin', 'third_cousin', 'THIRD_COUSIN', 'SYMMETRIC', 'COUSIN', false, true, true, 880),
('cousins_son', 5, 'Cousins and cousin-side relations', 'Cousin''s son', 'चचेरे / ममेरे भाई-बहन का बेटा', 'Cousin''s son (चचेरे / ममेरे भाई-बहन का बेटा)', 'Son of a cousin.', 'MALE', 'EXTENDED', 'first_cousin_once_removed', 'first_cousin_once_removed', 'first_cousin_once_removed', 'COUSINS_SON', 'DIRECT', 'COUSIN', false, true, true, 890),
('cousins_daughter', 5, 'Cousins and cousin-side relations', 'Cousin''s daughter', 'चचेरे / ममेरे भाई-बहन की बेटी', 'Cousin''s daughter (चचेरे / ममेरे भाई-बहन की बेटी)', 'Daughter of a cousin.', 'FEMALE', 'EXTENDED', 'first_cousin_once_removed', 'first_cousin_once_removed', 'first_cousin_once_removed', 'COUSINS_DAUGHTER', 'DIRECT', 'COUSIN', false, true, true, 900),
('cousins_child', 5, 'Cousins and cousin-side relations', 'Cousin''s child', 'चचेरे / ममेरे भाई-बहन की संतान', 'Cousin''s child (चचेरे / ममेरे भाई-बहन की संतान)', 'Gender-neutral child of a cousin.', 'NEUTRAL', 'EXTENDED', 'first_cousin_once_removed', 'first_cousin_once_removed', 'first_cousin_once_removed', 'COUSINS_CHILD', 'DIRECT', 'COUSIN', false, true, true, 910),
('cousins_spouse', 5, 'Cousins and cousin-side relations', 'Cousin''s spouse', 'चचेरे / ममेरे संबंधी का जीवनसाथी', 'Cousin''s spouse (चचेरे / ममेरे संबंधी का जीवनसाथी)', 'Spouse of a cousin; exact local term varies.', 'NEUTRAL', 'EXTENDED', 'cousins_spouse', 'cousins_spouse', 'cousins_spouse', 'COUSINS_SPOUSE', 'SYMMETRIC', 'COUSIN', false, true, true, 920),

-- Category 6: Nephews, nieces and ALL their branches
('nephew', 6, 'Nephews, nieces and ALL their branches', 'Nephew', 'भतीजा / भांजा', 'Nephew (भतीजा / भांजा)', 'Brother''s or sister''s son; भतीजा is commonly brother''s son, भांजा sister''s son.', 'MALE', 'CHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NEPHEW', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1000),
('brothers_son', 6, 'Nephews, nieces and ALL their branches', 'Brother''s son (Nephew)', 'भतीजा', 'Brother''s son (भतीजा)', 'Brother''s son specifically.', 'MALE', 'CHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'BROTHERS_SON', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1010),
('sisters_son', 6, 'Nephews, nieces and ALL their branches', 'Sister''s son (Nephew)', 'भांजा', 'Sister''s son (भांजा)', 'Sister''s son specifically.', 'MALE', 'CHILD', 'maternal_uncle', 'maternal_aunt', 'uncle', 'SISTERS_SON', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1020),
('niece', 6, 'Nephews, nieces and ALL their branches', 'Niece', 'भतीजी / भांजी', 'Niece (भतीजी / भांजी)', 'Brother''s or sister''s daughter; भतीजी is commonly brother''s daughter, भांजी sister''s daughter.', 'FEMALE', 'CHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NIECE', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1030),
('brothers_daughter', 6, 'Nephews, nieces and ALL their branches', 'Brother''s daughter (Niece)', 'भतीजी', 'Brother''s daughter (भतीजी)', 'Brother''s daughter specifically.', 'FEMALE', 'CHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'BROTHERS_DAUGHTER', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1040),
('sisters_daughter', 6, 'Nephews, nieces and ALL their branches', 'Sister''s daughter (Niece)', 'भांजी', 'Sister''s daughter (भांजी)', 'Sister''s daughter specifically.', 'FEMALE', 'CHILD', 'maternal_uncle', 'maternal_aunt', 'uncle', 'SISTERS_DAUGHTER', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1050),
('nibling', 6, 'Nephews, nieces and ALL their branches', 'Nibling', 'भाई या बहन की संतान', 'Nibling (भाई या बहन की संतान)', 'Gender-neutral sibling''s child.', 'NEUTRAL', 'CHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NIBLING', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1060),
('nephews_wife', 6, 'Nephews, nieces and ALL their branches', 'Nephew''s wife', 'भतीजे की पत्नी / भांजे की पत्नी', 'Nephew''s wife (भतीजे की पत्नी / भांजे की पत्नी)', 'Wife of a nephew. Use भतीजे की पत्नी / भांजे की पत्नी according to whether he is brother''s or sister''s son.', 'FEMALE', 'EXTENDED', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NEPHEWS_WIFE', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1070),
('brothers_sons_wife', 6, 'Nephews, nieces and ALL their branches', 'Brother''s son''s wife', 'भतीजे की पत्नी', 'Brother''s son''s wife (भतीजे की पत्नी)', 'Wife of brother''s son specifically.', 'FEMALE', 'EXTENDED', 'paternal_uncle', 'paternal_aunt', 'uncle', 'BROTHERS_SONS_WIFE', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1075),
('sisters_sons_wife', 6, 'Nephews, nieces and ALL their branches', 'Sister''s son''s wife', 'भांजे की पत्नी', 'Sister''s son''s wife (भांजे की पत्नी)', 'Wife of sister''s son specifically.', 'FEMALE', 'EXTENDED', 'maternal_uncle', 'maternal_aunt', 'uncle', 'SISTERS_SONS_WIFE', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1076),
('nieces_husband', 6, 'Nephews, nieces and ALL their branches', 'Niece''s husband', 'भतीजी का पति / भांजी का पति', 'Niece''s husband (भतीजी का पति / भांजी का पति)', 'Husband of a niece.', 'MALE', 'EXTENDED', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NIECES_HUSBAND', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1080),
('brothers_daughters_husband', 6, 'Nephews, nieces and ALL their branches', 'Brother''s daughter''s husband', 'भतीजी का पति', 'Brother''s daughter''s husband (भतीजी का पति)', 'Husband of brother''s daughter specifically.', 'MALE', 'EXTENDED', 'paternal_uncle', 'paternal_aunt', 'uncle', 'BROTHERS_DAUGHTERS_HUSBAND', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1085),
('sisters_daughters_husband', 6, 'Nephews, nieces and ALL their branches', 'Sister''s daughter''s husband', 'भांजी का पति', 'Sister''s daughter''s husband (भांजी का पति)', 'Husband of sister''s daughter specifically.', 'MALE', 'EXTENDED', 'maternal_uncle', 'maternal_aunt', 'uncle', 'SISTERS_DAUGHTERS_HUSBAND', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1086),
('nephews_spouse', 6, 'Nephews, nieces and ALL their branches', 'Nephew''s spouse', 'भतीजे / भांजे का जीवनसाथी', 'Nephew''s spouse (भतीजे / भांजे का जीवनसाथी)', 'Gender-neutral spouse of a nephew.', 'NEUTRAL', 'EXTENDED', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NEPHEWS_SPOUSE', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1090),
('nieces_spouse', 6, 'Nephews, nieces and ALL their branches', 'Niece''s spouse', 'भतीजी / भांजी का जीवनसाथी', 'Niece''s spouse (भतीजी / भांजी का जीवनसाथी)', 'Gender-neutral spouse of a niece.', 'NEUTRAL', 'EXTENDED', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NIECES_SPOUSE', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1100),
('nephews_son', 6, 'Nephews, nieces and ALL their branches', 'Nephew''s son', 'भतीजे / भांजे का बेटा', 'Nephew''s son (भतीजे / भांजे का बेटा)', 'Son of a nephew.', 'MALE', 'GRANDCHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NEPHEWS_SON', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1110),
('nephews_daughter', 6, 'Nephews, nieces and ALL their branches', 'Nephew''s daughter', 'भतीजे / भांजे की बेटी', 'Nephew''s daughter (भतीजे / भांजे की बेटी)', 'Daughter of a nephew.', 'FEMALE', 'GRANDCHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NEPHEWS_DAUGHTER', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1120),
('nieces_son', 6, 'Nephews, nieces and ALL their branches', 'Niece''s son', 'भतीजी / भांजी का बेटा', 'Niece''s son (भतीजी / भांजी का बेटा)', 'Son of a niece.', 'MALE', 'GRANDCHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NIECES_SON', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1130),
('nieces_daughter', 6, 'Nephews, nieces and ALL their branches', 'Niece''s daughter', 'भतीजी / भांजी की बेटी', 'Niece''s daughter (भतीजी / भांजी की बेटी)', 'Daughter of a niece.', 'FEMALE', 'GRANDCHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NIECES_DAUGHTER', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1140),
('nephews_child', 6, 'Nephews, nieces and ALL their branches', 'Nephew''s child', 'भतीजे / भांजे की संतान', 'Nephew''s child (भतीजे / भांजे की संतान)', 'Any child of a nephew.', 'NEUTRAL', 'GRANDCHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NEPHEWS_CHILD', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1150),
('nieces_child', 6, 'Nephews, nieces and ALL their branches', 'Niece''s child', 'भतीजी / भांजी की संतान', 'Niece''s child (भतीजी / भांजी की संतान)', 'Any child of a niece.', 'NEUTRAL', 'GRANDCHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NIECES_CHILD', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1160),
('great_nephew', 6, 'Nephews, nieces and ALL their branches', 'Great-nephew', 'भतीजे / भांजे का बेटा; संदर्भानुसार', 'Great-nephew (भतीजे / भांजे का बेटा; संदर्भानुसार)', 'Nephew''s or niece''s son; English usage varies by family-tree convention.', 'MALE', 'GRANDCHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'GREAT_NEPHEW', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1170),
('great_niece', 6, 'Nephews, nieces and ALL their branches', 'Great-niece', 'भतीजी / भांजी की बेटी; संदर्भानुसार', 'Great-niece (भतीजी / भांजी की बेटी; संदर्भानुसार)', 'Nephew''s or niece''s daughter; English usage varies by convention.', 'FEMALE', 'GRANDCHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'GREAT_NIECE', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1180),
('great_nibling', 6, 'Nephews, nieces and ALL their branches', 'Great-nibling', 'भाई या बहन के पोते-पोती / नाती-नातिन', 'Great-nibling (भाई या बहन के पोते-पोती / नाती-नातिन)', 'Sibling''s grandchild.', 'NEUTRAL', 'GRANDCHILD', 'paternal_uncle', 'paternal_aunt', 'uncle', 'GREAT_NIBLING', 'DIRECT', 'NEPHEW_NIECE', false, true, true, 1190),

-- Category 7: In-laws: spouse's family and child's spouse
('father_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Father-in-law', 'ससुर', 'Father-in-law (ससुर)', 'Spouse''s father.', 'MALE', 'PARENT', 'son_in_law', 'daughter_in_law', 'child_in_law', 'FATHER_IN_LAW', 'INVERSE', 'IN_LAW', false, true, true, 1200),
('mother_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Mother-in-law', 'सास', 'Mother-in-law (सास)', 'Spouse''s mother.', 'FEMALE', 'PARENT', 'son_in_law', 'daughter_in_law', 'child_in_law', 'MOTHER_IN_LAW', 'INVERSE', 'IN_LAW', false, true, true, 1210),
('parent_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Parent-in-law', 'सास या ससुर', 'Parent-in-law (सास या ससुर)', 'Gender-neutral spouse''s parent.', 'NEUTRAL', 'PARENT', 'son_in_law', 'daughter_in_law', 'child_in_law', 'PARENT_IN_LAW', 'INVERSE', 'IN_LAW', false, true, true, 1220),
('brother_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Brother-in-law', 'साला / बहनोई / देवर / जेठ', 'Brother-in-law (साला / बहनोई / देवर / जेठ)', 'Spouse''s brother or sibling''s husband; choose exact path.', 'MALE', 'EXTENDED', 'brother_in_law', 'sister_in_law', 'sibling_in_law', 'BROTHER_IN_LAW', 'SYMMETRIC', 'IN_LAW', false, true, true, 1230),
('sister_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Sister-in-law', 'साली / ननद / भाभी / जेठानी / देवरानी', 'Sister-in-law (साली / ननद / भाभी / जेठानी / देवरानी)', 'Spouse''s sister or sibling''s wife; choose exact path.', 'FEMALE', 'EXTENDED', 'brother_in_law', 'sister_in_law', 'sibling_in_law', 'SISTER_IN_LAW', 'SYMMETRIC', 'IN_LAW', false, true, true, 1240),
('bhabhi', 7, 'In-laws: spouse''s family and child''s spouse', 'Brother''s wife (Bhabhi)', 'भाभी', 'Sister-in-law (भाभी)', 'Brother''s wife specifically.', 'FEMALE', 'EXTENDED', 'brother_in_law', 'sister_in_law', 'sibling_in_law', 'BHABHI', 'SYMMETRIC', 'IN_LAW', false, true, true, 1245),
('sibling_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Sibling-in-law', 'ससुराल पक्ष का भाई या बहन', 'Sibling-in-law (ससुराल पक्ष का भाई या बहन)', 'Gender-neutral spouse''s sibling.', 'NEUTRAL', 'EXTENDED', 'sibling_in_law', 'sibling_in_law', 'sibling_in_law', 'SIBLING_IN_LAW', 'SYMMETRIC', 'IN_LAW', false, true, true, 1250),
('son_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Son-in-law', 'दामाद', 'Son-in-law (दामाद)', 'Daughter''s husband.', 'MALE', 'EXTENDED', 'father_in_law', 'mother_in_law', 'parent_in_law', 'SON_IN_LAW', 'DIRECT', 'IN_LAW', false, true, true, 1260),
('daughter_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Daughter-in-law', 'बहू', 'Daughter-in-law (बहू)', 'Son''s wife.', 'FEMALE', 'EXTENDED', 'father_in_law', 'mother_in_law', 'parent_in_law', 'DAUGHTER_IN_LAW', 'DIRECT', 'IN_LAW', false, true, true, 1270),
('child_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Child-in-law', 'दामाद या बहू', 'Child-in-law (दामाद या बहू)', 'Gender-neutral child''s spouse.', 'NEUTRAL', 'EXTENDED', 'father_in_law', 'mother_in_law', 'parent_in_law', 'CHILD_IN_LAW', 'DIRECT', 'IN_LAW', false, true, true, 1280),
('co_parent_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Co-parent-in-law', 'समधी / समधन', 'Co-parent-in-law (समधी / समधन)', 'Parent of one''s child-in-law.', 'NEUTRAL', 'EXTENDED', 'co_parent_in_law', 'co_parent_in_law', 'co_parent_in_law', 'CO_PARENT_IN_LAW', 'SYMMETRIC', 'IN_LAW', false, true, true, 1290),
('spouses_nephew', 7, 'In-laws: spouse''s family and child''s spouse', 'Spouse''s nephew', 'पति / पत्नी का भतीजा या भांजा', 'Spouse''s nephew (पति / पत्नी का भतीजा या भांजा)', 'Nephew of one''s spouse.', 'MALE', 'EXTENDED', 'uncle_by_marriage', 'aunt_by_marriage', 'uncle', 'SPOUSES_NEPHEW', 'DIRECT', 'IN_LAW', false, true, true, 1300),
('spouses_niece', 7, 'In-laws: spouse''s family and child''s spouse', 'Spouse''s niece', 'पति / पत्नी की भतीजी या भांजी', 'Spouse''s niece (पति / पत्नी की भतीजी या भांजी)', 'Niece of one''s spouse.', 'FEMALE', 'EXTENDED', 'uncle_by_marriage', 'aunt_by_marriage', 'uncle', 'SPOUSES_NIECE', 'DIRECT', 'IN_LAW', false, true, true, 1310),
('nephew_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Nephew-in-law', 'भतीजे / भांजे का जीवनसाथी', 'Nephew-in-law (भतीजे / भांजे का जीवनसाथी)', 'Spouse of one''s nephew; specify exact path.', 'NEUTRAL', 'EXTENDED', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NEPHEW_IN_LAW', 'DIRECT', 'IN_LAW', false, true, true, 1320),
('niece_in_law', 7, 'In-laws: spouse''s family and child''s spouse', 'Niece-in-law', 'भतीजी / भांजी का जीवनसाथी', 'Niece-in-law (भतीजी / भांजी का जीवनसाथी)', 'Spouse of one''s niece; specify exact path.', 'NEUTRAL', 'EXTENDED', 'paternal_uncle', 'paternal_aunt', 'uncle', 'NIECE_IN_LAW', 'DIRECT', 'IN_LAW', false, true, true, 1330),

-- Category 8: Step-family, adoptive and foster relationships
('stepfather', 8, 'Step-family, adoptive and foster relationships', 'Stepfather', 'सौतेले पिता', 'Stepfather (सौतेले पिता)', 'Parent''s husband who is not one''s biological/adoptive father.', 'MALE', 'PARENT', 'stepson', 'stepdaughter', 'stepchild', 'STEPFATHER', 'INVERSE', 'STEP_FAMILY', false, true, true, 1400),
('stepmother', 8, 'Step-family, adoptive and foster relationships', 'Stepmother', 'सौतेली माँ', 'Stepmother (सौतेली माँ)', 'Parent''s wife who is not one''s biological/adoptive mother.', 'FEMALE', 'PARENT', 'stepson', 'stepdaughter', 'stepchild', 'STEPMOTHER', 'INVERSE', 'STEP_FAMILY', false, true, true, 1410),
('stepparent', 8, 'Step-family, adoptive and foster relationships', 'Stepparent', 'सौतेले माता-पिता', 'Stepparent (सौतेले माता-पिता)', 'Gender-neutral step-parent.', 'NEUTRAL', 'PARENT', 'stepson', 'stepdaughter', 'stepchild', 'STEPPARENT', 'INVERSE', 'STEP_FAMILY', false, true, true, 1420),
('stepson', 8, 'Step-family, adoptive and foster relationships', 'Stepson', 'सौतेला बेटा', 'Stepson (सौतेला बेटा)', 'Spouse''s son from another relationship.', 'MALE', 'CHILD', 'stepfather', 'stepmother', 'stepparent', 'STEPSON', 'DIRECT', 'STEP_FAMILY', false, true, true, 1430),
('stepdaughter', 8, 'Step-family, adoptive and foster relationships', 'Stepdaughter', 'सौतेली बेटी', 'Stepdaughter (सौतेली बेटी)', 'Spouse''s daughter from another relationship.', 'FEMALE', 'CHILD', 'stepfather', 'stepmother', 'stepparent', 'STEPDAUGHTER', 'DIRECT', 'STEP_FAMILY', false, true, true, 1440),
('stepchild', 8, 'Step-family, adoptive and foster relationships', 'Stepchild', 'सौतेली संतान', 'Stepchild (सौतेली संतान)', 'Gender-neutral step-child.', 'NEUTRAL', 'CHILD', 'stepfather', 'stepmother', 'stepparent', 'STEPCHILD', 'DIRECT', 'STEP_FAMILY', false, true, true, 1450),
('step_grandparent', 8, 'Step-family, adoptive and foster relationships', 'Step-grandparent', 'सौतेले दादा-दादी / नाना-नानी', 'Step-grandparent (सौतेले दादा-दादी / नाना-नानी)', 'Step-parent''s parent.', 'NEUTRAL', 'GRANDPARENT', 'step_grandchild', 'step_grandchild', 'step_grandchild', 'STEP_GRANDPARENT', 'INVERSE', 'STEP_FAMILY', false, true, true, 1460),
('step_grandchild', 8, 'Step-family, adoptive and foster relationships', 'Step-grandchild', 'सौतेला पोता / पोती / नाती / नातिन', 'Step-grandchild (सौतेला पोता / पोती / नाती / नातिन)', 'Stepchild''s child.', 'NEUTRAL', 'GRANDCHILD', 'step_grandparent', 'step_grandparent', 'step_grandparent', 'STEP_GRANDCHILD', 'DIRECT', 'STEP_FAMILY', false, true, true, 1470),
('adoptive_father', 8, 'Step-family, adoptive and foster relationships', 'Adoptive father', 'दत्तक पिता', 'Adoptive father (दत्तक पिता)', 'Legal/adoptive male parent.', 'MALE', 'PARENT', 'adopted_son', 'adopted_daughter', 'adopted_child', 'ADOPTIVE_FATHER', 'INVERSE', 'ADOPTIVE', false, true, true, 1480),
('adoptive_mother', 8, 'Step-family, adoptive and foster relationships', 'Adoptive mother', 'दत्तक माता', 'Adoptive mother (दत्तक माता)', 'Legal/adoptive female parent.', 'FEMALE', 'PARENT', 'adopted_son', 'adopted_daughter', 'adopted_child', 'ADOPTIVE_MOTHER', 'INVERSE', 'ADOPTIVE', false, true, true, 1490),
('adoptive_parent', 8, 'Step-family, adoptive and foster relationships', 'Adoptive parent', 'दत्तक माता या पिता', 'Adoptive parent (दत्तक माता या पिता)', 'Gender-neutral adoptive parent.', 'NEUTRAL', 'PARENT', 'adopted_son', 'adopted_daughter', 'adopted_child', 'ADOPTIVE_PARENT', 'INVERSE', 'ADOPTIVE', false, true, true, 1500),
('adopted_son', 8, 'Step-family, adoptive and foster relationships', 'Adopted son', 'गोद लिया हुआ बेटा', 'Adopted son (गोद लिया हुआ बेटा)', 'Male child adopted into the family.', 'MALE', 'CHILD', 'adoptive_father', 'adoptive_mother', 'adoptive_parent', 'ADOPTED_SON', 'DIRECT', 'ADOPTIVE', false, true, true, 1510),
('adopted_daughter', 8, 'Step-family, adoptive and foster relationships', 'Adopted daughter', 'गोद ली हुई बेटी', 'Adopted daughter (गोद ली हुई बेटी)', 'Female child adopted into the family.', 'FEMALE', 'CHILD', 'adoptive_father', 'adoptive_mother', 'adoptive_parent', 'ADOPTED_DAUGHTER', 'DIRECT', 'ADOPTIVE', false, true, true, 1520),
('adopted_child', 8, 'Step-family, adoptive and foster relationships', 'Adopted child', 'गोद ली हुई संतान', 'Adopted child (गोद ली हुई संतान)', 'Gender-neutral adopted child.', 'NEUTRAL', 'CHILD', 'adoptive_father', 'adoptive_mother', 'adoptive_parent', 'ADOPTED_CHILD', 'DIRECT', 'ADOPTIVE', false, true, true, 1530),
('foster_father', 8, 'Step-family, adoptive and foster relationships', 'Foster father', 'पालक पिता', 'Foster father (पालक पिता)', 'Male foster parent.', 'MALE', 'PARENT', 'foster_child', 'foster_child', 'foster_child', 'FOSTER_FATHER', 'INVERSE', 'FOSTER', false, true, true, 1540),
('foster_mother', 8, 'Step-family, adoptive and foster relationships', 'Foster mother', 'पालक माता', 'Foster mother (पालक माता)', 'Female foster parent.', 'FEMALE', 'PARENT', 'foster_child', 'foster_child', 'foster_child', 'FOSTER_MOTHER', 'INVERSE', 'FOSTER', false, true, true, 1550),
('foster_parent', 8, 'Step-family, adoptive and foster relationships', 'Foster parent', 'पालक माता या पिता', 'Foster parent (पालक माता या पिता)', 'Gender-neutral foster parent.', 'NEUTRAL', 'PARENT', 'foster_child', 'foster_child', 'foster_child', 'FOSTER_PARENT', 'INVERSE', 'FOSTER', false, true, true, 1560),
('foster_son_daughter', 8, 'Step-family, adoptive and foster relationships', 'Foster son/daughter', 'पालक बेटा / बेटी', 'Foster son/daughter (पालक बेटा / बेटी)', 'Foster child; specify gender.', 'NEUTRAL', 'CHILD', 'foster_father', 'foster_mother', 'foster_parent', 'FOSTER_SON_DAUGHTER', 'DIRECT', 'FOSTER', false, true, true, 1570),
('foster_child', 8, 'Step-family, adoptive and foster relationships', 'Foster child', 'पालक संतान', 'Foster child (पालक संतान)', 'Gender-neutral foster child.', 'NEUTRAL', 'CHILD', 'foster_father', 'foster_mother', 'foster_parent', 'FOSTER_CHILD', 'DIRECT', 'FOSTER', false, true, true, 1580),

-- Category 9: Further generations and extended descendants
('great_great_grandparent', 9, 'Further generations and extended descendants', 'Great-great-grandparent', 'पर-परदादा / पर-परदादी / पर-नाना / पर-नानी', 'Great-great-grandparent (पर-परदादा / पर-परदादी / पर-नाना / पर-नानी)', 'Two generations above great-grandparent.', 'NEUTRAL', 'GRANDPARENT', 'great_great_grandchild', 'great_great_grandchild', 'great_great_grandchild', 'GREAT_GREAT_GRANDPARENT', 'INVERSE', 'ANCESTOR', false, true, true, 1600),
('great_great_grandchild', 9, 'Further generations and extended descendants', 'Great-great-grandchild', 'पर-परपोता / पर-परपोती / पर-परनाती / पर-परनातिन', 'Great-great-grandchild (पर-परपोता / पर-परपोती / पर-परनाती / पर-परनातिन)', 'Two generations below great-grandchild.', 'NEUTRAL', 'GRANDCHILD', 'great_great_grandparent', 'great_great_grandparent', 'great_great_grandparent', 'GREAT_GREAT_GRANDCHILD', 'DIRECT', 'DESCENDANT', false, true, true, 1610),
('third_great_grandparent', 9, 'Further generations and extended descendants', '3rd great-grandparent', 'तीसरी पीढ़ी के पूर्वज', '3rd great-grandparent (तीसरी पीढ़ी के पूर्वज)', 'Ancestor three great-generations above; local term varies.', 'NEUTRAL', 'GRANDPARENT', 'third_great_grandchild', 'third_great_grandchild', 'third_great_grandchild', 'THIRD_GREAT_GRANDPARENT', 'INVERSE', 'ANCESTOR', false, true, true, 1620),
('third_great_grandchild', 9, 'Further generations and extended descendants', '3rd great-grandchild', 'तीसरी पीढ़ी का वंशज', '3rd great-grandchild (तीसरी पीढ़ी का वंशज)', 'Descendant three great-generations below.', 'NEUTRAL', 'GRANDCHILD', 'third_great_grandparent', 'third_great_grandparent', 'third_great_grandparent', 'THIRD_GREAT_GRANDCHILD', 'DIRECT', 'DESCENDANT', false, true, true, 1630),
('lineal_ancestor', 9, 'Further generations and extended descendants', 'Lineal ancestor', 'सीधा पूर्वज', 'Lineal ancestor (सीधा पूर्वज)', 'Ancestor in direct parent line.', 'NEUTRAL', 'GRANDPARENT', 'lineal_descendant', 'lineal_descendant', 'lineal_descendant', 'LINEAL_ANCESTOR', 'INVERSE', 'ANCESTOR', false, true, true, 1640),
('lineal_descendant', 9, 'Further generations and extended descendants', 'Lineal descendant', 'सीधा वंशज', 'Lineal descendant (सीधा वंशज)', 'Descendant in direct child line.', 'NEUTRAL', 'GRANDCHILD', 'lineal_ancestor', 'lineal_ancestor', 'lineal_ancestor', 'LINEAL_DESCENDANT', 'DIRECT', 'DESCENDANT', false, true, true, 1650),
('collateral_relative', 9, 'Further generations and extended descendants', 'Collateral relative', 'पार्श्व / पारिवारिक संबंधी', 'Collateral relative (पार्श्व / पारिवारिक संबंधी)', 'Relative not in direct ancestor-descendant line, e.g. sibling/cousin.', 'NEUTRAL', 'EXTENDED', 'collateral_relative', 'collateral_relative', 'collateral_relative', 'COLLATERAL_RELATIVE', 'SYMMETRIC', 'EXTENDED', false, true, true, 1660),
('remote_relative', 9, 'Further generations and extended descendants', 'Remote relative', 'दूर का रिश्तेदार', 'Remote relative (दूर का रिश्तेदार)', 'Distant relation; exact degree should be stored.', 'NEUTRAL', 'EXTENDED', 'remote_relative', 'remote_relative', 'remote_relative', 'REMOTE_RELATIVE', 'SYMMETRIC', 'EXTENDED', false, true, true, 1670),

-- Category 10: Guardian, household and social/ceremonial ties
('guardian', 10, 'Guardian, household and social/ceremonial ties', 'Guardian', 'अभिभावक / संरक्षक', 'Guardian (अभिभावक / संरक्षक)', 'Person legally/formally responsible for another.', 'NEUTRAL', 'PARENT', 'ward', 'ward', 'ward', 'GUARDIAN', 'INVERSE', 'HOUSEHOLD', false, true, true, 1700),
('ward', 10, 'Guardian, household and social/ceremonial ties', 'Ward', 'आश्रित / संरक्षित व्यक्ति', 'Ward (आश्रित / संरक्षित व्यक्ति)', 'Person under a guardian''s care.', 'NEUTRAL', 'CHILD', 'guardian', 'guardian', 'guardian', 'WARD', 'DIRECT', 'HOUSEHOLD', false, true, true, 1710),
('godfather', 10, 'Guardian, household and social/ceremonial ties', 'Godfather', 'धर्म-पिता / मानद पिता', 'Godfather (धर्म-पिता / मानद पिता)', 'Chosen ceremonial/religious mentor.', 'MALE', 'PARENT', 'godson', 'goddaughter', 'godchild', 'GODFATHER', 'INVERSE', 'CEREMONIAL', false, true, true, 1720),
('godmother', 10, 'Guardian, household and social/ceremonial ties', 'Godmother', 'धर्म-माता / मानद माता', 'Godmother (धर्म-माता / मानद माता)', 'Chosen ceremonial/religious mentor.', 'FEMALE', 'PARENT', 'godson', 'goddaughter', 'godchild', 'GODMOTHER', 'INVERSE', 'CEREMONIAL', false, true, true, 1730),
('godparent', 10, 'Guardian, household and social/ceremonial ties', 'Godparent', 'धर्म-अभिभावक', 'Godparent (धर्म-अभिभावक)', 'Gender-neutral godparent.', 'NEUTRAL', 'PARENT', 'godson', 'goddaughter', 'godchild', 'GODPARENT', 'INVERSE', 'CEREMONIAL', false, true, true, 1740),
('godson', 10, 'Guardian, household and social/ceremonial ties', 'Godson', 'धर्म-पुत्र', 'Godson (धर्म-पुत्र)', 'Male godchild.', 'MALE', 'CHILD', 'godfather', 'godmother', 'godparent', 'GODSON', 'DIRECT', 'CEREMONIAL', false, true, true, 1750),
('goddaughter', 10, 'Guardian, household and social/ceremonial ties', 'Goddaughter', 'धर्म-पुत्री', 'Goddaughter (धर्म-पुत्री)', 'Female godchild.', 'FEMALE', 'CHILD', 'godfather', 'godmother', 'godparent', 'GODDAUGHTER', 'DIRECT', 'CEREMONIAL', false, true, true, 1760),
('godchild', 10, 'Guardian, household and social/ceremonial ties', 'Godchild', 'धर्म-संतान', 'Godchild (धर्म-संतान)', 'Gender-neutral godchild.', 'NEUTRAL', 'CHILD', 'godfather', 'godmother', 'godparent', 'GODCHILD', 'DIRECT', 'CEREMONIAL', false, true, true, 1770),
('household_member', 10, 'Guardian, household and social/ceremonial ties', 'Household member — non-relative', 'परिवार से असंबंधित गृह-सदस्य', 'Household member (परिवार से असंबंधित गृह-सदस्य)', 'Lives in household but is not a family relation.', 'NEUTRAL', 'EXTENDED', 'household_member', 'household_member', 'household_member', 'HOUSEHOLD_MEMBER', 'SYMMETRIC', 'HOUSEHOLD', false, true, true, 1780),
('other_family_member', 10, 'Guardian, household and social/ceremonial ties', 'Other family member', 'अन्य परिवारजन', 'Other family member (अन्य परिवारजन)', 'Related person whose exact relation is not listed.', 'NEUTRAL', 'EXTENDED', 'other_family_member', 'other_family_member', 'other_family_member', 'OTHER_FAMILY_MEMBER', 'SYMMETRIC', 'EXTENDED', false, true, true, 1790),
('unspecified_relative', 10, 'Guardian, household and social/ceremonial ties', 'Unspecified relative', 'अज्ञात संबंध वाला रिश्तेदार', 'Unspecified relative (अज्ञात संबंध वाला रिश्तेदार)', 'Known relative; exact relation unknown.', 'NEUTRAL', 'EXTENDED', 'unspecified_relative', 'unspecified_relative', 'unspecified_relative', 'UNSPECIFIED_RELATIVE', 'SYMMETRIC', 'EXTENDED', false, true, true, 1800),

-- Category 11: Former, deceased and relationship status
('former_spouse', 11, 'Former, deceased and relationship status', 'Former spouse', 'पूर्व जीवनसाथी', 'Former spouse (पूर्व जीवनसाथी)', 'Person previously married to the individual.', 'NEUTRAL', 'EXTENDED', 'former_spouse', 'former_spouse', 'former_spouse', 'FORMER_SPOUSE', 'SYMMETRIC', 'STATUS', false, true, true, 1900),
('former_partner', 11, 'Former, deceased and relationship status', 'Former partner', 'पूर्व साथी', 'Former partner (पूर्व साथी)', 'Former partner.', 'NEUTRAL', 'EXTENDED', 'former_partner', 'former_partner', 'former_partner', 'FORMER_PARTNER', 'SYMMETRIC', 'STATUS', false, true, true, 1910),
('widow', 11, 'Former, deceased and relationship status', 'Widow', 'विधवा', 'Widow (विधवा)', 'Woman whose spouse has died.', 'FEMALE', 'EXTENDED', NULL, NULL, NULL, 'WIDOW', 'DIRECT', 'STATUS', false, true, true, 1920),
('widower', 11, 'Former, deceased and relationship status', 'Widower', 'विधुर', 'Widower (विधुर)', 'Man whose spouse has died.', 'MALE', 'EXTENDED', NULL, NULL, NULL, 'WIDOWER', 'DIRECT', 'STATUS', false, true, true, 1930),
('surviving_spouse', 11, 'Former, deceased and relationship status', 'Surviving spouse', 'जीवित जीवनसाथी', 'Surviving spouse (जीवित जीवनसाथी)', 'Spouse whose partner has died.', 'NEUTRAL', 'SPOUSE', NULL, NULL, NULL, 'SURVIVING_SPOUSE', 'DIRECT', 'STATUS', false, true, true, 1940),
('deceased_father', 11, 'Former, deceased and relationship status', 'Deceased father', 'दिवंगत पिता', 'Deceased father (दिवंगत पिता)', 'Father who has died.', 'MALE', 'PARENT', 'son', 'daughter', 'child', 'DECEASED_FATHER', 'INVERSE', 'STATUS', false, true, true, 1950),
('deceased_mother', 11, 'Former, deceased and relationship status', 'Deceased mother', 'दिवंगत माता', 'Deceased mother (दिवंगत माता)', 'Mother who has died.', 'FEMALE', 'PARENT', 'son', 'daughter', 'child', 'DECEASED_MOTHER', 'INVERSE', 'STATUS', false, true, true, 1960),
('deceased_spouse', 11, 'Former, deceased and relationship status', 'Deceased spouse', 'दिवंगत जीवनसाथी', 'Deceased spouse (दिवंगत जीवनसाथी)', 'Spouse who has died.', 'NEUTRAL', 'SPOUSE', 'surviving_spouse', 'surviving_spouse', 'surviving_spouse', 'DECEASED_SPOUSE', 'SYMMETRIC', 'STATUS', false, true, true, 1970),
('deceased_relative', 11, 'Former, deceased and relationship status', 'Deceased relative', 'दिवंगत रिश्तेदार', 'Deceased relative (दिवंगत रिश्तेदार)', 'Any relative who has died; retain original relationship too.', 'NEUTRAL', 'EXTENDED', NULL, NULL, NULL, 'DECEASED_RELATIVE', 'SYMMETRIC', 'STATUS', false, true, true, 1980),

-- Category 12: Reciprocal and derived relationships for family-tree software
('paternal_uncle_derived', 12, 'Reciprocal and derived relationships for family-tree software', 'Paternal uncle', 'चाचा / ताऊ', 'Paternal uncle (चाचा / ताऊ)', 'Father''s brother of member; exact term depends on age/family convention.', 'MALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'PATERNAL_UNCLE_DERIVED', 'INVERSE', 'DERIVED', true, true, true, 2000),
('aunt_by_marriage_derived', 12, 'Reciprocal and derived relationships for family-tree software', 'Aunt by marriage', 'चाची / ताई', 'Aunt by marriage (चाची / ताई)', 'Wife of member''s paternal uncle.', 'FEMALE', 'EXTENDED', 'nephew', 'niece', 'nibling', 'AUNT_BY_MARRIAGE_DERIVED', 'INVERSE', 'DERIVED', true, true, true, 2010),
('cousins_wife_derived', 12, 'Reciprocal and derived relationships for family-tree software', 'Cousin''s wife', 'चचेरे भाई की पत्नी', 'Cousin''s wife (चचेरे भाई की पत्नी)', 'Wife of cousin.', 'FEMALE', 'EXTENDED', 'cousin', 'cousin', 'cousin', 'COUSINS_WIFE_DERIVED', 'SYMMETRIC', 'DERIVED', true, true, true, 2020),

-- Category 13: Recommended relationship data rules & Other fallback
('other', 13, 'Other / Specify Community Relationship', 'Other / Specify', 'अन्य / विशिष्ट संबंध', 'Other (अन्य / विशिष्ट संबंध)', 'Community-specific or regional relationship; specify exact path and definition.', 'NEUTRAL', 'EXTENDED', 'other', 'other', 'other', 'OTHER_SPECIFY', 'BIDIRECTIONAL', 'CUSTOM', false, true, true, 2100)

ON CONFLICT (canonical_key) DO UPDATE SET
  category_number = EXCLUDED.category_number,
  category_name = EXCLUDED.category_name,
  english_label = EXCLUDED.english_label,
  hindi_label = EXCLUDED.hindi_label,
  display_label = EXCLUDED.display_label,
  meaning = EXCLUDED.meaning,
  gender_applicability = EXCLUDED.gender_applicability,
  family_role = EXCLUDED.family_role,
  reciprocal_key_male = EXCLUDED.reciprocal_key_male,
  reciprocal_key_female = EXCLUDED.reciprocal_key_female,
  reciprocal_key_neutral = EXCLUDED.reciprocal_key_neutral,
  relationship_code = EXCLUDED.relationship_code,
  relationship_direction = EXCLUDED.relationship_direction,
  relationship_group = EXCLUDED.relationship_group,
  is_derived = EXCLUDED.is_derived,
  is_selectable = EXCLUDED.is_selectable,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- 4. Centralized Relationship Master Query RPC
CREATE OR REPLACE FUNCTION public.get_family_relationships_master_catalog(
  p_search TEXT DEFAULT NULL,
  p_category_number INT DEFAULT NULL
)
RETURNS SETOF public.family_relationships_master
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.family_relationships_master
  WHERE is_active = true
    AND (p_category_number IS NULL OR category_number = p_category_number)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR english_label ILIKE '%' || p_search || '%'
      OR hindi_label ILIKE '%' || p_search || '%'
      OR display_label ILIKE '%' || p_search || '%'
      OR relationship_code ILIKE '%' || p_search || '%'
      OR meaning ILIKE '%' || p_search || '%'
    )
  ORDER BY category_number ASC, display_order ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_family_relationships_master_catalog(TEXT, INT) TO anon, authenticated;

-- 5. Seed / Verify Canonical 10-Member Vyas Validation Family (including Rajvi)
DO $$
DECLARE
  v_vyas_family_id UUID;
  v_admin_id UUID;
  v_ck_id UUID;
  v_dv_id UUID;
  v_tushar_id UUID;
  v_maya_id UUID;
  v_jayesh_id UUID;
  v_jignasha_id UUID;
  v_harsh_id UUID;
  v_rajvi_id UUID;
  v_vraj_id UUID;
  v_dhruv_id UUID;
  v_harsh_gotra TEXT;
  v_harsh_nukh TEXT;
BEGIN
  -- Locate Vyas Family
  SELECT id, created_by INTO v_vyas_family_id, v_admin_id
  FROM public.families
  WHERE lower(trim(family_name)) = 'vyas family' OR lower(family_name) LIKE '%vyas%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_vyas_family_id IS NOT NULL THEN
    -- Match all persons
    SELECT p.id INTO v_ck_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'chandra%' LIMIT 1;

    SELECT p.id INTO v_dv_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'devi%' LIMIT 1;

    SELECT p.id INTO v_tushar_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'tushar%' LIMIT 1;

    SELECT p.id INTO v_maya_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'maya%' LIMIT 1;

    SELECT p.id INTO v_jayesh_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'jayesh%' LIMIT 1;

    SELECT p.id INTO v_jignasha_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'jigna%' LIMIT 1;

    SELECT p.id INTO v_harsh_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'harsh%' LIMIT 1;

    SELECT p.id INTO v_rajvi_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'rajvi%' LIMIT 1;

    SELECT p.id INTO v_vraj_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'vraj%' LIMIT 1;

    SELECT p.id INTO v_dhruv_id FROM public.persons p
    JOIN public.family_members fm ON fm.person_id = p.id
    WHERE fm.family_id = v_vyas_family_id AND lower(p.first_name) LIKE 'dhruv%' LIMIT 1;

    -- If Rajvi does not exist yet in census, create Rajvi Harsh Vyas safely
    IF v_rajvi_id IS NULL THEN
      -- Resolve valid Gotra and Nukh matching family or master tables
      SELECT p.gotra, p.nukh INTO v_harsh_gotra, v_harsh_nukh
      FROM public.persons p
      WHERE p.id = COALESCE(v_harsh_id, v_jayesh_id, v_tushar_id)
        AND p.gotra IS NOT NULL
        AND p.nukh IS NOT NULL
      LIMIT 1;

      IF v_harsh_gotra IS NULL OR v_harsh_nukh IS NULL THEN
        SELECT g.name, n.name INTO v_harsh_gotra, v_harsh_nukh
        FROM public.nukhs n
        JOIN public.gotras g ON g.id = n.gotra_id
        WHERE lower(g.name) = 'kashyap'
        LIMIT 1;

        IF v_harsh_gotra IS NULL THEN
          SELECT g.name, n.name INTO v_harsh_gotra, v_harsh_nukh
          FROM public.nukhs n
          JOIN public.gotras g ON g.id = n.gotra_id
          LIMIT 1;
        END IF;
      END IF;

      INSERT INTO public.persons (
        first_name, middle_name, last_name, gender, date_of_birth,
        blood_group, birth_place, gotra, nukh, email_contact, phone,
        status, verification_status, profile_privacy, created_by
      ) VALUES (
        'Rajvi', 'Harsh', 'Vyas', 'FEMALE', '2002-04-10',
        'B+', 'Surat, Gujarat', v_harsh_gotra, v_harsh_nukh,
        'rajvi.vyas@khatrisarvaniyat.org', '+91 98765 43210',
        'ACTIVE', 'VERIFIED', 'COMMUNITY', v_admin_id
      )
      RETURNING id INTO v_rajvi_id;

      INSERT INTO public.family_members (
        family_id, person_id, role, relationship_to_head, is_head, added_by
      ) VALUES (
        v_vyas_family_id, v_rajvi_id, 'EXTENDED', 'Nephew''s Wife (भतीजे की पत्नी)', false, v_admin_id
      )
      ON CONFLICT (family_id, person_id) WHERE left_at IS NULL DO UPDATE SET
        relationship_to_head = 'Nephew''s Wife (भतीजे की पत्नी)',
        role = 'EXTENDED';
    END IF;

    -- Canonical edges between Harsh and Rajvi
    IF v_harsh_id IS NOT NULL AND v_rajvi_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_relationship_edge') THEN
        PERFORM public.upsert_relationship_edge(v_harsh_id, v_rajvi_id, 'SPOUSE', v_admin_id);
      ELSE
        INSERT INTO public.relationships (
          person_a_id, person_b_id, relationship_type, verification_status, created_by
        ) VALUES (
          LEAST(v_harsh_id, v_rajvi_id),
          GREATEST(v_harsh_id, v_rajvi_id),
          'SPOUSE',
          'VERIFIED',
          v_admin_id
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;
END;
$$;

COMMIT;
