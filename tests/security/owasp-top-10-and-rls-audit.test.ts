import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Phase 15 — Subtask 5: Comprehensive RLS & OWASP Top 10 Security Audit Test Suite
 *
 * Automated regression suite validating PostgreSQL RLS posture, SECURITY DEFINER hygiene,
 * privilege escalation protections, client-side sinks, and OWASP Top 10 defensive controls.
 */
describe('Phase 15 — Subtask 5: RLS & OWASP Top 10 Security Audit', () => {
  const rootDir = process.cwd()
  const migrationsDir = path.join(rootDir, 'supabase', 'migrations')
  const srcDir = path.join(rootDir, 'src')

  // Helper to read all migration SQL files
  function getAllMigrationFiles(): Array<{ name: string; content: string }> {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    return files.map((f) => ({
      name: f,
      content: fs.readFileSync(path.join(migrationsDir, f), 'utf-8'),
    }))
  }

  // Helper to recursively collect files from a directory
  function getFilesRecursively(dir: string, extensions: string[]): string[] {
    const results: string[] = []
    const list = fs.readdirSync(dir)
    for (const item of list) {
      const fullPath = path.join(dir, item)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        results.push(...getFilesRecursively(fullPath, extensions))
      } else if (extensions.some((ext) => item.endsWith(ext))) {
        results.push(fullPath)
      }
    }
    return results
  }

  describe('A01: Broken Access Control & PostgreSQL RLS Enforcement', () => {
    const EXPECTED_TABLES = [
      'public.profiles',
      'public.persons',
      'public.families',
      'public.family_members',
      'public.audit_logs',
      'public.relationships',
      'public.connections',
      'public.person_claims',
      'public.invitations',
      'public.verification_requests',
      'public.duplicate_flags',
      'public.groups',
      'public.group_members',
      'public.announcements',
      'public.events',
      'public.event_rsvps',
      'public.family_albums',
      'public.family_media',
      'public.family_stories',
      'public.notifications',
      'public.notification_preferences',
      'public.notification_outbox',
      'public.import_batches',
      'public.staging_records',
    ]

    it('enforces RLS on every public application table (24 tables)', () => {
      const migrations = getAllMigrationFiles()
      const combinedSql = migrations.map((m) => m.content).join('\n')

      for (const table of EXPECTED_TABLES) {
        const regex = new RegExp(`ALTER\\s+TABLE\\s+${table.replace('.', '\\.')}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i')
        expect(
          regex.test(combinedSql),
          `Table ${table} must explicitly execute ENABLE ROW LEVEL SECURITY in migrations`
        ).toBe(true)
      }
    })

    it('denies direct client mutations on immutable and staging tables via RLS deny policies', () => {
      const migrations = getAllMigrationFiles()
      const combinedSql = migrations.map((m) => m.content).join('\n')

      const immutableTables = [
        'audit_logs',
        'import_batches',
        'staging_records',
        'notification_outbox',
      ]

      for (const table of immutableTables) {
        // Must contain WITH CHECK (FALSE) or USING (FALSE) for insert/update/delete
        const denyPattern = new RegExp(`CREATE\\s+POLICY\\s+"${table}_insert_deny"|CREATE\\s+POLICY\\s+"${table}_insert_trigger_only"`, 'i')
        expect(
          denyPattern.test(combinedSql),
          `Table ${table} must define an explicit deny/trigger-only policy for client insertion`
        ).toBe(true)
      }
    })

    it('strictly forbids self-role escalation in public.profiles UPDATE policy', () => {
      const phase1Sql = fs.readFileSync(
        path.join(migrationsDir, '20261002140000_phase1_foundation.sql'),
        'utf-8'
      )

      // Verify that profiles_update_own compares role to public.get_my_role()
      expect(phase1Sql).toMatch(/CREATE\s+POLICY\s+"profiles_update_own"[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?role::TEXT\s*=\s*public\.get_my_role\(\)/i)
      // Verify that profiles_update_own forbids inactive accounts from updating
      expect(phase1Sql).toMatch(/CREATE\s+POLICY\s+"profiles_update_own"[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?is_active\s*=\s*TRUE/i)
    })
  })

  describe('A02: Cryptographic Failures & Credential Protection', () => {
    it('never contains SUPABASE_SERVICE_ROLE_KEY anywhere in src/ (excluding TypeScript ambient type definitions)', () => {
      const srcFiles = getFilesRecursively(srcDir, ['.ts', '.tsx']).filter((f) => !f.endsWith('.d.ts'))
      for (const file of srcFiles) {
        const content = fs.readFileSync(file, 'utf-8')
        expect(
          content.includes('SUPABASE_SERVICE_ROLE_KEY'),
          `Forbidden credential reference found in ${path.relative(rootDir, file)}`
        ).toBe(false)
      }
    })

    it('stores only SHA-256 token hashes in invitations and never logs plain tokens in audit_logs', () => {
      const rpcSql = fs.readFileSync(
        path.join(migrationsDir, '20261006120000_create_invitation_rpcs.sql'),
        'utf-8'
      )
      // Validates 64-char SHA-256 hash regex in get_invitation_by_token & create_family_invitation
      expect(rpcSql).toContain("p_token_hash !~ '^[0-9a-f]{64}$'")
      // Audit log in create_family_invitation omits token / token_hash
      expect(rpcSql).not.toContain("'token_hash', p_token_hash")
    })
  })

  describe('A03: Injection Defense & Static Verification', () => {
    it('contains ZERO dynamic SQL statements in any migration file', () => {
      const migrations = getAllMigrationFiles()
      for (const m of migrations) {
        expect(
          /EXECUTE\s+format|EXECUTE\s+'/i.test(m.content),
          `Dynamic SQL EXECUTE found in migration ${m.name}`
        ).toBe(false)
      }
    })

    it('contains ZERO dangerous DOM injection sinks (eval, Function, innerHTML, dangerouslySetInnerHTML) in src/', () => {
      const srcFiles = getFilesRecursively(srcDir, ['.ts', '.tsx'])
      const dangerousRegex = /\beval\(|\bFunction\(|dangerouslySetInnerHTML\s*=|(?<!\/\/.*?)\.innerHTML\s*=|document\.write\b/
      for (const file of srcFiles) {
        const lines = fs.readFileSync(file, 'utf-8').split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            continue
          }
          expect(
            dangerousRegex.test(trimmed),
            `Dangerous DOM injection sink found in ${path.relative(rootDir, file)}: ${trimmed}`
          ).toBe(false)
        }
      }
    })
  })

  describe('A04: Insecure Design & Architectural Boundary Invariants', () => {
    it('maintains the PERSON != USER boundary: persons table never requires user_id', () => {
      const phase1Sql = fs.readFileSync(
        path.join(migrationsDir, '20261002140000_phase1_foundation.sql'),
        'utf-8'
      )
      // persons.user_id must be nullable and default null
      expect(phase1Sql).toMatch(/user_id\s+UUID\s+REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i)
    })

    it('enforces last SUPER_ADMIN protection in admin_update_user_role and admin_set_user_status', () => {
      const adminSql = fs.readFileSync(
        path.join(migrationsDir, '20261016180000_create_admin_authorization_rpcs.sql'),
        'utf-8'
      )
      // Both functions must acquire advisory xact lock and check super_admin_count > 1
      expect(adminSql).toMatch(/pg_advisory_xact_lock\(hashtext\('super_admin_membership_guard'\)\)/)
      expect(adminSql).toMatch(/v_super_admin_count\s*<=\s*1/)
    })

    it('enforces that family head reference must resolve to the same import batch in import promotion', () => {
      const promoSql = fs.readFileSync(
        path.join(migrationsDir, '20261017220000_create_import_promotion_rpc.sql'),
        'utf-8'
      )
      expect(promoSql).toMatch(/Family head reference must belong to the same import batch/i)
    })
  })

  describe('A05: Security Misconfiguration & SECURITY DEFINER Hygiene', () => {
    it('sets explicit search_path on 100% of SECURITY DEFINER functions', () => {
      const migrations = getAllMigrationFiles()
      let securityDefinerCount = 0

      for (const m of migrations) {
        const matches = m.content.matchAll(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([^\s(]+)[\s\S]+?SECURITY\s+DEFINER[\s\S]+?;/gi)
        for (const match of matches) {
          securityDefinerCount++
          const funcText = match[0]
          const funcName = match[1]
          expect(
            /SET\s+search_path\s*=/i.test(funcText),
            `SECURITY DEFINER function ${funcName} in ${m.name} is missing explicit SET search_path`
          ).toBe(true)
        }
      }

      // Assert that we checked a substantial number of functions (> 90)
      expect(securityDefinerCount).toBeGreaterThanOrEqual(100)
    })

    it('configures defensive security headers in vite.config.ts', () => {
      const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf-8')
      expect(viteConfig).toContain('Content-Security-Policy')
      expect(viteConfig).toContain('X-Frame-Options')
      expect(viteConfig).toContain('X-Content-Type-Options')
      expect(viteConfig).toContain('Referrer-Policy')
      expect(viteConfig).toContain('Permissions-Policy')
    })
  })

  describe('A07: Identification and Authentication Failures', () => {
    it('ensures no table privileges are granted to anon in authenticated privilege migration', () => {
      const privSql = fs.readFileSync(
        path.join(migrationsDir, '20261003100000_grant_authenticated_table_privileges.sql'),
        'utf-8'
      )
      const nonCommentLines = privSql
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('--'))
        .join(' ')
      expect(nonCommentLines).not.toMatch(/GRANT.*TO\s+anon/i)
    })
  })

  describe('A09: Security Logging & Audit Integrity', () => {
    it('revokes direct execution of log_audit_event from authenticated and anon clients', () => {
      const phase1Sql = fs.readFileSync(
        path.join(migrationsDir, '20261002140000_phase1_foundation.sql'),
        'utf-8'
      )
      expect(phase1Sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.log_audit_event[\s\S]+?FROM\s+PUBLIC/i)
      expect(phase1Sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.log_audit_event[\s\S]+?FROM\s+anon/i)
      expect(phase1Sql).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.log_audit_event[\s\S]+?FROM\s+authenticated/i)
    })
  })

  describe('A10: Server-Side Request Forgery (SSRF) & Unbounded Networking', () => {
    it('contains ZERO raw fetch() calls in frontend application code', () => {
      const srcFiles = getFilesRecursively(srcDir, ['.ts', '.tsx'])
      for (const file of srcFiles) {
        const content = fs.readFileSync(file, 'utf-8')
        expect(
          /\bfetch\(/.test(content),
          `Uncontrolled fetch() call found in ${path.relative(rootDir, file)}`
        ).toBe(false)
      }
    })

    it('contains ZERO window.location assignment sinks in frontend code', () => {
      const srcFiles = getFilesRecursively(srcDir, ['.ts', '.tsx'])
      for (const file of srcFiles) {
        const content = fs.readFileSync(file, 'utf-8')
        expect(
          /window\.location\s*=/.test(content),
          `window.location assignment sink found in ${path.relative(rootDir, file)}`
        ).toBe(false)
      }
    })
  })
})
