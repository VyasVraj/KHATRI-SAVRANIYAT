-- =============================================================================
-- Migration: 20261105230000_create_community_mukhis_and_seed_118.sql
-- Description: Official Community Mukhi Directory (118 records from PDF)
--              and family-wise Mukhi selection with strict separation of roles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table: public.community_mukhis
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_mukhis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_serial_number INTEGER NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  gram TEXT NOT NULL,
  mobile_number TEXT,
  password_given_status TEXT,
  form_received_status TEXT,
  online_updated_status TEXT,
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  linked_person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.community_mukhis IS
  'Official 118-member Community Mukhi Directory from the authoritative Community Mukhi List.';

CREATE INDEX IF NOT EXISTS idx_community_mukhis_source_serial ON public.community_mukhis(source_serial_number);
CREATE INDEX IF NOT EXISTS idx_community_mukhis_gram ON public.community_mukhis(gram);
CREATE INDEX IF NOT EXISTS idx_community_mukhis_full_name ON public.community_mukhis(full_name);

-- -----------------------------------------------------------------------------
-- 2. Row-Level Security for public.community_mukhis
-- -----------------------------------------------------------------------------
ALTER TABLE public.community_mukhis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_mukhis_select_authenticated" ON public.community_mukhis;
CREATE POLICY "community_mukhis_select_authenticated"
  ON public.community_mukhis
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "community_mukhis_admin_all" ON public.community_mukhis;
CREATE POLICY "community_mukhis_admin_all"
  ON public.community_mukhis
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.community_mukhis TO authenticated;
GRANT ALL ON public.community_mukhis TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Public Directory View (Excludes Administrative Tracking Columns)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.community_mukhis_directory AS
SELECT
  id,
  source_serial_number,
  full_name,
  gram,
  mobile_number,
  linked_user_id,
  linked_person_id,
  is_active,
  created_at,
  updated_at
FROM public.community_mukhis
WHERE is_active = TRUE;

GRANT SELECT ON public.community_mukhis_directory TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Re-link families.selected_mukhi_id to public.community_mukhis
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- Drop foreign key to executive_committee_members if present
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'families_selected_mukhi_id_fkey'
      AND table_name = 'families'
  ) THEN
    ALTER TABLE public.families DROP CONSTRAINT families_selected_mukhi_id_fkey;
  END IF;

  -- Add column if not already present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'families' AND column_name = 'selected_mukhi_id'
  ) THEN
    ALTER TABLE public.families ADD COLUMN selected_mukhi_id UUID;
  END IF;

  -- Clear any pre-existing pointers that do not exist in community_mukhis
  UPDATE public.families
  SET selected_mukhi_id = NULL
  WHERE selected_mukhi_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.community_mukhis WHERE id = selected_mukhi_id);

  -- Add foreign key referencing community_mukhis
  ALTER TABLE public.families
    ADD CONSTRAINT families_selected_mukhi_id_fkey
    FOREIGN KEY (selected_mukhi_id) REFERENCES public.community_mukhis(id) ON DELETE SET NULL;
END $$;

COMMENT ON COLUMN public.families.selected_mukhi_id IS
  'Official Community Mukhi representative designated from the 118-member Community Mukhi Directory.';

-- -----------------------------------------------------------------------------
-- 5. Seed all 118 Official Community Mukhis from authoritative PDF
-- -----------------------------------------------------------------------------
INSERT INTO public.community_mukhis (
  source_serial_number, full_name, gram, mobile_number, password_given_status, form_received_status, online_updated_status, is_active
) VALUES
  (1, 'Mukhi Naraindas Vensimal Kiri', 'Agarwal Farm, Jaipur', '9414056200', 'Yes', '1', '1', TRUE),
  (2, 'Mukhi Suryaprakash Govind Ram Varde', 'Agra', '9412300643', 'Yes', '1', '1', TRUE),
  (3, 'Mukhi Pitambardas Laxmandas Khuha', 'Ahmedabad', '9375172208', 'Yes', NULL, NULL, TRUE),
  (4, 'Mukhi Kishore Kumar Topandas Valera', 'Ajmer', '8529610087', 'Yes', NULL, NULL, TRUE),
  (5, 'Mukhi Devidas Mahadevdas Somesar', 'Alwar', '9252506300', NULL, NULL, NULL, TRUE),
  (6, 'Mukhi Natvarlal Ramchand Sorathiya', 'Amerli', '9724297807', 'Yes', NULL, NULL, TRUE),
  (7, 'Mukhi Vijaykumar Hotchand Khuha', 'AMET (Rajasamand)', NULL, 'Yes', NULL, NULL, TRUE),
  (8, 'Mukhi Khemchand Mirchumal Khatri', 'Amrapur', '9825520396', 'Yes', NULL, NULL, TRUE),
  (9, 'Mukhi Kamlesh Kumar Kishanchand Saraya', 'Amreli', '9426223815', NULL, NULL, NULL, TRUE),
  (10, 'Mukhi Ghanshyamdas Khemchand Khuha', 'Anand', '9898503206', 'Yes', '1', '1', TRUE),
  (11, 'Mukhi Prakash Chand Lilaram Khuha', 'Asifabad', '9440922655', 'Yes', NULL, NULL, TRUE),
  (12, 'Mukhi Vinod Laxmandas Khuha', 'Asind', '9414573154', 'Yes', NULL, NULL, TRUE),
  (13, 'Mukhi Jethanand Rochiram Chhanchhariya', 'Bajwa, Vadodara', '9328231811', 'Yes', NULL, NULL, TRUE),
  (14, 'Mukhi Murlidhar Mannumal Varde', 'Balotra', '9414385180', 'Yes', '1', '1', TRUE),
  (15, 'Mukhi Dr. Rajender Moolchandani', 'Bandanwara', '9214907297', NULL, NULL, NULL, TRUE),
  (16, 'Mukhi Deepak Uttamchand Kapoor', 'Bangalore', '9986078646', NULL, NULL, NULL, TRUE),
  (17, 'Mukhi Kimatrai Deepchand Khuha', 'Banswara', '9116963559', NULL, NULL, NULL, TRUE),
  (18, 'Mukhi Ghanshyam Hemandas Kapoor', 'Bantwa (Distt. Junagadh)', '9909972633', 'Yes', NULL, NULL, TRUE),
  (19, 'Mukhi Moolchand Jethanand Dulera', 'Barmer', '9461482976', NULL, '1', '1', TRUE),
  (20, 'Mukhi Gordhandas Vensimal Moorjani', 'Baroda', '9426333386', 'Yes', '1', '1', TRUE),
  (21, 'Mukhi Narayandas Bhugromal Godiya', 'Beawar', '7737017300', 'Yes', NULL, NULL, TRUE),
  (22, 'Mukhi Kishan Chand Wadumal Khuha', 'Bhanwata', '9828403949', NULL, NULL, NULL, TRUE),
  (23, 'Mukhi Vasant Kumar Jamandas Pamnani', 'Bhavnagar', '9033361661', 'Yes', NULL, NULL, TRUE),
  (24, 'Mukhi Shantiprakash Sadhuram Somesar', 'Bhawani Mandi', '9680224166', 'Yes', NULL, NULL, TRUE),
  (25, 'Mukhi Hemandas Kewalram Khuha', 'Bhilwara', '7737109000', NULL, NULL, NULL, TRUE),
  (26, 'Mukhi Vijay Kumar Hotchand Dor', 'Bhim Rajsamand', '9414666535', NULL, NULL, NULL, TRUE),
  (27, 'Mukhi Bhagwandas Odharmal Kapoor', 'Bhinmal', '9166361699', 'Yes', NULL, NULL, TRUE),
  (28, 'Mukhi Hemant Kumar Lalchand', 'Bhopal', '9425080957', NULL, NULL, NULL, TRUE),
  (29, 'Mukhi Lalchand Loungmal Khatri', 'Bhuj (Distt. Kutchh)', '7575091951', 'Yes', '1', '1', TRUE),
  (30, 'Mukhi Tilumal Mirchumal Hargun', 'Bikaner', '9214489822', NULL, NULL, NULL, TRUE),
  (31, 'Mukhi Gyanchand Topandas Khuha', 'Bundi', '8209847779', 'Yes', NULL, NULL, TRUE),
  (32, 'Mukhi Chetan Das Vikyomal Chhanchhariya', 'Chittorgarh', '9414104058', 'Yes', NULL, NULL, TRUE),
  (33, 'Mukhi Vijay Kumar Sobhrajmal Khuha', 'Deesa', '9974911113', NULL, '1', '1', TRUE),
  (34, 'Mukhi Jairam Mulchand Somesar', 'Deoli', '9214659975', NULL, NULL, NULL, TRUE),
  (35, 'Mukhi Motilal Prahladrai Kiri', 'Devas', '9752091010', 'Yes', '1', '1', TRUE),
  (36, 'Mukhi Bhavesh Chetan Bhai Khuha', 'Dhanu Road (Maharashtra)', '8007129019', 'Yes', NULL, NULL, TRUE),
  (37, 'Mukhi Govindram Khajumal Somesar', 'Dodiyana', '6367079900', NULL, NULL, NULL, TRUE),
  (38, 'Mukhi Pritamdas Rochiram Kakupota', 'Dungarpur', '9610135087', 'Yes', '1', '1', TRUE),
  (39, 'Mukhi Dr. Thakarsi Bhai Barva', 'Dungrasan (Banaskantha)', '9427492844', 'Yes', NULL, NULL, TRUE),
  (40, 'Mukhi Purushottamdas Khajumal Goratela', 'Gangapur City', '9828673054', 'Yes', NULL, NULL, TRUE),
  (41, 'Mukhi Askaran Heeranand Varde', 'Hanumangarh', '9928501162', 'Yes', NULL, NULL, TRUE),
  (42, 'Mukhi Tirathdas Shamandas Liya', 'Hatpipla (Distt. Dewas)', '9977499775', 'Yes', NULL, NULL, TRUE),
  (43, 'Mukhi Naveen Kumar Sobhrajmal Madhu', 'Himmatnagar, (Gujarat)', '9924936051', 'Yes', NULL, NULL, TRUE),
  (44, 'Mukhi Umesh Kumar Jashanmal Dagiya', 'Hyderabad', '9849474375', 'Yes', '1', '1', TRUE),
  (45, 'Mukhi Chelaram Mangharam Hargun', 'Indore', '9424594838', 'Yes', '1', '1', TRUE),
  (46, 'Mukhi Durgadas Narayandas Khuha', 'Jaipur', '9414133499', 'Yes', '1', '1', TRUE),
  (47, 'Mukhi Mahesh Udhavdas Khuha', 'Jamnagar', '7096022628', 'Yes', NULL, NULL, TRUE),
  (48, 'Mukhi Ramchand Dariyanomal Dagiya', 'Jethana', '9829935393', 'Yes', NULL, NULL, TRUE),
  (49, 'Mukhi ChanduBhai Bhojrajmal Madhu', 'Jetpur', '9426960105', 'Yes', NULL, NULL, TRUE),
  (50, 'Mukhi Detaram Dulichand Davariya', 'Jhalawar', '9667412832', 'Yes', NULL, NULL, TRUE),
  (51, 'Mukhi Daulatram Fatumal Sorathiya', 'Jhalrapatan', '9829744321', 'Yes', NULL, NULL, TRUE),
  (52, 'Mukhi Devanand Mithumal Hargun', 'Jodhpur', '9314711697', 'Yes', NULL, NULL, TRUE),
  (53, 'Mukhi H.K. Roopchandani', 'Junagadh', '9825714020', NULL, '1', '1', TRUE),
  (54, 'Mukhi Hundrajmal Nenumal Dhandha', 'Kanpur', '9369016122', NULL, NULL, NULL, TRUE),
  (55, 'Mukhi Gehimal Moolchand Kapoor', 'Kekri', '9414933318', 'Yes', NULL, NULL, TRUE),
  (56, 'Mukhi Murlibhai Narayandas Vishnani', 'Khambat (Distt. Anand)', '9727123754', 'Yes', '1', '1', TRUE),
  (57, 'Mukhi Harish Bhai Gokudas Kakupota', 'Khera (Nadiyad)', '9998668368', NULL, NULL, NULL, TRUE),
  (58, 'Mukhi Surendra Kumar Gyanchand Varde', 'Kishangarh', '9252128962', 'Yes', NULL, NULL, TRUE),
  (59, 'Mukhi Gehiram Kimatram Khuha', 'Kota', '9460676815', 'Yes', '1', '1', TRUE),
  (60, 'Mukhi Bhagwandas Devidas Khuha', 'Kumbhamarg, Pratap Nagar, Jaipur', '9928122536', 'Yes', NULL, NULL, TRUE),
  (61, 'Mukhi Lal Chand Gopaldas Kiri', 'Kutch (Adipur)', '9574745302', NULL, '1', '1', TRUE),
  (62, 'Mukhi Dr. Hari Jamandas Pamnani', 'Mahuva ( Bhavnagar)', '7990846265', NULL, NULL, NULL, TRUE),
  (63, 'Mukhi Jethanand Motiram Saraya', 'Makrana', '9829180360', 'Yes', NULL, NULL, TRUE),
  (64, 'Mukhi Seerumal Bhagwandas Davariya', 'Malviya Nagar Jaipur', '9929156381', 'Yes', '1', '1', TRUE),
  (65, 'Mukhi Shree Durgadas Motiram Achraya', 'Mandvi (Surat)', '9726128606', 'Yes', NULL, NULL, TRUE),
  (66, 'Mukhi Hundraj Purshumal Kapoor', 'Mangrol (Junagadh)', '9824273650', 'Yes', NULL, NULL, TRUE),
  (67, 'Mukhi Radhakishan Daulatram Hargun', 'Mansarovar', '9314195699', 'Yes', NULL, NULL, TRUE),
  (68, 'Mukhi Deepak Ramchand Chhanchhariya', 'Masuda', '8823952981', NULL, NULL, NULL, TRUE),
  (69, 'Mukhi Manohar Lal Niyalchand Khuha', 'Mehsana', '9825661957', NULL, NULL, NULL, TRUE),
  (70, 'Mukhi Sobrajmal mulchand Karatela', 'Morbi', '9913222358', 'Yes', '1', '1', TRUE),
  (71, 'Mukhi Gordhandas Pesumal Khatri', 'Nagaur', '8239532652', NULL, NULL, NULL, TRUE),
  (72, 'Mukhi Dev Kumar Prem Chand Khuha', 'Nagda', '9827445880', NULL, NULL, NULL, TRUE),
  (73, 'Mukhi Rajaram Hiranand Varde', 'Nagpur', '9860111222', 'Yes', NULL, NULL, TRUE),
  (74, 'Mukhi Bhimandas Harchumal Varde', 'Nasirabad', '9462783642', NULL, NULL, NULL, TRUE),
  (75, 'MUkhi Laxmandas Lilaram Vishnai Khuha', 'Navsari', '8401010275', NULL, NULL, NULL, TRUE),
  (76, 'Mukhi Naraindas Vasandmal Liya', 'New Delhi', '8130148778', NULL, NULL, NULL, TRUE),
  (77, 'Mukhi Mulchand Khanumal Valera', 'Palanpur', '9427043614', 'Yes', '1', '1', TRUE),
  (78, 'Mukhi Devidas Jairamdas Khurkhuriya', 'Dahod', '9979955542', 'Yes', '1', '1', TRUE),
  (79, 'Mukhi Rajan M. Madhu', 'Parra (Goa)', '9822181722', 'Yes', NULL, NULL, TRUE),
  (80, 'Mukhi Chandrakant Narayandas Khuha', 'Patan', '9328925331', 'Yes', '1', '1', TRUE),
  (81, 'Mukhi Durgadas Shankarlal Khuha', 'Pethapur', '9924936051', 'Yes', NULL, NULL, TRUE),
  (82, 'Mukhi Narayandas Mohandas Dada', 'Petlad', '9106235470', 'Yes', NULL, NULL, TRUE),
  (83, 'Mukhi Asandas Chandumal Dhandha', 'Porbandar', '9722666080', NULL, '1', '1', TRUE),
  (84, 'Mukhi Govermal Karomal Dhandha', 'Pratap Nagar, Jaipur', '9314233916', 'Yes', '1', '1', TRUE),
  (85, 'Mukhi Asandas Mulchand Khuha', 'Pune', '9881604961', 'Yes', NULL, NULL, TRUE),
  (86, 'Mukhi Balkishan Gobindram Dhandha', 'Pushkar', '9414300034', 'Yes', NULL, NULL, TRUE),
  (87, 'Mukhi Prakash Mulchand Kiri', 'Rajkot', '9428251508', 'Yes', 'N/A', '1', TRUE),
  (88, 'Mukhi Devidas Veerumal Varde', 'Rajpur Deesa', '7874836937', 'Yes', NULL, NULL, TRUE),
  (89, 'Mukhi Vasantkumar Shewakram Sorathiya', 'Rajula', '9409187770', NULL, NULL, NULL, TRUE),
  (90, 'Mukhi Pohumal Hardasmal Davariya', 'Ramganjmandi', '9414193039', 'Yes', NULL, NULL, TRUE),
  (91, 'Mukhi Kamalkumar Rochiram Kakupota', 'Ratlam', '8461938050', 'Yes', NULL, NULL, TRUE),
  (92, 'Mukhi Hukamchand Jawaharlal Kakupota', 'Rupangarh (Distt. Ajmer)', '9928391214', 'Yes', '1', '1', TRUE),
  (93, 'Mukhi heeranand Chelaram Khatri', 'Saradhana (Distt. Ajmer)', '8949811471', NULL, NULL, NULL, TRUE),
  (94, 'Mukhi Jairam Das Moolchand Khatri', 'Sarwar (Distt. Ajmer)', '7737870725', 'Yes', NULL, NULL, TRUE),
  (95, 'Mukhi Bholaram Bhagwandas Keria', 'Sawai Madhopur', '9928854188', 'Yes', NULL, NULL, TRUE),
  (96, 'Mukhi Khushiram Govindram Acharya', 'Shajapur', '9425428611', NULL, NULL, NULL, TRUE),
  (97, 'Mukhi Laxman Das Jagdish Bhai Barva', 'Shihori (Banaskantha)', '9904429629', 'Yes', NULL, NULL, TRUE),
  (98, 'Mukhi Ishwardas Chandumal Khuha', 'Vanthali (Junagadh)', '9925406111', 'Yes', NULL, NULL, TRUE),
  (99, 'Mukhi Tulsidas Boolchand Davariya', 'Sriganganagar', '9828203531', 'Yes', NULL, NULL, TRUE),
  (100, 'Mukhi Prakash Chand Asandas Kakupota', 'Sumerpur, Pali', '9829828025', 'Yes', NULL, NULL, TRUE),
  (101, 'Mukhi Mohanlal Basrimal Khuha', 'Surat', '9510586075', 'Yes', '1', '1', TRUE),
  (102, 'Mukhi Ishwarlal Veerumal Dhanadiya', 'Surender Nagar', '9909932036', 'Yes', NULL, NULL, TRUE),
  (103, 'Mukhi Vasant Kr. Vensimal', 'Thara (Banaskantha)', '9427065803', 'Yes', NULL, NULL, TRUE),
  (104, 'Mukhi Tilokchand Narayandas', 'Toda Raisingh (Tonk)', '9838364425', NULL, NULL, NULL, TRUE),
  (105, 'Mukhi Rajkumar Tamakimal Kapoor', 'Udaipur', '9929151168', 'Yes', NULL, NULL, TRUE),
  (106, 'Mukhi Ramchand Narayandas Khatri', 'Ujjain', '9827637265', 'Yes', NULL, NULL, TRUE),
  (107, 'Mukhi Ghanshyamdas Kallumal Hargun', 'Ulhasnagar', '8806881797', 'Yes', NULL, NULL, TRUE),
  (108, 'Mukhi Dheerajlal Tarachand Dagiya', 'UNA ( Junagadh)', '9624825496', 'Yes', NULL, NULL, TRUE),
  (109, 'Mukhi Lalchand Gehimal Dara (Israni)', 'Vadodara', '9426531144', NULL, '1', '1', TRUE),
  (110, 'Mukhi Mohanlal Hotchand Saraya', 'Valsad', '9974104123', NULL, NULL, NULL, TRUE),
  (111, 'Mukhi Bhagwandas Tarachand Hargun', 'Varanasi', '9696042254', 'Yes', '1', '1', TRUE),
  (112, 'Mukhi Vishandas Ladharam Dagia', 'Veraval', '9824325005', 'Yes', NULL, NULL, TRUE),
  (113, 'Mukhi Gopaldas Sirumal Khuha', 'Vidisha', '9425463780', 'Yes', NULL, NULL, TRUE),
  (114, 'Mukhi Deelip Kumar Virji Khuha', 'Visavandar (Junagadh)', '9428624414', 'Yes', NULL, NULL, TRUE),
  (115, 'Mukhi Shyam Sunder Mulchand Khuha', 'Vishakapatnam', '9849891748', 'Yes', NULL, NULL, TRUE),
  (116, 'Mukhi Bhagwandas Mulchand Saraya', 'Waghai', '9426888022', NULL, NULL, NULL, TRUE),
  (117, 'Mukhi Gagan das Jhamatmal Dagiya', 'Ramdevra', '9460584673', NULL, '1', '1', TRUE),
  (118, 'Mukhi Prakash Gyanchand Liya', 'Sanganer, Jaipur', '9166202777', NULL, '1', '1', TRUE)
ON CONFLICT (source_serial_number) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  gram = EXCLUDED.gram,
  mobile_number = EXCLUDED.mobile_number,
  password_given_status = EXCLUDED.password_given_status,
  form_received_status = EXCLUDED.form_received_status,
  online_updated_status = EXCLUDED.online_updated_status,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
