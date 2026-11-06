/**
 * Hook: useAccessibilityFontSize
 *
 * Manages user-level font size preference:
 * - Supports: 'SMALL' | 'DEFAULT' | 'LARGE'
 * - Immediately applies root CSS font size scaling across the complete website
 * - Works consistently across desktop, tablet, and mobile
 * - Prevents layout clipping and preserves existing typography and responsive design
 * - Persists locally in localStorage AND synchronizes to user profile in Supabase
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/features/auth/context/AuthContext'

export type FontSizePreference = 'SMALL' | 'DEFAULT' | 'LARGE'

const STORAGE_KEY = 'khatri_font_size_preference'

const SCALE_MAP: Record<FontSizePreference, string> = {
  SMALL: '14px',
  DEFAULT: '16px',
  LARGE: '18px',
}

export function useAccessibilityFontSize() {
  const { user, profile } = useAuthContext()

  const [fontSize, setFontSizeState] = useState<FontSizePreference>(() => {
    // 1. LocalStorage initial load
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY) as FontSizePreference | null
      if (stored && (stored === 'SMALL' || stored === 'DEFAULT' || stored === 'LARGE')) {
        return stored
      }
    }
    return 'DEFAULT'
  })

  // Synchronize when profile loads from database
  useEffect(() => {
    const profileFontSize = (profile as { font_size_preference?: string } | null)?.font_size_preference
    if (profileFontSize && (profileFontSize === 'SMALL' || profileFontSize === 'DEFAULT' || profileFontSize === 'LARGE')) {
      setFontSizeState(profileFontSize as FontSizePreference)
      try {
        localStorage.setItem(STORAGE_KEY, profileFontSize)
      } catch {
        // Ignore quota/private browsing errors
      }
    }
  }, [profile])

  // Apply to document root (html font-size) for rem-based responsive scaling
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      root.style.fontSize = SCALE_MAP[fontSize]
      root.classList.remove('font-size-small', 'font-size-default', 'font-size-large')
      root.classList.add(`font-size-${fontSize.toLowerCase()}`)
    }
  }, [fontSize])

  const setFontSize = useCallback(
    async (newSize: FontSizePreference) => {
      setFontSizeState(newSize)
      try {
        localStorage.setItem(STORAGE_KEY, newSize)
      } catch {
        // Ignore
      }

      // If user is authenticated, persist to profile in database
      if (user?.id) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).rpc('update_my_font_size_preference', {
            p_font_size: newSize,
          })
        } catch {
          // Silent fallback to local storage
        }
      }
    },
    [user?.id]
  )

  const decreaseFontSize = useCallback(() => {
    if (fontSize === 'LARGE') {
      setFontSize('DEFAULT')
    } else if (fontSize === 'DEFAULT') {
      setFontSize('SMALL')
    }
  }, [fontSize, setFontSize])

  const increaseFontSize = useCallback(() => {
    if (fontSize === 'SMALL') {
      setFontSize('DEFAULT')
    } else if (fontSize === 'DEFAULT') {
      setFontSize('LARGE')
    }
  }, [fontSize, setFontSize])

  const resetFontSize = useCallback(() => {
    setFontSize('DEFAULT')
  }, [setFontSize])

  return {
    fontSize,
    setFontSize,
    decreaseFontSize,
    increaseFontSize,
    resetFontSize,
  }
}
