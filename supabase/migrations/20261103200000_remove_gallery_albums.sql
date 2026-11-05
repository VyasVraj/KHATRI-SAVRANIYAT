-- =============================================================================
-- Migration: 20261103200000_remove_gallery_albums.sql
-- Purpose:   Complete teardown of deprecated Family Media, Albums, and Stories.
--
-- STRICT TOPOLOGICAL DEPENDENCY DROP ORDER:
--   1. Drop storage.objects RLS policies referencing family media helper functions.
--   2. Explicitly drop all table RLS policies on media tables.
--   3. Explicitly drop all named table triggers on owning tables.
--   4. Explicitly drop circular foreign key constraints (family_albums <-> family_media).
--   5. Drop tables in safe dependency order (family_stories -> family_media -> family_albums)
--      WITHOUT blanket CASCADE.
--   6. Drop all media-related RPC functions (including register_family_media which
--      depends on public.family_media_type).
--   7. Drop all trigger functions and guard functions (using actual historical names).
--      NOTE: Shared public.handle_updated_at() is PRESERVED.
--   8. Drop authorization helper functions.
--   9. Drop the domain enum (public.family_media_type).
--  10. Operational note on Supabase Storage cleanup (emptyBucket / deleteBucket).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Storage RLS Policies (Must drop before helper functions are removed)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_media_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "family_media_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "family_media_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "family_media_delete_policy" ON storage.objects;

-- Defensive drops for alternate naming conventions
DROP POLICY IF EXISTS "family_media_select" ON storage.objects;
DROP POLICY IF EXISTS "family_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "family_media_update" ON storage.objects;
DROP POLICY IF EXISTS "family_media_delete" ON storage.objects;

-- -----------------------------------------------------------------------------
-- 2. Explicitly Drop Table RLS Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "family_stories_select_policy" ON public.family_stories;
DROP POLICY IF EXISTS "family_stories_insert_policy" ON public.family_stories;
DROP POLICY IF EXISTS "family_stories_update_policy" ON public.family_stories;
DROP POLICY IF EXISTS "family_stories_delete_policy" ON public.family_stories;

DROP POLICY IF EXISTS "family_media_select_policy" ON public.family_media;
DROP POLICY IF EXISTS "family_media_insert_policy" ON public.family_media;
DROP POLICY IF EXISTS "family_media_update_policy" ON public.family_media;
DROP POLICY IF EXISTS "family_media_delete_policy" ON public.family_media;

DROP POLICY IF EXISTS "family_albums_select_policy" ON public.family_albums;
DROP POLICY IF EXISTS "family_albums_insert_policy" ON public.family_albums;
DROP POLICY IF EXISTS "family_albums_update_policy" ON public.family_albums;
DROP POLICY IF EXISTS "family_albums_delete_policy" ON public.family_albums;

-- -----------------------------------------------------------------------------
-- 3. Explicitly Drop Named Triggers on Owning Tables
-- -----------------------------------------------------------------------------
-- Triggers on public.family_stories
DROP TRIGGER IF EXISTS family_stories_handle_updated_at ON public.family_stories;
DROP TRIGGER IF EXISTS family_story_featured_media_guard ON public.family_stories;
DROP TRIGGER IF EXISTS trg_family_story_notification_events ON public.family_stories;

-- Triggers on public.family_media
DROP TRIGGER IF EXISTS family_media_handle_updated_at ON public.family_media;
DROP TRIGGER IF EXISTS family_media_album_guard ON public.family_media;
DROP TRIGGER IF EXISTS family_media_storage_path_guard ON public.family_media;
DROP TRIGGER IF EXISTS family_media_immutability_guard ON public.family_media;
DROP TRIGGER IF EXISTS trg_family_media_notification_events ON public.family_media;

-- Triggers on public.family_albums
DROP TRIGGER IF EXISTS family_albums_handle_updated_at ON public.family_albums;
DROP TRIGGER IF EXISTS family_album_immutability_guard ON public.family_albums;
DROP TRIGGER IF EXISTS family_album_cover_guard ON public.family_albums;

-- -----------------------------------------------------------------------------
-- 4. Explicitly Unlink Circular Foreign Keys
-- -----------------------------------------------------------------------------
-- family_albums.cover_media_id -> family_media.id
ALTER TABLE IF EXISTS public.family_albums
  DROP CONSTRAINT IF EXISTS family_albums_cover_media_id_fkey;

-- family_stories.featured_media_id -> family_media.id
ALTER TABLE IF EXISTS public.family_stories
  DROP CONSTRAINT IF EXISTS family_stories_featured_media_id_fkey;

-- family_media.album_id -> family_albums.id
ALTER TABLE IF EXISTS public.family_media
  DROP CONSTRAINT IF EXISTS family_media_album_id_fkey;

-- -----------------------------------------------------------------------------
-- 5. Drop Tables in Safe Dependency Order (Leaf to Root, No CASCADE)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.family_stories;
DROP TABLE IF EXISTS public.family_media;
DROP TABLE IF EXISTS public.family_albums;

-- -----------------------------------------------------------------------------
-- 6. Drop Media-Related RPC Functions
--    (Must drop register_family_media before dropping family_media_type enum)
--    Uses exact argument signatures to comply with strict PostgreSQL syntax.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_family_media(UUID, UUID, UUID, TEXT, public.family_media_type, TEXT, TEXT, BIGINT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.soft_delete_family_media(UUID);
DROP FUNCTION IF EXISTS public.create_family_story(UUID, TEXT, TEXT, TEXT, public.privacy_level, UUID);
DROP FUNCTION IF EXISTS public.create_family_album(UUID, TEXT, TEXT, public.privacy_level);

-- -----------------------------------------------------------------------------
-- 7. Drop Trigger Functions and Guard Functions (Using exact historical signatures)
--    NOTE: public.handle_updated_at() is a shared trigger function and is NOT dropped.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.handle_family_story_featured_media_guard();
DROP FUNCTION IF EXISTS public.handle_family_story_notification_events();

DROP FUNCTION IF EXISTS public.handle_family_media_album_guard();
DROP FUNCTION IF EXISTS public.handle_family_media_storage_path_guard();
DROP FUNCTION IF EXISTS public.handle_family_media_immutability_guard();
DROP FUNCTION IF EXISTS public.handle_family_media_notification_events();

DROP FUNCTION IF EXISTS public.handle_family_album_immutability_guard();
DROP FUNCTION IF EXISTS public.handle_family_album_cover_guard();

-- Defensive drops for naming variations (strictly zero-argument syntax)
DROP FUNCTION IF EXISTS public.family_media_validate_album();
DROP FUNCTION IF EXISTS public.family_media_validate_storage_path();
DROP FUNCTION IF EXISTS public.family_media_enforce_immutability();
DROP FUNCTION IF EXISTS public.family_album_validate_cover();
DROP FUNCTION IF EXISTS public.family_album_enforce_immutability();
DROP FUNCTION IF EXISTS public.family_story_validate_featured_media();
DROP FUNCTION IF EXISTS public.emit_family_media_notification();
DROP FUNCTION IF EXISTS public.emit_family_story_notification();

-- -----------------------------------------------------------------------------
-- 8. Drop Authorization Helper Functions (Using exact historical signatures)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.can_manage_family_media(UUID);
DROP FUNCTION IF EXISTS public.can_read_family_item(UUID, public.privacy_level);
DROP FUNCTION IF EXISTS public.can_read_family_media_object(TEXT);

-- -----------------------------------------------------------------------------
-- 9. Drop Domain Enum
-- -----------------------------------------------------------------------------
DROP TYPE IF EXISTS public.family_media_type;

-- -----------------------------------------------------------------------------
-- 10. Operational Note on Supabase Storage Bucket Cleanup
--
-- IMPORTANT ARCHITECTURAL DIRECTIVE:
-- Direct SQL deletion from storage.objects and storage.buckets is intentionally
-- omitted from this migration. Direct SQL manipulation of internal storage schema
-- tables does not trigger the Supabase Storage service to evict physical files
-- from the underlying S3/cloud storage layer.
--
-- Because all existing gallery and album uploads are disposable testing data,
-- physical file preservation is not required.
-- If complete removal of the 'family-media' bucket is desired in the target
-- environment, operators must empty and delete the bucket through the Supabase
-- Storage Management API or the Supabase Dashboard prior to (or following)
-- executing this SQL migration:
--
--   // Supabase Storage API (Node.js / Admin script with service_role):
--   await supabase.storage.emptyBucket('family-media');
--   await supabase.storage.deleteBucket('family-media');
--
-- The 'avatars' bucket, its storage records, and all 'avatars_*' policies remain
-- 100% intact and unaffected.
-- -----------------------------------------------------------------------------

COMMIT;
