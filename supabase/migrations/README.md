# Supabase Migrations

Database migrations live in this directory.

## Naming Convention

```
YYYYMMDDHHMMSS_description_of_change.sql
```

Example:
```
20241001120000_initial_schema.sql
20241002090000_add_person_table.sql
```

## Rules

- Migrations are IMMUTABLE once applied to a shared environment.
- NEVER modify an existing migration file.
- To fix a migration: create a NEW migration.
- Every schema change must go through a migration.
- Test migrations locally before committing.
- Include DOWN/rollback comments where practical.

## Phase 0

No migrations are created in Phase 0.
The first migrations will be created in Phase 1 (Architecture & Database Foundation).

## Running Migrations

```bash
# Local development
npx supabase db push

# Generate types after migration
npx supabase gen types typescript --local > src/types/database.ts
```
