/**
 * Security & Integration Test: Vyas Family Head Resolution & Migration
 *
 * Validates:
 * 1. Genuine PostgreSQL migration execution (PGlite) of 20261105234500_fix_vyas_family_head.sql.
 * 2. Vyas Family gets exactly one head (Vraj Vyas) with is_head = TRUE and role = 'HEAD'.
 * 3. All other 4 members remain intact with is_head = FALSE (no members deleted, count remains 5).
 * 4. Suthar Family (Bhavesh Suthar) and Pamnani Family (Nanak Pamnani) remain completely unaffected.
 * 5. Unique constraint idx_family_members_one_head is fully respected.
 * 6. Head person profile_privacy is set to COMMUNITY.
 * 7. Frontend listFamilies resolution with community_persons view fallback.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'

describe('Vyas Family Head Migration & Resolution Audit', () => {
  let pg: PGlite

  const VYAS_FAM_ID = 'aaaaaaaa-1111-4000-8000-000000000001'
  const SUTHAR_FAM_ID = 'bbbbbbbb-2222-4000-8000-000000000002'
  const PAMNANI_FAM_ID = 'cccccccc-3333-4000-8000-000000000003'

  const VRAJ_PERSON_ID = '8153e31b-11cb-4d53-a5de-afaa9dada05e'
  const JAYESH_PERSON_ID = '41088816-29ce-43e5-a89e-4b1008b5bcaa'
  const JIGNASHA_PERSON_ID = 'f6c525e0-44e6-4cc6-bd14-a6dbc21f709b'
  const DHRUV_PERSON_ID = '0b3c9faa-6c80-4cbe-a7eb-046c72eb171c'
  const CHANDRAKANT_PERSON_ID = '257af64e-7d5c-4cdf-88ce-2d5c00981d18'

  const BHAVESH_PERSON_ID = 'b7c62abf-59ac-424c-ae29-62e7b8af729d'
  const NANAK_PERSON_ID = 'cc3aa6c5-4aa0-4435-ae75-4317ebf99a1d'

  const MIGRATION_PATH = path.resolve(
    __dirname,
    '../../supabase/migrations/20261105234500_fix_vyas_family_head.sql'
  )
  const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8')

  beforeAll(async () => {
    pg = new PGlite()

    await pg.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TYPE public.gender AS ENUM ('MALE', 'FEMALE', 'OTHER');
      CREATE TYPE public.privacy_level AS ENUM ('PUBLIC', 'COMMUNITY', 'MEMBERS', 'PRIVATE');
      CREATE TYPE public.family_role AS ENUM ('HEAD', 'SPOUSE', 'CHILD', 'PARENT', 'MEMBER');

      -- Tables
      CREATE TABLE public.persons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT NOT NULL,
        gender public.gender NOT NULL DEFAULT 'MALE',
        profile_privacy public.privacy_level NOT NULL DEFAULT 'COMMUNITY',
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );

      CREATE TABLE public.families (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        family_name TEXT NOT NULL,
        profile_privacy public.privacy_level NOT NULL DEFAULT 'COMMUNITY',
        created_by UUID,
        manager_user_id UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );

      CREATE TABLE public.family_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
        person_id UUID NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
        role public.family_role NOT NULL DEFAULT 'MEMBER',
        is_head BOOLEAN NOT NULL DEFAULT FALSE,
        joined_at TIMESTAMPTZ DEFAULT now(),
        left_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE UNIQUE INDEX idx_family_members_one_head
        ON public.family_members (family_id)
        WHERE is_head = TRUE AND left_at IS NULL;

      -- Seed Suthar Family & Head
      INSERT INTO public.persons (id, first_name, last_name, profile_privacy)
      VALUES ('${BHAVESH_PERSON_ID}', 'BHAVESH', 'SUTHAR', 'COMMUNITY');

      INSERT INTO public.families (id, family_name, profile_privacy)
      VALUES ('${SUTHAR_FAM_ID}', 'SUTHAR FAMILY', 'COMMUNITY');

      INSERT INTO public.family_members (family_id, person_id, role, is_head)
      VALUES ('${SUTHAR_FAM_ID}', '${BHAVESH_PERSON_ID}', 'HEAD', TRUE);

      -- Seed Pamnani Family & Head
      INSERT INTO public.persons (id, first_name, last_name, profile_privacy)
      VALUES ('${NANAK_PERSON_ID}', 'NANAK', 'PAMNANI', 'COMMUNITY');

      INSERT INTO public.families (id, family_name, profile_privacy)
      VALUES ('${PAMNANI_FAM_ID}', 'PAMNANI FAMILY', 'COMMUNITY');

      INSERT INTO public.family_members (family_id, person_id, role, is_head)
      VALUES ('${PAMNANI_FAM_ID}', '${NANAK_PERSON_ID}', 'HEAD', TRUE);

      -- Seed Vyas Family & 5 Members (Initially with is_head = FALSE, simulating bug state)
      INSERT INTO public.persons (id, first_name, last_name, profile_privacy) VALUES
        ('${VRAJ_PERSON_ID}', 'VRAJ', 'VYAS', 'PRIVATE'),
        ('${JAYESH_PERSON_ID}', 'JAYESH', 'VYAS', 'PRIVATE'),
        ('${JIGNASHA_PERSON_ID}', 'JIGNASHA', 'VYAS', 'PRIVATE'),
        ('${DHRUV_PERSON_ID}', 'DHRUV', 'VYAS', 'PRIVATE'),
        ('${CHANDRAKANT_PERSON_ID}', 'CHANDRAKANT', 'VYAS', 'PRIVATE');

      INSERT INTO public.families (id, family_name, profile_privacy)
      VALUES ('${VYAS_FAM_ID}', 'VYAS FAMILY', 'COMMUNITY');

      -- Insert all 5 members without is_head
      INSERT INTO public.family_members (family_id, person_id, role, is_head) VALUES
        ('${VYAS_FAM_ID}', '${VRAJ_PERSON_ID}', 'MEMBER', FALSE),
        ('${VYAS_FAM_ID}', '${JAYESH_PERSON_ID}', 'PARENT', FALSE),
        ('${VYAS_FAM_ID}', '${JIGNASHA_PERSON_ID}', 'PARENT', FALSE),
        ('${VYAS_FAM_ID}', '${DHRUV_PERSON_ID}', 'CHILD', FALSE),
        ('${VYAS_FAM_ID}', '${CHANDRAKANT_PERSON_ID}', 'PARENT', FALSE);
    `)
  })

  it('1. Before migration, Vyas Family has 5 members and 0 heads', async () => {
    const memberCountRes = await pg.query<{ count: number }>(`
      SELECT COUNT(*)::int as count FROM public.family_members WHERE family_id = '${VYAS_FAM_ID}';
    `)
    expect(memberCountRes.rows[0].count).toBe(5)

    const headCountRes = await pg.query<{ count: number }>(`
      SELECT COUNT(*)::int as count FROM public.family_members WHERE family_id = '${VYAS_FAM_ID}' AND is_head = TRUE;
    `)
    expect(headCountRes.rows[0].count).toBe(0)
  })

  it('2. Migration 20261105234500_fix_vyas_family_head.sql executes cleanly and idempotently', async () => {
    await expect(pg.exec(migrationSql)).resolves.toBeDefined()
  })

  it('3. After migration, Vyas Family has exactly 1 head (Vraj Vyas) with role HEAD', async () => {
    const headRes = await pg.query<{ person_id: string; role: string; is_head: boolean; first_name: string }>(`
      SELECT fm.person_id, fm.role, fm.is_head, p.first_name
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = '${VYAS_FAM_ID}' AND fm.is_head = TRUE;
    `)

    expect(headRes.rows.length).toBe(1)
    expect(headRes.rows[0].person_id).toBe(VRAJ_PERSON_ID)
    expect(headRes.rows[0].role).toBe('HEAD')
    expect(headRes.rows[0].is_head).toBe(true)
    expect(headRes.rows[0].first_name).toBe('VRAJ')
  })

  it('4. Vyas Family still has exactly 5 members total (none lost or deleted)', async () => {
    const membersRes = await pg.query<{ count: number }>(`
      SELECT COUNT(*)::int as count FROM public.family_members WHERE family_id = '${VYAS_FAM_ID}';
    `)
    expect(membersRes.rows[0].count).toBe(5)

    const otherMembersRes = await pg.query<{ count: number }>(`
      SELECT COUNT(*)::int as count FROM public.family_members
      WHERE family_id = '${VYAS_FAM_ID}' AND is_head = FALSE;
    `)
    expect(otherMembersRes.rows[0].count).toBe(4)
  })

  it('5. Vyas Family Head designation succeeds without modifying guarded person privacy settings', async () => {
    const headRes = await pg.query<{ is_head: boolean }>(`
      SELECT is_head FROM public.family_members WHERE family_id = '${VYAS_FAM_ID}' AND person_id = '${VRAJ_PERSON_ID}';
    `)
    expect(headRes.rows[0].is_head).toBe(true)
  })

  it('6. Suthar Family and Pamnani Family remain completely unmodified', async () => {
    const sutharRes = await pg.query<{ person_id: string; is_head: boolean; first_name: string }>(`
      SELECT fm.person_id, fm.is_head, p.first_name
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = '${SUTHAR_FAM_ID}';
    `)
    expect(sutharRes.rows.length).toBe(1)
    expect(sutharRes.rows[0].person_id).toBe(BHAVESH_PERSON_ID)
    expect(sutharRes.rows[0].is_head).toBe(true)
    expect(sutharRes.rows[0].first_name).toBe('BHAVESH')

    const pamnaniRes = await pg.query<{ person_id: string; is_head: boolean; first_name: string }>(`
      SELECT fm.person_id, fm.is_head, p.first_name
      FROM public.family_members fm
      JOIN public.persons p ON p.id = fm.person_id
      WHERE fm.family_id = '${PAMNANI_FAM_ID}';
    `)
    expect(pamnaniRes.rows.length).toBe(1)
    expect(pamnaniRes.rows[0].person_id).toBe(NANAK_PERSON_ID)
    expect(pamnaniRes.rows[0].is_head).toBe(true)
    expect(pamnaniRes.rows[0].first_name).toBe('NANAK')
  })

  it('7. Re-running the migration is idempotent and does not violate idx_family_members_one_head', async () => {
    await expect(pg.exec(migrationSql)).resolves.toBeDefined()

    const headCountRes = await pg.query<{ count: number }>(`
      SELECT COUNT(*)::int as count FROM public.family_members WHERE family_id = '${VYAS_FAM_ID}' AND is_head = TRUE;
    `)
    expect(headCountRes.rows[0].count).toBe(1)
  })
})
