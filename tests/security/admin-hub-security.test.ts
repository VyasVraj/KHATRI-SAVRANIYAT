/**
 * Security Tests: Admin Hub & Layout Access Boundaries (Phase 13 Subtask 2)
 *
 * Verifies:
 * 1. Client-Side Secret Isolation & Hygiene (No service_role key anywhere in src/)
 * 2. Server-Authoritative RPC Invariants (No direct profiles mutations in client code)
 * 3. Architectural Boundary: PERSON != USER (Accounts and census persons are strictly separated)
 * 4. Route Protection Hierarchy (AdminRoute restricts to PLATFORM_ADMIN_ROLES, blocks moderators & members)
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { PLATFORM_ADMIN_ROLES, ADMIN_ROLES, ROUTES } from '@/constants/app'

describe('Admin Hub & Layout Security Boundaries (Phase 13 Subtask 2)', () => {
  const srcDir = path.resolve(__dirname, '../../src')

  it('never references SUPABASE_SERVICE_ROLE_KEY anywhere in client-side code', () => {
    function scanDir(dir: string): string[] {
      let files: string[] = []
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          files = files.concat(scanDir(fullPath))
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath)
        }
      }
      return files
    }

    const allSourceFiles = scanDir(srcDir)
    expect(allSourceFiles.length).toBeGreaterThan(0)

    for (const file of allSourceFiles) {
      if (file.endsWith('.d.ts')) continue
      const content = fs.readFileSync(file, 'utf-8')
      expect(
        content.includes('SUPABASE_SERVICE_ROLE_KEY'),
        `Security violation: SUPABASE_SERVICE_ROLE_KEY referenced in ${path.relative(process.cwd(), file)}`
      ).toBe(false)
      expect(
        content.toLowerCase().includes('service_role_key'),
        `Security violation: service_role_key referenced in ${path.relative(process.cwd(), file)}`
      ).toBe(false)
    }
  })

  it('never directly performs UPDATE or DELETE on profiles table in admin client code', () => {
    const adminFeatureDir = path.join(srcDir, 'features/admin')
    const files = fs.readdirSync(adminFeatureDir, { recursive: true }) as string[]

    for (const relPath of files) {
      const fullPath = path.join(adminFeatureDir, relPath)
      if (fs.statSync(fullPath).isFile() && /\.(ts|tsx)$/.test(relPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8')
        expect(content).not.toMatch(/\.from\(['"]profiles['"]\)\.update\(/)
        expect(content).not.toMatch(/\.from\(['"]profiles['"]\)\.delete\(/)
        expect(content).not.toMatch(/\.from\(['"]duplicate_flags['"]\)\.update\(/)
        expect(content).not.toMatch(/\.from\(['"]duplicate_flags['"]\)\.delete\(/)
      }
    }
  })

  it('routes platform metrics strictly through security-definer RPC admin_get_platform_metrics', () => {
    const adminServiceFile = path.join(srcDir, 'features/admin/services/admin.service.ts')
    const content = fs.readFileSync(adminServiceFile, 'utf-8')

    expect(content).toMatch(/admin_get_platform_metrics/)
    // Never queries raw auth.users, profiles, or persons tables directly for platform stats
    const getPlatformMetricsFn = content.slice(
      content.indexOf('getPlatformMetrics'),
      content.indexOf('listAdminUsers') !== -1 ? content.indexOf('listAdminUsers') : undefined
    )
    expect(getPlatformMetricsFn).not.toMatch(/\.from\(['"]auth\.users['"]\)/)
    expect(getPlatformMetricsFn).not.toMatch(/\.from\(['"]profiles['"]\)/)
    expect(getPlatformMetricsFn).not.toMatch(/\.from\(['"]persons['"]\)/)
  })

  it('enforces PERSON != USER distinction in platform metrics interface', () => {
    const typesFile = path.join(srcDir, 'features/admin/types.ts')
    const content = fs.readFileSync(typesFile, 'utf-8')

    // Verifies distinct fields for users (accounts) and persons (census)
    expect(content).toMatch(/total_users:\s*number/)
    expect(content).toMatch(/active_users:\s*number/)
    expect(content).toMatch(/total_persons:\s*number/)
    expect(content).toMatch(/total_families:\s*number/)
    expect(content).toMatch(/PERSON != USER/i)
  })

  it('strictly restricts PLATFORM_ADMIN_ROLES to SUPER_ADMIN and ADMIN', () => {
    expect(PLATFORM_ADMIN_ROLES).toEqual(['SUPER_ADMIN', 'ADMIN'])
    expect(PLATFORM_ADMIN_ROLES).not.toContain('COMMUNITY_MODERATOR')
    expect(PLATFORM_ADMIN_ROLES).not.toContain('MEMBER')
    expect(PLATFORM_ADMIN_ROLES).not.toContain('GUEST')
    expect(PLATFORM_ADMIN_ROLES).not.toContain('FAMILY_HEAD')
    expect(PLATFORM_ADMIN_ROLES).not.toContain('COMMITTEE_MEMBER')
  })

  it('ensures ADMIN_ROLES contains COMMUNITY_MODERATOR for claim/verification workflows', () => {
    expect(ADMIN_ROLES).toContain('COMMUNITY_MODERATOR')
    expect(ADMIN_ROLES).toContain('ADMIN')
    expect(ADMIN_ROLES).toContain('SUPER_ADMIN')
  })

  it('configures ROUTES.ADMIN and subroutes correctly', () => {
    expect(ROUTES.ADMIN).toBe('/admin')
    expect(ROUTES.ADMIN_USERS).toBe('/admin/users')
    expect(ROUTES.ADMIN_AUDIT).toBe('/admin/audit')
    expect(ROUTES.ADMIN_DUPLICATES).toBe('/admin/duplicates')
    expect(ROUTES.CLAIM_REVIEW_QUEUE).toBe('/admin/claims')
    expect(ROUTES.VERIFICATION_REVIEW_QUEUE).toBe('/admin/verifications')
  })
})
