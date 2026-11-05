/**
 * AvatarImage — Accessible avatar presentation component
 *
 * Renders an image with automatic error handling, falling back to
 * initials or default user/family icons upon error or absence.
 */

import { useState, useEffect } from 'react'
import { User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getInitials } from '../utils/image.utils'
import { resolveAvatarUrl } from '../services/avatar.service'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type AvatarShape = 'circle' | 'rounded'

export interface AvatarImageProps {
  src?: string | null
  name?: string | null
  alt?: string
  size?: AvatarSize
  shape?: AvatarShape
  className?: string
  isFamily?: boolean
}

const SIZE_CLASSES: Record<AvatarSize, { container: string; text: string; icon: string }> = {
  xs: { container: 'h-6 w-6', text: 'text-[10px]', icon: 'h-3.5 w-3.5' },
  sm: { container: 'h-8 w-8', text: 'text-xs', icon: 'h-4 w-4' },
  md: { container: 'h-10 w-10', text: 'text-sm font-medium', icon: 'h-5 w-5' },
  lg: { container: 'h-14 w-14', text: 'text-base font-semibold', icon: 'h-7 w-7' },
  xl: { container: 'h-20 w-20', text: 'text-xl font-bold', icon: 'h-9 w-9' },
  '2xl': { container: 'h-28 w-28', text: 'text-2xl font-bold', icon: 'h-12 w-12' },
}

export function AvatarImage({
  src,
  name,
  alt,
  size = 'md',
  shape = 'circle',
  className,
  isFamily = false,
}: AvatarImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (!src) return null
    // If it's already an http(s) URL that doesn't start with avatars/, default to it initially
    if ((src.startsWith('http://') || src.startsWith('https://')) && !src.includes('/avatars/')) {
      return src
    }
    return null
  })
  const [imageError, setImageError] = useState(false)

  // Resolve signed URL when src changes (especially for private storage paths)
  useEffect(() => {
    let isCancelled = false
    setImageError(false)

    if (!src) {
      setResolvedSrc(null)
      return
    }

    // Direct external URL that is not storage-backed
    if ((src.startsWith('http://') || src.startsWith('https://')) && !src.includes('/avatars/')) {
      setResolvedSrc(src)
      return
    }

    resolveAvatarUrl(src)
      .then((url) => {
        if (!isCancelled) {
          setResolvedSrc(url)
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setResolvedSrc(null)
          setImageError(true)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [src])

  const dimensions = SIZE_CLASSES[size]
  const initials = getInitials(name)
  const accessibleAlt = alt ?? (name ? `${name}'s avatar` : 'Avatar')
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg'

  if (resolvedSrc && !imageError) {
    return (
      <img
        src={resolvedSrc}
        alt={accessibleAlt}
        onError={() => setImageError(true)}
        className={cn(
          'object-cover border border-navy-200 bg-navy-50 flex-shrink-0',
          dimensions.container,
          shapeClass,
          className
        )}
      />
    )
  }

  // Fallback to initials or icon
  return (
    <div
      aria-label={accessibleAlt}
      role="img"
      className={cn(
        'flex items-center justify-center flex-shrink-0 select-none border border-navy-200',
        isFamily
          ? 'bg-amber-100 text-amber-800'
          : 'bg-brand-100 text-brand-700',
        dimensions.container,
        dimensions.text,
        shapeClass,
        className
      )}
    >
      {initials !== '?' ? (
        <span>{initials}</span>
      ) : isFamily ? (
        <Users className={dimensions.icon} aria-hidden="true" />
      ) : (
        <User className={dimensions.icon} aria-hidden="true" />
      )}
    </div>
  )
}
