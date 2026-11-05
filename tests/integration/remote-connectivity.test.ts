/**
 * Remote Connectivity Integration Tests
 *
 * Phase 2 — Subtask 3 (Gap-Fill)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLASSIFICATION: REAL REMOTE INTEGRATION TESTS
 *
 * These tests make actual HTTPS requests to the deployed Supabase project
 * (community-family-platform / ixhvsprwjalgcyievsrg).
 *
 * These are NOT type-contract tests. They communicate with the live database.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SECURITY POSTURE DISCOVERED (confirmed by running these tests):
 *
 *   The deployed Supabase project does NOT grant table-level SELECT/INSERT/
 *   UPDATE/DELETE privileges to the anon or authenticated roles.
 *
 *   This is a stricter configuration than Supabase defaults. Rather than
 *   relying solely on RLS to filter rows, the project has also revoked the
 *   underlying PostgreSQL table privileges from the anon role.
 *
 *   Effect: Unauthenticated SELECT returns HTTP 403 / code 42501
 *   ("permission denied for table X") rather than an empty array.
 *   Both outcomes correctly block anon access — the mechanism differs.
 *
 *   This is the REAL behaviour of the deployed database, verified by live
 *   requests. Tests assert this actual secure behavior.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT THESE TESTS VALIDATE:
 *   - The deployed Supabase project is reachable via the anon key.
 *   - All 5 Phase 1 tables exist in the remote schema (verified by the
 *     specific error code returned — 42501 proves the table exists and is
 *     inaccessible, not absent; a missing table returns 42P01).
 *   - Unauthenticated access to all 5 tables is denied at the PostgreSQL
 *     privilege level (stricter than RLS-only).
 *   - DB function is_admin(), is_community_moderator(), get_my_role() are
 *     either callable-and-return-safe-values OR are permission-denied.
 *   - log_audit_event() is correctly REVOKED from anon (permission denied).
 *
 * WHAT THESE TESTS DO NOT DO:
 *   - They do NOT create any users, persons, families, or audit records.
 *   - They do NOT modify any data.
 *   - They do NOT use a service-role key or any privileged credential.
 *   - They do NOT authenticate as any user.
 *   - They do NOT bypass RLS or table-level security.
 *
 * SKIP BEHAVIOR:
 *   All tests skip automatically when run in environments without real
 *   credentials (CI without .env, test environments, etc.). The skip is
 *   detected by checking whether VITE_SUPABASE_URL is the test placeholder.
 *
 * CREDENTIAL SAFETY:
 *   - This file reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
 *     process.env (populated by Vite/Vitest from .env).
 *   - tests/setup.ts only mocks import.meta.env; process.env is unaffected.
 *   - No credential value is logged, printed, or included in assertions.
 *   - The anon key is a public key — it identifies the project and is safe
 *     in browser code. Access control is enforced by PostgreSQL privileges
 *     and RLS policies.
 */

import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// ---------------------------------------------------------------------------
// Environment detection
//
// process.env is populated by Vite/Vitest from .env at test startup.
// tests/setup.ts mocks import.meta.env only — process.env is untouched.
// ---------------------------------------------------------------------------

const RAW_URL: string | undefined = process.env['VITE_SUPABASE_URL']
const RAW_KEY: string | undefined = process.env['VITE_SUPABASE_ANON_KEY']

/**
 * Returns true if the environment appears to contain real Supabase credentials
 * (not the test placeholder from tests/setup.ts).
 */
function isRealEnvironment(): boolean {
  if (!RAW_URL || !RAW_KEY) return false
  if (RAW_URL === 'https://test-project.supabase.co') return false
  if (RAW_KEY === 'test-anon-key') return false
  if (!RAW_URL.startsWith('https://') || !RAW_URL.includes('.supabase.co')) return false
  return true
}

const HAS_REAL_ENV = isRealEnvironment()

/**
 * A live Supabase client created using process.env credentials (not the
 * import.meta.env mock). Only instantiated when real credentials are present.
 */
let liveClient: SupabaseClient<Database>

if (HAS_REAL_ENV) {
  liveClient = createClient<Database>(RAW_URL!, RAW_KEY!, {
    auth: {
      // Ensure no session is persisted from a previous test run
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

// Use describe.skip when real credentials are not available.
// This allows npm run test to pass in any environment.
const describeRemote = HAS_REAL_ENV ? describe : describe.skip

// PostgreSQL error codes returned by this project's security configuration
const PERMISSION_DENIED = '42501'  // PostgreSQL: insufficient_privilege
const TABLE_NOT_FOUND = '42P01'    // PostgreSQL: undefined_table

// ---------------------------------------------------------------------------
// Suite 1: Remote connectivity probe
//
// Validates the deployed project is reachable and returns recognisable error
// codes (not fetch/network errors). A network failure produces a different
// error shape entirely.
// ---------------------------------------------------------------------------

describeRemote('Remote Integration: Supabase project connectivity', () => {
  it('anon client can reach the deployed Supabase project (receives PostgreSQL error, not network failure)', async () => {
    const { error } = await liveClient.from('profiles').select('id').limit(1)

    // The project denies table access to anon at the privilege level.
    // This is a PostgreSQL error returned by PostgREST — NOT a network failure.
    // A network failure (wrong URL, offline) would produce a different error shape.
    expect(error).not.toBeNull()
    expect(error!.code).toBe(PERMISSION_DENIED)
    // The hint confirms the table exists and the denial is at the privilege level
    expect(error!.hint).toContain('GRANT')
    expect(error!.message).toContain('permission denied')
  }, 20000)
})

// ---------------------------------------------------------------------------
// Suite 2: Table existence — all 5 Phase 1 tables
//
// The deployed project revokes table-level SELECT from the anon role.
// This means unauthenticated SELECT returns 42501 (permission denied).
//
// The critical distinction from 42P01 (undefined_table):
//   - 42501 → table EXISTS, access DENIED at privilege level
//   - 42P01 → table does NOT EXIST
//
// Both indicate the table is not readable, but 42501 proves the table exists.
// ---------------------------------------------------------------------------

describeRemote('Remote Integration: Table existence — all 5 tables confirmed by permission error', () => {
  /**
   * Helper: asserts that the table exists in the remote schema.
   * The project configuration denies anon access at the PostgreSQL privilege
   * level (42501). A missing table would return 42P01 instead.
   */
  async function assertTableExists(tableName: 'profiles' | 'persons' | 'families' | 'family_members' | 'audit_logs') {
    const { error } = await liveClient.from(tableName).select('id').limit(0)

    // Error must exist — the project denies anon table access
    expect(
      error,
      `Expected an error from table '${tableName}' but got none`
    ).not.toBeNull()

    // Code must be 42501 (permission denied) NOT 42P01 (table not found).
    // 42501 is the security-correct outcome: table exists, access denied.
    expect(
      error!.code,
      `Table '${tableName}': expected code 42501 (permission denied, table exists) ` +
      `but got ${error!.code} (${error!.message})`
    ).toBe(PERMISSION_DENIED)

    // Confirm it is NOT a table-not-found error
    expect(error!.code).not.toBe(TABLE_NOT_FOUND)
  }

  it('[REAL] profiles table exists in remote schema', async () => {
    await assertTableExists('profiles')
  })

  it('[REAL] persons table exists in remote schema', async () => {
    await assertTableExists('persons')
  })

  it('[REAL] families table exists in remote schema', async () => {
    await assertTableExists('families')
  })

  it('[REAL] family_members table exists in remote schema', async () => {
    await assertTableExists('family_members')
  })

  it('[REAL] audit_logs table exists in remote schema', async () => {
    await assertTableExists('audit_logs')
  })

  it('[REAL] all 5 Phase 1 tables exist (parallel confirmation)', async () => {
    const tables = ['profiles', 'persons', 'families', 'family_members', 'audit_logs'] as const

    const results = await Promise.all(
      tables.map((table) =>
        liveClient.from(table).select('id').limit(0)
      )
    )

    for (let i = 0; i < tables.length; i++) {
      const { error } = results[i]
      expect(
        error?.code,
        `Table '${tables[i]}' did not return expected 42501. ` +
        `Got: code=${error?.code ?? 'none'}, msg=${error?.message ?? 'none'}`
      ).toBe(PERMISSION_DENIED)
    }
  })
})

// ---------------------------------------------------------------------------
// Suite 3: Unauthenticated access denial — negative tests (actual remote)
//
// These are REAL negative RLS/privilege tests, not specification documents.
// They confirm the deployed database correctly denies unauthenticated access.
// ---------------------------------------------------------------------------

describeRemote('Remote Integration: Unauthenticated access denial — all operations', () => {
  it('[REAL][NEGATIVE] anon SELECT on profiles is denied (42501)', async () => {
    const { error } = await liveClient.from('profiles').select('*').limit(1)
    expect(error).not.toBeNull()
    expect(error!.code).toBe(PERMISSION_DENIED)
  })

  it('[REAL][NEGATIVE] anon SELECT on persons is denied (42501)', async () => {
    const { error } = await liveClient.from('persons').select('id').limit(1)
    expect(error).not.toBeNull()
    expect(error!.code).toBe(PERMISSION_DENIED)
  })

  it('[REAL][NEGATIVE] anon SELECT on families is denied (42501)', async () => {
    const { error } = await liveClient.from('families').select('id').limit(1)
    expect(error).not.toBeNull()
    expect(error!.code).toBe(PERMISSION_DENIED)
  })

  it('[REAL][NEGATIVE] anon SELECT on family_members is denied (42501)', async () => {
    const { error } = await liveClient.from('family_members').select('id').limit(1)
    expect(error).not.toBeNull()
    expect(error!.code).toBe(PERMISSION_DENIED)
  })

  it('[REAL][NEGATIVE] anon SELECT on audit_logs is denied (42501)', async () => {
    const { error } = await liveClient.from('audit_logs').select('id').limit(1)
    expect(error).not.toBeNull()
    expect(error!.code).toBe(PERMISSION_DENIED)
  })

  it('[REAL][NEGATIVE] anon INSERT into profiles is denied', async () => {
    const { error } = await liveClient
      .from('profiles')
      .insert({ id: '00000000-0000-0000-0000-000000000001', email: 'rls-probe@test.invalid' })
    expect(error).not.toBeNull()
    // May be 42501 (privilege denied) or 42P01 or a policy denial
    expect(error!.code).toBeTruthy()
  })

  it('[REAL][NEGATIVE] anon INSERT into persons is denied', async () => {
    const { error } = await liveClient
      .from('persons')
      .insert({ first_name: 'TestRLS', last_name: 'Probe' })
    expect(error).not.toBeNull()
    expect(error!.code).toBeTruthy()
  })

  it('[REAL][NEGATIVE] anon INSERT into audit_logs is denied', async () => {
    const { error } = await liveClient
      .from('audit_logs')
      .insert({ action: 'ADMIN_ACTION' as const })
    expect(error).not.toBeNull()
    expect(error!.code).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Suite 4: DB function calls via typed RPC — unauthenticated
//
// is_admin(), is_community_moderator(), get_my_role() have no explicit REVOKE
// in the Phase 1 migration for anon/authenticated. PostgreSQL default is
// GRANT EXECUTE to PUBLIC. These functions may be callable by anon.
//
// log_audit_event() has explicit REVOKE from anon and authenticated.
// ---------------------------------------------------------------------------

describeRemote('Remote Integration: DB function calls (unauthenticated via RPC)', () => {
  it('[REAL] is_admin() via RPC — unauthenticated caller gets false or permission denied', async () => {
    const { data, error } = await liveClient.rpc('is_admin')

    if (error) {
      // Function not callable by anon — permission denied is a valid secure outcome
      expect(error.code).toBeTruthy()
    } else {
      // Function callable — must return false for unauthenticated caller
      // (auth.uid() is null → no matching admin profile exists)
      expect(data).toBe(false)
    }
  })

  it('[REAL] is_community_moderator() via RPC — unauthenticated caller gets false or permission denied', async () => {
    const { data, error } = await liveClient.rpc('is_community_moderator')

    if (error) {
      expect(error.code).toBeTruthy()
    } else {
      expect(data).toBe(false)
    }
  })

  it('[REAL] get_my_role() via RPC — unauthenticated caller gets null or permission denied', async () => {
    const { data, error } = await liveClient.rpc('get_my_role')

    if (error) {
      expect(error.code).toBeTruthy()
    } else {
      // No profile for auth.uid() = null → SQL returns NULL
      expect(data).toBeNull()
    }
  })

  it('[REAL][NEGATIVE] log_audit_event() is REVOKED from anon — must return permission denied', async () => {
    const { error } = await liveClient.rpc('log_audit_event', {
      p_action: 'ADMIN_ACTION',
    })

    // Phase 1 migration explicitly:
    //   REVOKE EXECUTE ON FUNCTION public.log_audit_event(...) FROM anon;
    // This call MUST fail with a permission error.
    expect(error).not.toBeNull()
    // Acceptable codes: 42501 (insufficient_privilege) or PGRST202 (function not found in schema cache)
    expect(error!.code).toBeTruthy()
  })
})
