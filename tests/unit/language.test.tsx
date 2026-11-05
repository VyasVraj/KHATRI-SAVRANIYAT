/**
 * Unit Tests: i18n & Language Selection System
 * ANDROID-3 Parity Requirement
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider, useLanguage, LanguageSelector, SUPPORTED_LANGUAGES, TRANSLATIONS } from '@/features/i18n'
import type { TranslationKey } from '@/features/i18n'

function TestLanguageConsumer() {
  const { language, setLanguage, t, currentLanguageOption } = useLanguage()
  return (
    <div>
      <div data-testid="current-lang">{language}</div>
      <div data-testid="current-label">{currentLanguageOption.label}</div>
      <div data-testid="slogan">{t('app.slogan')}</div>
      <div data-testid="step1-title">{t('tour.step1.title')}</div>
      <button onClick={() => setLanguage('hi')}>Switch to Hindi</button>
      <button onClick={() => setLanguage('gu')}>Switch to Gujarati</button>
      <button onClick={() => setLanguage('en')}>Switch to English</button>
    </div>
  )
}

describe('ANDROID-3: Language System & Translations', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('provides all 3 supported community languages: EN, HI, GU', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(3)
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code)
    expect(codes).toContain('en')
    expect(codes).toContain('hi')
    expect(codes).toContain('gu')
  })

  it('contains complete translation dictionaries for en, hi, and gu', () => {
    const keys = Object.keys(TRANSLATIONS.en) as TranslationKey[]
    expect(keys.length).toBeGreaterThan(25)

    for (const key of keys) {
      expect(TRANSLATIONS.en[key]).toBeDefined()
      expect(TRANSLATIONS.hi[key]).toBeDefined()
      expect(TRANSLATIONS.gu[key]).toBeDefined()
      expect(TRANSLATIONS.en[key].length).toBeGreaterThan(0)
      expect(TRANSLATIONS.hi[key].length).toBeGreaterThan(0)
      expect(TRANSLATIONS.gu[key].length).toBeGreaterThan(0)
    }
  })

  it('renders default language as English (en) and persists switch to Hindi', () => {
    render(
      <LanguageProvider>
        <TestLanguageConsumer />
      </LanguageProvider>
    )

    expect(screen.getByTestId('current-lang')).toHaveTextContent('en')
    expect(screen.getByTestId('slogan')).toHaveTextContent('Ek Samaj • Ek Pehchaan • Ek Digital Record')
    expect(screen.getByTestId('step1-title')).toHaveTextContent('Choose your language')

    // Switch to Hindi
    fireEvent.click(screen.getByText('Switch to Hindi'))
    expect(screen.getByTestId('current-lang')).toHaveTextContent('hi')
    expect(screen.getByTestId('slogan')).toHaveTextContent('एक समाज • एक पहचान • एक डिजिटल रिकॉर्ड')
    expect(screen.getByTestId('step1-title')).toHaveTextContent('अपनी भाषा चुनें')
    expect(window.localStorage.getItem('app_language')).toBe('hi')

    // Switch to Gujarati
    fireEvent.click(screen.getByText('Switch to Gujarati'))
    expect(screen.getByTestId('current-lang')).toHaveTextContent('gu')
    expect(screen.getByTestId('slogan')).toHaveTextContent('એક સમાજ • એક ઓળખ • એક ડિજિટલ રેકોર્ડ')
    expect(screen.getByTestId('step1-title')).toHaveTextContent('તમારી ભાષા પસંદ કરો')
    expect(window.localStorage.getItem('app_language')).toBe('gu')
  })

  it('restores saved language preference from localStorage', () => {
    window.localStorage.setItem('app_language', 'gu')

    render(
      <LanguageProvider>
        <TestLanguageConsumer />
      </LanguageProvider>
    )

    expect(screen.getByTestId('current-lang')).toHaveTextContent('gu')
    expect(screen.getByTestId('slogan')).toHaveTextContent('એક સમાજ • એક ઓળખ • એક ડિજિટલ રેકોર્ડ')
  })

  it('renders LanguageSelector header pill and allows opening dropdown to switch language', () => {
    render(
      <LanguageProvider>
        <LanguageSelector variant="header" />
        <TestLanguageConsumer />
      </LanguageProvider>
    )

    // Initially closed
    const trigger = screen.getByRole('button', { name: /choose your language/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    // Open dropdown
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    // Click Hindi in dropdown
    const hindiItem = screen.getByRole('menuitem', { name: /हिन्दी/i })
    fireEvent.click(hindiItem)

    expect(screen.getByTestId('current-lang')).toHaveTextContent('hi')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders LanguageSelector card variant for profile settings', () => {
    render(
      <LanguageProvider>
        <LanguageSelector variant="card" />
        <TestLanguageConsumer />
      </LanguageProvider>
    )

    const gujaratiBtn = screen.getByRole('button', { name: /ગુજરાતી/i })
    fireEvent.click(gujaratiBtn)
    expect(screen.getByTestId('current-lang')).toHaveTextContent('gu')
  })
})
