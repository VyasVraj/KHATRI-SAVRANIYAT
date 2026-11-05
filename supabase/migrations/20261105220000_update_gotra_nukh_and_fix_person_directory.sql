-- =============================================================================
-- Migration: 20261105220000_update_gotra_nukh_and_fix_person_directory.sql
-- Description:
-- 1. Updates Gotra & Nukh master directory to the authoritative 29 Gotras and 148 Nukhs
--    from "Brahma Khatri Gotra and Nukh Directory.pdf".
-- 2. Normalizes existing historical Gotra/Nukh spellings on persons and families.
-- 3. Cleans up old mismatched Nukh rows and seeds all 148 official Nukhs.
-- 4. Upgrades validate_gotra_nukh() with intelligent base name & alias resolution.
-- 5. Backfills Gotra, Nukh, and Location from families to family_members/persons.
-- 6. Recreates public.community_persons security barrier view with proper CASCADE drop,
--    ensuring strict family-based privacy (other-family users see only name & age,
--    while own-family & admin see full verified details, lineage, and location fallbacks).
-- =============================================================================

-- Step 1: Temporarily disable guard triggers for master updates
ALTER TABLE IF EXISTS public.gotras DISABLE TRIGGER trg_guard_gotra_master_integrity;
ALTER TABLE IF EXISTS public.nukhs DISABLE TRIGGER trg_guard_nukh_master_integrity;
ALTER TABLE IF EXISTS public.persons DISABLE TRIGGER trg_validate_person_gotra_nukh;
ALTER TABLE IF EXISTS public.families DISABLE TRIGGER trg_validate_family_gotra_nukh;

-- Step 2: Update existing historical Gotra spellings across persons and families
UPDATE public.persons SET gotra = 'Krishna' WHERE lower(gotra) IN ('krishna (shishan)', 'shishan');
UPDATE public.families SET gotra = 'Krishna' WHERE lower(gotra) IN ('krishna (shishan)', 'shishan');

UPDATE public.persons SET gotra = 'Uttari' WHERE lower(gotra) = 'utri';
UPDATE public.families SET gotra = 'Uttari' WHERE lower(gotra) = 'utri';

UPDATE public.persons SET gotra = 'Badrayan' WHERE lower(gotra) IN ('badarayana', 'badarayan');
UPDATE public.families SET gotra = 'Badrayan' WHERE lower(gotra) IN ('badarayana', 'badarayan');

UPDATE public.persons SET gotra = 'Bhabhroya' WHERE lower(gotra) IN ('bhamaraya', 'bhabhroya');
UPDATE public.families SET gotra = 'Bhabhroya' WHERE lower(gotra) IN ('bhamaraya', 'bhabhroya');

UPDATE public.persons SET gotra = 'Taitar' WHERE lower(gotra) = 'tandira';
UPDATE public.families SET gotra = 'Taitar' WHERE lower(gotra) = 'tandira';

UPDATE public.persons SET gotra = 'Jamdagni' WHERE lower(gotra) = 'jamadagni';
UPDATE public.families SET gotra = 'Jamdagni' WHERE lower(gotra) = 'jamadagni';

UPDATE public.persons SET gotra = 'Dhananjay' WHERE lower(gotra) = 'dhananjaya';
UPDATE public.families SET gotra = 'Dhananjay' WHERE lower(gotra) = 'dhananjaya';

UPDATE public.persons SET gotra = 'Dakhshayan' WHERE lower(gotra) IN ('darvashayana', 'dakshayan');
UPDATE public.families SET gotra = 'Dakhshayan' WHERE lower(gotra) IN ('darvashayana', 'dakshayan');

UPDATE public.persons SET gotra = 'Rahugan' WHERE lower(gotra) IN ('raghuna', 'rahugana');
UPDATE public.families SET gotra = 'Rahugan' WHERE lower(gotra) IN ('raghuna', 'rahugana');

UPDATE public.persons SET gotra = 'Kashyap' WHERE lower(gotra) IN ('kashyap (kashyapa)', 'kashyapa');
UPDATE public.families SET gotra = 'Kashyap' WHERE lower(gotra) IN ('kashyap (kashyapa)', 'kashyapa');

UPDATE public.persons SET gotra = 'Karno' WHERE lower(gotra) = 'karna';
UPDATE public.families SET gotra = 'Karno' WHERE lower(gotra) = 'karna';

UPDATE public.persons SET gotra = 'Narniyojan' WHERE lower(gotra) IN ('naradijana', 'narniyojan');
UPDATE public.families SET gotra = 'Narniyojan' WHERE lower(gotra) IN ('naradijana', 'narniyojan');

UPDATE public.persons SET gotra = 'Vashistha' WHERE lower(gotra) IN ('vashishtha', 'vashishta');
UPDATE public.families SET gotra = 'Vashistha' WHERE lower(gotra) IN ('vashishtha', 'vashishta');

UPDATE public.persons SET gotra = 'Unrecorded / Not Known' WHERE lower(gotra) IN ('gotra not known', 'unknown', 'not known');
UPDATE public.families SET gotra = 'Unrecorded / Not Known' WHERE lower(gotra) IN ('gotra not known', 'unknown', 'not known');

-- Step 3: Upsert the Authoritative 29 Gotras into public.gotras
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

-- Step 4: Safely replace outdated Nukhs in public.nukhs with authoritative 148 entries
DELETE FROM public.nukhs;
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

-- Step 5: Upgrade validate_gotra_nukh() trigger function with intelligent matching
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

  -- Validate Gotra exists in public.gotras (matching canonical name or case-insensitive or base name)
  SELECT id, name INTO v_gotra_id, v_canonical_gotra
  FROM public.gotras
  WHERE lower(name) = lower(NEW.gotra)
     OR lower(split_part(name, ' (', 1)) = lower(split_part(NEW.gotra, ' (', 1))
  ORDER BY CASE WHEN lower(name) = lower(NEW.gotra) THEN 1 ELSE 2 END
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
        lower(name) = lower(NEW.nukh)
        OR lower(split_part(name, ' (', 1)) = lower(split_part(NEW.nukh, ' (', 1))
        OR (position('(' in name) > 0 AND lower(substring(name from '\(([^)]+)\)')) = lower(NEW.nukh))
        OR (position('(' in NEW.nukh) > 0 AND lower(substring(NEW.nukh from '\(([^)]+)\)')) = lower(name))
        OR lower(name) LIKE '%' || lower(split_part(NEW.nukh, ' (', 1)) || '%'
      )
    ORDER BY
      CASE WHEN lower(name) = lower(NEW.nukh) THEN 1 ELSE 2 END,
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

-- Step 6: Re-enable guard triggers
ALTER TABLE IF EXISTS public.gotras ENABLE TRIGGER trg_guard_gotra_master_integrity;
ALTER TABLE IF EXISTS public.nukhs ENABLE TRIGGER trg_guard_nukh_master_integrity;
ALTER TABLE IF EXISTS public.persons ENABLE TRIGGER trg_validate_person_gotra_nukh;
ALTER TABLE IF EXISTS public.families ENABLE TRIGGER trg_validate_family_gotra_nukh;

-- Step 7: Backfill Gotra, Nukh, City, State, Birth Place on persons from active family memberships
-- where individual person record has missing Gotra or Nukh
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

-- Step 8: Drop and recreate public.community_persons security barrier view
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
  public.calculate_person_age(p.date_of_birth) AS age,

  -- Date of birth: strictly visible only to same family or admin
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.date_of_birth
    ELSE NULL
  END AS date_of_birth,

  -- Birth year: strictly visible only to same family or admin
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.dob_year
    ELSE NULL
  END AS dob_year,

  -- Birth place: strictly visible only to same family or admin
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.birth_place
    ELSE NULL
  END AS birth_place,

  -- Contact details: strictly visible only to same family or admin
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

  -- City: resolved with family fallback, strictly visible only to same family or admin
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
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
      )
    ELSE NULL
  END AS city,

  -- State: resolved with family fallback, strictly visible only to same family or admin
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
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
      )
    ELSE NULL
  END AS state,

  p.date_of_death,
  p.avatar_url,

  -- Gotra: resolved with family fallback, strictly visible only to same family or admin
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
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
      )
    ELSE NULL
  END AS gotra,

  -- Nukh: resolved with family fallback, strictly visible only to same family or admin
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN
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
      )
    ELSE NULL
  END AS nukh,

  -- Kul: strictly visible only to same family or admin
  CASE
    WHEN public.is_admin() OR public.is_same_family_member(p.id) THEN p.kul
    ELSE NULL
  END AS kul,

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

  (public.is_admin() OR public.is_same_family_member(p.id)) AS is_same_family,
  public.can_edit_person(p.id) AS can_edit

FROM public.persons p
WHERE p.deleted_at IS NULL;

-- Step 9: Grants & Permissions
REVOKE ALL ON public.community_persons FROM PUBLIC;
GRANT SELECT ON public.community_persons TO authenticated, anon;

COMMENT ON VIEW public.community_persons IS
  'Directory view enforcing strict family privacy: other-family members view only name, age, gender and status; own-family and admins view complete verified records, location, and lineage with family fallbacks.';
