/// <reference types="vite/client" />

/**
 * Vite environment variable type declarations.
 * Add new environment variables here to get TypeScript type safety.
 *
 * SECURITY: Only VITE_ prefixed variables appear here (safe for client).
 * Server-only variables (e.g. SUPABASE_SERVICE_ROLE_KEY) must NOT be added.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_APP_ENV: 'development' | 'staging' | 'production'
  readonly VITE_FEATURE_REGISTRATION: string
  readonly VITE_FEATURE_FAMILY_TREE: string
  readonly VITE_FEATURE_COMMUNITY: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
