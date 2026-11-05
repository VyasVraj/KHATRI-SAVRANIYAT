/**
 * Image Utilities for Media & Avatar Processing
 *
 * Provides client-side file validation, storage path construction,
 * aspect-ratio cropping, and initials derivation.
 */

import type {
  AvatarTarget,
  AvatarValidationOptions,
  AvatarValidationResult,
} from '../types'

export const DEFAULT_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

export const DEFAULT_MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5 MB
export const DEFAULT_AVATAR_DIMENSION = 512

/**
 * Validate an avatar image file against size and MIME type restrictions.
 */
export function validateAvatarFile(
  file: File | Blob,
  options?: AvatarValidationOptions
): AvatarValidationResult {
  const maxSize = options?.maxSizeBytes ?? DEFAULT_MAX_AVATAR_SIZE
  const allowedTypes = options?.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES

  if (!file) {
    return { valid: false, error: 'No file selected.' }
  }

  if (file.size > maxSize) {
    const maxMb = (maxSize / (1024 * 1024)).toFixed(0)
    return {
      valid: false,
      error: `File size exceeds the ${maxMb}MB limit. Please choose a smaller image.`,
    }
  }

  // If File has type property, check MIME type
  if (file.type && !allowedTypes.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Unsupported image format. Allowed formats: JPEG, PNG, WEBP, GIF.',
    }
  }

  return { valid: true }
}

/**
 * Generates an isolated, collision-safe storage path for an avatar object.
 *
 * Folder structure:
 * - profiles/{user_id}/avatar_{timestamp}.{ext}
 * - persons/{person_id}/avatar_{timestamp}.{ext}
 * - families/{family_id}/avatar_{timestamp}.{ext}
 *
 * Timestamp prevents browser CDN caching issues when an avatar is replaced.
 */
export function generateAvatarStoragePath(
  target: AvatarTarget,
  extension = 'webp'
): string {
  const cleanExt = extension.replace(/^\./, '').toLowerCase() || 'webp'
  const folder =
    target.type === 'profile'
      ? 'profiles'
      : target.type === 'person'
        ? 'persons'
        : 'families'

  const timestamp = Date.now()
  return `${folder}/${target.id}/avatar_${timestamp}.${cleanExt}`
}

/**
 * Extracts clean initials from a person or family name.
 */
export function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Crop and resize an image file into a square avatar Blob using canvas.
 * Falls back to the original file/blob if canvas or window.Image is unavailable (e.g. in test env).
 */
export async function cropAndResizeAvatar(
  file: File | Blob,
  targetSize = DEFAULT_AVATAR_DIMENSION,
  quality = 0.85
): Promise<Blob> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file
  }

  return new Promise((resolve) => {
    try {
      const img = new Image()
      const url = URL.createObjectURL(file)

      img.onload = () => {
        URL.revokeObjectURL(url)
        try {
          const canvas = document.createElement('canvas')
          canvas.width = targetSize
          canvas.height = targetSize
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            resolve(file)
            return
          }

          // Calculate center crop
          const { naturalWidth: width, naturalHeight: height } = img
          const minDim = Math.min(width, height)
          const sx = (width - minDim) / 2
          const sy = (height - minDim) / 2

          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize)

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob)
              } else {
                resolve(file)
              }
            },
            'image/webp',
            quality
          )
        } catch {
          resolve(file)
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(file)
      }

      img.src = url
    } catch {
      resolve(file)
    }
  })
}

/**
 * Format bytes into readable format (e.g. 1.2 MB, 450 KB).
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Format an ISO timestamp to locale date string.
 */
export function formatMediaDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}
