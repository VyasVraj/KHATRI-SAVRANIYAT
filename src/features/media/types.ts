/**
 * Types for the Media Feature Domain (Phase 11 — Subtask 1: Storage Infrastructure & Avatars)
 */

export type AvatarTargetType = 'profile' | 'person' | 'family'

export interface AvatarTarget {
  type: AvatarTargetType
  id: string
}

export interface AvatarValidationOptions {
  /** Maximum file size in bytes (default: 5MB = 5,242,880) */
  maxSizeBytes?: number
  /** Allowed MIME types */
  allowedMimeTypes?: string[]
  /** Preferred target dimension (square, default: 512px) */
  targetSize?: number
  /** Output image quality (0.0 to 1.0, default: 0.85) */
  quality?: number
}

export interface AvatarValidationResult {
  valid: boolean
  error?: string
}

export interface AvatarUploadResult {
  url: string
  path: string
}

export type FamilyMediaType = 'PHOTO' | 'DOCUMENT' | 'HISTORICAL_RECORD'

export interface MediaUploadOptions {
  /** Maximum file size in bytes (default: 20MB = 20,971,520) */
  maxSizeBytes?: number
  /** Allowed MIME types */
  allowedMimeTypes?: string[]
}

export interface FamilyMediaItem {
  id: string
  family_id: string
  album_id: string | null
  storage_object_path: string
  media_type: FamilyMediaType
  original_filename: string
  mime_type: string
  file_size: number
  caption: string | null
  description: string | null
  display_order: number
  uploaded_by: string | null
  created_at: string
  updated_at: string
  /** Signed URL resolved dynamically on client */
  resolved_url?: string | null
}

export interface FamilyAlbum {
  id: string
  family_id: string
  title: string
  description: string | null
  privacy_level: 'PUBLIC' | 'COMMUNITY' | 'FAMILY' | 'PRIVATE'
  cover_media_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  media_count?: number
  cover_url?: string | null
}

export interface FamilyStory {
  id: string
  family_id: string
  title: string
  content: string
  summary: string | null
  author_id: string | null
  privacy_level: 'PUBLIC' | 'COMMUNITY' | 'FAMILY' | 'PRIVATE'
  featured_media_id: string | null
  created_at: string
  updated_at: string
  featured_media?: FamilyMediaItem | null
}
