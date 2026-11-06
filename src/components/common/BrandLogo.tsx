/**
 * BrandLogo — Official KHATRI SARVANIYAT Emblem Component
 *
 * Renders the authentic traditional Khatri Sarvaniyat emblem:
 * - Deep navy shield with golden decorative border
 * - Crossed traditional swords and sun motif
 * - Central sacred Om symbol
 * - Aspect-ratio preserved (object-fit: contain)
 */

import React from 'react'
import { cn } from '@/lib/utils'

export interface BrandLogoProps {
  /** Size variant or explicit pixel size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number
  /** Additional image container classes */
  className?: string
  /** Image element classes */
  imgClassName?: string
  /** Whether to render the brand name text beside the logo */
  showText?: boolean
  /** Brand text orientation */
  layout?: 'row' | 'column'
  /** Custom classes for brand text */
  textClassName?: string
  /** Priority flag for LCP optimization */
  priority?: boolean
  /** Alt text */
  alt?: string
}

const SIZE_MAP = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-20 w-20',
  xl: 'h-28 w-28',
} as const

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'sm',
  className,
  imgClassName,
  showText = false,
  layout = 'row',
  textClassName,
  priority = false,
  alt = 'KHATRI SARVANIYAT Official Emblem',
}) => {
  const sizeClass = typeof size === 'string' ? SIZE_MAP[size] : ''
  const inlineStyle = typeof size === 'number' ? { width: size, height: size } : undefined

  const imageElement = (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md',
        sizeClass,
        className
      )}
      style={inlineStyle}
    >
      <img
        src="/logo.png"
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={cn(
          'h-full w-full object-contain drop-shadow-xs transition-transform',
          imgClassName
        )}
      />
    </div>
  )

  if (!showText) {
    return imageElement
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5',
        layout === 'column' ? 'flex-col text-center' : 'flex-row',
        className
      )}
    >
      {imageElement}
      <span
        className={cn(
          'font-bold tracking-tight text-white select-none',
          size === 'lg' || size === 'xl' ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg',
          textClassName
        )}
      >
        KHATRI SARVANIYAT
      </span>
    </div>
  )
}
