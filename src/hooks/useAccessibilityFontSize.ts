/**
 * Hook: useAccessibilityFontSize
 *
 * Manages user-level font size preference across 5 calibrated accessibility steps:
 * - Step 1: 'SMALL' (14px / 0.90 scale)
 * - Step 2: 'STANDARD' (16px / 1.00 scale) [Default]
 * - Step 3: 'LARGE' (18px / 1.15 scale)
 * - Step 4: 'EXTRA_LARGE' (21px / 1.30 scale)
 * - Step 5: 'VERY_LARGE' (24px / 1.45 scale)
 *
 * - Live sliding bar interaction without page refresh
 * - Synchronizes across document root HTML font-size and CSS utility classes
 * - Preserves responsive design across all devices
 * - Persists to localStorage and Supabase profile via RPC update_my_font_size_preference
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/features/auth/context/AuthContext'

export type FontSizePreference =
  | 'SMALL'
  | 'STANDARD'
  | 'DEFAULT'
  | 'LARGE'
  | 'EXTRA_LARGE'
  | 'VERY_LARGE'

export const FONT_SIZE_STEPS: ReadonlyArray<Exclude<FontSizePreference, 'DEFAULT'>> = [
  'SMALL',
  'STANDARD',
  'LARGE',
  'EXTRA_LARGE',
  'VERY_LARGE',
] as const

const STORAGE_KEY = 'khatri_font_size_preference'

const SCALE_MAP: Record<string, string> = {
  SMALL: '14px',
  STANDARD: '16px',
  DEFAULT: '16px',
  LARGE: '18px',
  EXTRA_LARGE: '21px',
  VERY_LARGE: '24px',
}

export const FONT_SIZE_LABELS: Record<string, string> = {
  SMALL: 'Small',
  STANDARD: 'Standard',
  DEFAULT: 'Standard',
  LARGE: 'Large',
  EXTRA_LARGE: 'Extra Large',
  VERY_LARGE: 'Very Large',
}

function normalizePreference(val?: string | null): FontSizePreference {
  if (!val) return 'STANDARD'
  const upper = val.toUpperCase().trim()
  if (upper === 'SMALL') return 'SMALL'
  if (upper === 'STANDARD' || upper === 'DEFAULT') return 'STANDARD'
  if (upper === 'LARGE') return 'LARGE'
  if (upper === 'EXTRA_LARGE') return 'EXTRA_LARGE'
  if (upper === 'VERY_LARGE') return 'VERY_LARGE'
  return 'STANDARD'
}

function preferenceToStep(pref: FontSizePreference): number {
  switch (pref) {
    case 'SMALL':
      return 1
    case 'STANDARD':
    case 'DEFAULT':
      return 2
    case 'LARGE':
      return 3
    case 'EXTRA_LARGE':
      return 4
    case 'VERY_LARGE':
      return 5
    default:
      return 2
  }
}

function stepToPreference(step: number): Exclude<FontSizePreference, 'DEFAULT'> {
  const clamped = Math.max(1, Math.min(5, Math.round(step)))
  return FONT_SIZE_STEPS[clamped - 1]
}

export function useAccessibilityFontSize() {
  const { user, profile } = useAuthContext()

  const [fontSize, setFontSizeState] = useState<FontSizePreference>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return normalizePreference(stored)
      }
    }
    return 'STANDARD'
  })

  // Synchronize when profile loads from database
  useEffect(() => {
    const profileFontSize = (profile as { font_size_preference?: string } | null)?.font_size_preference
    if (profileFontSize) {
      const normalized = normalizePreference(profileFontSize)
      setFontSizeState(normalized)
      try {
        localStorage.setItem(STORAGE_KEY, normalized)
      } catch {
        // Ignore quota/private browsing errors
      }
    }
  }, [profile])

  // Apply to document root (html font-size) for rem-based responsive scaling
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      const sizePx = SCALE_MAP[fontSize] || '16px'
      root.style.fontSize = sizePx
      root.classList.remove(
        'font-size-small',
        'font-size-standard',
        'font-size-default',
        'font-size-large',
        'font-size-extra-large',
        'font-size-very-large'
      )
      const classSuffix = fontSize.toLowerCase().replace('_', '-')
      root.classList.add(`font-size-${classSuffix}`)
    }
  }, [fontSize])

  const setFontSize = useCallback(
    async (newSize: FontSizePreference) => {
      const normalized = normalizePreference(newSize)
      setFontSizeState(normalized)
      try {
        localStorage.setItem(STORAGE_KEY, normalized)
      } catch {
        // Ignore
      }

      // If user is authenticated, persist to profile in database
      if (user?.id) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).rpc('update_my_font_size_preference', {
            p_font_size: normalized,
          })
        } catch {
          // Silent fallback to local storage
        }
      }
    },
    [user?.id]
  )

  const step = useMemo(() => preferenceToStep(fontSize), [fontSize])
  const levelLabel = useMemo(() => FONT_SIZE_LABELS[fontSize] || 'Standard', [fontSize])

  const setStep = useCallback(
    (newStep: number) => {
      const pref = stepToPreference(newStep)
      setFontSize(pref)
    },
    [setFontSize]
  )

  const decreaseFontSize = useCallback(() => {
    setStep(Math.max(1, step - 1))
  }, [setStep, step])

  const increaseFontSize = useCallback(() => {
    setStep(Math.min(5, step + 1))
  }, [setStep, step])

  const resetFontSize = useCallback(() => {
    setFontSize('STANDARD')
  }, [setFontSize])

  return {
    fontSize,
    step,
    levelLabel,
    setStep,
    setFontSize,
    decreaseFontSize,
    increaseFontSize,
    resetFontSize,
  }
}
