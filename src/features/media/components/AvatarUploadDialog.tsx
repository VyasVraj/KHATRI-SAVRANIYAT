/**
 * AvatarUploadDialog Component
 *
 * Accessible modal dialog enabling avatar selection, drag-and-drop,
 * client-side preview, validation, upload, and deletion.
 */

import React, { useState, useRef, useEffect } from 'react'
import { X, Upload, Trash2, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react'
import type { AvatarTarget } from '../types'
import { validateAvatarFile, cropAndResizeAvatar } from '../utils/image.utils'
import { uploadAvatar, deleteAvatar } from '../services/avatar.service'
import { Button } from '@/components/forms/Button'

export interface AvatarUploadDialogProps {
  isOpen: boolean
  onClose: () => void
  target: AvatarTarget
  currentAvatarUrl?: string | null
  title?: string
  onSuccess?: (newUrl: string | null) => void
}

export const AvatarUploadDialog: React.FC<AvatarUploadDialogProps> = ({
  isOpen,
  onClose,
  target,
  currentAvatarUrl,
  title,
  onSuccess,
}) => {
  const defaultTitle = target.type === 'family' ? 'Update Family Crest' : 'Update Photo'
  const dialogTitle = title ?? defaultTitle
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clear preview URL object URL when component unmounts or file changes
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [selectedFile])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null)
      setPreviewUrl(null)
      setErrorMessage(null)
      setIsUploading(false)
      setIsDeleting(false)
    }
  }, [isOpen])

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !isUploading && !isDeleting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isUploading, isDeleting, onClose])

  if (!isOpen) return null

  const handleFileChange = (file: File | null) => {
    setErrorMessage(null)
    if (!file) return

    const validation = validateAvatarFile(file)
    if (!validation.valid) {
      setErrorMessage(validation.error ?? 'Invalid file selected.')
      return
    }

    setSelectedFile(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0])
    }
  }

  const handleSave = async () => {
    if (!selectedFile) return
    setIsUploading(true)
    setErrorMessage(null)

    try {
      // Crop & resize on client
      const processedBlob = await cropAndResizeAvatar(selectedFile)

      const result = await uploadAvatar(processedBlob, target)
      if (result.error) {
        setErrorMessage(result.error.message)
        setIsUploading(false)
        return
      }

      if (onSuccess && result.data) {
        onSuccess(result.data.url)
      }
      onClose()
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to upload photo.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!currentAvatarUrl) return
    setIsDeleting(true)
    setErrorMessage(null)

    try {
      const result = await deleteAvatar(target, currentAvatarUrl)
      if (result.error) {
        setErrorMessage(result.error.message)
        setIsDeleting(false)
        return
      }

      if (onSuccess) {
        onSuccess(null)
      }
      onClose()
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to remove photo.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading && !isDeleting) {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-dialog-title"
    >
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl border border-navy-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-6 py-4">
          <h2 id="avatar-dialog-title" className="text-lg font-semibold text-navy-900">
            {dialogTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading || isDeleting}
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Preview / Dropzone */}
          {previewUrl ? (
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="relative h-44 w-44 rounded-full overflow-hidden border-4 border-brand-100 shadow-md">
                <img
                  src={previewUrl}
                  alt="Avatar preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                disabled={isUploading}
                className="text-xs text-brand-600 hover:text-brand-800 underline font-medium"
              >
                Choose a different photo
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
                isDragOver
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-navy-200 bg-navy-50/50 hover:bg-navy-50 hover:border-navy-300'
              }`}
            >
              <div className="rounded-full bg-white p-3 shadow-sm border border-navy-100 text-brand-600">
                <ImageIcon className="h-8 w-8" />
              </div>
              <p className="mt-3 text-sm font-medium text-navy-800">
                Click to select or drag and drop photo
              </p>
              <p className="mt-1 text-xs text-navy-500">
                JPEG, PNG, WEBP, or GIF (max 5 MB)
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileChange(e.target.files[0])
              }
            }}
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-navy-100 bg-navy-50/50 px-6 py-4">
          <div>
            {currentAvatarUrl && !previewUrl && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isUploading}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>Remove current photo</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isUploading || isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!selectedFile || isUploading || isDeleting}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1.5" />
                  Save Photo
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
