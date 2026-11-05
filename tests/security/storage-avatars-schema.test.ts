import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Storage & Avatars Schema Contract (Phase 11 Subtask 1)', () => {
  const migrationPath = resolve(
    __dirname,
    '../../supabase/migrations/20261010100000_create_storage_and_avatars.sql'
  )
  const sql = readFileSync(migrationPath, 'utf8')

  it('declares the avatars bucket creation as PRIVATE (public = FALSE) with 5MB limit and MIME type restriction', () => {
    expect(sql).toContain("INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)")
    expect(sql).toContain("'avatars'")
    expect(sql).toContain("FALSE")
    expect(sql).not.toContain("VALUES ('avatars', 'avatars', TRUE")
    expect(sql).toContain('5242880')
    expect(sql).toContain('image/jpeg')
    expect(sql).toContain('image/png')
    expect(sql).toContain('image/webp')
  })

  it('adds avatar_url column to public.persons, families, and profiles with strict format constraints accepting ONLY canonical internal paths', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS avatar_url TEXT')
    expect(sql).toContain('persons_avatar_url_format')
    expect(sql).toContain('families_avatar_url_format')
    expect(sql).toContain('profiles_avatar_url_format')
    // Asserts constraints enforce ONLY canonical internal storage path avatars/<scope>/<uuid>/<filename>
    expect(sql).toContain("avatar_url ~ '^avatars/persons/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'")
    expect(sql).toContain("avatar_url ~ '^avatars/families/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'")
    expect(sql).toContain("avatar_url ~ '^avatars/profiles/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'")
    // Asserts signed and arbitrary external URLs are strictly forbidden from DB storage
    expect(sql).not.toContain('/storage/v1/object/sign/')
    expect(sql).not.toContain('/storage/v1/object/authenticated/')
  })

  it('defines helper security functions with SECURITY DEFINER, search_path = public, and restricted to is_admin', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_manage_person_avatar(p_person_id UUID)')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_manage_family_avatar(p_family_id UUID)')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_read_avatar_object(p_object_name TEXT)')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public')
    // Asserts COMMITTEE_MEMBER is NOT granted global moderation authority (is_admin used instead of is_community_moderator)
    expect(sql).toContain('public.is_admin()')
    expect(sql).not.toContain('is_community_moderator')
  })

  it('implements can_read_avatar_object with path segment validation, active family lifecycle, and privacy enforcement', () => {
    expect(sql).toContain("split_part(p_object_name, '/', 1)")
    expect(sql).toContain("split_part(p_object_name, '/', 3) = '' OR split_part(p_object_name, '/', 4) != ''")
    expect(sql).toContain('public.are_users_connected')
    expect(sql).toContain("v_privacy = 'PUBLIC'")
    expect(sql).toContain("v_privacy = 'COMMUNITY'")
    // Enforces active family lifecycle (non-deleted, non-archived, left_at IS NULL)
    expect(sql).toContain("f.status = 'ACTIVE'")
    expect(sql).toContain('fm1.left_at IS NULL')
    expect(sql).toContain('fm2.left_at IS NULL')
    expect(sql).toContain('f.deleted_at IS NULL')
  })

  it('implements audit-logging RPCs for setting and removing avatars accepting ONLY canonical internal paths', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_person_avatar')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.delete_person_avatar')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_family_avatar')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.delete_family_avatar')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_profile_avatar')
    expect(sql).toContain('PERFORM public.log_audit_event')
    // RPCs must enforce canonical internal path regex and reject signed/external URLs
    expect(sql).toContain("p_avatar_url !~ '^avatars/persons/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'")
    expect(sql).toContain("p_avatar_url !~ '^avatars/families/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'")
    expect(sql).toContain("p_avatar_url !~ ('^avatars/profiles/' || v_user_id::TEXT || '/[^/]+$')")
  })

  it('enforces regex UUID validation on storage path segments to prevent malformed casting', () => {
    expect(sql).toContain("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
  })

  it('configures explicit storage RLS policies on storage.objects using can_read_avatar_object', () => {
    expect(sql).toContain('avatars_select_policy')
    expect(sql).toContain('public.can_read_avatar_object(name)')
    expect(sql).toContain('avatars_insert_policy')
    expect(sql).toContain('avatars_update_policy')
    expect(sql).toContain('avatars_delete_policy')
  })

  it('revokes public execution on helper and management functions, granting only to authenticated/anon appropriately with documented rationale', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.set_person_avatar(UUID, TEXT) FROM PUBLIC')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.set_person_avatar(UUID, TEXT) TO authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.can_read_avatar_object(TEXT) TO authenticated, anon')
    expect(sql).toContain('Storage RLS evaluation of avatars for records configured with profile_privacy = \'PUBLIC\'')
  })
})
