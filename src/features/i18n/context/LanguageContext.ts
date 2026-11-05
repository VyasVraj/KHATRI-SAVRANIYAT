/**
 * Language Context definition and useLanguage consumer hook
 *
 * Separated from LanguageProvider to comply with React Fast Refresh conventions.
 */

import { createContext, useContext } from 'react'
import type { SupportedLanguage, LanguageOption, TranslationKey } from '../types'
import { TRANSLATIONS, SUPPORTED_LANGUAGES } from '../translations'

export interface LanguageContextValue {
  language: SupportedLanguage
  setLanguage: (lang: SupportedLanguage) => void
  t: (key: TranslationKey, fallback?: string) => string
  languages: LanguageOption[]
  currentLanguageOption: LanguageOption
}

const defaultContextValue: LanguageContextValue = {
  language: 'en',
  setLanguage: () => {},
  t: (key: TranslationKey, fallback?: string) => TRANSLATIONS.en[key] ?? fallback ?? key,
  languages: SUPPORTED_LANGUAGES,
  currentLanguageOption: SUPPORTED_LANGUAGES[0],
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)
LanguageContext.displayName = 'LanguageContext'

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)
  return context ?? defaultContextValue
}

export const useTranslation = useLanguage
