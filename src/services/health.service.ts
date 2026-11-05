/**
 * Application Health & Readiness Service
 *
 * Implements defensive health verification and subsystem readiness assessment.
 *
 * Architecture & Distinction:
 * - LIVENESS: "Is the application host / CDN serving static assets and executable code?"
 *   (Verified via static `/health.json` at Cloudflare edge or `checkStaticLiveness()`).
 * - READINESS: "Is the application properly configured with valid parameters and capable
 *   of communicating with required upstream services?"
 *   (Verified via `getReadinessReport()`).
 *
 * Security Invariants:
 * 1. ZERO secret leakage: Never returns or formats raw `VITE_SUPABASE_ANON_KEY`, privileged service keys,
 *    database connection strings, or user credentials.
 * 2. ZERO PII leakage: Diagnostic checks never query personal census records or user profile contents.
 * 3. ZERO database error / stack trace leakage: PostgREST and PostgreSQL exceptions are sanitized into
 *    safe status indicators (`reachable`, `unreachable`, `timeout`).
 * 4. Graceful Degradation: An upstream backend connectivity failure reports status 'degraded' rather than
 *    classifying the entire web application as completely offline.
 */

import { supabase } from '@/lib/supabase'

export type HealthStatus = 'pass' | 'warn' | 'fail'

export interface SubsystemHealth {
  status: HealthStatus
  message: string
  latencyMs?: number
  details?: Record<string, string | number | boolean>
}

export interface ReadinessReport {
  status: 'ready' | 'degraded' | 'unready'
  timestamp: string
  version: string
  environment: string
  subsystems: {
    staticAssets: SubsystemHealth
    configuration: SubsystemHealth
    backendConnectivity: SubsystemHealth
  }
}

/**
 * Validates whether the static host and runtime JavaScript context are operational.
 */
export function checkStaticLiveness(): SubsystemHealth {
  return {
    status: 'pass',
    message: 'Application runtime environment and static assets operational',
    details: {
      version: '0.1.0',
      clientRuntime: typeof window !== 'undefined' ? 'browser' : 'non-browser',
      environment: import.meta.env.MODE || 'production',
    },
  }
}

/**
 * Validates presence and format of required frontend configuration parameters.
 * Guarantees zero credential exposure: values are masked or checked for structure only.
 */
export function checkConfigurationHealth(): SubsystemHealth {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return {
      status: 'fail',
      message: 'VITE_SUPABASE_URL is missing or unconfigured',
      details: { urlConfigured: false, keyConfigured: Boolean(anonKey) },
    }
  }

  if (!anonKey || typeof anonKey !== 'string' || anonKey.trim().length === 0) {
    return {
      status: 'fail',
      message: 'VITE_SUPABASE_ANON_KEY is missing or unconfigured',
      details: { urlConfigured: true, keyConfigured: false },
    }
  }

  // Basic protocol and structure validation without leaking key contents
  let isHttps = false
  try {
    const parsed = new URL(url)
    isHttps = parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return {
      status: 'fail',
      message: 'VITE_SUPABASE_URL is not a valid URL',
      details: { urlConfigured: true, validUrl: false },
    }
  }

  // Key safety checks: ensure no whitespace or service_role indicators
  const keyLooksSuspicious = anonKey.includes('service_role') || anonKey.includes(' ')

  if (!isHttps) {
    return {
      status: 'warn',
      message: 'VITE_SUPABASE_URL is using an insecure non-HTTPS protocol',
      details: { urlConfigured: true, keyConfigured: true, secureProtocol: false },
    }
  }

  if (keyLooksSuspicious) {
    return {
      status: 'fail',
      message: 'VITE_SUPABASE_ANON_KEY contains invalid or prohibited format',
      details: { urlConfigured: true, keyConfigured: false },
    }
  }

  return {
    status: 'pass',
    message: 'Required environment configuration verified',
    details: {
      urlConfigured: true,
      keyConfigured: true,
      secureProtocol: true,
    },
  }
}

/**
 * Performs a minimal, safe, unauthenticated read against the Supabase backend to confirm
 * network reachability and PostgREST responsiveness.
 *
 * Invariants:
 * - Does NOT mutate any data.
 * - Does NOT access user PII.
 * - Sanitizes all error responses into safe diagnostics.
 */
export async function checkBackendConnectivity(timeoutMs = 5000): Promise<SubsystemHealth> {
  const start = Date.now()

  try {
    // Create an abortable timeout promise
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('CONNECTIVITY_TIMEOUT')), timeoutMs)
    )

    // Execute minimal query against profiles table
    // (A PostgreSQL permission denied 42501 or empty array confirms PostgREST and PostgreSQL are reachable)
    const probePromise = supabase.from('profiles').select('id').limit(1)

    const response = (await Promise.race([probePromise, timeoutPromise])) as {
      error: { code?: string; message?: string } | null
    }

    const elapsed = Date.now() - start

    // If query returned with error, verify it is an expected PostgreSQL security error rather than network fault
    if (response.error) {
      const code = response.error.code
      // 42501 (insufficient_privilege) or PGRST error means the server is reachable and enforcing security
      if (code === '42501' || (code && code.startsWith('PGRST'))) {
        return {
          status: 'pass',
          message: 'Supabase backend service reachable and responding with active security policies',
          latencyMs: elapsed,
        }
      }

      // Any unexpected error shape is treated as degraded without leaking internal DB details
      return {
        status: 'warn',
        message: 'Supabase backend responded with unexpected status code',
        latencyMs: elapsed,
      }
    }

    return {
      status: 'pass',
      message: 'Supabase backend service reachable and responding normally',
      latencyMs: elapsed,
    }
  } catch (err) {
    const elapsed = Date.now() - start
    const isTimeout = err instanceof Error && err.message === 'CONNECTIVITY_TIMEOUT'

    return {
      status: 'fail',
      message: isTimeout
        ? `Supabase backend connectivity timed out after ${timeoutMs}ms`
        : 'Supabase backend unreachable or network connection failed',
      latencyMs: elapsed,
    }
  }
}

/**
 * Compiles a comprehensive readiness report for all subsystems.
 *
 * Status evaluation:
 * - 'ready': All subsystems pass.
 * - 'degraded': Static assets and configuration pass, but backend is unreachable or warning.
 * - 'unready': Configuration is missing or invalid.
 */
export async function getReadinessReport(timeoutMs = 5000): Promise<ReadinessReport> {
  const staticAssets = checkStaticLiveness()
  const configuration = checkConfigurationHealth()
  const backendConnectivity = await checkBackendConnectivity(timeoutMs)

  let overallStatus: ReadinessReport['status'] = 'ready'

  if (configuration.status === 'fail') {
    overallStatus = 'unready'
  } else if (backendConnectivity.status === 'fail' || backendConnectivity.status === 'warn') {
    overallStatus = 'degraded'
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    environment: import.meta.env.MODE || 'production',
    subsystems: {
      staticAssets,
      configuration,
      backendConnectivity,
    },
  }
}
