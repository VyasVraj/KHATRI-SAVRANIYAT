/**
 * Avatar Service — Storage Upload & Canonical Linkage
 *
 * Handles client-side storage uploads to the 'avatars' bucket,
 * accompanied by authoritative RPC persistence to public.profiles,
 * public.persons, or public.families.
 *
 * DOMAIN RULE:
 * Storage is object persistence; database RPCs remain sole authoritative source of truth.
 * If database RPC fails, the uploaded storage file is immediately cleaned up to prevent orphans.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import type { AvatarTarget, AvatarUploadResult, AvatarValidationOptions } from '../types'
import {
  validateAvatarFile,
  generateAvatarStoragePath,
} from '../utils/image.utils'

/**
 * Maps raw Supabase / PostgreSQL errors in avatar service to safe user messages.
 */
function mapAvatarError(message?: string, code?: string, fallback = 'Failed to process avatar.'): string {
  if (code === '42501') {
    return 'You do not have permission to update this avatar.'
  }
  if (code === '23503') {
    return 'Referenced record was not found.'
  }
  const lower = (message ?? '').toLowerCase()
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  return message && !message.includes('relation') && !message.includes('syntax')
    ? message
    : fallback
}

export const AVATARS_BUCKET = 'avatars'

/**
 * Extracts storage relative path from either a canonical path or a Supabase URL.
 */
export function extractStoragePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null

  // If already relative storage path: avatars/...
  if (urlOrPath.startsWith(`${AVATARS_BUCKET}/`)) {
    return urlOrPath.slice(`${AVATARS_BUCKET}/`.length).split('?')[0]
  }

  // If path without bucket prefix: profiles/... or persons/... or families/...
  if (
    urlOrPath.startsWith('profiles/') ||
    urlOrPath.startsWith('persons/') ||
    urlOrPath.startsWith('families/')
  ) {
    return urlOrPath.split('?')[0]
  }

  // If full URL containing /avatars/
  const marker = `/${AVATARS_BUCKET}/`
  const index = urlOrPath.indexOf(marker)
  if (index === -1) return null
  return urlOrPath.slice(index + marker.length).split('?')[0]
}

interface CacheEntry {
  signedUrl: string
  expiresAt: number
}

// In-memory cache for resolved avatar signed URLs to prevent redundant network round-trips
const avatarUrlCache = new Map<string, CacheEntry>()

/**
 * Clears the in-memory avatar signed URL cache (useful for testing or cache eviction).
 */
export function clearAvatarUrlCache(): void {
  avatarUrlCache.clear()
}

/**
 * Resolves a stored avatar reference (canonical path or URL) into a viewable URL.
 * In a private bucket architecture, creates a signed URL with standard TTL (1 hour)
 * so that authorized clients can render images without exposing a public CDN endpoint.
 * Cached in-memory to prevent repeated network signing requests for the same image.
 */
export async function resolveAvatarUrl(
  pathOrUrl: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!pathOrUrl) return null

  // If already an HTTP/HTTPS URL that does not belong to our private bucket, return as is
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    // If it's a legacy public storage URL, extract path and sign it
    const relativePath = extractStoragePath(pathOrUrl)
    if (!relativePath) return pathOrUrl

    const now = Date.now()
    const cached = avatarUrlCache.get(relativePath)
    if (cached && cached.expiresAt > now + 60_000) {
      return cached.signedUrl
    }

    const { data, error } = await supabase.storage
      .from(AVATARS_BUCKET)
      .createSignedUrl(relativePath, expiresIn)
    if (error || !data) return null

    avatarUrlCache.set(relativePath, {
      signedUrl: data.signedUrl,
      expiresAt: now + expiresIn * 1000,
    })
    return data.signedUrl
  }

  // Canonical internal path: extract relative path within avatars bucket
  const relativePath = extractStoragePath(pathOrUrl)
  if (!relativePath) return null

  const now = Date.now()
  const cached = avatarUrlCache.get(relativePath)
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.signedUrl
  }

  const { data, error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .createSignedUrl(relativePath, expiresIn)

  if (error || !data) {
    return null
  }

  avatarUrlCache.set(relativePath, {
    signedUrl: data.signedUrl,
    expiresAt: now + expiresIn * 1000,
  })

  return data.signedUrl
}

/**
 * Resolves an array of avatar references in a single batch Storage request.
 * Uses in-memory cache to skip already-cached active signed URLs.
 */
export async function resolveAvatarUrls(
  pathsOrUrls: Array<string | null | undefined>,
  expiresIn = 3600
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!pathsOrUrls || pathsOrUrls.length === 0) return result

  const now = Date.now()
  const uncachedRelativePaths: string[] = []
  const relativeToOriginals = new Map<string, string[]>()

  for (const raw of pathsOrUrls) {
    if (!raw) continue
    if ((raw.startsWith('http://') || raw.startsWith('https://')) && !raw.includes(`/${AVATARS_BUCKET}/`)) {
      result.set(raw, raw)
      continue
    }

    const rel = extractStoragePath(raw)
    if (!rel) continue

    const cached = avatarUrlCache.get(rel)
    if (cached && cached.expiresAt > now + 60_000) {
      result.set(raw, cached.signedUrl)
      continue
    }

    const existing = relativeToOriginals.get(rel)
    if (existing) {
      existing.push(raw)
    } else {
      relativeToOriginals.set(rel, [raw])
      uncachedRelativePaths.push(rel)
    }
  }

  if (uncachedRelativePaths.length === 0) {
    return result
  }

  const storageBucket = supabase.storage.from(AVATARS_BUCKET)
  if (typeof storageBucket.createSignedUrls === 'function') {
    const { data, error } = await storageBucket.createSignedUrls(uncachedRelativePaths, expiresIn)
    if (!error && Array.isArray(data)) {
      for (const item of data) {
        const signed = item.signedUrl || (item as { signedURL?: string | null }).signedURL
        if (item.path && signed) {
          avatarUrlCache.set(item.path, {
            signedUrl: signed,
            expiresAt: now + expiresIn * 1000,
          })
          const originals = relativeToOriginals.get(item.path) || []
          for (const orig of originals) {
            result.set(orig, signed)
          }
        }
      }
      return result
    }
  }

  // Graceful fallback for mock environments or when createSignedUrls is not provided
  await Promise.all(
    uncachedRelativePaths.map(async (rel) => {
      const { data } = await storageBucket.createSignedUrl(rel, expiresIn)
      if (data?.signedUrl) {
        avatarUrlCache.set(rel, {
          signedUrl: data.signedUrl,
          expiresAt: now + expiresIn * 1000,
        })
        const originals = relativeToOriginals.get(rel) || []
        for (const orig of originals) {
          result.set(orig, data.signedUrl)
        }
      }
    })
  )

  return result
}

/**
 * Upload an avatar to Supabase Storage and link it to the target entity via RPC.
 */
export async function uploadAvatar(
  file: File | Blob,
  target: AvatarTarget,
  options?: AvatarValidationOptions
): Promise<ApiResponse<AvatarUploadResult>> {
  // 1. Client-side validation
  const validation = validateAvatarFile(file, options)
  if (!validation.valid) {
    return {
      data: null,
      error: {
        message: validation.error ?? 'Invalid avatar file.',
        code: 'VALIDATION_ERROR',
      },
    }
  }

  // 2. Resolve content type and extension
  const contentType = file.type || 'image/webp'
  const ext = contentType.includes('png')
    ? 'png'
    : contentType.includes('gif')
      ? 'gif'
      : contentType.includes('jpeg') || contentType.includes('jpg')
        ? 'jpg'
        : 'webp'

  const storagePath = generateAvatarStoragePath(target, ext)

  // 3. Upload to Supabase Storage
  const { error: storageError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(storagePath, file, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    })

  if (storageError) {
    return {
      data: null,
      error: {
        message: mapAvatarError(storageError.message, (storageError as { statusCode?: string }).statusCode, 'Failed to upload image to storage.'),
        code: (storageError as { statusCode?: string }).statusCode ?? 'STORAGE_ERROR',
        cause: storageError,
      },
    }
  }

  // 4. Canonical internal storage path reference
  const canonicalPath = `${AVATARS_BUCKET}/${storagePath}`

  // 5. Persist canonical reference via authoritative RPC based on target type
  let rpcError: { message: string; code?: string } | null = null

  if (target.type === 'profile') {
    const { error } = await supabase.rpc('set_profile_avatar', {
      p_avatar_url: canonicalPath,
    })
    if (error) rpcError = error
  } else if (target.type === 'person') {
    const { error } = await supabase.rpc('set_person_avatar', {
      p_person_id: target.id,
      p_avatar_url: canonicalPath,
    })
    if (error) rpcError = error
  } else if (target.type === 'family') {
    const { error } = await supabase.rpc('set_family_avatar', {
      p_family_id: target.id,
      p_avatar_url: canonicalPath,
    })
    if (error) rpcError = error
  }

  // 6. Handle RPC error and prevent orphaned storage objects
  if (rpcError) {
    // Attempt rollback of uploaded storage object
    await supabase.storage.from(AVATARS_BUCKET).remove([storagePath]).catch(() => {
      // Best-effort cleanup
    })

    return {
      data: null,
      error: {
        message: mapAvatarError(rpcError.message, rpcError.code, 'Failed to link avatar to record.'),
        code: rpcError.code ?? 'RPC_ERROR',
      },
    }
  }

  // Invalidate any existing cached signed URL for this path
  avatarUrlCache.delete(storagePath)

  return {
    data: {
      url: canonicalPath,
      path: storagePath,
    },
    error: null,
  }
}

/**
 * Remove an avatar from the target record and delete the object from storage.
 */
export async function deleteAvatar(
  target: AvatarTarget,
  currentUrl?: string | null
): Promise<ApiResponse<boolean>> {
  let rpcError: { message: string; code?: string } | null = null

  if (target.type === 'profile') {
    const { error } = await supabase.rpc('set_profile_avatar', {
      p_avatar_url: null,
    })
    if (error) rpcError = error
  } else if (target.type === 'person') {
    const { error } = await supabase.rpc('delete_person_avatar', {
      p_person_id: target.id,
    })
    if (error) rpcError = error
  } else if (target.type === 'family') {
    const { error } = await supabase.rpc('delete_family_avatar', {
      p_family_id: target.id,
    })
    if (error) rpcError = error
  } else {
    return {
      data: null,
      error: {
        message: 'Invalid avatar target type.',
        code: 'VALIDATION_ERROR',
      },
    }
  }

  if (rpcError) {
    return {
      data: null,
      error: {
        message: mapAvatarError(rpcError.message, rpcError.code, 'Failed to remove avatar from record.'),
        code: rpcError.code ?? 'RPC_ERROR',
      },
    }
  }

  // Best effort deletion from storage if old path is resolvable
  const oldPath = extractStoragePath(currentUrl)
  if (oldPath) {
    avatarUrlCache.delete(oldPath)
    await supabase.storage.from(AVATARS_BUCKET).remove([oldPath]).catch(() => {
      // Non-blocking storage cleanup
    })
  }

  return {
    data: true,
    error: null,
  }
}
