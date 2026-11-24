/**
 * ProfilePhotoUpload Component
 *
 * Professional profile photo uploader conforming to SINDHI KHATRI SAMAJ design standards:
 * - Image preview circle with fallback initials / user icon.
 * - Automatic client-side non-blocking Web Worker compression before staging/upload.
 * - Targets <= 400x400 px WebP format, 75–100 KB target (max 150 KB).
 * - Visual optimization feedback and compressed file size badge.
 * - Upload Photo / Change Photo / Remove Photo actions.
 * - Validation for file type (JPG, PNG, WebP, HEIC/HEIF) and size.
 * - Supports staging (file + preview) for registration forms, or direct upload for existing records.
 */

import React, { useState, useRef, useEffect } from 'react'
import { Camera, Upload, Trash2, RefreshCw, Loader2, User, AlertCircle, Sparkles } from 'lucide-react'
import { validateAvatarFile } from '@/features/media/utils/image.utils'
import { resolveAvatarUrl } from '@/features/media/services/avatar.service'
import { compressProfilePhoto } from '@/features/media/utils/imageCompression.utils'

export interface ProfilePhotoUploadProps {
  id?: string
  label?: string
  currentPhotoUrl?: string | null
  previewUrl?: string | null
  onPhotoSelected?: (file: File | null, previewUrl: string | null) => void
  disabled?: boolean
  error?: string
  helperText?: string
  className?: string
}

export const ProfilePhotoUpload: React.FC<ProfilePhotoUploadProps> = ({
  id = 'profile-photo-upload',
  label = 'Profile Photo',
  currentPhotoUrl,
  previewUrl: externalPreviewUrl,
  onPhotoSelected,
  disabled = false,
  error,
  helperText = 'Allowed formats: JPG, PNG, WebP, HEIC. Automatically compressed to WebP (max 75 KB).',
  className = '',
}) => {
  const [internalPreview, setInternalPreview] = useState<string | null>(null)
  const [resolvedStorageUrl, setResolvedStorageUrl] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isLoadingSignedUrl, setIsLoadingSignedUrl] = useState(false)
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressionInfo, setCompressionInfo] = useState<{
    originalSize: number
    compressedSize: number
    savedPercentage: number
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Resolve current storage URL if it's an internal path (avatars/...)
  useEffect(() => {
    let isMounted = true
    if (currentPhotoUrl && !currentPhotoUrl.startsWith('data:') && !currentPhotoUrl.startsWith('blob:')) {
      setIsLoadingSignedUrl(true)
      resolveAvatarUrl(currentPhotoUrl)
        .then((signed) => {
          if (isMounted) setResolvedStorageUrl(signed)
        })
        .finally(() => {
          if (isMounted) setIsLoadingSignedUrl(false)
        })
    } else {
      setResolvedStorageUrl(null)
    }
    return () => {
      isMounted = false
    }
  }, [currentPhotoUrl])

  // Revoke object URL on cleanup
  useEffect(() => {
    return () => {
      if (internalPreview && internalPreview.startsWith('blob:')) {
        URL.revokeObjectURL(internalPreview)
      }
    }
  }, [internalPreview])

  const effectivePreview = externalPreviewUrl || internalPreview || resolvedStorageUrl || currentPhotoUrl

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null)
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateAvatarFile(file)
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid image file.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (internalPreview && internalPreview.startsWith('blob:')) {
      URL.revokeObjectURL(internalPreview)
    }

    setIsCompressing(true)

    try {
      // Automatic client-side compression to WebP (<100 KB target, max 400x400)
      const compressed = await compressProfilePhoto(file)
      setInternalPreview(compressed.previewUrl)
      setCompressionInfo({
        originalSize: compressed.originalSize,
        compressedSize: compressed.compressedSize,
        savedPercentage: compressed.savedPercentage,
      })

      if (onPhotoSelected) {
        onPhotoSelected(compressed.file, compressed.previewUrl)
      }
    } catch {
      setValidationError('Failed to optimize profile photo. Please try another image.')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setIsCompressing(false)
    }
  }

  const handleRemovePhoto = () => {
    setValidationError(null)
    setCompressionInfo(null)
    if (internalPreview && internalPreview.startsWith('blob:')) {
      URL.revokeObjectURL(internalPreview)
    }
    setInternalPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (onPhotoSelected) {
      onPhotoSelected(null, null)
    }
  }

  const handleTriggerUpload = () => {
    if (fileInputRef.current && !disabled && !isCompressing) {
      fileInputRef.current.click()
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-navy-700">
          {label}
        </label>
      )}

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-xl border border-navy-100 bg-slate-50/70">
        {/* Photo Preview Circle */}
        <div className="relative group shrink-0">
          <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-white shadow-md bg-navy-100 flex items-center justify-center relative">
            {isLoadingSignedUrl || isCompressing ? (
              <div className="flex flex-col items-center justify-center gap-1 text-center p-1">
                <Loader2 className="h-6 w-6 text-brand-600 animate-spin" />
                <span className="text-[10px] font-semibold text-brand-700 leading-tight">
                  {isCompressing ? 'Optimizing...' : 'Loading...'}
                </span>
              </div>
            ) : effectivePreview ? (
              <img
                src={effectivePreview}
                alt="Profile preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-12 w-12 text-navy-400" />
            )}
          </div>

          <button
            type="button"
            onClick={handleTriggerUpload}
            disabled={disabled || isCompressing}
            aria-label="Upload profile photo"
            className="absolute bottom-0 right-0 p-1.5 rounded-full bg-brand-600 text-white shadow-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 transition-transform active:scale-95 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>

        {/* Action Controls & Instructions */}
        <div className="flex-1 text-center sm:text-left space-y-2">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <button
              type="button"
              onClick={handleTriggerUpload}
              disabled={disabled || isCompressing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-colors shadow-2xs disabled:opacity-50"
            >
              {isCompressing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
                  <span>Optimizing photo...</span>
                </>
              ) : effectivePreview ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Change Photo</span>
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload Photo</span>
                </>
              )}
            </button>

            {effectivePreview && !isCompressing && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors shadow-2xs disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove Photo</span>
              </button>
            )}
          </div>

          {/* Compressed Size & Optimization Badge */}
          {compressionInfo && !isCompressing && (
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                Image compressed successfully – {Math.max(1, Math.round(compressionInfo.compressedSize / 1024))} KB
              </span>
            </div>
          )}

          <p className="text-xs text-navy-500 leading-relaxed">
            {helperText}
          </p>

          {(validationError || error) && (
            <p className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{validationError || error}</span>
            </p>
          )}
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/jpg,image/heic,image/heif"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || isCompressing}
        />
      </div>
    </div>
  )
}
