# Media Feature Domain

> **Phase 11 — Media / Family History / Secure Storage Foundation (Subtask 1: Storage Infrastructure & Avatars)**

---

## 1. Overview

The **Media** feature domain provides secure cloud object storage and presentation components for community avatars, photographs, family albums, and historical document archives:

1. **Storage Infrastructure (Subtask 1)**:
   - Dedicated `avatars` bucket in Supabase Storage with 5MB file size limits and image-only MIME enforcement.
   - Storage RLS policies on `storage.objects` enforcing path isolation:
     - `profiles/{user_id}/...`: Restricted to `auth.uid() = user_id`.
     - `persons/{person_id}/...`: Governed by `public.can_manage_person_avatar(UUID)`.
     - `families/{family_id}/...`: Governed by `public.can_manage_family_avatar(UUID)`.
   - Client-side validation, center-crop square resizing, and format standardization.
   - Authoritative RPCs for linking avatars to `public.profiles`, `public.persons`, and `public.families` with audit logging.
   - Automatic cleanup of uploaded objects if the database RPC fails to prevent orphaned storage objects.

---

## 2. Core Architectural Invariants

### 1. `PERSON != USER`
- A User's profile avatar is stored at `profiles/{user_id}/...` and recorded on `public.profiles.avatar_url`.
- A Person's census avatar is stored at `persons/{person_id}/...` and recorded on `public.persons.avatar_url`.
- An individual Person census record exists independently of whether the individual has an authenticated user account.
- Managing an avatar for an unlinked Person does not create an authentication account or claim.

### 2. Configurable Authority
- The helper functions `public.can_manage_person_avatar(UUID)` and `public.can_manage_family_avatar(UUID)` evaluate permissions strictly against `auth.uid()` internally.
- Supported management roles include:
  - Linked User (`persons.user_id = auth.uid()`)
  - Creator (`persons.created_by = auth.uid()` / `families.created_by = auth.uid()`)
  - Active Family Head (`family_members.is_head = TRUE`)
  - Community Moderator / Administrator (`public.is_community_moderator()`)

### 3. Server-Authoritative Mutation
- Direct client table updates to `avatar_url` are prohibited or governed by table RLS.
- Persistence routes through `SECURITY DEFINER` RPCs (`set_person_avatar`, `set_family_avatar`, `set_profile_avatar`) with fixed `search_path = public` and audit logging in `public.audit_logs`.

---

## 3. Storage Hierarchy

```
storage.objects (bucket_id: 'avatars')
├── profiles/
│   └── {user_id}/
│       └── avatar_{timestamp}.webp
├── persons/
│   └── {person_id}/
│       └── avatar_{timestamp}.webp
└── families/
    └── {family_id}/
        └── avatar_{timestamp}.webp

storage.objects (bucket_id: 'family-media')
└── families/
    └── {family_id}/
        └── media/
            └── {media_id}/
                └── {filename}
```

---

## 4. Family Media, Albums & History (Subtask 2)

### Tables
1. **`public.family_albums`**: Collections of family photos/documents.
2. **`public.family_media`**: Individual photos, historical certificates, and documents (MIME types: `jpeg`, `png`, `webp`, `gif`, `pdf`, max 20MB).
3. **`public.family_stories`**: Preserved oral histories, stories, and narratives.

### Storage Namespace & Path Validation
- Bucket: dedicated private `family-media` (20MB limit).
- Path: `family-media/families/<family_id>/media/<media_id>/<filename>`.
- Exactly 5 segments verified by database triggers (`handle_family_media_storage_path_guard`) and Storage RLS.
- Storage RLS validates access via `can_read_family_media_object(name)`.
- Storage uploads validate active membership via `can_manage_family_media(family_id)`.
- Metadata registrations route via authoritative `SECURITY DEFINER` RPC `register_family_media`.

### Dynamic Signed URLs
- Stored URLs in PostgreSQL are purely internal canonical paths (`family-media/families/...`).
- Client generates temporary 1-hour signed URLs at display/render time via `resolveFamilyMediaUrl`.
- Zero signed URLs are ever persisted in the database.

### Table Mutation Security & Trigger Guards
- Direct mutations (`INSERT`, `UPDATE`, `DELETE`) on `family_albums`, `family_media`, and `family_stories` are blocked at both the PostgreSQL grant layer (`REVOKE ALL`, `GRANT SELECT ... TO authenticated`) and RLS layer (`WITH CHECK (FALSE)`, `USING (FALSE)`).
- All mutations route through audited `SECURITY DEFINER` RPCs (`create_family_album`, `register_family_media`, `soft_delete_family_media`, `create_family_story`).
- Six database triggers enforce relational integrity and immutability:
  1. `handle_family_media_album_guard`: Blocks cross-family album association on media.
  2. `handle_family_album_cover_guard`: Blocks cross-family cover media on albums.
  3. `handle_family_story_featured_media_guard`: Blocks cross-family featured media on stories.
  4. `handle_family_media_storage_path_guard`: Enforces exact UUID matching between path and record.
  5. `handle_family_album_immutability_guard`: Guards `id`, `family_id`, `created_by`, `created_at` against modification.
  6. `handle_family_media_immutability_guard`: Guards `id`, `family_id`, `uploaded_by`, `created_at`, `storage_object_path` against modification.

---

## 5. UI Integration & Modals (Subtask 3)

The Subtask 3 UI integration connects the deployed storage and database infrastructure to the frontend application:

### Components & Modals

1. **`FamilyMediaSection` (`src/features/media/components/FamilyMediaSection.tsx`)**:
   - Integrated into `FamilyDetail.tsx` as a stacked section with clean dividers.
   - Dual-tab navigation: `Albums & Photos` (with badge count) and `Family History & Stories` (with badge count).
   - Dynamic filter pills: `All Photos`, `Unassigned`, and custom albums with photo count chips.
   - Selected album context banner displaying title, description, privacy badge, and media count.
   - Mobile-first responsive media grid (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`) with lazy loading, PDF document badges, and click-to-view interaction.
   - Family story cards featuring thumbnail previews, executive summaries, creation dates, privacy tags, and "Read Story" buttons.
   - Empty state placeholders when no media or stories exist.
   - Manager actions gated by `canManage` (active family head or creator): `New Album`, `Upload Photo/Doc`, `Write Family Story`.

2. **`MediaViewerModal` (`src/features/media/components/MediaViewerModal.tsx`)**:
   - Accessible lightbox dialog with Escape-to-close and backdrop dismiss.
   - Dynamically resolves 1-hour signed URLs via `resolveFamilyMediaUrl`; never caches signed URLs in browser storage.
   - Supports both images and PDF documents:
     - Images: full aspect-ratio preview with zoom protection.
     - PDFs: dedicated document icon, file size, original filename, and safe `target="_blank" rel="noopener noreferrer"` download/view action.
   - Displays metadata grid: original filename, formatted file size, media type, and creation date.
    - Deletion support for managers calling `soft_delete_family_media` RPC with confirmation guard.

3. **`MediaUploadModal` (`src/features/media/components/MediaUploadModal.tsx`)**:
   - Accessible drag-and-drop and file picker modal.
   - Client-side validation: file size <= 20MB, MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`).
   - Auto-selects `DOCUMENT` for PDF files.
   - Supports album assignment, caption, description, and media type selection.
   - Storage upload to private `family-media` bucket followed by `register_family_media` RPC; automatically rolls back storage object on database error.

4. **`AlbumCreateModal` (`src/features/media/components/AlbumCreateModal.tsx`)**:
   - Accessible collection authoring modal with title, description, and privacy level selector (`FAMILY`, `COMMUNITY`, `PUBLIC`, `PRIVATE`).
   - Mutations route strictly to `create_family_album` RPC.

5. **`StoryViewerModal` (`src/features/media/components/StoryViewerModal.tsx`)**:
   - Oral history viewing modal.
   - Summary callout block for quick reading.
   - Safe pure-text rendering with `whitespace-pre-line leading-relaxed font-serif` (**zero** `dangerouslySetInnerHTML`).
   - Featured photo display with caption.

6. **`StoryCreateModal` (`src/features/media/components/StoryCreateModal.tsx`)**:
   - History and oral narrative authoring modal with title, summary, narrative content, privacy level, and optional featured photo attachment picker.
   - Mutations route strictly to `create_family_story` RPC.

---

## 6. Hardening & Release Readiness (Subtask 4)

1. **UX Error Resilience**:
   - Graceful image load error handling across `MediaViewerModal` and `StoryViewerModal` via local `imageError` state and `onError` handlers; displays clear fallback notice ("Image preview unavailable or link expired.") instead of broken browser image artifacts.
2. **Storage Rollback Guarantee**:
   - `uploadFamilyMedia` in `familyMedia.service.ts` guarantees atomic rollback: if `register_family_media` RPC fails or is rejected, the uploaded object in `family-media` is automatically removed via `supabase.storage.from('family-media').remove([relativeStoragePath])`.
3. **Cache & Persistence Invariant**:
   - Dynamic 1-hour signed URLs are fetched on-demand and kept only in React component/query memory; zero signed URLs are stored in `localStorage`, `sessionStorage`, or cookies.
4. **Comprehensive Automated Test Coverage**:
   - 11 modal interaction tests (`tests/unit/FamilyMediaModals.test.tsx`).
   - 13 service layer tests (`tests/unit/familyMedia.service.test.ts`) validating queries, mutations, rollback, and `soft_delete_family_media`.
   - 2 family media section tests (`tests/unit/FamilyMediaSection.test.tsx`).
   - 12 image utility tests (`tests/unit/image.utils.test.ts`).
   - 2 security test suites (`tests/security/family-media-schema.test.ts`, `tests/security/family-media-authz.test.ts`).
