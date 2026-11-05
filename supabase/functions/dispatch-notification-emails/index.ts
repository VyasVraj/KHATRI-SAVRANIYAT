/**
 * Dispatch Notification Emails — Supabase Edge Function Entrypoint
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 *
 * Purpose:
 * Triggered by scheduled cron or trusted worker to process pending notification_outbox rows.
 *
 * Security:
 * - Requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY | WORKER_SECRET>
 * - Executes with service_role permissions on PostgreSQL RPCs
 * - Zero sensitive census data leakage in logs or responses
 */

import { createEmailProvider } from './email-provider.ts'
import { dispatchNotificationBatch } from './dispatcher.ts'
import type { DispatchOptions } from './types.ts'

// Ambient declaration for Deno runtime globals when checked by non-Deno linters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getEnv(key: string): string | undefined {
  try {
    if (typeof Deno !== 'undefined' && Deno.env?.get) {
      return Deno.env.get(key)
    }
  } catch {
    // Ignore environment access errors in restricted sandbox
  }
  return undefined
}

function getAllEnv(): Record<string, string | undefined> {
  try {
    if (typeof Deno !== 'undefined' && Deno.env?.toObject) {
      return Deno.env.toObject()
    }
  } catch {
    // Ignore
  }
  return {}
}

export async function handleRequest(req: Request): Promise<Response> {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 2. Authorize caller — Must be service_role or worker secret
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || ''
  const workerSecret = getEnv('NOTIFICATION_WORKER_SECRET') || getEnv('CRON_SECRET') || ''

  const isAuthorized =
    Boolean(token) &&
    ((serviceRoleKey && token === serviceRoleKey) ||
      (workerSecret && token === workerSecret))

  if (!isAuthorized) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Unauthorized. Valid service_role or worker secret Bearer token required.',
      }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 3. Initialize Supabase Client
  const supabaseUrl = getEnv('SUPABASE_URL') || ''
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Server misconfiguration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Dynamic import of createClient for Deno runtime compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: any
  try {
    // In Deno runtime, @supabase/supabase-js is loaded from esm.sh or npm specifier
    // @ts-expect-error URL import supported in Deno runtime
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.8')
    supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Failed to initialize database client: ${err instanceof Error ? err.message : String(err)}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 4. Parse request parameters
  let options: DispatchOptions = {}
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (body && typeof body === 'object') {
        options = {
          batchSize: typeof body.batchSize === 'number' ? body.batchSize : undefined,
          maxAttempts: typeof body.maxAttempts === 'number' ? body.maxAttempts : undefined,
          retryDelaySeconds: typeof body.retryDelaySeconds === 'number' ? body.retryDelaySeconds : undefined,
          defaultBaseUrl: typeof body.defaultBaseUrl === 'string' ? body.defaultBaseUrl : getEnv('APP_BASE_URL'),
          supportEmail: typeof body.supportEmail === 'string' ? body.supportEmail : getEnv('SUPPORT_EMAIL'),
        }
      }
    } catch {
      // Empty or non-JSON body is acceptable; defaults will apply
    }
  }

  // 5. Select and initialize provider
  const envMap = getAllEnv()
  const provider = createEmailProvider(envMap)

  // 6. Run batch dispatch
  try {
    const summary = await dispatchNotificationBatch({
      supabase,
      provider,
      options,
    })

    return new Response(
      JSON.stringify({
        ok: true,
        summary,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (dispatchErr: unknown) {
    const message = dispatchErr instanceof Error ? dispatchErr.message : 'Unknown dispatch error'
    return new Response(
      JSON.stringify({
        ok: false,
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
}

// Serve function if in Deno runtime
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handleRequest)
}
