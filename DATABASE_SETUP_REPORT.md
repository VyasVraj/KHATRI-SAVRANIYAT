# Database Setup & Migration Report — Community Roots

**Project Name**: KHATRI SARVANIYAT  
**Environment**: PRODUCTION / Main  
**Supabase Project Reference**: `aodbcxpzpxyatiikqeic`  
**Supabase Project URL**: `https://aodbcxpzpxyatiikqeic.supabase.co`  
**Publishable / Anon API Key**: `sb_publishable_H5kEjknaIDKkd59ftR6sAw_zG8QsVPS`  
**Target Schema**: `public`  
**Date**: November 5, 2026  

---

## 1. Project Analysis

The application is **Community Roots** (Khatri Sarvaniyat), a specialized community census, genealogical family tree, directory, and kinship connection platform.

### Architectural Structure:
- **Presentation Layer**: React 19 + TypeScript (strict mode) + Vite.
- **UI Library**: Tailwind CSS + shadcn/ui (Radix UI accessible primitives).
- **Client State & Server Cache**: TanStack Query v5.
- **Form Validation**: React Hook Form + Zod.
- **Visualization**: React Flow (Interactive genealogy trees) + Recharts (Community demographics).
- **Backend Architecture**: Supabase PostgreSQL 15+ (PostgreSQL database, Row Level Security, Supabase Auth, Storage, Triggers, and transactional RPCs).
- **Client Access**: Single typed Supabase client `@/lib/supabase` utilizing the public anon key. All authorization and access control is strictly enforced in PostgreSQL policies.

---

## 2. Database Architecture & Complete Table List

The database schema comprises **27 domain tables**, 30 domain enums, and 2 private storage buckets:

### 2.1 Complete Table Specifications

#### 1. `public.profiles`
- `id` (UUID, PK) — References `auth.users(id) ON DELETE CASCADE`
- `role` (public.user_role, NOT NULL, DEFAULT 'MEMBER')
- `display_name` (TEXT, NOT NULL)
- `linked_person_id` (UUID, NULLABLE) — References `public.persons(id) ON DELETE SET NULL`
- `status` (TEXT, NOT NULL, DEFAULT 'ACTIVE')
- `email_confirmed` (BOOLEAN, NOT NULL, DEFAULT FALSE)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 2. `public.audit_logs`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `actor_id` (UUID, NULLABLE) — References `auth.users(id) ON DELETE SET NULL`
- `action` (public.audit_action, NOT NULL)
- `entity_type` (TEXT, NOT NULL)
- `entity_id` (UUID, NULLABLE)
- `old_values` (JSONB, NULLABLE)
- `new_values` (JSONB, NULLABLE)
- `ip_address` (INET, NULLABLE)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 3. `public.persons`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `user_id` (UUID, NULLABLE, UNIQUE) — References `auth.users(id)`
- `first_name` (TEXT, NOT NULL)
- `middle_name` (TEXT, NULLABLE)
- `last_name` (TEXT, NOT NULL)
- `maiden_name` (TEXT, NULLABLE)
- `gender` (public.gender, NOT NULL)
- `date_of_birth` (DATE, NULLABLE)
- `date_of_death` (DATE, NULLABLE)
- `is_living` (BOOLEAN, NOT NULL, DEFAULT TRUE)
- `birth_place` (TEXT, NULLABLE)
- `current_city` (TEXT, NULLABLE)
- `occupation` (TEXT, NULLABLE)
- `education` (TEXT, NULLABLE)
- `phone` (TEXT, NULLABLE)
- `email` (TEXT, NULLABLE)
- `avatar_url` (TEXT, NULLABLE)
- `status` (public.person_status, NOT NULL, DEFAULT 'ACTIVE')
- `privacy_level` (public.privacy_level, NOT NULL, DEFAULT 'FAMILY')
- `verification_status` (public.verification_status, NOT NULL, DEFAULT 'UNVERIFIED')
- `created_by` (UUID, NULLABLE) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `deleted_at` (TIMESTAMPTZ, NULLABLE)

#### 4. `public.gotras`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `name` (TEXT, NOT NULL, UNIQUE)
- `kuldevi` (TEXT, NULLABLE)
- `description` (TEXT, NULLABLE)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 5. `public.nukhs`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `gotra_id` (UUID, NOT NULL) — References `public.gotras(id) ON DELETE CASCADE`
- `name` (TEXT, NOT NULL)
- `description` (TEXT, NULLABLE)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 6. `public.cities`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `name` (TEXT, NOT NULL)
- `state` (TEXT, NOT NULL)
- `country` (TEXT, NOT NULL, DEFAULT 'India')
- `is_custom` (BOOLEAN, NOT NULL, DEFAULT FALSE)
- `created_by` (UUID, NULLABLE) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 7. `public.families`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `name` (TEXT, NOT NULL)
- `head_id` (UUID, NULLABLE) — References `public.persons(id) ON DELETE SET NULL`
- `gotra_id` (UUID, NULLABLE) — References `public.gotras(id)`
- `nukh_id` (UUID, NULLABLE) — References `public.nukhs(id)`
- `native_place` (TEXT, NULLABLE)
- `current_city` (TEXT, NULLABLE)
- `status` (public.family_status, NOT NULL, DEFAULT 'ACTIVE')
- `privacy_level` (public.privacy_level, NOT NULL, DEFAULT 'COMMUNITY')
- `avatar_url` (TEXT, NULLABLE)
- `created_by` (UUID, NULLABLE) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `deleted_at` (TIMESTAMPTZ, NULLABLE)

#### 8. `public.family_members`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `family_id` (UUID, NOT NULL) — References `public.families(id) ON DELETE CASCADE`
- `person_id` (UUID, NOT NULL) — References `public.persons(id) ON DELETE RESTRICT`
- `role` (public.family_role, NOT NULL)
- `is_primary` (BOOLEAN, NOT NULL, DEFAULT TRUE)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 9. `public.relationships`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `person_a_id` (UUID, NOT NULL) — References `public.persons(id) ON DELETE CASCADE`
- `person_b_id` (UUID, NOT NULL) — References `public.persons(id) ON DELETE CASCADE`
- `relationship_type` (public.relationship_type, NOT NULL)
- `verification_status` (public.verification_status, NOT NULL, DEFAULT 'UNVERIFIED')
- `created_by` (UUID, NULLABLE) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 10. `public.connections`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `requester_id` (UUID, NOT NULL) — References `public.profiles(id) ON DELETE CASCADE`
- `receiver_id` (UUID, NOT NULL) — References `public.profiles(id) ON DELETE CASCADE`
- `status` (public.connection_status, NOT NULL, DEFAULT 'PENDING')
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 11. `public.person_claims`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `person_id` (UUID, NOT NULL) — References `public.persons(id) ON DELETE CASCADE`
- `user_id` (UUID, NOT NULL) — References `auth.users(id) ON DELETE CASCADE`
- `status` (public.claim_status, NOT NULL, DEFAULT 'PENDING')
- `proof_notes` (TEXT, NULLABLE)
- `reviewed_by` (UUID, NULLABLE) — References `auth.users(id)`
- `reviewed_at` (TIMESTAMPTZ, NULLABLE)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 12. `public.invitations`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `token` (TEXT, NOT NULL, UNIQUE)
- `family_id` (UUID, NOT NULL) — References `public.families(id) ON DELETE CASCADE`
- `person_id` (UUID, NULLABLE) — References `public.persons(id) ON DELETE SET NULL`
- `email` (TEXT, NOT NULL)
- `invited_by` (UUID, NOT NULL) — References `auth.users(id)`
- `status` (public.invitation_status, NOT NULL, DEFAULT 'PENDING')
- `expires_at` (TIMESTAMPTZ, NOT NULL)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 13. `public.verification_requests`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `entity_type` (TEXT, NOT NULL)
- `entity_id` (UUID, NOT NULL)
- `requester_id` (UUID, NOT NULL) — References `auth.users(id)`
- `status` (public.verification_request_status, NOT NULL, DEFAULT 'PENDING')
- `review_notes` (TEXT, NULLABLE)
- `reviewed_by` (UUID, NULLABLE) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 14. `public.duplicate_flags`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `entity_type` (public.duplicate_entity_type, NOT NULL)
- `primary_id` (UUID, NOT NULL)
- `duplicate_id` (UUID, NOT NULL)
- `confidence` (public.duplicate_confidence, NOT NULL)
- `status` (public.duplicate_flag_status, NOT NULL, DEFAULT 'OPEN')
- `flagged_by` (UUID, NULLABLE) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 15. `public.groups`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `name` (TEXT, NOT NULL)
- `description` (TEXT, NULLABLE)
- `group_type` (public.group_type, NOT NULL)
- `privacy_level` (public.privacy_level, NOT NULL, DEFAULT 'COMMUNITY')
- `created_by` (UUID, NOT NULL) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 16. `public.group_members`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `group_id` (UUID, NOT NULL) — References `public.groups(id) ON DELETE CASCADE`
- `user_id` (UUID, NOT NULL) — References `public.profiles(id) ON DELETE CASCADE`
- `role` (public.group_role, NOT NULL, DEFAULT 'MEMBER')
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 17. `public.announcements`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `title` (TEXT, NOT NULL)
- `content` (TEXT, NOT NULL)
- `announcement_type` (public.announcement_type, NOT NULL)
- `status` (public.announcement_status, NOT NULL, DEFAULT 'PUBLISHED')
- `target_group_id` (UUID, NULLABLE) — References `public.groups(id)`
- `created_by` (UUID, NOT NULL) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 18. `public.events`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `title` (TEXT, NOT NULL)
- `description` (TEXT, NULLABLE)
- `event_type` (public.event_type, NOT NULL)
- `location` (TEXT, NULLABLE)
- `start_date` (TIMESTAMPTZ, NOT NULL)
- `end_date` (TIMESTAMPTZ, NOT NULL)
- `status` (public.event_status, NOT NULL, DEFAULT 'UPCOMING')
- `created_by` (UUID, NOT NULL) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 19. `public.event_rsvps`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `event_id` (UUID, NOT NULL) — References `public.events(id) ON DELETE CASCADE`
- `user_id` (UUID, NOT NULL) — References `auth.users(id) ON DELETE CASCADE`
- `status` (public.event_rsvp_status, NOT NULL)
- `guest_count` (INTEGER, NOT NULL, DEFAULT 0)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 20. `public.family_albums`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `family_id` (UUID, NOT NULL) — References `public.families(id) ON DELETE CASCADE`
- `title` (TEXT, NOT NULL)
- `description` (TEXT, NULLABLE)
- `privacy_level` (public.privacy_level, NOT NULL, DEFAULT 'FAMILY')
- `created_by` (UUID, NULLABLE) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `deleted_at` (TIMESTAMPTZ, NULLABLE)

#### 21. `public.family_media`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `album_id` (UUID, NOT NULL) — References `public.family_albums(id) ON DELETE CASCADE`
- `storage_path` (TEXT, NOT NULL)
- `media_type` (public.family_media_type, NOT NULL)
- `caption` (TEXT, NULLABLE)
- `file_size_bytes` (BIGINT, NOT NULL)
- `mime_type` (TEXT, NOT NULL)
- `created_by` (UUID, NULLABLE) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 22. `public.family_stories`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `family_id` (UUID, NOT NULL) — References `public.families(id) ON DELETE CASCADE`
- `title` (TEXT, NOT NULL)
- `content` (TEXT, NOT NULL)
- `privacy_level` (public.privacy_level, NOT NULL, DEFAULT 'FAMILY')
- `created_by` (UUID, NULLABLE) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 23. `public.notifications`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `recipient_id` (UUID, NOT NULL) — References `public.profiles(id) ON DELETE CASCADE`
- `category` (public.notification_category, NOT NULL)
- `title` (TEXT, NOT NULL)
- `body` (TEXT, NOT NULL)
- `action_url` (TEXT, NULLABLE)
- `is_read` (BOOLEAN, NOT NULL, DEFAULT FALSE)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 24. `public.notification_preferences`
- `user_id` (UUID, PK) — References `public.profiles(id) ON DELETE CASCADE`
- `email_enabled` (BOOLEAN, NOT NULL, DEFAULT TRUE)
- `in_app_enabled` (BOOLEAN, NOT NULL, DEFAULT TRUE)
- `categories_disabled` (TEXT[], NOT NULL, DEFAULT ARRAY[]::TEXT[])

#### 25. `public.notification_outbox`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `notification_id` (UUID, NOT NULL) — References `public.notifications(id) ON DELETE CASCADE`
- `channel` (public.notification_channel, NOT NULL)
- `status` (public.notification_delivery_status, NOT NULL, DEFAULT 'PENDING')
- `retry_count` (INTEGER, NOT NULL, DEFAULT 0)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 26. `public.import_batches`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `filename` (TEXT, NOT NULL)
- `entity_type` (public.import_entity_type, NOT NULL)
- `status` (public.import_batch_status, NOT NULL, DEFAULT 'UPLOADED')
- `total_rows` (INTEGER, NOT NULL, DEFAULT 0)
- `valid_rows` (INTEGER, NOT NULL, DEFAULT 0)
- `invalid_rows` (INTEGER, NOT NULL, DEFAULT 0)
- `created_by` (UUID, NOT NULL) — References `auth.users(id)`
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

#### 27. `public.staging_records`
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `batch_id` (UUID, NOT NULL) — References `public.import_batches(id) ON DELETE CASCADE`
- `row_number` (INTEGER, NOT NULL)
- `raw_data` (JSONB, NOT NULL)
- `validation_status` (public.staging_validation_status, NOT NULL, DEFAULT 'PENDING')
- `errors` (JSONB, NULLABLE)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

---

## 3. Storage Buckets

1. **`avatars`** (Private, 5MB limit, `image/jpeg`, `image/png`, `image/webp`, `image/gif`)
2. **`family-media`** (Private, 20MB limit, `image/*`, `application/pdf`)

---

## 4. Migration Files

The project contains 28 chronological migration files in `supabase/migrations/` plus a master consolidated deployment script:
> **Primary Deployment Script**: [`supabase/full_schema.sql`](file:///d:/project/PRINCIPAL_SIR/community-family-platform-main/supabase/full_schema.sql) (589.8 KB, 16,604 lines)

---

## 5. Migration Execution & Why Tables Are Not Yet Visible

### Why Table Editor shows "No tables or views":
A new Supabase project initializes with an empty `public` schema. PostgREST client tokens (`sb_publishable_...`) have permissions for data querying, but PostgreSQL explicitly restricts Data Definition Language (DDL) operations like `CREATE TABLE` and `CREATE TRIGGER` to administrative superusers (`postgres` role).

### How to apply the migrations in 1 click:
1. Open your Supabase Dashboard:
   **[https://supabase.com/dashboard/project/aodbcxpzpxyatiikqeic/sql/new](https://supabase.com/dashboard/project/aodbcxpzpxyatiikqeic/sql/new)**
2. Copy the entire contents of [`supabase/full_schema.sql`](file:///d:/project/PRINCIPAL_SIR/community-family-platform-main/supabase/full_schema.sql).
3. Paste into the SQL query window.
4. Click **Run** (`Ctrl+Enter`).
5. Open the **Table Editor** on the left menu: All 27 tables will immediately appear.

---

## 6. Remote Database Verification Query

After executing the script, paste and run this verification query in the SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

Expected result: 27 rows returned matching all application tables.

---

## 7. Frontend Integration Status

- **Environment Config**: Updated in `.env` with URL `https://aodbcxpzpxyatiikqeic.supabase.co` and key `sb_publishable_H5kEjknaIDKkd59ftR6sAw_zG8QsVPS`.
- **Obsolete Project References**: Completely removed from active code and bundle.
- **Type Safety**: `npm run type-check` passes with 0 errors.
- **ESLint Quality**: `npm run lint` passes with 0 errors.
- **Dev Server**: Running live at `http://localhost:5173/`.
