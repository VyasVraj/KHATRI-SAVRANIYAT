/**
 * Static security tests for invitations domain (Phase 8 — Subtask 4B)
 *
 * Verifies non-negotiable security requirements:
 * 1. No service_role key usage in frontend code or services.
 * 2. No console.log or console.error statements.
 * 3. No direct table writes to invitations (no .from('invitations').insert, update, delete).
 * 4. No Math.random() for token generation.
 * 5. No token_hash or plaintext token persistence in localStorage or sessionStorage.
 * 6. PERSON != USER: No mutation of persons.user_id.
 * 7. INVITATION != CLAIM: No mutation of person_claims.status.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('Invitation Domain Static Security & Architecture Invariants', () => {
  const invitationsDir = path.resolve(__dirname, '../../src/features/invitations')

  function getAllTsFiles(dir: string): string[] {
    const results: string[] = []
    const list = fs.readdirSync(dir)
    for (const file of list) {
      const fullPath = path.join(dir, file)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        results.push(...getAllTsFiles(fullPath))
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(fullPath)
      }
    }
    return results
  }

  const files = getAllTsFiles(invitationsDir)

  it('contains at least 5 implementation files in src/features/invitations', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  it('NEVER uses service_role or SUPABASE_SERVICE_ROLE_KEY', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      expect(content).not.toContain('service_role')
      expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    }
  })

  it('NEVER leaves console.log or console.error in production paths', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      expect(content).not.toContain('console.log(')
      expect(content).not.toContain('console.error(')
    }
  })

  it('NEVER performs direct INSERT, UPDATE, or DELETE on public.invitations', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      expect(content).not.toMatch(/\.from\(['"]invitations['"]\)\.insert/i)
      expect(content).not.toMatch(/\.from\(['"]invitations['"]\)\.update/i)
      expect(content).not.toMatch(/\.from\(['"]invitations['"]\)\.delete/i)
    }
  })

  it('NEVER uses Math.random for token generation', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      expect(content).not.toContain('Math.random')
    }
  })

  it('NEVER persists invitation tokens in localStorage or sessionStorage', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      expect(content).not.toContain('localStorage')
      expect(content).not.toContain('sessionStorage')
    }
  })

  it('NEVER modifies persons.user_id (maintains PERSON != USER boundary)', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      expect(content).not.toMatch(/user_id\s*:\s*[a-zA-Z0-9_]+/i)
      expect(content).not.toMatch(/\.from\(['"]persons['"]\)\.update\(\{[^}]*user_id/i)
    }
  })

  it('NEVER modifies person_claims status (maintains INVITATION != CLAIM boundary)', () => {
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      expect(content).not.toMatch(/\.from\(['"]person_claims['"]\)/i)
      expect(content).not.toContain('approve_person_claim')
    }
  })
})
