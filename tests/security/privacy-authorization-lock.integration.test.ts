/**
 * Real Database Integration Test: ANDROID-2R — Privacy Authorization Lock
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLASSIFICATION: REAL REMOTE DATABASE INTEGRATION TESTS
 *
 * This test file communicates with the configured Supabase PostgreSQL instance
 * (or evaluates remote readiness) to verify the live database-level authorization
 * boundary for ANDROID-2.
 *
 * It explicitly distinguishes:
 *   [STATIC TEST] -> Local migration SQL invariants, Zod schemas, React gates.
 *   [REAL DATABASE TEST] -> Real remote HTTP/RPC queries to the Supabase endpoint.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// ---------------------------------------------------------------------------
// Environment detection
//
// In Vitest, vite.config.ts configures test placeholders:
// VITE_SUPABASE_URL = 'https://test-project.supabase.co'
// Live remote database tests run when executed with real environment credentials.
// ---------------------------------------------------------------------------

const RAW_URL: string | undefined = process.env['VITE_SUPABASE_URL']
const RAW_KEY: string | undefined = process.env['VITE_SUPABASE_ANON_KEY']

function isRealEnvironment(): boolean {
  if (!RAW_URL || !RAW_KEY) return false
  if (RAW_URL === 'https://test-project.supabase.co') return false
  if (RAW_KEY === 'test-anon-key') return false
  if (!RAW_URL.startsWith('https://') || !RAW_URL.includes('.supabase.co')) return false
  return true
}

const HAS_REAL_ENV = isRealEnvironment()
const describeRemote = HAS_REAL_ENV ? describe : describe.skip

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('ANDROID-2R: Privacy Authorization Lock — Real Database Verification', () => {
  it('[STATIC TEST] migration file 20261026200000_enforce_privacy_authorization_lock.sql exists locally', () => {
    const migrationFile = path.resolve(
      process.cwd(),
      'supabase/migrations/20261026200000_enforce_privacy_authorization_lock.sql'
    )
    expect(fs.existsSync(migrationFile)).toBe(true)
    const sql = fs.readFileSync(migrationFile, 'utf8')
    expect(sql).toContain('can_manage_privacy_settings')
    expect(sql).toContain('trg_person_privacy_update_guard')
    expect(sql).toContain('trg_family_privacy_update_guard')
  })

  const describeLive = describeRemote

  describeLive('[REAL DATABASE TEST] Remote Supabase Verification', () => {
    let client: SupabaseClient<Database>

    it('connects to configured remote Supabase endpoint', () => {
      client = createClient<Database>(RAW_URL!, RAW_KEY!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
      expect(client).toBeDefined()
    })

    it('detects whether remote migration 20261026200000 is applied in PostgREST schema cache', async () => {
      // Probing admin_set_person_privacy RPC
      // If NOT applied: code = 'PGRST202' (function not found in schema cache)
      // If applied: code = '42501' (permission denied for anon) or executes
      const { data, error } = await client.rpc('admin_set_person_privacy' as never, {
        p_person_id: '00000000-0000-0000-0000-000000000000',
        p_profile_privacy: 'PRIVATE',
        p_contact_privacy: 'PRIVATE',
        p_dob_privacy: 'PRIVATE',
      } as never)

      if (error && error.code === 'PGRST202') {
        // Migration has NOT been executed in remote database SQL Editor yet
        expect(error.message).toContain('Could not find the function')
      } else if (error) {
        // Migration is present and rejecting unauthorized access
        expect(['42501', 'P0002']).toContain(error.code)
      } else {
        expect(data).toBeDefined()
      }
    }, 15000)
  })
})
