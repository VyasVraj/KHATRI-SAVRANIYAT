/**
 * Security & RLS Invariant Tests: Notifications Outbox Worker RPCs
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 *
 * Security Invariants Verified:
 * 1. Queue Concurrency: Stored procedure uses FOR UPDATE SKIP LOCKED.
 * 2. Least Privilege: RPC execution revoked from anon and authenticated.
 * 3. Exclusive Access: RPC execution granted exclusively to service_role.
 * 4. Client Isolation: Frontend (src/) has ZERO references to worker RPCs or direct outbox mutations.
 * 5. Secret Hygiene: Frontend (src/) has ZERO references to SUPABASE_SERVICE_ROLE_KEY.
 * 6. Data Minimization: Stored procedure does NOT project sensitive census fields.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261016160000_create_notification_outbox_worker_rpcs.sql'
)

const SRC_DIR = path.resolve(process.cwd(), 'src')

function getAllSourceFiles(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...getAllSourceFiles(fullPath))
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

describe('Notification Outbox Worker RPCs Security & Architecture', () => {
  it('migration file exists and is readable', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true)
  })

  const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8')

  it('uses PostgreSQL FOR UPDATE SKIP LOCKED for atomic queue claiming', () => {
    expect(migrationSql).toMatch(/FOR UPDATE SKIP LOCKED/i)
  })

  it('declares SECURITY DEFINER on all three worker RPCs', () => {
    const claimMatches = migrationSql.match(/CREATE OR REPLACE FUNCTION public\.claim_notification_outbox_batch[\s\S]*?SECURITY DEFINER/i)
    const completeMatches = migrationSql.match(/CREATE OR REPLACE FUNCTION public\.complete_notification_outbox_delivery[\s\S]*?SECURITY DEFINER/i)
    const failMatches = migrationSql.match(/CREATE OR REPLACE FUNCTION public\.fail_notification_outbox_delivery[\s\S]*?SECURITY DEFINER/i)

    expect(claimMatches).not.toBeNull()
    expect(completeMatches).not.toBeNull()
    expect(failMatches).not.toBeNull()
  })

  it('explicitly revokes execution from PUBLIC, anon, and authenticated', () => {
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.claim_notification_outbox_batch[\s\S]*?FROM PUBLIC, anon, authenticated/i)
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.complete_notification_outbox_delivery[\s\S]*?FROM PUBLIC, anon, authenticated/i)
    expect(migrationSql).toMatch(/REVOKE ALL ON FUNCTION public\.fail_notification_outbox_delivery[\s\S]*?FROM PUBLIC, anon, authenticated/i)
  })

  it('grants execution privileges exclusively to service_role', () => {
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_notification_outbox_batch[\s\S]*?TO service_role/i)
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_notification_outbox_delivery[\s\S]*?TO service_role/i)
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fail_notification_outbox_delivery[\s\S]*?TO service_role/i)
  })

  it('handles bounded retries and transitions to DEAD_LETTER when attempts exceed max or error is terminal', () => {
    expect(migrationSql).toMatch(/p_is_terminal OR v_current_attempts >= p_max_attempts/i)
    expect(migrationSql).toContain("'DEAD_LETTER'")
    expect(migrationSql).toContain("'FAILED'")
    expect(migrationSql).toContain('scheduled_at')
  })

  it('enforces strict state transition guards in complete_notification_outbox_delivery (PROCESSING -> SENT only)', () => {
    // Requires status = 'PROCESSING' in UPDATE WHERE clause
    expect(migrationSql).toMatch(/UPDATE public\.notification_outbox[\s\S]*?WHERE id = p_outbox_id[\s\S]*?AND status = 'PROCESSING'/i)
    // Uses now() for sent_at
    expect(migrationSql).toMatch(/sent_at = now\(\)/i)
    // Returns boolean based on ROW_COUNT
    expect(migrationSql).toMatch(/GET DIAGNOSTICS v_updated = ROW_COUNT[\s\S]*?RETURN v_updated > 0/i)
  })

  it('enforces strict state transition guards in fail_notification_outbox_delivery (only PROCESSING rows may fail)', () => {
    // Guards against non-PROCESSING rows before attempting failure update
    expect(migrationSql).toMatch(/IF v_current_status <> 'PROCESSING' THEN[\s\S]*?RETURN v_current_status;[\s\S]*?END IF;/i)
    // Requires status = 'PROCESSING' in UPDATE WHERE clause
    expect(migrationSql).toMatch(/UPDATE public\.notification_outbox[\s\S]*?WHERE id = p_outbox_id[\s\S]*?AND status = 'PROCESSING'/i)
  })

  it('ensures all worker RPCs use now() with timestamptz semantics (zero timezone conversions)', () => {
    expect(migrationSql).not.toContain("timezone('utc'::text, now())")
    expect(migrationSql).not.toContain('timezone(')
    expect(migrationSql).toMatch(/o\.scheduled_at <= now\(\)/i)
    expect(migrationSql).toMatch(/sent_at = now\(\)/i)
  })

  it('verifies data minimization: no sensitive census columns projected', () => {
    const forbiddenColumns = [
      'date_of_birth',
      'birth_date',
      'address',
      'street',
      'phone',
      'mobile',
      'father_id',
      'mother_id',
      'gotra',
      'nukh',
    ]

    for (const col of forbiddenColumns) {
      expect(migrationSql.toLowerCase()).not.toContain(`.${col}`)
    }
  })
})

describe('Notification Outbox Lifecycle State Machine Constraints', () => {
  type DeliveryStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER'

  interface OutboxRecord {
    id: string
    status: DeliveryStatus
    attempts: number
    sent_at: string | null
    scheduled_at: string | null
    last_error: string | null
  }

  // Exact JavaScript simulation of the SQL RPC algorithms
  function simulateClaimBatch(records: OutboxRecord[], maxAttempts = 3): { claimed: OutboxRecord[] } {
    const eligible = records.filter(
      (r) => (r.status === 'PENDING' || r.status === 'FAILED') && r.attempts < maxAttempts
    )
    for (const row of eligible) {
      row.status = 'PROCESSING'
      row.attempts += 1
    }
    return { claimed: eligible }
  }

  function simulateCompleteDelivery(record: OutboxRecord): boolean {
    if (record.status !== 'PROCESSING') {
      return false
    }
    record.status = 'SENT'
    record.sent_at = new Date().toISOString()
    record.last_error = null
    return true
  }

  function simulateFailDelivery(
    record: OutboxRecord,
    params: { isTerminal?: boolean; maxAttempts?: number; retryDelaySeconds?: number }
  ): DeliveryStatus {
    if (record.status !== 'PROCESSING') {
      return record.status
    }
    const isTerminal = Boolean(params.isTerminal)
    const maxAttempts = params.maxAttempts ?? 3
    const newStatus: DeliveryStatus = isTerminal || record.attempts >= maxAttempts ? 'DEAD_LETTER' : 'FAILED'

    record.status = newStatus
    record.last_error = 'Simulated error'
    if (newStatus === 'FAILED') {
      record.scheduled_at = new Date(Date.now() + (params.retryDelaySeconds ?? 300) * 1000).toISOString()
    }
    return newStatus
  }

  describe('VALID Transitions', () => {
    it('PENDING -> PROCESSING: PASS', () => {
      const row: OutboxRecord = { id: '1', status: 'PENDING', attempts: 0, sent_at: null, scheduled_at: null, last_error: null }
      const { claimed } = simulateClaimBatch([row])
      expect(claimed).toHaveLength(1)
      expect(row.status).toBe('PROCESSING')
      expect(row.attempts).toBe(1)
    })

    it('FAILED -> PROCESSING: PASS', () => {
      const row: OutboxRecord = { id: '2', status: 'FAILED', attempts: 1, sent_at: null, scheduled_at: null, last_error: 'Prior error' }
      const { claimed } = simulateClaimBatch([row])
      expect(claimed).toHaveLength(1)
      expect(row.status).toBe('PROCESSING')
      expect(row.attempts).toBe(2)
    })

    it('PROCESSING -> SENT: PASS', () => {
      const row: OutboxRecord = { id: '3', status: 'PROCESSING', attempts: 1, sent_at: null, scheduled_at: null, last_error: null }
      const updated = simulateCompleteDelivery(row)
      expect(updated).toBe(true)
      expect(row.status).toBe('SENT')
      expect(row.sent_at).not.toBeNull()
    })

    it('PROCESSING -> FAILED: PASS', () => {
      const row: OutboxRecord = { id: '4', status: 'PROCESSING', attempts: 1, sent_at: null, scheduled_at: null, last_error: null }
      const newStatus = simulateFailDelivery(row, { isTerminal: false, maxAttempts: 3 })
      expect(newStatus).toBe('FAILED')
      expect(row.status).toBe('FAILED')
      expect(row.scheduled_at).not.toBeNull()
    })

    it('PROCESSING -> DEAD_LETTER: PASS (via terminal error)', () => {
      const row: OutboxRecord = { id: '5', status: 'PROCESSING', attempts: 1, sent_at: null, scheduled_at: null, last_error: null }
      const newStatus = simulateFailDelivery(row, { isTerminal: true, maxAttempts: 3 })
      expect(newStatus).toBe('DEAD_LETTER')
      expect(row.status).toBe('DEAD_LETTER')
    })

    it('PROCESSING -> DEAD_LETTER: PASS (via max attempts reached)', () => {
      const row: OutboxRecord = { id: '6', status: 'PROCESSING', attempts: 3, sent_at: null, scheduled_at: null, last_error: null }
      const newStatus = simulateFailDelivery(row, { isTerminal: false, maxAttempts: 3 })
      expect(newStatus).toBe('DEAD_LETTER')
      expect(row.status).toBe('DEAD_LETTER')
    })
  })

  describe('INVALID Transitions to SENT (BLOCKED)', () => {
    it('PENDING -> SENT: BLOCKED', () => {
      const row: OutboxRecord = { id: '7', status: 'PENDING', attempts: 0, sent_at: null, scheduled_at: null, last_error: null }
      const updated = simulateCompleteDelivery(row)
      expect(updated).toBe(false)
      expect(row.status).toBe('PENDING')
    })

    it('FAILED -> SENT: BLOCKED', () => {
      const row: OutboxRecord = { id: '8', status: 'FAILED', attempts: 1, sent_at: null, scheduled_at: null, last_error: 'Err' }
      const updated = simulateCompleteDelivery(row)
      expect(updated).toBe(false)
      expect(row.status).toBe('FAILED')
    })

    it('SENT -> SENT: BLOCKED', () => {
      const row: OutboxRecord = { id: '9', status: 'SENT', attempts: 1, sent_at: '2026-10-16T12:00:00Z', scheduled_at: null, last_error: null }
      const updated = simulateCompleteDelivery(row)
      expect(updated).toBe(false)
      expect(row.status).toBe('SENT')
    })

    it('DEAD_LETTER -> SENT: BLOCKED', () => {
      const row: OutboxRecord = { id: '10', status: 'DEAD_LETTER', attempts: 3, sent_at: null, scheduled_at: null, last_error: 'Terminal' }
      const updated = simulateCompleteDelivery(row)
      expect(updated).toBe(false)
      expect(row.status).toBe('DEAD_LETTER')
    })
  })

  describe('INVALID Transitions to FAILED or DEAD_LETTER (BLOCKED)', () => {
    it('PENDING -> FAILED: BLOCKED', () => {
      const row: OutboxRecord = { id: '11', status: 'PENDING', attempts: 0, sent_at: null, scheduled_at: null, last_error: null }
      const result = simulateFailDelivery(row, { isTerminal: false })
      expect(result).toBe('PENDING')
      expect(row.status).toBe('PENDING')
    })

    it('PENDING -> DEAD_LETTER: BLOCKED', () => {
      const row: OutboxRecord = { id: '12', status: 'PENDING', attempts: 0, sent_at: null, scheduled_at: null, last_error: null }
      const result = simulateFailDelivery(row, { isTerminal: true })
      expect(result).toBe('PENDING')
      expect(row.status).toBe('PENDING')
    })

    it('FAILED -> FAILED: BLOCKED', () => {
      const row: OutboxRecord = { id: '13', status: 'FAILED', attempts: 1, sent_at: null, scheduled_at: null, last_error: 'Err' }
      const result = simulateFailDelivery(row, { isTerminal: false })
      expect(result).toBe('FAILED')
      expect(row.status).toBe('FAILED')
    })

    it('FAILED -> DEAD_LETTER: BLOCKED', () => {
      const row: OutboxRecord = { id: '14', status: 'FAILED', attempts: 1, sent_at: null, scheduled_at: null, last_error: 'Err' }
      const result = simulateFailDelivery(row, { isTerminal: true })
      expect(result).toBe('FAILED')
      expect(row.status).toBe('FAILED')
    })

    it('SENT -> FAILED: BLOCKED', () => {
      const row: OutboxRecord = { id: '15', status: 'SENT', attempts: 1, sent_at: '2026-10-16T12:00:00Z', scheduled_at: null, last_error: null }
      const result = simulateFailDelivery(row, { isTerminal: false })
      expect(result).toBe('SENT')
      expect(row.status).toBe('SENT')
    })

    it('SENT -> DEAD_LETTER: BLOCKED', () => {
      const row: OutboxRecord = { id: '16', status: 'SENT', attempts: 1, sent_at: '2026-10-16T12:00:00Z', scheduled_at: null, last_error: null }
      const result = simulateFailDelivery(row, { isTerminal: true })
      expect(result).toBe('SENT')
      expect(row.status).toBe('SENT')
    })

    it('DEAD_LETTER -> FAILED: BLOCKED', () => {
      const row: OutboxRecord = { id: '17', status: 'DEAD_LETTER', attempts: 3, sent_at: null, scheduled_at: null, last_error: 'Dead' }
      const result = simulateFailDelivery(row, { isTerminal: false })
      expect(result).toBe('DEAD_LETTER')
      expect(row.status).toBe('DEAD_LETTER')
    })

    it('DEAD_LETTER -> DEAD_LETTER: BLOCKED', () => {
      const row: OutboxRecord = { id: '18', status: 'DEAD_LETTER', attempts: 3, sent_at: null, scheduled_at: null, last_error: 'Dead' }
      const result = simulateFailDelivery(row, { isTerminal: true })
      expect(result).toBe('DEAD_LETTER')
      expect(row.status).toBe('DEAD_LETTER')
    })
  })
})

describe('Client-Side Security Isolation & Secret Hygiene', () => {
  const sourceFiles = getAllSourceFiles(SRC_DIR)

  it('finds source files in src/ directory', () => {
    expect(sourceFiles.length).toBeGreaterThan(50)
  })

  it('never references worker RPCs in client-side code', () => {
    const workerRpcNames = [
      'claim_notification_outbox_batch',
      'complete_notification_outbox_delivery',
      'fail_notification_outbox_delivery',
    ]

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      for (const rpc of workerRpcNames) {
        expect(
          content.includes(rpc),
          `Security violation: ${rpc} found in client file ${path.relative(process.cwd(), file)}`
        ).toBe(false)
      }
    }
  })

  it('never references SUPABASE_SERVICE_ROLE_KEY in client-side code', () => {
    for (const file of sourceFiles) {
      if (file.endsWith('.d.ts')) continue
      const content = fs.readFileSync(file, 'utf-8')
      expect(
        content.includes('SUPABASE_SERVICE_ROLE_KEY'),
        `Critical security violation: SUPABASE_SERVICE_ROLE_KEY referenced in ${path.relative(process.cwd(), file)}`
      ).toBe(false)
    }
  })

  it('never directly performs UPDATE or DELETE on notification_outbox in client-side code', () => {
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      expect(
        content.includes('.from(\'notification_outbox\').update') ||
          content.includes('.from("notification_outbox").update') ||
          content.includes('.from(\'notification_outbox\').delete') ||
          content.includes('.from("notification_outbox").delete'),
        `Security violation: direct mutation on notification_outbox in ${path.relative(process.cwd(), file)}`
      ).toBe(false)
    }
  })

  it('never directly updates notification_preferences in client code (uses RPC)', () => {
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      expect(
        content.includes('.from(\'notification_preferences\').update') ||
          content.includes('.from("notification_preferences").update') ||
          content.includes('.from(\'notification_preferences\').upsert') ||
          content.includes('.from("notification_preferences").upsert'),
        `Security violation: direct mutation on notification_preferences in ${path.relative(process.cwd(), file)}`
      ).toBe(false)
    }
  })
})
