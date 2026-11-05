/**
 * Static Security Test: Authenticated Table Privileges Migration
 *
 * Validates that supabase/migrations/20261003100000_grant_authenticated_table_privileges.sql
 * adheres to strict least-privilege security requirements:
 *
 * 1.  profiles grants SELECT + UPDATE to authenticated.
 * 2.  persons grants SELECT + INSERT + UPDATE to authenticated.
 * 3.  families grants SELECT + INSERT + UPDATE to authenticated.
 * 4.  family_members grants SELECT + INSERT + UPDATE + DELETE to authenticated.
 * 5.  audit_logs grants SELECT only to authenticated.
 * 6.  anon is NOT granted any table privileges.
 * 7.  NO 'GRANT ALL' exists.
 * 8.  NO RLS disabling (DISABLE ROW LEVEL SECURITY) exists.
 * 9.  profiles INSERT is NOT granted to authenticated.
 * 10. audit_logs INSERT, UPDATE, DELETE are NOT granted to authenticated.
 * 11. persons DELETE is NOT granted to authenticated.
 * 12. families DELETE is NOT granted to authenticated.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('Security: Authenticated Table Privileges Migration', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/20261003100000_grant_authenticated_table_privileges.sql'
  )

  const content = fs.readFileSync(migrationPath, 'utf-8')

  // Helper to extract non-comment lines
  const sqlCommands = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'))
    .join(' ')

  it('1. profiles grants SELECT and UPDATE to authenticated', () => {
    expect(sqlCommands).toMatch(
      /GRANT\s+SELECT\s*,\s*UPDATE\s+ON\s+TABLE\s+public\.profiles\s+TO\s+authenticated\s*;/i
    )
  })

  it('2. persons grants SELECT, INSERT, UPDATE to authenticated', () => {
    expect(sqlCommands).toMatch(
      /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s+ON\s+TABLE\s+public\.persons\s+TO\s+authenticated\s*;/i
    )
  })

  it('3. families grants SELECT, INSERT, UPDATE to authenticated', () => {
    expect(sqlCommands).toMatch(
      /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s+ON\s+TABLE\s+public\.families\s+TO\s+authenticated\s*;/i
    )
  })

  it('4. family_members grants SELECT, INSERT, UPDATE, DELETE to authenticated', () => {
    expect(sqlCommands).toMatch(
      /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.family_members\s+TO\s+authenticated\s*;/i
    )
  })

  it('5. audit_logs grants SELECT only to authenticated', () => {
    expect(sqlCommands).toMatch(
      /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.audit_logs\s+TO\s+authenticated\s*;/i
    )
  })

  it('6. anon is NOT granted any table privileges', () => {
    expect(sqlCommands).not.toMatch(/TO\s+anon\b/i)
  })

  it('7. NO "GRANT ALL" statement exists', () => {
    expect(sqlCommands).not.toMatch(/GRANT\s+ALL\b/i)
  })

  it('8. NO RLS disabling statement exists', () => {
    expect(sqlCommands).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i)
  })

  it('9. profiles INSERT is NOT granted', () => {
    expect(sqlCommands).not.toMatch(/GRANT[^;]*\bINSERT\b[^;]*ON[^;]*public\.profiles/i)
  })

  it('10. audit_logs INSERT, UPDATE, DELETE are NOT granted', () => {
    expect(sqlCommands).not.toMatch(/GRANT[^;]*\bINSERT\b[^;]*ON[^;]*public\.audit_logs/i)
    expect(sqlCommands).not.toMatch(/GRANT[^;]*\bUPDATE\b[^;]*ON[^;]*public\.audit_logs/i)
    expect(sqlCommands).not.toMatch(/GRANT[^;]*\bDELETE\b[^;]*ON[^;]*public\.audit_logs/i)
  })

  it('11. persons DELETE is NOT granted', () => {
    expect(sqlCommands).not.toMatch(/GRANT[^;]*\bDELETE\b[^;]*ON[^;]*public\.persons/i)
  })

  it('12. families DELETE is NOT granted', () => {
    expect(sqlCommands).not.toMatch(/GRANT[^;]*\bDELETE\b[^;]*ON[^;]*public\.families/i)
  })
})
