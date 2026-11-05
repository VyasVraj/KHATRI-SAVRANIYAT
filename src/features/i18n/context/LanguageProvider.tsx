/**
 * Language Provider Component
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import type { SupportedLanguage, TranslationKey } from '../types'
import { SUPPORTED_LANGUAGES, TRANSLATIONS } from '../translations'
import { LanguageContext, type LanguageContextValue } from './LanguageContext'

const STORAGE_KEY = 'app_language'

interface LanguageProviderProps {
  children: ReactNode
  defaultLanguage?: SupportedLanguage
}

export function LanguageProvider({ children, defaultLanguage = 'en' }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null
        if (saved && (saved === 'en' || saved === 'hi' || saved === 'gu')) {
          return saved
        }
      }
    } catch {
      // Ignore storage access errors
    }
    return defaultLanguage
  })

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, lang)
      }
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang
      }
    } catch {
      // Ignore storage access errors
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language
    }
  }, [language])

  const t = useCallback(
    (key: TranslationKey, fallback?: string): string => {
      const dict = TRANSLATIONS[language]
      if (dict && dict[key]) {
        return dict[key]
      }
      const enDict = TRANSLATIONS.en
      if (enDict && enDict[key]) {
        return enDict[key]
      }
      return fallback ?? key
    },
    [language]
  )

  const currentLanguageOption =
    SUPPORTED_LANGUAGES.find((opt) => opt.code === language) ?? SUPPORTED_LANGUAGES[0]

  const value: LanguageContextValue = {
    language,
    setLanguage,
    t,
    languages: SUPPORTED_LANGUAGES,
    currentLanguageOption,
  }

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
