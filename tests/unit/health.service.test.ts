/**
 * Unit tests for Health & Readiness Service (Phase 16 Subtask 5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkStaticLiveness,
  checkConfigurationHealth,
  checkBackendConnectivity,
  getReadinessReport,
} from '@/services/health.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const mutableEnv = import.meta.env as unknown as Record<string, string>

describe('Health & Readiness Verification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset env to valid test baseline
    mutableEnv['VITE_SUPABASE_URL'] = 'https://test-project.supabase.co'
    mutableEnv['VITE_SUPABASE_ANON_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-key'
  })

  describe('checkStaticLiveness (Host Liveness)', () => {
    it('reports pass with client runtime details', () => {
      const result = checkStaticLiveness()

      expect(result.status).toBe('pass')
      expect(result.message).toContain('runtime environment')
      expect(result.details?.version).toBe('0.1.0')
      expect(result.details?.clientRuntime).toBeDefined()
    })
  })

  describe('checkConfigurationHealth (Configuration Readiness)', () => {
    it('reports pass when valid HTTPS URL and anon key are present', () => {
      const result = checkConfigurationHealth()

      expect(result.status).toBe('pass')
      expect(result.message).toContain('configuration verified')
      expect(result.details?.urlConfigured).toBe(true)
      expect(result.details?.keyConfigured).toBe(true)

      // Zero secret exposure: must not contain the raw key
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain('test-anon-key')
      expect(serialized).not.toContain('eyJhbGci')
    })

    it('reports fail when VITE_SUPABASE_URL is missing or blank', () => {
      mutableEnv['VITE_SUPABASE_URL'] = ''
      const result = checkConfigurationHealth()

      expect(result.status).toBe('fail')
      expect(result.message).toContain('VITE_SUPABASE_URL is missing')
      expect(result.details?.urlConfigured).toBe(false)
    })

    it('reports fail when VITE_SUPABASE_ANON_KEY is missing or blank', () => {
      mutableEnv['VITE_SUPABASE_ANON_KEY'] = ''
      const result = checkConfigurationHealth()

      expect(result.status).toBe('fail')
      expect(result.message).toContain('VITE_SUPABASE_ANON_KEY is missing')
      expect(result.details?.keyConfigured).toBe(false)
    })

    it('reports fail when VITE_SUPABASE_URL is malformed', () => {
      mutableEnv['VITE_SUPABASE_URL'] = 'not-a-valid-url'
      const result = checkConfigurationHealth()

      expect(result.status).toBe('fail')
      expect(result.message).toContain('not a valid URL')
    })

    it('reports warn when VITE_SUPABASE_URL is non-HTTPS in non-localhost', () => {
      mutableEnv['VITE_SUPABASE_URL'] = 'http://remote-server.example.com'
      const result = checkConfigurationHealth()

      expect(result.status).toBe('warn')
      expect(result.message).toContain('insecure non-HTTPS')
    })

    it('reports fail if anon key contains suspicious service_role token', () => {
      mutableEnv['VITE_SUPABASE_ANON_KEY'] = 'eyJ...service_role...secret'
      const result = checkConfigurationHealth()

      expect(result.status).toBe('fail')
      expect(result.message).toContain('prohibited format')
    })
  })

  describe('checkBackendConnectivity (Backend Reachability)', () => {
    it('reports pass when Supabase responds with expected PostgreSQL 42501 permission denied', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '42501', message: 'permission denied for table profiles' },
          }),
        }),
      } as unknown as ReturnType<typeof supabase.from>)

      const result = await checkBackendConnectivity(1000)

      expect(result.status).toBe('pass')
      expect(result.message).toContain('reachable and responding with active security policies')
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)

      // Must not leak raw SQL or error objects
      expect(JSON.stringify(result)).not.toContain('permission denied')
      expect(JSON.stringify(result)).not.toContain('table profiles')
    })

    it('reports pass when Supabase query succeeds normally', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      } as unknown as ReturnType<typeof supabase.from>)

      const result = await checkBackendConnectivity(1000)

      expect(result.status).toBe('pass')
      expect(result.message).toContain('responding normally')
    })

    it('reports fail when query times out', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200))),
        }),
      } as unknown as ReturnType<typeof supabase.from>)

      // Run with short timeout
      const result = await checkBackendConnectivity(50)

      expect(result.status).toBe('fail')
      expect(result.message).toContain('timed out')
    })

    it('reports fail when network connection throws an unhandled error', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
        }),
      } as unknown as ReturnType<typeof supabase.from>)

      const result = await checkBackendConnectivity(1000)

      expect(result.status).toBe('fail')
      expect(result.message).toContain('unreachable or network connection failed')
      expect(JSON.stringify(result)).not.toContain('Failed to fetch')
    })
  })

  describe('getReadinessReport (Overall Readiness Evaluation)', () => {
    it('returns "ready" when all subsystems pass', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      } as unknown as ReturnType<typeof supabase.from>)

      const report = await getReadinessReport(1000)

      expect(report.status).toBe('ready')
      expect(report.version).toBe('0.1.0')
      expect(report.subsystems.staticAssets.status).toBe('pass')
      expect(report.subsystems.configuration.status).toBe('pass')
      expect(report.subsystems.backendConnectivity.status).toBe('pass')
      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('returns "degraded" when backend connectivity fails but static and configuration pass', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error('Network offline')),
        }),
      } as unknown as ReturnType<typeof supabase.from>)

      const report = await getReadinessReport(1000)

      // Application is degraded, not completely dead (liveness vs readiness)
      expect(report.status).toBe('degraded')
      expect(report.subsystems.staticAssets.status).toBe('pass')
      expect(report.subsystems.configuration.status).toBe('pass')
      expect(report.subsystems.backendConnectivity.status).toBe('fail')
    })

    it('returns "unready" when configuration fails', async () => {
      mutableEnv['VITE_SUPABASE_URL'] = ''

      const report = await getReadinessReport(1000)

      expect(report.status).toBe('unready')
      expect(report.subsystems.configuration.status).toBe('fail')
    })
  })
})
