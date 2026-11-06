-- =============================================================================
-- Migration: 20261105233000_replace_gotra_nukh_with_official_pdf_data.sql
-- Description:
-- 1. Updates Gotra & Nukh master directory to the authoritative 29 Gotras and 148 Nukhs
--    from 'Brahma Khatri Gotra and Nukh Directory(1).pdf'.
-- 2. Upgrades validate_gotra_nukh() trigger function to recognize exact names, base names,
--    and parenthetical aliases, resolving 'INVALID_GOTRA_NUKH' errors.
-- 3. Safely normalizes existing historical Gotra and Nukh values in persons and families.
-- 4. Backfills missing Gotra, Nukh, Location, and dob_year from families onto persons.
-- 5. Safely recreates public.community_persons security barrier view (including blood_group)
--    and public.get_my_linked_person(), avoiding Postgres 42P16 error.
-- =============================================================================

BEGIN;

-- Step 1: Temporarily disable guard & validation triggers for master updates
ALTER TABLE IF EXISTS public.gotras DISABLE TRIGGER trg_guard_gotra_master_integrity;
ALTER TABLE IF EXISTS public.nukhs DISABLE TRIGGER trg_guard_nukh_master_integrity;
ALTER TABLE IF EXISTS public.persons DISABLE TRIGGER trg_validate_person_gotra_nukh;
ALTER TABLE IF EXISTS public.families DISABLE TRIGGER trg_validate_family_gotra_nukh;

-- Step 2: Normalize existing Gotra values across persons and families before inserting
UPDATE public.persons SET gotra = 'Agastya' WHERE lower(gotra) IN ('agastya', 'agasti');
UPDATE public.families SET gotra = 'Agastya' WHERE lower(gotra) IN ('agastya', 'agasti');

UPDATE public.persons SET gotra = 'Uttari' WHERE lower(gotra) IN ('uttari', 'utri');
UPDATE public.families SET gotra = 'Uttari' WHERE lower(gotra) IN ('uttari', 'utri');

UPDATE public.persons SET gotra = 'Badrayan' WHERE lower(gotra) IN ('badrayan', 'badarayana', 'badarayan');
UPDATE public.families SET gotra = 'Badrayan' WHERE lower(gotra) IN ('badrayan', 'badarayana', 'badarayan');

UPDATE public.persons SET gotra = 'Bhabhroya' WHERE lower(gotra) IN ('bhabhroya', 'bhamaraya');
UPDATE public.families SET gotra = 'Bhabhroya' WHERE lower(gotra) IN ('bhabhroya', 'bhamaraya');

UPDATE public.persons SET gotra = 'Bharadwaj' WHERE lower(gotra) IN ('bharadwaj', 'bhardwaj');
UPDATE public.families SET gotra = 'Bharadwaj' WHERE lower(gotra) IN ('bharadwaj', 'bhardwaj');

UPDATE public.persons SET gotra = 'Taitar' WHERE lower(gotra) IN ('taitar', 'tandira');
UPDATE public.families SET gotra = 'Taitar' WHERE lower(gotra) IN ('taitar', 'tandira');

UPDATE public.persons SET gotra = 'Jamdagni' WHERE lower(gotra) IN ('jamdagni', 'jamadagni');
UPDATE public.families SET gotra = 'Jamdagni' WHERE lower(gotra) IN ('jamdagni', 'jamadagni');

UPDATE public.persons SET gotra = 'Dhananjay' WHERE lower(gotra) IN ('dhananjay', 'dhananjaya');
UPDATE public.families SET gotra = 'Dhananjay' WHERE lower(gotra) IN ('dhananjay', 'dhananjaya');

UPDATE public.persons SET gotra = 'Dakhshayan' WHERE lower(gotra) IN ('dakhshayan', 'darvashayana', 'dakshayan');
UPDATE public.families SET gotra = 'Dakhshayan' WHERE lower(gotra) IN ('dakhshayan', 'darvashayana', 'dakshayan');

UPDATE public.persons SET gotra = 'Rahugan' WHERE lower(gotra) IN ('rahugan', 'raghuna', 'rahugana');
UPDATE public.families SET gotra = 'Rahugan' WHERE lower(gotra) IN ('rahugan', 'raghuna', 'rahugana');

UPDATE public.persons SET gotra = 'Sudarshan' WHERE lower(gotra) IN ('sudarshan', 'sudharshan');
UPDATE public.families SET gotra = 'Sudarshan' WHERE lower(gotra) IN ('sudarshan', 'sudharshan');

UPDATE public.persons SET gotra = 'Shandilya' WHERE lower(gotra) IN ('shandilya', 'sandilya');
UPDATE public.families SET gotra = 'Shandilya' WHERE lower(gotra) IN ('shandilya', 'sandilya');

UPDATE public.persons SET gotra = 'Shankhpal' WHERE lower(gotra) IN ('shankhpal', 'shankhapala');
UPDATE public.families SET gotra = 'Shankhpal' WHERE lower(gotra) IN ('shankhpal', 'shankhapala');

UPDATE public.persons SET gotra = 'Kashyap' WHERE lower(gotra) IN ('kashyap', 'kashyapa', 'kashyap (kashyapa)');
UPDATE public.families SET gotra = 'Kashyap' WHERE lower(gotra) IN ('kashyap', 'kashyapa', 'kashyap (kashyapa)');

UPDATE public.persons SET gotra = 'Krishna' WHERE lower(gotra) IN ('krishna', 'krishna (shishan)', 'shishan');
UPDATE public.families SET gotra = 'Krishna' WHERE lower(gotra) IN ('krishna', 'krishna (shishan)', 'shishan');

UPDATE public.persons SET gotra = 'Karno' WHERE lower(gotra) IN ('karno', 'karna');
UPDATE public.families SET gotra = 'Karno' WHERE lower(gotra) IN ('karno', 'karna');

UPDATE public.persons SET gotra = 'Kaushik' WHERE lower(gotra) IN ('kaushik', 'kaushika');
UPDATE public.families SET gotra = 'Kaushik' WHERE lower(gotra) IN ('kaushik', 'kaushika');

UPDATE public.persons SET gotra = 'Narniyojan' WHERE lower(gotra) IN ('narniyojan', 'naradijana', 'narniyo-jan');
UPDATE public.families SET gotra = 'Narniyojan' WHERE lower(gotra) IN ('narniyojan', 'naradijana', 'narniyo-jan');

UPDATE public.persons SET gotra = 'Vashistha' WHERE lower(gotra) IN ('vashistha', 'vashishtha', 'vashishta');
UPDATE public.families SET gotra = 'Vashistha' WHERE lower(gotra) IN ('vashistha', 'vashishtha', 'vashishta');

UPDATE public.persons SET gotra = 'Unrecorded / Not Known' WHERE lower(gotra) IN ('unrecorded / not known', 'gotra not known', 'unknown', 'not known');
UPDATE public.families SET gotra = 'Unrecorded / Not Known' WHERE lower(gotra) IN ('unrecorded / not known', 'gotra not known', 'unknown', 'not known');

-- Step 3: Insert / Upsert the 29 Authoritative Gotras into public.gotras
INSERT INTO public.gotras (name, display_order) VALUES ('Agastya', 1)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Uttari', 2)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Badrayan', 3)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Bhabhroya', 4)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Bharadwaj', 5)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Taitar', 6)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Parashar', 7)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Jamdagni', 8)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Dhananjay', 9)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Dakhshayan', 10)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Rahugan', 11)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Sudarshan', 12)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Shandilya', 13)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Shankhpal', 14)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Kashyap', 15)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Kamuk', 16)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Krishna', 17)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Karno', 18)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Kaushik', 19)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Gargya', 20)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Gautam', 21)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Mandhata', 22)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Mudgal', 23)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Narniyojan', 24)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Vaman', 25)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Vamdev', 26)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Vatsa', 27)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Vashistha', 28)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;
INSERT INTO public.gotras (name, display_order) VALUES ('Unrecorded / Not Known', 29)
  ON CONFLICT ((lower(name))) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order;

-- Step 4: Clean and re-seed all 148 official Nukhs mapped to gotra_id
-- We delete all old nukhs first so foreign key constraints on gotras are not violated
DELETE FROM public.nukhs;

-- Clean up any old gotras that are not in the 29 canonical gotras
UPDATE public.persons SET gotra = 'Unrecorded / Not Known' WHERE gotra IS NOT NULL AND lower(gotra) NOT IN (
  'agastya',
  'uttari',
  'badrayan',
  'bhabhroya',
  'bharadwaj',
  'taitar',
  'parashar',
  'jamdagni',
  'dhananjay',
  'dakhshayan',
  'rahugan',
  'sudarshan',
  'shandilya',
  'shankhpal',
  'kashyap',
  'kamuk',
  'krishna',
  'karno',
  'kaushik',
  'gargya',
  'gautam',
  'mandhata',
  'mudgal',
  'narniyojan',
  'vaman',
  'vamdev',
  'vatsa',
  'vashistha',
  'unrecorded / not known'
);

UPDATE public.families SET gotra = 'Unrecorded / Not Known' WHERE gotra IS NOT NULL AND lower(gotra) NOT IN (
  'agastya',
  'uttari',
  'badrayan',
  'bhabhroya',
  'bharadwaj',
  'taitar',
  'parashar',
  'jamdagni',
  'dhananjay',
  'dakhshayan',
  'rahugan',
  'sudarshan',
  'shandilya',
  'shankhpal',
  'kashyap',
  'kamuk',
  'krishna',
  'karno',
  'kaushik',
  'gargya',
  'gautam',
  'mandhata',
  'mudgal',
  'narniyojan',
  'vaman',
  'vamdev',
  'vatsa',
  'vashistha',
  'unrecorded / not known'
);

DELETE FROM public.gotras WHERE lower(name) NOT IN (
  'agastya',
  'uttari',
  'badrayan',
  'bhabhroya',
  'bharadwaj',
  'taitar',
  'parashar',
  'jamdagni',
  'dhananjay',
  'dakhshayan',
  'rahugan',
  'sudarshan',
  'shandilya',
  'shankhpal',
  'kashyap',
  'kamuk',
  'krishna',
  'karno',
  'kaushik',
  'gargya',
  'gautam',
  'mandhata',
  'mudgal',
  'narniyojan',
  'vaman',
  'vamdev',
  'vatsa',
  'vashistha',
  'unrecorded / not known'
);

-- Step 5: Insert all 148 official Nukhs mapped to gotra_id

-- Gotra: Agastya (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Arora (Aroda)' FROM public.gotras g WHERE lower(g.name) = lower('Agastya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Aslachhantara (Aslacheva)' FROM public.gotras g WHERE lower(g.name) = lower('Agastya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Jagotra' FROM public.gotras g WHERE lower(g.name) = lower('Agastya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Tatariya' FROM public.gotras g WHERE lower(g.name) = lower('Agastya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Uttari (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Asra (Aasra)' FROM public.gotras g WHERE lower(g.name) = lower('Uttari')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Mamlatura' FROM public.gotras g WHERE lower(g.name) = lower('Uttari')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Digagan-dre' FROM public.gotras g WHERE lower(g.name) = lower('Uttari')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Bagal' FROM public.gotras g WHERE lower(g.name) = lower('Uttari')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Thankana (Drukana)' FROM public.gotras g WHERE lower(g.name) = lower('Uttari')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Badrayan (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Bagiriya (Bagadiya)' FROM public.gotras g WHERE lower(g.name) = lower('Badrayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Borachiya' FROM public.gotras g WHERE lower(g.name) = lower('Badrayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Harshun' FROM public.gotras g WHERE lower(g.name) = lower('Badrayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Harshana' FROM public.gotras g WHERE lower(g.name) = lower('Badrayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Bhabhroya (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Vesamiya (Vishwama, Bosamiya)' FROM public.gotras g WHERE lower(g.name) = lower('Bhabhroya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Burba' FROM public.gotras g WHERE lower(g.name) = lower('Bhabhroya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Paporiya' FROM public.gotras g WHERE lower(g.name) = lower('Bhabhroya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Parya (Padiya)' FROM public.gotras g WHERE lower(g.name) = lower('Bhabhroya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Bharadwaj (7 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Bhut (Nirmal)' FROM public.gotras g WHERE lower(g.name) = lower('Bharadwaj')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Bheva' FROM public.gotras g WHERE lower(g.name) = lower('Bharadwaj')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Bhuchhada' FROM public.gotras g WHERE lower(g.name) = lower('Bharadwaj')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Kookar (Kokil)' FROM public.gotras g WHERE lower(g.name) = lower('Bharadwaj')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Bhedan (Bheda)' FROM public.gotras g WHERE lower(g.name) = lower('Bharadwaj')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Bhachhal' FROM public.gotras g WHERE lower(g.name) = lower('Bharadwaj')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Badhar (Badhar)' FROM public.gotras g WHERE lower(g.name) = lower('Bharadwaj')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Taitar (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Taitya Otha' FROM public.gotras g WHERE lower(g.name) = lower('Taitar')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Thegra' FROM public.gotras g WHERE lower(g.name) = lower('Taitar')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dooda' FROM public.gotras g WHERE lower(g.name) = lower('Taitar')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dodhiya' FROM public.gotras g WHERE lower(g.name) = lower('Taitar')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dadagan' FROM public.gotras g WHERE lower(g.name) = lower('Taitar')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Parashar (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Panjabhut' FROM public.gotras g WHERE lower(g.name) = lower('Parashar')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Pathar' FROM public.gotras g WHERE lower(g.name) = lower('Parashar')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Mamtara (Mamutora)' FROM public.gotras g WHERE lower(g.name) = lower('Parashar')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Bhitar Meher' FROM public.gotras g WHERE lower(g.name) = lower('Parashar')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Jamdagni (8 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Godhiya (Godiya)' FROM public.gotras g WHERE lower(g.name) = lower('Jamdagni')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Gosihar (Josihar)' FROM public.gotras g WHERE lower(g.name) = lower('Jamdagni')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Josihar' FROM public.gotras g WHERE lower(g.name) = lower('Jamdagni')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Jajal' FROM public.gotras g WHERE lower(g.name) = lower('Jamdagni')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Jogi' FROM public.gotras g WHERE lower(g.name) = lower('Jamdagni')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Jariya' FROM public.gotras g WHERE lower(g.name) = lower('Jamdagni')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Jagar' FROM public.gotras g WHERE lower(g.name) = lower('Jamdagni')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Lula' FROM public.gotras g WHERE lower(g.name) = lower('Jamdagni')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Dhananjay (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dhandha' FROM public.gotras g WHERE lower(g.name) = lower('Dhananjay')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dharre' FROM public.gotras g WHERE lower(g.name) = lower('Dhananjay')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dharduhiya (Dhandhiya)' FROM public.gotras g WHERE lower(g.name) = lower('Dhananjay')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dara (Dada)' FROM public.gotras g WHERE lower(g.name) = lower('Dhananjay')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dharu Jagat (Dharu Jakhwat)' FROM public.gotras g WHERE lower(g.name) = lower('Dhananjay')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Dakhshayan (7 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dubal (Dubdan)' FROM public.gotras g WHERE lower(g.name) = lower('Dakhshayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Kosara' FROM public.gotras g WHERE lower(g.name) = lower('Dakhshayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dhandhara (Dandriya)' FROM public.gotras g WHERE lower(g.name) = lower('Dakhshayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dulera' FROM public.gotras g WHERE lower(g.name) = lower('Dakhshayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dumriya (Darmariya)' FROM public.gotras g WHERE lower(g.name) = lower('Dakhshayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dheerya' FROM public.gotras g WHERE lower(g.name) = lower('Dakhshayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Gaday' FROM public.gotras g WHERE lower(g.name) = lower('Dakhshayan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Rahugan (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Rasputra' FROM public.gotras g WHERE lower(g.name) = lower('Rahugan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Raspoira' FROM public.gotras g WHERE lower(g.name) = lower('Rahugan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Raja' FROM public.gotras g WHERE lower(g.name) = lower('Rahugan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Khakhra (Kharara)' FROM public.gotras g WHERE lower(g.name) = lower('Rahugan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Rusiya' FROM public.gotras g WHERE lower(g.name) = lower('Rahugan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Sudarshan (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Soneshwar (Sonesar, Somesar)' FROM public.gotras g WHERE lower(g.name) = lower('Sudarshan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Sita (Sota)' FROM public.gotras g WHERE lower(g.name) = lower('Sudarshan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Sodiya (Soddhiya)' FROM public.gotras g WHERE lower(g.name) = lower('Sudarshan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Damra (Damra)' FROM public.gotras g WHERE lower(g.name) = lower('Sudarshan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Chacha Jagwarath' FROM public.gotras g WHERE lower(g.name) = lower('Sudarshan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Shandilya (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Sanishcharya (Chhanchhariya)' FROM public.gotras g WHERE lower(g.name) = lower('Shandilya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Sonpal (Sonpar)' FROM public.gotras g WHERE lower(g.name) = lower('Shandilya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Sidhwa' FROM public.gotras g WHERE lower(g.name) = lower('Shandilya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Sodechi (Sodha)' FROM public.gotras g WHERE lower(g.name) = lower('Shandilya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Shankhpal (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Sorathiya' FROM public.gotras g WHERE lower(g.name) = lower('Shankhpal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Soneji (Soneja)' FROM public.gotras g WHERE lower(g.name) = lower('Shankhpal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dengra (Dhengra)' FROM public.gotras g WHERE lower(g.name) = lower('Shankhpal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dresar' FROM public.gotras g WHERE lower(g.name) = lower('Shankhpal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Godiya' FROM public.gotras g WHERE lower(g.name) = lower('Shankhpal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Kashyap (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Kathbhanbhan (Kath Bagada, Kathiya)' FROM public.gotras g WHERE lower(g.name) = lower('Kashyap')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Kandhra' FROM public.gotras g WHERE lower(g.name) = lower('Kashyap')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Hargun (Majathiya)' FROM public.gotras g WHERE lower(g.name) = lower('Kashyap')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Hanja (Hanjadiya)' FROM public.gotras g WHERE lower(g.name) = lower('Kashyap')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Kamuk (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Keherich' FROM public.gotras g WHERE lower(g.name) = lower('Kamuk')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Kariya (Keediya)' FROM public.gotras g WHERE lower(g.name) = lower('Kamuk')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Tokla (Tikli)' FROM public.gotras g WHERE lower(g.name) = lower('Kamuk')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Tangra' FROM public.gotras g WHERE lower(g.name) = lower('Kamuk')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dak' FROM public.gotras g WHERE lower(g.name) = lower('Kamuk')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Krishna (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Karatela' FROM public.gotras g WHERE lower(g.name) = lower('Krishna')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Karchila' FROM public.gotras g WHERE lower(g.name) = lower('Krishna')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Kharkhur (Khudkhudiya)' FROM public.gotras g WHERE lower(g.name) = lower('Krishna')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Khuha (Khuha)' FROM public.gotras g WHERE lower(g.name) = lower('Krishna')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Khathuriya' FROM public.gotras g WHERE lower(g.name) = lower('Krishna')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Karno (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Keedi (Keeri)' FROM public.gotras g WHERE lower(g.name) = lower('Karno')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dagiya (Dagiya)' FROM public.gotras g WHERE lower(g.name) = lower('Karno')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dayani' FROM public.gotras g WHERE lower(g.name) = lower('Karno')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Tandon (Tandan)' FROM public.gotras g WHERE lower(g.name) = lower('Karno')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Kaushik (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Kakaiya' FROM public.gotras g WHERE lower(g.name) = lower('Kaushik')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Kaku (Kakwa, Kakupota)' FROM public.gotras g WHERE lower(g.name) = lower('Kaushik')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Kakra' FROM public.gotras g WHERE lower(g.name) = lower('Kaushik')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Lakhanhar' FROM public.gotras g WHERE lower(g.name) = lower('Kaushik')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Katkiya' FROM public.gotras g WHERE lower(g.name) = lower('Kaushik')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Gargya (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Gajkaran (Gaj Karn)' FROM public.gotras g WHERE lower(g.name) = lower('Gargya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Gumra' FROM public.gotras g WHERE lower(g.name) = lower('Gargya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Chakla' FROM public.gotras g WHERE lower(g.name) = lower('Gargya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Chhuchha (Chhunchha)' FROM public.gotras g WHERE lower(g.name) = lower('Gargya')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Gautam (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Girach' FROM public.gotras g WHERE lower(g.name) = lower('Gautam')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Goratela' FROM public.gotras g WHERE lower(g.name) = lower('Gautam')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Gila' FROM public.gotras g WHERE lower(g.name) = lower('Gautam')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Madhur' FROM public.gotras g WHERE lower(g.name) = lower('Gautam')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Madhu' FROM public.gotras g WHERE lower(g.name) = lower('Gautam')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Mandhata (6 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Mamutar' FROM public.gotras g WHERE lower(g.name) = lower('Mandhata')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Mavirya (Mavarba)' FROM public.gotras g WHERE lower(g.name) = lower('Mandhata')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Mavdiya (Mavdasya)' FROM public.gotras g WHERE lower(g.name) = lower('Mandhata')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Marathak' FROM public.gotras g WHERE lower(g.name) = lower('Mandhata')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Maniyar' FROM public.gotras g WHERE lower(g.name) = lower('Mandhata')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Mohanvachha' FROM public.gotras g WHERE lower(g.name) = lower('Mandhata')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Mudgal (6 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Makariya (Makdiya, Manak)' FROM public.gotras g WHERE lower(g.name) = lower('Mudgal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Makori' FROM public.gotras g WHERE lower(g.name) = lower('Mudgal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Medhiya (Meghya)' FROM public.gotras g WHERE lower(g.name) = lower('Mudgal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Machhar' FROM public.gotras g WHERE lower(g.name) = lower('Mudgal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Garnara' FROM public.gotras g WHERE lower(g.name) = lower('Mudgal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Meher (Meer)' FROM public.gotras g WHERE lower(g.name) = lower('Mudgal')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Narniyojan (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Nansi' FROM public.gotras g WHERE lower(g.name) = lower('Narniyojan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Neman' FROM public.gotras g WHERE lower(g.name) = lower('Narniyojan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Naisar' FROM public.gotras g WHERE lower(g.name) = lower('Narniyojan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Nengo' FROM public.gotras g WHERE lower(g.name) = lower('Narniyojan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Nan (Nayan)' FROM public.gotras g WHERE lower(g.name) = lower('Narniyojan')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Vaman (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Vadhyal' FROM public.gotras g WHERE lower(g.name) = lower('Vaman')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Davdiya' FROM public.gotras g WHERE lower(g.name) = lower('Vaman')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dode (Daor)' FROM public.gotras g WHERE lower(g.name) = lower('Vaman')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Dodhiya' FROM public.gotras g WHERE lower(g.name) = lower('Vaman')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Vamdev (4 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Verde (Varde)' FROM public.gotras g WHERE lower(g.name) = lower('Vamdev')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Leemriya' FROM public.gotras g WHERE lower(g.name) = lower('Vamdev')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Leea' FROM public.gotras g WHERE lower(g.name) = lower('Vamdev')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Loolaiya' FROM public.gotras g WHERE lower(g.name) = lower('Vamdev')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Vatsa (5 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Vama' FROM public.gotras g WHERE lower(g.name) = lower('Vatsa')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Vajri' FROM public.gotras g WHERE lower(g.name) = lower('Vatsa')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Veechhi' FROM public.gotras g WHERE lower(g.name) = lower('Vatsa')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Vali (Veli)' FROM public.gotras g WHERE lower(g.name) = lower('Vatsa')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Chamariya' FROM public.gotras g WHERE lower(g.name) = lower('Vatsa')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Vashistha (6 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Valeel (Valera)' FROM public.gotras g WHERE lower(g.name) = lower('Vashistha')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Chhatpar' FROM public.gotras g WHERE lower(g.name) = lower('Vashistha')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Chhanang' FROM public.gotras g WHERE lower(g.name) = lower('Vashistha')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Mel (Meer)' FROM public.gotras g WHERE lower(g.name) = lower('Vashistha')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Jeel' FROM public.gotras g WHERE lower(g.name) = lower('Vashistha')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Jheel' FROM public.gotras g WHERE lower(g.name) = lower('Vashistha')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Gotra: Unrecorded / Not Known (8 Nukhs)
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Acharya' FROM public.gotras g WHERE lower(g.name) = lower('Unrecorded / Not Known')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Ripaiya' FROM public.gotras g WHERE lower(g.name) = lower('Unrecorded / Not Known')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Gana' FROM public.gotras g WHERE lower(g.name) = lower('Unrecorded / Not Known')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Tanji Odhya' FROM public.gotras g WHERE lower(g.name) = lower('Unrecorded / Not Known')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Saraya' FROM public.gotras g WHERE lower(g.name) = lower('Unrecorded / Not Known')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Harsarya' FROM public.gotras g WHERE lower(g.name) = lower('Unrecorded / Not Known')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Chhatakpur' FROM public.gotras g WHERE lower(g.name) = lower('Unrecorded / Not Known')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.nukhs (gotra_id, name)
  SELECT g.id, 'Gugya' FROM public.gotras g WHERE lower(g.name) = lower('Unrecorded / Not Known')
  ON CONFLICT (gotra_id, (lower(name))) DO UPDATE SET name = EXCLUDED.name;

-- Step 6: Upgrade validate_gotra_nukh() trigger function with intelligent matching
CREATE OR REPLACE FUNCTION public.validate_gotra_nukh()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gotra_id UUID;
  v_canonical_gotra TEXT;
  v_canonical_nukh TEXT;
BEGIN
  -- Normalize empty strings to NULL
  NEW.gotra := NULLIF(trim(NEW.gotra), '');
  NEW.nukh := NULLIF(trim(NEW.nukh), '');

  -- If both are NULL, allow
  IF NEW.gotra IS NULL AND NEW.nukh IS NULL THEN
    RETURN NEW;
  END IF;

  -- If Nukh is provided without Gotra, reject
  IF NEW.gotra IS NULL AND NEW.nukh IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_GOTRA_NUKH: Nukh cannot be specified without a valid Gotra.' USING ERRCODE = '22023';
  END IF;

  -- Validate Gotra exists in public.gotras (matching canonical name, base name, or alias)
  SELECT id, name INTO v_gotra_id, v_canonical_gotra
  FROM public.gotras
  WHERE lower(trim(name)) = lower(trim(NEW.gotra))
     OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(NEW.gotra, ' (', 1)))
     OR (position('(' in name) > 0 AND lower(substring(name from '\(([^)]+)\)')) LIKE '%' || lower(trim(NEW.gotra)) || '%')
     OR (position('(' in NEW.gotra) > 0 AND lower(trim(name)) = lower(trim(substring(NEW.gotra from '\(([^)]+)\)'))))
  ORDER BY
    CASE WHEN lower(trim(name)) = lower(trim(NEW.gotra)) THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_gotra_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_GOTRA_NUKH: "%" is not a registered Gotra.', NEW.gotra USING ERRCODE = '22023';
  END IF;

  -- Canonicalize stored Gotra spelling from master table
  NEW.gotra := v_canonical_gotra;

  -- If Nukh is provided, validate it belongs to that Gotra and canonicalize stored Nukh spelling
  IF NEW.nukh IS NOT NULL THEN
    SELECT name INTO v_canonical_nukh
    FROM public.nukhs
    WHERE gotra_id = v_gotra_id
      AND (
        lower(trim(name)) = lower(trim(NEW.nukh))
        OR lower(trim(split_part(name, ' (', 1))) = lower(trim(split_part(NEW.nukh, ' (', 1)))
        OR lower(name) ~* ('(^|[^a-zA-Z0-9])' || regexp_replace(lower(trim(NEW.nukh)), '[^a-zA-Z0-9]', '', 'g') || '([^a-zA-Z0-9]|$)')
        OR regexp_replace(lower(name), '[^a-zA-Z0-9]', '', 'g') = regexp_replace(lower(NEW.nukh), '[^a-zA-Z0-9]', '', 'g')
        OR regexp_replace(lower(split_part(name, ' (', 1)), '[^a-zA-Z0-9]', '', 'g') = regexp_replace(lower(NEW.nukh), '[^a-zA-Z0-9]', '', 'g')
        OR (position('(' in name) > 0 AND regexp_replace(lower(substring(name from '\(([^)]+)\)')), '[^a-zA-Z0-9]', '', 'g') LIKE '%' || regexp_replace(lower(NEW.nukh), '[^a-zA-Z0-9]', '', 'g') || '%')
      )
    ORDER BY
      CASE WHEN lower(trim(name)) = lower(trim(NEW.nukh)) THEN 1 ELSE 2 END,
      created_at ASC
    LIMIT 1;

    IF v_canonical_nukh IS NULL THEN
      RAISE EXCEPTION 'INVALID_GOTRA_NUKH: Nukh "%" does not belong to Gotra "%".', NEW.nukh, v_canonical_gotra USING ERRCODE = '22023';
    END IF;

    -- Canonicalize stored Nukh spelling from master table
    NEW.nukh := v_canonical_nukh;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 7: Update master integrity guard triggers to support base/alias comparison
CREATE OR REPLACE FUNCTION public.guard_gotra_master_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND lower(NEW.name) != lower(OLD.name)) THEN
    IF EXISTS (
      SELECT 1 FROM public.persons
      WHERE lower(gotra) = lower(OLD.name)
        AND lower(gotra) != lower(COALESCE(NEW.name, ''))
    ) OR EXISTS (
      SELECT 1 FROM public.families
      WHERE lower(gotra) = lower(OLD.name)
        AND lower(gotra) != lower(COALESCE(NEW.name, ''))
    ) THEN
      RAISE EXCEPTION 'RESTRICT: Cannot delete or rename Gotra "%" because active community records reference it.', OLD.name USING ERRCODE = '23001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_nukh_master_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_gotra_name TEXT;
BEGIN
  SELECT name INTO v_old_gotra_name FROM public.gotras WHERE id = OLD.gotra_id;

  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND (lower(NEW.name) != lower(OLD.name) OR NEW.gotra_id != OLD.gotra_id)) THEN

    IF EXISTS (
      SELECT 1 FROM public.persons
      WHERE lower(gotra) = lower(v_old_gotra_name)
        AND lower(nukh) = lower(OLD.name)
        AND lower(nukh) != lower(COALESCE(NEW.name, ''))
    ) OR EXISTS (
      SELECT 1 FROM public.families
      WHERE lower(gotra) = lower(v_old_gotra_name)
        AND lower(nukh) = lower(OLD.name)
        AND lower(nukh) != lower(COALESCE(NEW.name, ''))
    ) THEN
      RAISE EXCEPTION 'RESTRICT: Cannot delete, rename, or reassign Nukh "%" in Gotra "%" because active community records reference this association.', OLD.name, v_old_gotra_name USING ERRCODE = '23001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Step 8: Re-enable triggers
ALTER TABLE IF EXISTS public.gotras ENABLE TRIGGER trg_guard_gotra_master_integrity;
ALTER TABLE IF EXISTS public.nukhs ENABLE TRIGGER trg_guard_nukh_master_integrity;
ALTER TABLE IF EXISTS public.persons ENABLE TRIGGER trg_validate_person_gotra_nukh;
ALTER TABLE IF EXISTS public.families ENABLE TRIGGER trg_validate_family_gotra_nukh;

-- Step 9: Normalize existing Nukh values on persons and families to canonical PDF spellings
UPDATE public.persons SET nukh = 'Arora (Aroda)' WHERE lower(nukh) IN ('arora', 'aroda', 'arora (aroda)');
UPDATE public.families SET nukh = 'Arora (Aroda)' WHERE lower(nukh) IN ('arora', 'aroda', 'arora (aroda)');

UPDATE public.persons SET nukh = 'Asra (Aasra)' WHERE lower(nukh) IN ('asra', 'aasra', 'asra (aasra)');
UPDATE public.families SET nukh = 'Asra (Aasra)' WHERE lower(nukh) IN ('asra', 'aasra', 'asra (aasra)');

UPDATE public.persons SET nukh = 'Bagiriya (Bagadiya)' WHERE lower(nukh) IN ('bagiriya', 'bagadiya', 'bagiriya (bagadiya)');
UPDATE public.families SET nukh = 'Bagiriya (Bagadiya)' WHERE lower(nukh) IN ('bagiriya', 'bagadiya', 'bagiriya (bagadiya)');

UPDATE public.persons SET nukh = 'Karatela' WHERE lower(nukh) IN ('karatela', 'karotala');
UPDATE public.families SET nukh = 'Karatela' WHERE lower(nukh) IN ('karatela', 'karotala');

-- Step 10: Backfill Gotra, Nukh, and Location from active families to individual person records
UPDATE public.persons p
SET
  gotra = COALESCE(p.gotra, f.gotra),
  nukh = COALESCE(p.nukh, f.nukh),
  birth_place = COALESCE(p.birth_place, NULLIF(TRIM(CONCAT_WS(', ', f.city, f.state)), ''))
FROM public.family_members fm
JOIN public.families f ON f.id = fm.family_id
WHERE fm.person_id = p.id
  AND fm.left_at IS NULL
  AND f.deleted_at IS NULL
  AND (p.gotra IS NULL OR p.nukh IS NULL OR p.birth_place IS NULL);

-- Step 11: Ensure schema columns and security helper functions exist before view recreation
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS manager_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS email_contact TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS phone_secondary TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS kul TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS date_of_death DATE;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS blood_group TEXT;

CREATE OR REPLACE FUNCTION public.calculate_person_age(p_dob DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT CASE 
    WHEN p_dob IS NULL THEN NULL
    ELSE (date_part('year', CURRENT_DATE) - date_part('year', p_dob))::INTEGER - 
         CASE WHEN to_char(CURRENT_DATE, 'MMDD') < to_char(p_dob, 'MMDD') THEN 1 ELSE 0 END
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('SUPER_ADMIN', 'ADMIN')
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_same_family_member(p_target_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_target_person_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND user_id = auth.uid() AND deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND created_by = auth.uid() AND deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = p_target_person_id
          AND fm.left_at IS NULL
          AND f.deleted_at IS NULL
          AND (f.manager_user_id = auth.uid() OR f.created_by = auth.uid())
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.family_members head_fm
        JOIN public.persons head_p ON head_p.id = head_fm.person_id
        JOIN public.family_members target_fm ON target_fm.family_id = head_fm.family_id
        WHERE head_p.user_id = auth.uid()
          AND head_fm.is_head = TRUE
          AND head_fm.left_at IS NULL
          AND target_fm.person_id = p_target_person_id
          AND target_fm.left_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.persons my_p
        JOIN public.family_members my_fm ON my_fm.person_id = my_p.id AND my_fm.left_at IS NULL
        JOIN public.family_members target_fm ON target_fm.family_id = my_fm.family_id AND target_fm.left_at IS NULL
        JOIN public.families f ON f.id = my_fm.family_id AND f.deleted_at IS NULL
        WHERE my_p.user_id = auth.uid()
          AND my_p.deleted_at IS NULL
          AND target_fm.person_id = p_target_person_id
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_person(p_target_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (
    auth.uid() IS NOT NULL AND p_target_person_id IS NOT NULL AND (
      public.is_admin()
      OR
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND user_id = auth.uid() AND deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1 FROM public.persons
        WHERE id = p_target_person_id AND created_by = auth.uid() AND user_id IS NULL AND deleted_at IS NULL
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.family_members fm
        JOIN public.families f ON f.id = fm.family_id
        WHERE fm.person_id = p_target_person_id
          AND fm.left_at IS NULL
          AND f.deleted_at IS NULL
          AND (f.manager_user_id = auth.uid() OR (f.manager_user_id IS NULL AND f.created_by = auth.uid()))
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.persons my_p
        JOIN public.family_members my_fm ON my_fm.person_id = my_p.id AND my_fm.left_at IS NULL AND my_fm.is_head = TRUE
        JOIN public.family_members target_fm ON target_fm.family_id = my_fm.family_id AND target_fm.left_at IS NULL
        JOIN public.families f ON f.id = my_fm.family_id AND f.deleted_at IS NULL
        WHERE my_p.user_id = auth.uid()
          AND my_p.deleted_at IS NULL
          AND target_fm.person_id = p_target_person_id
      )
    )
  );
$$;

-- Step 12: Recreate public.community_persons security barrier view and get_my_linked_person()
DROP VIEW IF EXISTS public.community_persons CASCADE;

CREATE VIEW public.community_persons
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.first_name,
  p.middle_name,
  p.last_name,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.maiden_name
    ELSE NULL
  END AS maiden_name,
  p.gender,
  public.calculate_person_age(p.date_of_birth) AS age,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,
  EXTRACT(YEAR FROM p.date_of_birth)::integer AS dob_year,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.birth_place
    ELSE NULL
  END AS birth_place,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.blood_group
    ELSE NULL
  END AS blood_group,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.email_contact
    ELSE NULL
  END AS email_contact,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.phone
    ELSE NULL
  END AS phone,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.phone_secondary
    ELSE NULL
  END AS phone_secondary,
  COALESCE(
    (
      SELECT f.city
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    ),
    NULLIF(trim(split_part(p.birth_place, ',', 1)), '')
  ) AS city,
  COALESCE(
    (
      SELECT f.state
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    ),
    NULLIF(trim(split_part(p.birth_place, ',', 2)), '')
  ) AS state,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_death
    ELSE NULL
  END AS date_of_death,
  p.avatar_url,
  COALESCE(
    p.gotra,
    (
      SELECT f.gotra
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    )
  ) AS gotra,
  COALESCE(
    p.nukh,
    (
      SELECT f.nukh
      FROM public.family_members fm
      JOIN public.families f ON f.id = fm.family_id
      WHERE fm.person_id = p.id AND fm.left_at IS NULL AND f.deleted_at IS NULL
      ORDER BY fm.is_head DESC, fm.created_at ASC
      LIMIT 1
    )
  ) AS nukh,
  p.kul,
  p.status,
  p.verification_status,
  p.created_at,
  p.updated_at,
  p.deleted_at,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.user_id
    ELSE NULL
  END AS user_id,
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.created_by
    ELSE NULL
  END AS created_by,
  p.profile_privacy,
  p.contact_privacy,
  p.dob_privacy,
  (public.is_admin() OR public.is_same_family_member(p.id)) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit
FROM public.persons p
WHERE p.deleted_at IS NULL;

REVOKE ALL ON public.community_persons FROM PUBLIC, anon;
GRANT SELECT ON public.community_persons TO authenticated, anon;

-- Step 12: Recreate get_my_linked_person() since CASCADE dropped it
CREATE OR REPLACE FUNCTION public.get_my_linked_person()
RETURNS SETOF public.community_persons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cp.*
  FROM public.community_persons cp
  JOIN public.persons p ON p.id = cp.id
  WHERE p.user_id = auth.uid()
    AND p.deleted_at IS NULL
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_linked_person() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_linked_person() TO authenticated;

COMMIT;
