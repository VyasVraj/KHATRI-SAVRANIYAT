import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export interface ImagePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  src: string | null
  alt?: string
  title?: string
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  src,
  alt = 'Enlarged profile photo',
  title,
}) => {
  useEffect(() => {
    if (!isOpen) return

    // Prevent background scrolling while preview is open
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen || !src || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Preview for ${title}` : 'Image Preview'}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close preview"
        className="absolute top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/80 text-white border border-white/20 shadow-lg hover:bg-slate-800 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Enlarged image container */}
      <div
        className="relative flex flex-col items-center max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="max-h-[80vh] max-w-[90vw] sm:max-w-xl md:max-w-2xl w-auto h-auto object-contain rounded-2xl shadow-2xl border border-white/20 select-none bg-slate-900/50"
        />

        {title && (
          <div className="mt-3 px-4 py-1.5 rounded-full bg-slate-900/90 border border-white/10 text-white text-xs sm:text-sm font-medium shadow-md truncate max-w-[85vw]">
            {title}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
