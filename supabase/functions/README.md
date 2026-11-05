# Supabase Edge Functions

Edge functions live in this directory.

## Structure

Each function is a separate directory:

```
functions/
├── function-name/
│   └── index.ts
```

## Rules

- Edge functions use server-side Supabase client (service-role key via environment).
- NEVER import frontend/browser code into Edge Functions.
- All sensitive operations requiring elevated permissions happen here, not in the frontend.
- Validate all inputs server-side.
- Use appropriate authorization checks.

## Phase 0

No Edge Functions are created in Phase 0.
Functions will be created as required in later phases.
