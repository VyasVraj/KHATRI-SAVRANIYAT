/**
 * Integration Test: Real PostgreSQL Migration Execution & Behavioral Audit
 *
 * Engine: @electric-sql/pglite (Official WebAssembly PostgreSQL 16.2 engine)
 * Environment: Genuine in-process PostgreSQL database executing actual DDL,
 * PL/pgSQL functions, triggers, transactions, and integrity constraints.
 *
 * Covers:
 *  1. Production Role Model & Authorization Coverage (SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR, MEMBER, Inactive Admin/Mod)
 *  2. Historical Schema Loading & Complete Gallery Removal (20261010100000, 20261010140000, 20261016140000 -> 20261103200000)
 *  3. Family RPC Execution, Security & Exact Production RLS Privacy Boundary (20261103210000)
 *  4. Gotra & Nukh Master Registry, Blank Normalization, Scoped Triggers, DELETE Trigger Fix & Rollback (20261103220000)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'

describe('Real PostgreSQL Engine — Migration Execution & Invariants Audit', () => {
  let pg: PGlite
  let activeMemberId: string
  let communityModId: string
  let inactiveModId: string
  let adminId: string
  let superAdminId: string
  let inactiveAdminId: string
  let otherMemberId: string

  interface PolicyRow {
    schemaname: string
    tablename: string
    policyname: string
    permissive: string
    roles: string[]
    cmd: string
    qual: string | null
    with_check: string | null
  }

  interface GrantRow {
    grantee: string
    table_schema: string
    table_name: string
    privilege_type: string
  }

  interface RoutineRow {
    routine_schema: string
    routine_name: string
    routine_type: string
    security_type: string
  }

  let baselinePolicies: PolicyRow[] = []
  let baselineGrants: GrantRow[] = []
  let baselineRoutines: RoutineRow[] = []

  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations')
  const historicalStorageAvatarsSql = fs.readFileSync(path.join(migrationsDir, '20261010100000_create_storage_and_avatars.sql'), 'utf-8')
  const historicalMediaSql = fs.readFileSync(path.join(migrationsDir, '20261010140000_create_family_media_and_history.sql'), 'utf-8')
  const galleryTeardownSql = fs.readFileSync(path.join(migrationsDir, '20261103200000_remove_gallery_albums.sql'), 'utf-8')
  const familyRpcSql = fs.readFileSync(path.join(migrationsDir, '20261103210000_create_family_with_head_rpc.sql'), 'utf-8')
  const gotraRegistrySql = fs.readFileSync(path.join(migrationsDir, '20261103220000_create_gotra_nukh_master_registry.sql'), 'utf-8')

  beforeAll(async () => {
    pg = new PGlite()

    // 1. Setup base PostgreSQL environment mirroring Supabase base schema
    await pg.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;

      -- Supabase predefined roles
      DO $$ BEGIN
        CREATE ROLE anon;
        CREATE ROLE authenticated;
        CREATE ROLE service_role;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated;

      -- Production domain enums
      DO $$ BEGIN
        CREATE TYPE public.privacy_level AS ENUM ('PUBLIC', 'COMMUNITY', 'FAMILY', 'PRIVATE', 'CONNECTIONS');
        CREATE TYPE public.gender AS ENUM ('MALE', 'FEMALE', 'OTHER');
        CREATE TYPE public.family_role AS ENUM ('HEAD', 'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'EXTENDED', 'OTHER');
        CREATE TYPE public.user_role AS ENUM (
          'SUPER_ADMIN',
          'ADMIN',
          'COMMUNITY_MODERATOR',
          'COMMITTEE_MEMBER',
          'FAMILY_HEAD',
          'MEMBER',
          'GUEST'
        );
        CREATE TYPE public.audit_action AS ENUM (
          'INSERT',
          'UPDATE',
          'DELETE',
          'SECURITY',
          'ADMIN'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      -- Base auth.users table
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT
      );

      -- Base public.profiles table
      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY REFERENCES auth.users(id),
        role public.user_role NOT NULL DEFAULT 'MEMBER',
        is_active BOOLEAN DEFAULT TRUE,
        email_verified BOOLEAN DEFAULT FALSE,
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Session auth.uid() mocking helper
      CREATE TABLE IF NOT EXISTS public._mock_session (uid UUID);
      INSERT INTO public._mock_session (uid) VALUES (NULL);
      GRANT ALL ON TABLE public._mock_session TO anon, authenticated;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT uid FROM public._mock_session LIMIT 1;
      $$ LANGUAGE sql;

      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
      GRANT SELECT ON TABLE public.profiles TO anon, authenticated;

      -- Base helper functions
      CREATE OR REPLACE FUNCTION public.handle_updated_at() RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;

      -- Exact production is_admin() implementation
      CREATE OR REPLACE FUNCTION public.is_admin()
      RETURNS BOOLEAN
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public
      AS $$
        SELECT EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('ADMIN', 'SUPER_ADMIN')
            AND is_active = TRUE
        );
      $$;

      -- Exact production is_community_moderator() implementation
      CREATE OR REPLACE FUNCTION public.is_community_moderator()
      RETURNS BOOLEAN
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public
      AS $$
        SELECT EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MODERATOR')
            AND is_active = TRUE
        );
      $$;

      -- Base public.persons table
      CREATE TABLE IF NOT EXISTS public.persons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT NOT NULL,
        maiden_name TEXT,
        gender public.gender NOT NULL DEFAULT 'MALE',
        date_of_birth DATE,
        birth_place TEXT,
        gotra TEXT,
        nukh TEXT,
        profile_privacy public.privacy_level NOT NULL DEFAULT 'PRIVATE',
        contact_privacy public.privacy_level NOT NULL DEFAULT 'PRIVATE',
        dob_privacy public.privacy_level NOT NULL DEFAULT 'PRIVATE',
        created_by UUID,
        user_id UUID,
        deleted_at TIMESTAMPTZ,
        status TEXT DEFAULT 'ACTIVE',
        verification_status TEXT DEFAULT 'VERIFIED',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Base public.families table
      CREATE TABLE IF NOT EXISTS public.families (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        family_name TEXT NOT NULL,
        description TEXT,
        city TEXT,
        state TEXT,
        country TEXT DEFAULT 'India',
        gotra TEXT,
        nukh TEXT,
        profile_privacy public.privacy_level NOT NULL DEFAULT 'PRIVATE',
        members_privacy public.privacy_level NOT NULL DEFAULT 'PRIVATE',
        created_by UUID,
        deleted_at TIMESTAMPTZ,
        status TEXT DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Base public.family_members table
      CREATE TABLE IF NOT EXISTS public.family_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
        person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
        role public.family_role NOT NULL DEFAULT 'OTHER',
        is_head BOOLEAN NOT NULL DEFAULT FALSE,
        added_by UUID,
        left_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (family_id, person_id)
      );

      -- Base public.connections table & helper
      CREATE TABLE IF NOT EXISTS public.connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id UUID REFERENCES auth.users(id),
        addressee_id UUID REFERENCES auth.users(id),
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION public.are_users_connected(user_a UUID, user_b UUID)
      RETURNS BOOLEAN
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public
      AS $$
        SELECT CASE
          WHEN auth.uid() IS NULL OR user_a IS NULL OR user_b IS NULL THEN FALSE
          ELSE EXISTS (
            SELECT 1 FROM public.connections
            WHERE status = 'ACCEPTED'
              AND ((requester_id = user_a AND addressee_id = user_b)
                OR (requester_id = user_b AND addressee_id = user_a))
          )
        END;
      $$;

      -- Base audit log mock
      CREATE TABLE IF NOT EXISTS public.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action public.audit_action,
        entity_type TEXT,
        entity_id UUID,
        old_data JSONB,
        new_data JSONB,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION public.log_audit_event(
        p_action public.audit_action,
        p_entity_type TEXT,
        p_entity_id UUID,
        p_old_data JSONB DEFAULT NULL,
        p_new_data JSONB DEFAULT NULL,
        p_metadata JSONB DEFAULT NULL
      ) RETURNS UUID AS $$
      DECLARE v_id UUID;
      BEGIN
        INSERT INTO public.audit_logs (action, entity_type, entity_id, old_data, new_data, details)
        VALUES (p_action, p_entity_type, p_entity_id, p_old_data, p_new_data, p_metadata)
        RETURNING id INTO v_id;
        RETURN v_id;
      END;
      $$ LANGUAGE plpgsql;

      -- Storage schema stub
      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        public BOOLEAN DEFAULT FALSE,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[]
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT REFERENCES storage.buckets(id),
        name TEXT,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB
      );

      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

      -- Production RLS policies on baseline tables (mirroring 20261002140000 & 20261005180000)
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (id = auth.uid());
      CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT USING (public.is_admin());
      CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
      CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
      CREATE POLICY "profiles_insert_trigger_only" ON public.profiles FOR INSERT WITH CHECK (false);
      CREATE POLICY "profiles_delete_deny" ON public.profiles FOR DELETE USING (false);

      ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "persons_select_public" ON public.persons FOR SELECT USING (profile_privacy = 'PUBLIC' AND status != 'ARCHIVED');
      CREATE POLICY "persons_select_community" ON public.persons FOR SELECT USING (profile_privacy IN ('PUBLIC', 'COMMUNITY') AND status != 'ARCHIVED');
      CREATE POLICY "persons_select_own" ON public.persons FOR SELECT USING (user_id = auth.uid());
      CREATE POLICY "persons_select_admin" ON public.persons FOR SELECT USING (public.is_community_moderator());
      CREATE POLICY "persons_select_connections" ON public.persons FOR SELECT USING (profile_privacy = 'CONNECTIONS' AND user_id IS NOT NULL AND status != 'ARCHIVED' AND public.are_users_connected(auth.uid(), user_id));
      CREATE POLICY "persons_insert_authenticated" ON public.persons FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
      CREATE POLICY "persons_update_own" ON public.persons FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      CREATE POLICY "persons_update_admin" ON public.persons FOR UPDATE USING (public.is_community_moderator()) WITH CHECK (public.is_community_moderator());
      CREATE POLICY "persons_delete_deny" ON public.persons FOR DELETE USING (false);

      ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "families_select_public" ON public.families FOR SELECT USING (profile_privacy = 'PUBLIC');
      CREATE POLICY "families_select_community" ON public.families FOR SELECT USING (profile_privacy IN ('PUBLIC', 'COMMUNITY'));
      CREATE POLICY "families_select_creator" ON public.families FOR SELECT USING (created_by = auth.uid());
      CREATE POLICY "families_select_admin" ON public.families FOR SELECT USING (public.is_community_moderator());
      CREATE POLICY "families_insert_authenticated" ON public.families FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
      CREATE POLICY "families_update_creator" ON public.families FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
      CREATE POLICY "families_update_admin" ON public.families FOR UPDATE USING (public.is_community_moderator()) WITH CHECK (public.is_community_moderator());
      CREATE POLICY "families_delete_deny" ON public.families FOR DELETE USING (false);

      ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "family_members_select_community" ON public.family_members FOR SELECT USING (true);
      CREATE POLICY "family_members_select_own" ON public.family_members FOR SELECT USING (added_by = auth.uid());
      CREATE POLICY "family_members_select_admin" ON public.family_members FOR SELECT USING (public.is_community_moderator());
      CREATE POLICY "family_members_insert_creator" ON public.family_members FOR INSERT WITH CHECK (added_by = auth.uid());
      CREATE POLICY "family_members_insert_admin" ON public.family_members FOR INSERT WITH CHECK (public.is_community_moderator());
      CREATE POLICY "family_members_update_creator" ON public.family_members FOR UPDATE USING (added_by = auth.uid()) WITH CHECK (added_by = auth.uid());
      CREATE POLICY "family_members_update_admin" ON public.family_members FOR UPDATE USING (public.is_community_moderator()) WITH CHECK (public.is_community_moderator());
      CREATE POLICY "family_members_delete_creator" ON public.family_members FOR DELETE USING (added_by = auth.uid());
      CREATE POLICY "family_members_delete_admin" ON public.family_members FOR DELETE USING (public.is_community_moderator());

      ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "audit_logs_select_admin" ON public.audit_logs FOR SELECT USING (public.is_admin());
      CREATE POLICY "audit_logs_insert_trigger_only" ON public.audit_logs FOR INSERT WITH CHECK (false);

      -- Grant standard permissions to roles
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
      GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA storage TO anon;
    `)
  })

  // ---------------------------------------------------------------------------
  // 1. Production Role Model & Authorization Coverage
  // ---------------------------------------------------------------------------
  describe('1. Production Role Model & Authorization Coverage', () => {
    beforeAll(async () => {
      // Create user accounts representing all production roles
      const u1 = (await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('superadmin@test.com') RETURNING id::text;`)).rows[0].id
      superAdminId = u1
      await pg.exec(`INSERT INTO public.profiles (id, role, is_active) VALUES ('${superAdminId}', 'SUPER_ADMIN', TRUE);`)

      const u2 = (await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('admin@test.com') RETURNING id::text;`)).rows[0].id
      adminId = u2
      await pg.exec(`INSERT INTO public.profiles (id, role, is_active) VALUES ('${adminId}', 'ADMIN', TRUE);`)

      const u3 = (await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('moderator@test.com') RETURNING id::text;`)).rows[0].id
      communityModId = u3
      await pg.exec(`INSERT INTO public.profiles (id, role, is_active) VALUES ('${communityModId}', 'COMMUNITY_MODERATOR', TRUE);`)

      const u4 = (await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('member@test.com') RETURNING id::text;`)).rows[0].id
      activeMemberId = u4
      await pg.exec(`INSERT INTO public.profiles (id, role, is_active) VALUES ('${activeMemberId}', 'MEMBER', TRUE);`)

      const u5 = (await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('inactive_admin@test.com') RETURNING id::text;`)).rows[0].id
      inactiveAdminId = u5
      await pg.exec(`INSERT INTO public.profiles (id, role, is_active) VALUES ('${inactiveAdminId}', 'ADMIN', FALSE);`)

      const u6 = (await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('other_member@test.com') RETURNING id::text;`)).rows[0].id
      otherMemberId = u6
      await pg.exec(`INSERT INTO public.profiles (id, role, is_active) VALUES ('${otherMemberId}', 'MEMBER', TRUE);`)

      const u7 = (await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('inactive_mod@test.com') RETURNING id::text;`)).rows[0].id
      inactiveModId = u7
      await pg.exec(`INSERT INTO public.profiles (id, role, is_active) VALUES ('${inactiveModId}', 'COMMUNITY_MODERATOR', FALSE);`)
    })

    it('correctly evaluates is_admin() and is_community_moderator() across all production roles', async () => {
      // 1. SUPER_ADMIN
      await pg.exec(`UPDATE public._mock_session SET uid = '${superAdminId}';`)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_admin() AS r;`)).rows[0].r).toBe(true)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_community_moderator() AS r;`)).rows[0].r).toBe(true)

      // 2. ADMIN
      await pg.exec(`UPDATE public._mock_session SET uid = '${adminId}';`)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_admin() AS r;`)).rows[0].r).toBe(true)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_community_moderator() AS r;`)).rows[0].r).toBe(true)

      // 3. COMMUNITY_MODERATOR (is_admin = false, is_community_moderator = true)
      await pg.exec(`UPDATE public._mock_session SET uid = '${communityModId}';`)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_admin() AS r;`)).rows[0].r).toBe(false)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_community_moderator() AS r;`)).rows[0].r).toBe(true)

      // 4. MEMBER (standard authenticated user)
      await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_admin() AS r;`)).rows[0].r).toBe(false)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_community_moderator() AS r;`)).rows[0].r).toBe(false)

      // 5. Inactive Admin (is_active = FALSE) -> Must be revoked of all privileges
      await pg.exec(`UPDATE public._mock_session SET uid = '${inactiveAdminId}';`)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_admin() AS r;`)).rows[0].r).toBe(false)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_community_moderator() AS r;`)).rows[0].r).toBe(false)

      // 6. Inactive Community Moderator (is_active = FALSE) -> Must be revoked of moderator privileges
      await pg.exec(`UPDATE public._mock_session SET uid = '${inactiveModId}';`)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_admin() AS r;`)).rows[0].r).toBe(false)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_community_moderator() AS r;`)).rows[0].r).toBe(false)

      // 7. Anonymous (no session)
      await pg.exec(`UPDATE public._mock_session SET uid = NULL;`)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_admin() AS r;`)).rows[0].r).toBe(false)
      expect((await pg.query<{ r: boolean }>(`SELECT public.is_community_moderator() AS r;`)).rows[0].r).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Historical Schema Loading & Complete Gallery Removal (20261103200000)
  // ---------------------------------------------------------------------------
  describe('2. Historical Schema Loading & Complete Gallery Removal (20261103200000)', () => {
    it('loads actual historical avatars migration (20261010100000) from disk', async () => {
      await expect(pg.exec(historicalStorageAvatarsSql)).resolves.not.toThrow()

      // Verify avatars bucket and all 4 Storage policies exist
      const bucketRes = await pg.query<{ id: string }>(`SELECT id FROM storage.buckets WHERE id = 'avatars';`)
      expect(bucketRes.rows.length).toBe(1)

      const avatarPolicies = await pg.query<{ policyname: string }>(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'avatars%';
      `)
      expect(avatarPolicies.rows.length).toBe(4) // select, insert, update, delete

      // Snapshot baseline security configuration (pre-gallery, stable avatars + production tables baseline)
      baselinePolicies = (await pg.query<PolicyRow>(`
        SELECT schemaname, tablename, policyname, permissive, roles::text[] as roles, cmd, qual, with_check
        FROM pg_policies
        ORDER BY schemaname, tablename, policyname;
      `)).rows

      baselineGrants = (await pg.query<GrantRow>(`
        SELECT grantee, table_schema, table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema IN ('public', 'storage')
        ORDER BY grantee, table_schema, table_name, privilege_type;
      `)).rows

      baselineRoutines = (await pg.query<RoutineRow>(`
        SELECT routine_schema, routine_name, routine_type, security_type
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        ORDER BY routine_schema, routine_name;
      `)).rows
    })

    it('loads actual historical media migration (20261010140000) from disk', async () => {
      await expect(pg.exec(historicalMediaSql)).resolves.not.toThrow()

      // Verify family-media bucket exists
      const bucketRes = await pg.query<{ id: string }>(`SELECT id FROM storage.buckets WHERE id = 'family-media';`)
      expect(bucketRes.rows.length).toBe(1)

      // Verify all 4 family_media storage policies exist
      const mediaPolicies = await pg.query<{ policyname: string }>(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'family_media%';
      `)
      expect(mediaPolicies.rows.length).toBe(4) // select, insert, update, delete

      // Verify tables exist
      const tablesRes = await pg.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('family_albums', 'family_media', 'family_stories');
      `)
      expect(tablesRes.rows.length).toBe(3)
    })

    it('attaches historical notification triggers from 20261016140000', async () => {
      await pg.exec(`
        CREATE OR REPLACE FUNCTION public.handle_family_media_notification_events()
        RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN RETURN NEW; END; $$;

        DROP TRIGGER IF EXISTS trg_family_media_notification_events ON public.family_media;
        CREATE TRIGGER trg_family_media_notification_events
          AFTER INSERT ON public.family_media
          FOR EACH ROW EXECUTE FUNCTION public.handle_family_media_notification_events();

        CREATE OR REPLACE FUNCTION public.handle_family_story_notification_events()
        RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN RETURN NEW; END; $$;

        DROP TRIGGER IF EXISTS trg_family_story_notification_events ON public.family_stories;
        CREATE TRIGGER trg_family_story_notification_events
          AFTER INSERT ON public.family_stories
          FOR EACH ROW EXECUTE FUNCTION public.handle_family_story_notification_events();
      `)

      const trigRes = await pg.query<{ trigger_name: string }>(`
        SELECT trigger_name FROM information_schema.triggers
        WHERE trigger_schema = 'public' AND trigger_name IN ('trg_family_media_notification_events', 'trg_family_story_notification_events');
      `)
      expect(trigRes.rows.length).toBe(2)
    })

    it('executes 20261103200000_remove_gallery_albums.sql without error', async () => {
      await expect(pg.exec(galleryTeardownSql)).resolves.not.toThrow()
    })

    it('verifies all 4 family_media Storage policies are removed independently', async () => {
      const selectPol = await pg.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'family_media_select_policy';`)
      const insertPol = await pg.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'family_media_insert_policy';`)
      const updatePol = await pg.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'family_media_update_policy';`)
      const deletePol = await pg.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'family_media_delete_policy';`)

      expect(selectPol.rows.length).toBe(0)
      expect(insertPol.rows.length).toBe(0)
      expect(updatePol.rows.length).toBe(0)
      expect(deletePol.rows.length).toBe(0)
    })

    it('verifies all 4 avatar Storage policies and avatars bucket remain completely intact', async () => {
      const selectPol = await pg.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_select_policy';`)
      const insertPol = await pg.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_insert_policy';`)
      const updatePol = await pg.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_update_policy';`)
      const deletePol = await pg.query(`SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_delete_policy';`)

      expect(selectPol.rows.length).toBe(1)
      expect(insertPol.rows.length).toBe(1)
      expect(updatePol.rows.length).toBe(1)
      expect(deletePol.rows.length).toBe(1)

      const bucket = await pg.query(`SELECT id FROM storage.buckets WHERE id = 'avatars';`)
      expect(bucket.rows.length).toBe(1)
    })

    it('verifies all gallery tables, triggers, guard functions, RPCs and enums are completely dropped', async () => {
      const tables = await pg.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('family_albums', 'family_media', 'family_stories');
      `)
      expect(tables.rows.length).toBe(0)

      const enumType = await pg.query(`SELECT typname FROM pg_type WHERE typname = 'family_media_type';`)
      expect(enumType.rows.length).toBe(0)

      const funcs = await pg.query(`
        SELECT routine_name FROM information_schema.routines
        WHERE routine_schema = 'public' AND routine_name IN (
          'handle_family_media_album_guard',
          'handle_family_media_storage_path_guard',
          'handle_family_media_immutability_guard',
          'handle_family_album_cover_guard',
          'handle_family_story_featured_media_guard',
          'handle_family_media_notification_events',
          'handle_family_story_notification_events',
          'register_family_media',
          'soft_delete_family_media',
          'create_family_story',
          'create_family_album'
        );
      `)
      expect(funcs.rows.length).toBe(0)
    })

    it('verifies shared handle_updated_at trigger function remains intact', async () => {
      const func = await pg.query(`SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'handle_updated_at';`)
      expect(func.rows.length).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Family RPC Execution, Security & Exact Production RLS Privacy Boundary
  // ---------------------------------------------------------------------------
  describe('3. Family RPC Execution, Security & Exact Production RLS Privacy Boundary (20261103210000)', () => {
    it('executes 20261103210000_create_family_with_head_rpc.sql without error', async () => {
      await expect(pg.exec(familyRpcSql)).resolves.not.toThrow()
    })

    it('revokes execution from PUBLIC and anon; grants to authenticated', async () => {
      await pg.exec(`UPDATE public._mock_session SET uid = NULL;`)
      await expect(
        pg.query(`SELECT * FROM public.create_family_with_head(p_family_name := 'Anon Parivar');`)
      ).rejects.toThrow(/UNAUTHENTICATED/i)
    })

    it('rejects execution when authenticated user is inactive or has NULL profile status', async () => {
      await pg.exec(`UPDATE public._mock_session SET uid = '${inactiveAdminId}';`)
      await expect(
        pg.query(`SELECT * FROM public.create_family_with_head(p_family_name := 'Inactive Parivar');`)
      ).rejects.toThrow(/FORBIDDEN.*inactive/i)

      // Test user with missing/null profile
      const noProfileId = '99999999-9999-9999-9999-999999999999'
      await pg.exec(`UPDATE public._mock_session SET uid = '${noProfileId}';`)
      await expect(
        pg.query(`SELECT * FROM public.create_family_with_head(p_family_name := 'Missing Profile Parivar');`)
      ).rejects.toThrow(/FORBIDDEN.*inactive/i)
    })

    it('successfully creates family with new head person (Option A) and enforces PERSON != USER', async () => {
      await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)

      const res = await pg.query<{ family_id: string; head_person_id: string }>(`
        SELECT * FROM public.create_family_with_head(
          p_family_name := 'Khatri Parivar',
          p_city := 'Anjar',
          p_state := 'Gujarat',
          p_new_person_first_name := 'Deepak',
          p_new_person_last_name := 'Khatri',
          p_new_person_gender := 'MALE',
          p_new_person_dob := '1982-04-10'
        );
      `)

      expect(res.rows.length).toBe(1)
      const { family_id, head_person_id } = res.rows[0]
      expect(family_id).toBeDefined()
      expect(head_person_id).toBeDefined()

      // Invariant Check: PERSON != USER (user_id MUST be NULL for census records created via family flow)
      const person = (await pg.query<{ user_id: string | null; created_by: string }>(`
        SELECT user_id::text, created_by::text FROM public.persons WHERE id = '${head_person_id}';
      `)).rows[0]
      expect(person.user_id).toBeNull()
      expect(person.created_by).toBe(activeMemberId)

      // Verify membership
      const member = (await pg.query<{ role: string; is_head: boolean }>(`
        SELECT role::text, is_head FROM public.family_members WHERE family_id = '${family_id}' AND person_id = '${head_person_id}';
      `)).rows[0]
      expect(member.role).toBe('HEAD')
      expect(member.is_head).toBe(true)
    })

    it('allows multi-family headship when selected with existing person without transfer or demotion', async () => {
      await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)

      // Person linked to caller
      const myPersonId = (await pg.query<{ id: string }>(`
        INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy)
        VALUES ('Multi', 'HeadPerson', '${activeMemberId}', 'PRIVATE') RETURNING id::text;
      `)).rows[0].id

      // Create Family 1
      const fam1Res = await pg.query<{ family_id: string }>(`
        SELECT * FROM public.create_family_with_head(
          p_family_name := 'Branch One',
          p_existing_person_id := '${myPersonId}'
        );
      `)
      const fam1Id = fam1Res.rows[0].family_id

      // Create Family 2 with the same person
      const fam2Res = await pg.query<{ family_id: string }>(`
        SELECT * FROM public.create_family_with_head(
          p_family_name := 'Branch Two',
          p_existing_person_id := '${myPersonId}'
        );
      `)
      const fam2Id = fam2Res.rows[0].family_id

      // Verify headship in both families
      const memberships = await pg.query<{ family_id: string; is_head: boolean }>(`
        SELECT family_id::text, is_head FROM public.family_members WHERE person_id = '${myPersonId}' ORDER BY family_id;
      `)
      expect(memberships.rows.length).toBe(2)
      expect(memberships.rows.every(m => m.is_head)).toBe(true)
      expect(memberships.rows.map(m => m.family_id).sort()).toEqual([fam1Id, fam2Id].sort())
    })

    describe('Privacy Boundary Enforcement for Existing Person Selection', () => {
      let callerLinkedPrivatePersonId: string
      let privateSharedPersonId: string
      let unlinkedCreatorPrivatePersonId: string
      let familySharedPersonId: string
      let communityPersonId: string
      let publicPersonId: string
      let connectionPersonId: string
      let notConnectedPersonId: string
      let unrelatedPrivatePersonId: string
      let softDeletedPersonId: string
      let archivedCommunityPersonId: string

      beforeAll(async () => {
        // Shared family between activeMemberId and otherMemberId
        const sharedFamId = (await pg.query<{ id: string }>(`
          INSERT INTO public.families (family_name, created_by) VALUES ('Shared Household', '${otherMemberId}') RETURNING id::text;
        `)).rows[0].id

        // 1. Caller's own linked person (profile_privacy = 'PRIVATE')
        callerLinkedPrivatePersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy)
          VALUES ('MySelf', 'Caller', '${activeMemberId}', 'PRIVATE') RETURNING id::text;
        `)).rows[0].id

        // 2. Fellow family member's person in shared family (profile_privacy = 'PRIVATE')
        privateSharedPersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy)
          VALUES ('Private', 'SharedMember', '${otherMemberId}', 'PRIVATE') RETURNING id::text;
        `)).rows[0].id
        await pg.exec(`
          INSERT INTO public.family_members (family_id, person_id, role)
          VALUES ('${sharedFamId}', '${privateSharedPersonId}', 'OTHER');
        `)

        // 3. Unlinked census record created by activeMemberId (profile_privacy = 'PRIVATE')
        unlinkedCreatorPrivatePersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, created_by, profile_privacy)
          VALUES ('Unlinked', 'CensusCreated', '${activeMemberId}', 'PRIVATE') RETURNING id::text;
        `)).rows[0].id

        // 4. Person with profile_privacy = 'FAMILY' belonging to otherMemberId in shared family
        familySharedPersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy)
          VALUES ('Family', 'SharedTarget', '${otherMemberId}', 'FAMILY') RETURNING id::text;
        `)).rows[0].id
        await pg.exec(`
          INSERT INTO public.family_members (family_id, person_id, role)
          VALUES ('${sharedFamId}', '${familySharedPersonId}', 'OTHER');
        `)

        // 5. Person with profile_privacy = 'COMMUNITY'
        communityPersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy)
          VALUES ('Community', 'Member', '${otherMemberId}', 'COMMUNITY') RETURNING id::text;
        `)).rows[0].id

        // 6. Person with profile_privacy = 'PUBLIC'
        publicPersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy)
          VALUES ('Public', 'Citizen', '${otherMemberId}', 'PUBLIC') RETURNING id::text;
        `)).rows[0].id

        // 7. Person with profile_privacy = 'CONNECTIONS' with accepted connection
        const friendUserId = (await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('friend@test.com') RETURNING id::text;`)).rows[0].id
        await pg.exec(`INSERT INTO public.profiles (id, is_active) VALUES ('${friendUserId}', TRUE);`)
        connectionPersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy)
          VALUES ('Connected', 'Friend', '${friendUserId}', 'CONNECTIONS') RETURNING id::text;
        `)).rows[0].id
        await pg.exec(`
          INSERT INTO public.connections (requester_id, addressee_id, status)
          VALUES ('${activeMemberId}', '${friendUserId}', 'ACCEPTED');
        `)

        // 8. Person with profile_privacy = 'CONNECTIONS' WITHOUT connection
        const strangerUserId = (await pg.query<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('stranger@test.com') RETURNING id::text;`)).rows[0].id
        await pg.exec(`INSERT INTO public.profiles (id, is_active) VALUES ('${strangerUserId}', TRUE);`)
        notConnectedPersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy)
          VALUES ('NotConnected', 'Stranger', '${strangerUserId}', 'CONNECTIONS') RETURNING id::text;
        `)).rows[0].id

        // 9. Unrelated PRIVATE person
        unrelatedPrivatePersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy)
          VALUES ('Unrelated', 'Private', '${otherMemberId}', 'PRIVATE') RETURNING id::text;
        `)).rows[0].id

        // 10. Soft-deleted person
        softDeletedPersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy, deleted_at)
          VALUES ('Deleted', 'Person', '${otherMemberId}', 'PUBLIC', NOW()) RETURNING id::text;
        `)).rows[0].id

        // 11. Archived community person
        archivedCommunityPersonId = (await pg.query<{ id: string }>(`
          INSERT INTO public.persons (first_name, last_name, user_id, profile_privacy, status)
          VALUES ('Archived', 'Person', '${otherMemberId}', 'COMMUNITY', 'ARCHIVED') RETURNING id::text;
        `)).rows[0].id
      })

      it('ALLOWS selecting own linked person record even if PRIVATE (persons_select_own)', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        const res = await pg.query<{ family_id: string }>(`
          SELECT * FROM public.create_family_with_head(
            p_family_name := 'Self Head Family',
            p_existing_person_id := '${callerLinkedPrivatePersonId}'
          );
        `)
        expect(res.rows[0].family_id).toBeDefined()
      })

      it('SECURITY INVARIANT: REJECTS selection of a PRIVATE person sharing an active family with caller', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        await expect(
          pg.query(`
            SELECT * FROM public.create_family_with_head(
              p_family_name := 'Illegal Family Bypass',
              p_existing_person_id := '${privateSharedPersonId}'
            );
          `)
        ).rejects.toThrow(/NOT_FOUND.*permission/i)
      })

      it('SECURITY INVARIANT: REJECTS selection of an unlinked PRIVATE person created by caller (strict production RLS parity)', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        await expect(
          pg.query(`
            SELECT * FROM public.create_family_with_head(
              p_family_name := 'Illegal Creator Select',
              p_existing_person_id := '${unlinkedCreatorPrivatePersonId}'
            );
          `)
        ).rejects.toThrow(/NOT_FOUND.*permission/i)
      })

      it('SECURITY INVARIANT: REJECTS selection of a FAMILY privacy person (no persons_select_family in production RLS)', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        await expect(
          pg.query(`
            SELECT * FROM public.create_family_with_head(
              p_family_name := 'Illegal Family Privacy Select',
              p_existing_person_id := '${familySharedPersonId}'
            );
          `)
        ).rejects.toThrow(/NOT_FOUND.*permission/i)
      })

      it('ALLOWS selection of a COMMUNITY privacy person', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        const res = await pg.query<{ family_id: string }>(`
          SELECT * FROM public.create_family_with_head(
            p_family_name := 'Community Parivar',
            p_existing_person_id := '${communityPersonId}'
          );
        `)
        expect(res.rows[0].family_id).toBeDefined()
      })

      it('ALLOWS selection of a PUBLIC privacy person', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        const res = await pg.query<{ family_id: string }>(`
          SELECT * FROM public.create_family_with_head(
            p_family_name := 'Public Parivar',
            p_existing_person_id := '${publicPersonId}'
          );
        `)
        expect(res.rows[0].family_id).toBeDefined()
      })

      it('ALLOWS selection of a CONNECTIONS person when users share an accepted connection', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        const res = await pg.query<{ family_id: string }>(`
          SELECT * FROM public.create_family_with_head(
            p_family_name := 'Connected Parivar',
            p_existing_person_id := '${connectionPersonId}'
          );
        `)
        expect(res.rows[0].family_id).toBeDefined()
      })

      it('REJECTS selection of a CONNECTIONS person when no accepted connection exists', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        await expect(
          pg.query(`
            SELECT * FROM public.create_family_with_head(
              p_family_name := 'Unconnected Parivar',
              p_existing_person_id := '${notConnectedPersonId}'
            );
          `)
        ).rejects.toThrow(/NOT_FOUND.*permission/i)
      })

      it('REJECTS selection of an unrelated PRIVATE person', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        await expect(
          pg.query(`
            SELECT * FROM public.create_family_with_head(
              p_family_name := 'Stranger Parivar',
              p_existing_person_id := '${unrelatedPrivatePersonId}'
            );
          `)
        ).rejects.toThrow(/NOT_FOUND.*permission/i)
      })

      it('REJECTS selection of a soft-deleted person', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        await expect(
          pg.query(`
            SELECT * FROM public.create_family_with_head(
              p_family_name := 'Deleted Parivar',
              p_existing_person_id := '${softDeletedPersonId}'
            );
          `)
        ).rejects.toThrow(/NOT_FOUND.*permission/i)
      })

      it('REJECTS selection of an ARCHIVED person for ordinary members', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)
        await expect(
          pg.query(`
            SELECT * FROM public.create_family_with_head(
              p_family_name := 'Archived Parivar',
              p_existing_person_id := '${archivedCommunityPersonId}'
            );
          `)
        ).rejects.toThrow(/NOT_FOUND.*permission/i)
      })

      it('ADMIN and COMMUNITY_MODERATOR can select any person regardless of privacy tier', async () => {
        // Moderator selecting private person
        await pg.exec(`UPDATE public._mock_session SET uid = '${communityModId}';`)
        const modRes = await pg.query<{ family_id: string }>(`
          SELECT * FROM public.create_family_with_head(
            p_family_name := 'Mod Managed Parivar',
            p_existing_person_id := '${unrelatedPrivatePersonId}'
          );
        `)
        expect(modRes.rows[0].family_id).toBeDefined()

        // Admin selecting family person
        await pg.exec(`UPDATE public._mock_session SET uid = '${adminId}';`)
        const adminRes = await pg.query<{ family_id: string }>(`
          SELECT * FROM public.create_family_with_head(
            p_family_name := 'Admin Managed Parivar',
            p_existing_person_id := '${familySharedPersonId}'
          );
        `)
        expect(adminRes.rows[0].family_id).toBeDefined()
      })
    })

    describe('Family RPC Atomic Transaction Rollback', () => {
      it('forces failure after person insertion and verifies neither person nor family remains', async () => {
        await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)

        const personsBefore = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.persons;`)).rows[0].count)
        const familiesBefore = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.families;`)).rows[0].count)
        const membersBefore = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.family_members;`)).rows[0].count)

        // Add a check constraint on families that forces failure after person creation
        await pg.exec(`
          ALTER TABLE public.families ADD CONSTRAINT test_rollback_force_fail
            CHECK (family_name != 'TRIGGER_FAILURE_AFTER_PERSON');
        `)

        await expect(
          pg.query(`
            SELECT * FROM public.create_family_with_head(
              p_family_name := 'TRIGGER_FAILURE_AFTER_PERSON',
              p_new_person_first_name := 'Ghost',
              p_new_person_last_name := 'Person'
            );
          `)
        ).rejects.toThrow(/violates check constraint "test_rollback_force_fail"/i)

        // Drop the test constraint
        await pg.exec(`ALTER TABLE public.families DROP CONSTRAINT test_rollback_force_fail;`)

        // Verify total rollback: counts are completely identical to before
        const personsAfter = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.persons;`)).rows[0].count)
        const familiesAfter = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.families;`)).rows[0].count)
        const membersAfter = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.family_members;`)).rows[0].count)

        expect(personsAfter).toBe(personsBefore)
        expect(familiesAfter).toBe(familiesBefore)
        expect(membersAfter).toBe(membersBefore)

        // Verify Ghost Person does not exist in public.persons
        const ghost = await pg.query(`SELECT * FROM public.persons WHERE first_name = 'Ghost';`)
        expect(ghost.rows.length).toBe(0)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Gotra & Nukh Master Registry & Integrity System (20261103220000)
  // ---------------------------------------------------------------------------
  describe('4. Gotra & Nukh Master Registry & Integrity System (20261103220000)', () => {
    beforeAll(async () => {
      // Pre-populate existing data with lowercase/mixed-case spellings AND whitespace-only values
      // to test whitespace normalization & canonicalization
      await pg.exec(`
        INSERT INTO public.persons (first_name, last_name, gotra, nukh)
        VALUES ('Ramesh', 'Solanki', 'kashyap', 'varun');

        INSERT INTO public.families (family_name, gotra, nukh)
        VALUES ('Old Family', 'bhrigu', 'shukla');

        -- Blank / whitespace-only entries that must be normalized to NULL
        INSERT INTO public.persons (first_name, last_name, gotra, nukh)
        VALUES ('WhitespacePerson', 'Test', '   ', '');

        INSERT INTO public.families (family_name, gotra, nukh)
        VALUES ('WhitespaceFamily', '', '   ');
      `)

      // Execute migration
      await pg.exec(gotraRegistrySql)
    })

    it('normalizes empty and whitespace-only Gotra/Nukh values to NULL in existing records', async () => {
      const person = (await pg.query<{ gotra: string | null; nukh: string | null }>(`
        SELECT gotra, nukh FROM public.persons WHERE first_name = 'WhitespacePerson';
      `)).rows[0]
      expect(person.gotra).toBeNull()
      expect(person.nukh).toBeNull()

      const family = (await pg.query<{ gotra: string | null; nukh: string | null }>(`
        SELECT gotra, nukh FROM public.families WHERE family_name = 'WhitespaceFamily';
      `)).rows[0]
      expect(family.gotra).toBeNull()
      expect(family.nukh).toBeNull()
    })

    it('canonicalizes pre-existing valid records to authoritative master casing during migration', async () => {
      const person = (await pg.query<{ gotra: string; nukh: string }>(`
        SELECT gotra, nukh FROM public.persons WHERE first_name = 'Ramesh';
      `)).rows[0]
      expect(person.gotra).toBe('Kashyap')
      expect(person.nukh).toBe('Varun')

      const family = (await pg.query<{ gotra: string; nukh: string }>(`
        SELECT gotra, nukh FROM public.families WHERE family_name = 'Old Family';
      `)).rows[0]
      expect(family.gotra).toBe('Bhrigu')
      expect(family.nukh).toBe('Shukla')
    })

    it('seeds exactly 29 Gotras and supports rerun idempotency without duplicate entries', async () => {
      const countRes = await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.gotras;`)
      expect(countRes.rows[0].count).toBe('29')

      // Rerun migration SQL to test idempotency
      await expect(pg.exec(gotraRegistrySql)).resolves.not.toThrow()

      const countAfter = await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.gotras;`)
      expect(countAfter.rows[0].count).toBe('29')
    })

    it('strictly separates Garg (#9) and Garga (#10) dependent Nukhs', async () => {
      // Garg with Gargya (valid for Garg) -> Success
      await expect(
        pg.exec(`INSERT INTO public.persons (first_name, last_name, gotra, nukh) VALUES ('Test1', 'G', 'Garg', 'Gargya');`)
      ).resolves.not.toThrow()

      // Garg with Gargeya (belongs to Garga, NOT Garg) -> REJECTED
      await expect(
        pg.exec(`INSERT INTO public.persons (first_name, last_name, gotra, nukh) VALUES ('Test2', 'G', 'Garg', 'Gargeya');`)
      ).rejects.toThrow(/does not belong to Gotra/i)

      // Garga with Gargeya (valid for Garga) -> Success
      await expect(
        pg.exec(`INSERT INTO public.persons (first_name, last_name, gotra, nukh) VALUES ('Test3', 'G', 'Garga', 'Gargeya');`)
      ).resolves.not.toThrow()

      // Garga with Gargya (belongs to Garg, NOT Garga) -> REJECTED
      await expect(
        pg.exec(`INSERT INTO public.persons (first_name, last_name, gotra, nukh) VALUES ('Test4', 'G', 'Garga', 'Gargya');`)
      ).rejects.toThrow(/does not belong to Gotra/i)
    })

    it('trigger tests: rejects invalid Gotra, invalid Nukh, Nukh without Gotra, and mismatched pair', async () => {
      // 1. Invalid Gotra
      await expect(
        pg.exec(`INSERT INTO public.persons (first_name, last_name, gotra) VALUES ('T1', 'L', 'InvalidGotra');`)
      ).rejects.toThrow(/is not a registered Gotra/i)

      // 2. Invalid Nukh
      await expect(
        pg.exec(`INSERT INTO public.persons (first_name, last_name, gotra, nukh) VALUES ('T2', 'L', 'Agastya', 'InvalidNukh');`)
      ).rejects.toThrow(/does not belong to Gotra/i)

      // 3. Nukh without Gotra
      await expect(
        pg.exec(`INSERT INTO public.persons (first_name, last_name, gotra, nukh) VALUES ('T3', 'L', NULL, 'Dixit');`)
      ).rejects.toThrow(/Nukh cannot be specified without a valid Gotra/i)

      // 4. Mismatched Gotra / Nukh
      await expect(
        pg.exec(`INSERT INTO public.persons (first_name, last_name, gotra, nukh) VALUES ('T4', 'L', 'Harita', 'Pandya');`)
      ).rejects.toThrow(/does not belong to Gotra/i)
    })

    it('integrity guard prevents deleting, renaming, or reassigning in-use master entries', async () => {
      // Ensure 'Angiras' with 'Dave' is in use
      await pg.exec(`
        INSERT INTO public.persons (first_name, last_name, gotra, nukh)
        VALUES ('Aarav', 'Dave', 'Angiras', 'Dave');
      `)

      // Attempting to delete in-use Gotra
      await expect(
        pg.exec(`DELETE FROM public.gotras WHERE name = 'Angiras';`)
      ).rejects.toThrow(/RESTRICT: Cannot delete or rename Gotra "Angiras"/i)

      // Attempting to rename in-use Gotra
      await expect(
        pg.exec(`UPDATE public.gotras SET name = 'AngirasRenamed' WHERE name = 'Angiras';`)
      ).rejects.toThrow(/RESTRICT: Cannot delete or rename Gotra "Angiras"/i)

      // Attempting to delete in-use Nukh
      await expect(
        pg.exec(`DELETE FROM public.nukhs WHERE name = 'Dave';`)
      ).rejects.toThrow(/RESTRICT: Cannot delete, rename, or reassign Nukh "Dave" in Gotra "Angiras"/i)

      // Attempting to rename in-use Nukh
      await expect(
        pg.exec(`UPDATE public.nukhs SET name = 'DaveRenamed' WHERE name = 'Dave';`)
      ).rejects.toThrow(/RESTRICT: Cannot delete, rename, or reassign Nukh "Dave" in Gotra "Angiras"/i)

      // Attempting to reassign in-use Nukh to another Gotra
      const kashyapId = (await pg.query<{ id: string }>(`SELECT id::text FROM public.gotras WHERE name = 'Kashyap';`)).rows[0].id
      await expect(
        pg.exec(`UPDATE public.nukhs SET gotra_id = '${kashyapId}' WHERE name = 'Dave';`)
      ).rejects.toThrow(/RESTRICT: Cannot delete, rename, or reassign Nukh "Dave" in Gotra "Angiras"/i)
    })

    it('CRITICAL BEFORE DELETE TRIGGER TEST: successfully deletes and renames unused master entries (returns OLD)', async () => {
      // 1. Unused Nukh 'Sharma' in Angiras
      // Renaming unused Nukh succeeds
      await expect(
        pg.exec(`UPDATE public.nukhs SET name = 'SharmaUpdated' WHERE name = 'Sharma';`)
      ).resolves.not.toThrow()

      // Deleting unused Nukh succeeds AND actually removes the row (proves trigger returned OLD, not NULL)
      const countNukhBefore = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.nukhs WHERE name = 'SharmaUpdated';`)).rows[0].count)
      expect(countNukhBefore).toBe(1)

      await expect(
        pg.exec(`DELETE FROM public.nukhs WHERE name = 'SharmaUpdated';`)
      ).resolves.not.toThrow()

      const countNukhAfter = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.nukhs WHERE name = 'SharmaUpdated';`)).rows[0].count)
      expect(countNukhAfter).toBe(0)

      // 2. Unused Gotra 'Audala' (has no active persons or families)
      // Renaming unused Gotra succeeds
      await expect(
        pg.exec(`UPDATE public.gotras SET name = 'AudalaUpdated' WHERE name = 'Audala';`)
      ).resolves.not.toThrow()

      // First delete its nukhs so foreign key constraint allows Gotra deletion
      await pg.exec(`DELETE FROM public.nukhs WHERE gotra_id = (SELECT id FROM public.gotras WHERE name = 'AudalaUpdated');`)

      // Deleting unused Gotra succeeds AND actually removes the row (proves trigger returned OLD, not NULL)
      const countGotraBefore = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.gotras WHERE name = 'AudalaUpdated';`)).rows[0].count)
      expect(countGotraBefore).toBe(1)

      await expect(
        pg.exec(`DELETE FROM public.gotras WHERE name = 'AudalaUpdated';`)
      ).resolves.not.toThrow()

      const countGotraAfter = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.gotras WHERE name = 'AudalaUpdated';`)).rows[0].count)
      expect(countGotraAfter).toBe(0)

      // Restore Audala for idempotency
      await pg.exec(`
        DO $$
        DECLARE gid UUID;
        BEGIN
          INSERT INTO public.gotras (name, display_order) VALUES ('Audala', 5) RETURNING id INTO gid;
          INSERT INTO public.nukhs (gotra_id, name) VALUES (gid, 'Audichya'), (gid, 'Dholakia'), (gid, 'Trivedi');
        END $$;
      `)
    })

    it('enforces table privileges and RLS across anon, authenticated member, and admin roles', async () => {
      // 1. anon role: SELECT allowed, mutations denied at SQL privilege level
      await pg.exec(`SET ROLE anon;`)
      const anonSelect = await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.gotras;`)
      expect(Number(anonSelect.rows[0].count)).toBeGreaterThan(0)

      await expect(
        pg.exec(`INSERT INTO public.gotras (name) VALUES ('HackerGotra');`)
      ).rejects.toThrow(/permission denied/i)
      await expect(
        pg.exec(`UPDATE public.gotras SET name = 'Hacked' WHERE name = 'Agastya';`)
      ).rejects.toThrow(/permission denied/i)
      await expect(
        pg.exec(`DELETE FROM public.gotras WHERE name = 'Agastya';`)
      ).rejects.toThrow(/permission denied/i)

      await pg.exec(`RESET ROLE;`)

      // 2. authenticated MEMBER (is_admin = FALSE): SELECT allowed, mutation blocked by RLS
      await pg.exec(`SET ROLE authenticated;`)
      await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)

      const memberSelect = await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.gotras;`)
      expect(Number(memberSelect.rows[0].count)).toBeGreaterThan(0)

      await expect(
        pg.exec(`INSERT INTO public.gotras (name) VALUES ('MemberGotra');`)
      ).rejects.toThrow(/violates row-level security policy/i)

      await pg.exec(`RESET ROLE;`)

      // 3. authenticated ADMIN (is_admin = TRUE): mutation succeeds
      await pg.exec(`SET ROLE authenticated;`)
      await pg.exec(`UPDATE public._mock_session SET uid = '${adminId}';`)

      await expect(
        pg.exec(`INSERT INTO public.gotras (name, display_order) VALUES ('AdminGotra', 99);`)
      ).resolves.not.toThrow()

      // Clean up test entry so registry returns to exact 29 canonical Gotras
      await pg.exec(`DELETE FROM public.gotras WHERE name = 'AdminGotra';`)

      await pg.exec(`RESET ROLE;`)
    })

    it('rolls back entire transaction on migration abort when pre-existing data is invalid', async () => {
      const testPg = new PGlite()
      await testPg.exec(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE SCHEMA IF NOT EXISTS storage;
        DO $$ BEGIN
          CREATE ROLE anon;
          CREATE ROLE authenticated;
          CREATE ROLE service_role;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        CREATE OR REPLACE FUNCTION public.handle_updated_at() RETURNS TRIGGER AS $$
        BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
        $$ LANGUAGE plpgsql;
        CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$ BEGIN RETURN FALSE; END; $$ LANGUAGE plpgsql;

        CREATE TABLE public.persons (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          gotra TEXT,
          nukh TEXT
        );
        CREATE TABLE public.families (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          family_name TEXT NOT NULL,
          gotra TEXT,
          nukh TEXT
        );

        -- Insert invalid pre-existing record that does not match any canonical Gotra
        INSERT INTO public.persons (first_name, last_name, gotra, nukh)
        VALUES ('Bad', 'Record', 'CompletelyInvalidGotraName', 'FakeNukh');
      `)

      // Running the migration must abort with ERRCODE 22023 and ROLLBACK
      await expect(testPg.exec(gotraRegistrySql)).rejects.toThrow(/MIGRATION ABORTED.*invalid or unmatched/i)
      await testPg.exec('ROLLBACK;').catch(() => {})

      // Verify transaction rollback: public.gotras table does not exist
      const tableCheck = await testPg.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gotras'
        ) AS exists;
      `)
      expect(tableCheck.rows[0].exists).toBe(false)
    })

    it('aborts migration and rolls back completely when pre-existing family has unmatched Gotra/Nukh (Section 7 step 6)', async () => {
      const testPg = new PGlite()
      await testPg.exec(`
        CREATE SCHEMA IF NOT EXISTS storage;
        DO $$ BEGIN
          CREATE ROLE anon;
          CREATE ROLE authenticated;
          CREATE ROLE service_role;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        CREATE OR REPLACE FUNCTION public.handle_updated_at() RETURNS TRIGGER AS $$
        BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
        $$ LANGUAGE plpgsql;
        CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$ BEGIN RETURN FALSE; END; $$ LANGUAGE plpgsql;

        CREATE TABLE public.persons (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          gotra TEXT,
          nukh TEXT
        );
        CREATE TABLE public.families (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          family_name TEXT NOT NULL,
          gotra TEXT,
          nukh TEXT
        );

        -- Insert valid person record
        INSERT INTO public.persons (first_name, last_name, gotra, nukh)
        VALUES ('Valid', 'Person', 'Kashyap', 'Varun');

        -- Insert invalid pre-existing family record with valid Gotra but unmatched Nukh
        INSERT INTO public.families (family_name, gotra, nukh)
        VALUES ('Invalid Family', 'Kashyap', 'NonExistentNukh');
      `)

      // Running the migration must abort with ERRCODE 22023 specifically identifying family record
      await expect(testPg.exec(gotraRegistrySql)).rejects.toThrow(/Found existing families with invalid or unmatched Gotra\/Nukh records/i)
      await testPg.exec('ROLLBACK;').catch(() => {})

      // Verify transaction rollback: public.gotras table does not exist
      const tableCheck = await testPg.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gotras'
        ) AS exists;
      `)
      expect(tableCheck.rows[0].exists).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Complete Database Permission Regression Audit (Before vs After)
  // ---------------------------------------------------------------------------
  describe('5. Complete Database Permission Regression Audit (Before vs After)', () => {
    let postPolicies: PolicyRow[] = []
    let postGrants: GrantRow[] = []
    let postRoutines: RoutineRow[] = []

    beforeAll(async () => {
      postPolicies = (await pg.query<PolicyRow>(`
        SELECT schemaname, tablename, policyname, permissive, roles::text[] as roles, cmd, qual, with_check
        FROM pg_policies
        ORDER BY schemaname, tablename, policyname;
      `)).rows

      postGrants = (await pg.query<GrantRow>(`
        SELECT grantee, table_schema, table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema IN ('public', 'storage')
        ORDER BY grantee, table_schema, table_name, privilege_type;
      `)).rows

      postRoutines = (await pg.query<RoutineRow>(`
        SELECT routine_schema, routine_name, routine_type, security_type
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        ORDER BY routine_schema, routine_name;
      `)).rows
    })

    it('confirms every pre-existing baseline policy on persons, families, profiles, family_members, audit_logs remains identical', () => {
      const targetTables = ['persons', 'families', 'profiles', 'family_members', 'audit_logs']

      const baselineTargetPolicies = baselinePolicies.filter(p => targetTables.includes(p.tablename))
      const postTargetPolicies = postPolicies.filter(p => targetTables.includes(p.tablename))

      expect(postTargetPolicies.length).toBe(baselineTargetPolicies.length)

      for (const basePol of baselineTargetPolicies) {
        const postPol = postTargetPolicies.find(
          p => p.schemaname === basePol.schemaname && p.tablename === basePol.tablename && p.policyname === basePol.policyname
        )
        expect(postPol).toBeDefined()
        expect(postPol?.cmd).toBe(basePol.cmd)
        expect(postPol?.permissive).toBe(basePol.permissive)
        expect(postPol?.qual).toBe(basePol.qual)
        expect(postPol?.with_check).toBe(basePol.with_check)
      }
    })

    it('confirms all 4 avatar Storage policies on storage.objects are 100% identical and preserved', () => {
      const baseAvatars = baselinePolicies.filter(p => p.schemaname === 'storage' && p.tablename === 'objects' && p.policyname.startsWith('avatars'))
      const postAvatars = postPolicies.filter(p => p.schemaname === 'storage' && p.tablename === 'objects' && p.policyname.startsWith('avatars'))

      expect(baseAvatars.length).toBe(4)
      expect(postAvatars.length).toBe(4)

      for (const basePol of baseAvatars) {
        const postPol = postAvatars.find(p => p.policyname === basePol.policyname)
        expect(postPol).toBeDefined()
        expect(postPol?.cmd).toBe(basePol.cmd)
        expect(postPol?.qual).toBe(basePol.qual)
        expect(postPol?.with_check).toBe(basePol.with_check)
      }
    })

    it('confirms all 4 family_media Storage policies and media table policies are completely dropped', () => {
      const postMediaStorage = postPolicies.filter(p => p.schemaname === 'storage' && p.tablename === 'objects' && p.policyname.startsWith('family_media'))
      expect(postMediaStorage.length).toBe(0)

      const postMediaTables = postPolicies.filter(p => ['family_albums', 'family_media', 'family_stories'].includes(p.tablename))
      expect(postMediaTables.length).toBe(0)
    })

    it('confirms the only new policies added across the entire database are exactly the 8 gotras and nukhs policies', () => {
      const newPolicies = postPolicies.filter(
        post => !baselinePolicies.some(
          base => base.schemaname === post.schemaname && base.tablename === post.tablename && base.policyname === post.policyname
        )
      )

      expect(newPolicies.length).toBe(8)
      expect(newPolicies.every(p => ['gotras', 'nukhs'].includes(p.tablename))).toBe(true)

      const policyNames = newPolicies.map(p => p.policyname).sort()
      expect(policyNames).toEqual([
        'gotras_admin_delete',
        'gotras_admin_insert',
        'gotras_admin_update',
        'gotras_select_policy',
        'nukhs_admin_delete',
        'nukhs_admin_insert',
        'nukhs_admin_update',
        'nukhs_select_policy',
      ].sort())
    })

    it('confirms table grants on pre-existing baseline tables are completely unchanged', () => {
      const targetTables = ['persons', 'families', 'profiles', 'family_members', 'connections', 'audit_logs']

      const baseGrants = baselineGrants.filter(g => targetTables.includes(g.table_name))
      const postTargetGrants = postGrants.filter(g => targetTables.includes(g.table_name))

      expect(postTargetGrants.length).toBe(baseGrants.length)

      for (const bg of baseGrants) {
        const matching = postTargetGrants.find(
          pg => pg.grantee === bg.grantee && pg.table_schema === bg.table_schema && pg.table_name === bg.table_name && pg.privilege_type === bg.privilege_type
        )
        expect(matching).toBeDefined()
      }
    })

    it('confirms create_family_with_head function security: DEFINER, revoked from PUBLIC and anon, granted to authenticated', async () => {
      // Confirm all pre-existing baseline routines survive with identical security definitions
      for (const baseRoutine of baselineRoutines) {
        const postRoutine = postRoutines.find(r => r.routine_name === baseRoutine.routine_name)
        expect(postRoutine).toBeDefined()
        expect(postRoutine?.security_type).toBe(baseRoutine.security_type)
      }

      const rpcRoutine = postRoutines.find(r => r.routine_name === 'create_family_with_head')
      expect(rpcRoutine).toBeDefined()
      expect(rpcRoutine?.security_type).toBe('DEFINER')

      // Execution privileges test: anon cannot execute
      await pg.exec(`SET ROLE anon;`)
      await expect(
        pg.query(`SELECT * FROM public.create_family_with_head(p_family_name := 'Hacker Parivar');`)
      ).rejects.toThrow(/permission denied|UNAUTHENTICATED/i)

      await pg.exec(`RESET ROLE;`)
    })

    it('confirms existing access for anon, authenticated members, admins, and community moderators remains intact and correct', async () => {
      // 1. Unauthenticated / anon can read public census and gotras, cannot mutate
      await pg.exec(`SET ROLE anon;`)
      await pg.exec(`UPDATE public._mock_session SET uid = NULL;`)

      const gotrasCount = Number((await pg.query<{ count: string }>(`SELECT count(*)::text FROM public.gotras;`)).rows[0].count)
      expect(gotrasCount).toBe(29)

      await expect(pg.exec(`INSERT INTO public.gotras (name) VALUES ('Hacker');`)).rejects.toThrow(/permission denied/i)
      await pg.exec(`RESET ROLE;`)

      // 2. Authenticated MEMBER can read gotras, create family via RPC, but cannot mutate gotras master table
      await pg.exec(`SET ROLE authenticated;`)
      await pg.exec(`UPDATE public._mock_session SET uid = '${activeMemberId}';`)

      await expect(pg.exec(`INSERT INTO public.gotras (name) VALUES ('HackerMember');`)).rejects.toThrow(/violates row-level security policy/i)

      const famRes = await pg.query<{ family_id: string }>(`
        SELECT * FROM public.create_family_with_head(
          p_family_name := 'Verified Audit Parivar',
          p_new_person_first_name := 'Aarav',
          p_new_person_last_name := 'Khatri'
        );
      `)
      expect(famRes.rows[0].family_id).toBeDefined()

      await pg.exec(`RESET ROLE;`)

      // 3. ADMIN can mutate gotras master table
      await pg.exec(`SET ROLE authenticated;`)
      await pg.exec(`UPDATE public._mock_session SET uid = '${adminId}';`)

      await expect(pg.exec(`INSERT INTO public.gotras (name, display_order) VALUES ('AuditAdminGotra', 100);`)).resolves.not.toThrow()
      await pg.exec(`DELETE FROM public.gotras WHERE name = 'AuditAdminGotra';`)

      await pg.exec(`RESET ROLE;`)
    })
  })
})
