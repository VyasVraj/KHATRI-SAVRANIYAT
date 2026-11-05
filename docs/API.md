# docs/API.md

# API Documentation

**Product:** Community Roots
**Version:** 0.1.0
**Status:** Phase 0 — Engineering Foundation

---

## Overview

Community Roots uses Supabase as its backend. The "API" is the Supabase client SDK, which communicates with:

1. **PostgREST** — auto-generated REST API from PostgreSQL schema
2. **Supabase Auth** — authentication endpoints
3. **Supabase Storage** — file storage endpoints
4. **Edge Functions** — serverless functions for complex logic

All operations are secured by:
- Row Level Security (RLS) policies in PostgreSQL
- Supabase Auth session tokens (JWTs)

The anon key is safe to use in the frontend — RLS enforces authorization before any data is returned.

---

## Data Access Pattern

```
Frontend Component
  → TanStack Query (caching, loading states)
    → Service function (src/services/)
      → Supabase client (src/lib/supabase.ts)
        → PostgREST / Supabase API
          → PostgreSQL + RLS
```

---

## Authentication Endpoints

Handled by Supabase Auth SDK — Phase 2.

| Action | Method |
|---|---|
| Sign up | `supabase.auth.signUp()` |
| Sign in with password | `supabase.auth.signInWithPassword()` |
| Sign out | `supabase.auth.signOut()` |
| Get session | `supabase.auth.getSession()` |
| Refresh token | Auto-handled by SDK |
| Reset password | `supabase.auth.resetPasswordForEmail()` |

---

## Edge Functions

Serverless functions for operations requiring elevated permissions or complex server-side logic.

Location: `supabase/functions/<function-name>/index.ts`

Edge functions use the **service-role key** via Deno env variables — NEVER in frontend code.

No Edge Functions are implemented in Phase 0.

---

## Error Handling

Supabase errors follow a consistent pattern:

```typescript
const { data, error } = await supabase.from('table').select()

if (error) {
  // error.message — user-safe message
  // error.code — PostgreSQL error code
  // error.details — additional context
}
```

All service functions wrap Supabase errors in a consistent `ApiResponse<T>` type (see `src/types/common.ts`).

Never expose raw database error messages to users.

---

## Pagination

All list endpoints support cursor-based or offset pagination.

Standard parameters:
- `page` — page number (1-indexed)
- `pageSize` — results per page (default: 20, max: 100)

Standard response includes `hasMore` to support infinite scroll patterns.

---

## Rate Limiting

Enforced at the Supabase and Cloudflare WAF layers.

Application-level rate limiting to be added in Phase 2 for:
- Registration
- Connection requests
- Search (debounced client-side + server-side limits)
