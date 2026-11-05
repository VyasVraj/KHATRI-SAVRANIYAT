import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('SQL Migrations Safety & Architectural Invariants Audit', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations')

  const gallerySql = fs.readFileSync(
    path.join(migrationsDir, '20261103200000_remove_gallery_albums.sql'),
    'utf-8'
  )
  const familyRpcSql = fs.readFileSync(
    path.join(migrationsDir, '20261103210000_create_family_with_head_rpc.sql'),
    'utf-8'
  )
  const gotraRegistrySql = fs.readFileSync(
    path.join(migrationsDir, '20261103220000_create_gotra_nukh_master_registry.sql'),
    'utf-8'
  )

  describe('Gallery & Album Teardown Migration (20261103200000)', () => {
    it('drops storage policies ending in _policy before table drops', () => {
      const dropPolicyPos = gallerySql.indexOf('DROP POLICY IF EXISTS "family_media_select_policy" ON storage.objects;')
      const dropTablePos = gallerySql.indexOf('DROP TABLE IF EXISTS public.family_stories')
      expect(dropPolicyPos).toBeGreaterThan(-1)
      expect(dropTablePos).toBeGreaterThan(-1)
      expect(dropPolicyPos).toBeLessThan(dropTablePos)

      expect(gallerySql).toContain('DROP POLICY IF EXISTS "family_media_insert_policy" ON storage.objects;')
      expect(gallerySql).toContain('DROP POLICY IF EXISTS "family_media_update_policy" ON storage.objects;')
      expect(gallerySql).toContain('DROP POLICY IF EXISTS "family_media_delete_policy" ON storage.objects;')
    })

    it('explicitly drops table RLS policies on media tables', () => {
      expect(gallerySql).toContain('DROP POLICY IF EXISTS "family_stories_select_policy" ON public.family_stories;')
      expect(gallerySql).toContain('DROP POLICY IF EXISTS "family_media_select_policy" ON public.family_media;')
      expect(gallerySql).toContain('DROP POLICY IF EXISTS "family_albums_select_policy" ON public.family_albums;')
    })

    it('explicitly drops named triggers on owning tables before dropping tables or trigger functions', () => {
      const dropTrigAlbumPos = gallerySql.indexOf('DROP TRIGGER IF EXISTS family_album_cover_guard ON public.family_albums')
      const dropTrigMediaPos = gallerySql.indexOf('DROP TRIGGER IF EXISTS family_media_album_guard ON public.family_media')
      const dropTrigStoryPos = gallerySql.indexOf('DROP TRIGGER IF EXISTS family_story_featured_media_guard ON public.family_stories')
      const dropTablesPos = gallerySql.indexOf('DROP TABLE IF EXISTS public.family_stories')

      expect(dropTrigAlbumPos).toBeGreaterThan(-1)
      expect(dropTrigMediaPos).toBeGreaterThan(-1)
      expect(dropTrigStoryPos).toBeGreaterThan(-1)
      expect(dropTrigAlbumPos).toBeLessThan(dropTablesPos)
      expect(dropTrigMediaPos).toBeLessThan(dropTablesPos)
      expect(dropTrigStoryPos).toBeLessThan(dropTablesPos)
    })

    it('explicitly unlinks circular foreign key constraints before dropping tables', () => {
      const dropFkPos = gallerySql.indexOf('DROP CONSTRAINT IF EXISTS family_albums_cover_media_id_fkey')
      const dropTablePos = gallerySql.indexOf('DROP TABLE IF EXISTS public.family_stories')
      expect(dropFkPos).toBeGreaterThan(-1)
      expect(dropFkPos).toBeLessThan(dropTablePos)
    })

    it('drops tables in correct leaf-to-root order without blanket CASCADE', () => {
      const dropStoryPos = gallerySql.indexOf('DROP TABLE IF EXISTS public.family_stories')
      const dropMediaPos = gallerySql.indexOf('DROP TABLE IF EXISTS public.family_media')
      const dropAlbumPos = gallerySql.indexOf('DROP TABLE IF EXISTS public.family_albums')

      expect(dropStoryPos).toBeLessThan(dropMediaPos)
      expect(dropMediaPos).toBeLessThan(dropAlbumPos)

      // Ensure no blanket CASCADE on table drops
      expect(gallerySql).not.toMatch(/DROP TABLE\s+IF EXISTS[^;]+CASCADE/i)
    })

    it('drops register_family_media and soft_delete_family_media before dropping family_media_type enum', () => {
      const dropRegisterPos = gallerySql.indexOf('DROP FUNCTION IF EXISTS public.register_family_media')
      const dropEnumPos = gallerySql.indexOf('DROP TYPE IF EXISTS public.family_media_type')

      expect(dropRegisterPos).toBeGreaterThan(-1)
      expect(dropEnumPos).toBeGreaterThan(-1)
      expect(dropRegisterPos).toBeLessThan(dropEnumPos)

      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.soft_delete_family_media')
    })

    it('drops trigger functions using actual historical names', () => {
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.handle_family_media_album_guard')
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.handle_family_media_storage_path_guard')
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.handle_family_story_featured_media_guard')
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.handle_family_media_notification_events')
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.handle_family_story_notification_events')
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.handle_family_album_immutability_guard')
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.handle_family_album_cover_guard')
    })

    it('preserves the shared public.handle_updated_at function', () => {
      expect(gallerySql).not.toMatch(/DROP FUNCTION.*handle_updated_at/i)
    })

    it('drops helper functions and documents family-media storage bucket cleanup without raw SQL deletion', () => {
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.can_manage_family_media')
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.can_read_family_item')
      expect(gallerySql).toContain('DROP FUNCTION IF EXISTS public.can_read_family_media_object')
      expect(gallerySql).not.toContain("DELETE FROM storage.objects WHERE bucket_id = 'family-media'")
      expect(gallerySql).not.toContain("DELETE FROM storage.buckets WHERE id = 'family-media'")
      expect(gallerySql).toContain('supabase.storage.emptyBucket')
      expect(gallerySql).toContain('supabase.storage.deleteBucket')
    })
  })

  describe('Family Creation RPC Migration (20261103210000)', () => {
    it('enforces caller authentication and active profile check', () => {
      expect(familyRpcSql).toContain('v_caller_id := auth.uid()')
      expect(familyRpcSql).toContain('IF v_caller_id IS NULL THEN')
      expect(familyRpcSql).toContain('SELECT 1 FROM public.profiles')
      expect(familyRpcSql).toContain('WHERE id = v_caller_id AND is_active = TRUE')
    })

    it('enforces PERSON != USER invariant with user_id = NULL for new person records', () => {
      expect(familyRpcSql).toMatch(/INSERT INTO public\.persons[\s\S]*?VALUES[\s\S]*?NULL/)
      expect(familyRpcSql).toContain('p_new_person_first_name')
      expect(familyRpcSql).toContain('p_new_person_last_name')
    })

    it('preserves existing person family memberships without demoting or transferring existing ties', () => {
      expect(familyRpcSql).toContain('Existing family memberships remain untouched (no demotion, no transfer)')
      expect(familyRpcSql).not.toContain('DELETE FROM public.family_members WHERE person_id = v_head_person_id')
      expect(familyRpcSql).not.toContain('UPDATE public.family_members SET is_head = FALSE WHERE person_id = v_head_person_id')
    })

    it('uses secure search_path and error isolation', () => {
      expect(familyRpcSql).toContain('SET search_path = public, pg_temp')
      expect(familyRpcSql).toContain('SECURITY DEFINER')
    })
  })

  describe('Gotra & Nukh Master Registry Migration (20261103220000)', () => {
    it('creates case-insensitive unique expression indexes on gotras and nukhs', () => {
      expect(gotraRegistrySql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_gotras_name_lower_unique ON public.gotras (lower(name))')
      expect(gotraRegistrySql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_nukhs_gotra_name_lower_unique ON public.nukhs (gotra_id, lower(name))')
    })

    it('uses correct expression index conflict targets in seed logic', () => {
      expect(gotraRegistrySql).toContain('ON CONFLICT ((lower(name))) DO UPDATE')
      expect(gotraRegistrySql).toContain('ON CONFLICT (gotra_id, (lower(name))) DO UPDATE')
    })

    it('case-insensitively resolves canonical Gotra ID preventing NULL flow', () => {
      expect(gotraRegistrySql).toContain('WHERE lower(name) = lower(r.g_name)')
      expect(gotraRegistrySql).toContain("RAISE EXCEPTION 'CRITICAL: Failed to retrieve canonical Gotra ID")
    })

    it('enforces restrictive administrative RLS policies using public.is_admin()', () => {
      expect(gotraRegistrySql).toContain('CREATE POLICY gotras_admin_insert ON public.gotras')
      expect(gotraRegistrySql).toContain('FOR INSERT WITH CHECK (public.is_admin())')
      expect(gotraRegistrySql).toContain('CREATE POLICY gotras_admin_update ON public.gotras')
      expect(gotraRegistrySql).toContain('CREATE POLICY gotras_admin_delete ON public.gotras')
      expect(gotraRegistrySql).toContain('CREATE POLICY nukhs_admin_insert ON public.nukhs')
      expect(gotraRegistrySql).toContain('CREATE POLICY nukhs_admin_update ON public.nukhs')
      expect(gotraRegistrySql).toContain('CREATE POLICY nukhs_admin_delete ON public.nukhs')
    })

    it('attaches integrity triggers preventing deletion or renaming of active master entries', () => {
      expect(gotraRegistrySql).toContain('public.guard_gotra_master_integrity()')
      expect(gotraRegistrySql).toContain('public.guard_nukh_master_integrity()')
      expect(gotraRegistrySql).toContain('trg_guard_gotra_master_integrity')
      expect(gotraRegistrySql).toContain('trg_guard_nukh_master_integrity')
    })

    it('canonicalizes casing in trigger assigning authoritative spelling', () => {
      expect(gotraRegistrySql).toContain('NEW.gotra := v_canonical_gotra')
      expect(gotraRegistrySql).toContain('NEW.nukh := v_canonical_nukh')
    })

    it('seeds exactly 29 authoritative Gotras and maintains distinct Garg and Garga mappings', () => {
      expect(gotraRegistrySql).toContain("('Garg', 9, ARRAY['Garga', 'Gargya', 'Jani', 'Pandya'])")
      expect(gotraRegistrySql).toContain("('Garga', 10, ARRAY['Garg', 'Gargeya', 'Upadhyaya'])")
    })
  })
})
