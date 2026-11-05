/**
 * Onboarding & App Tour Types
 *
 * Implements the 7-step guided community tour as shown in KhatriSetu Android screens 00-06.
 */

import type { TranslationKey } from '@/features/i18n'

export interface TourStep {
  id: string
  stepNumber: number
  totalSteps: number
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  targetSelector?: string
  position?: 'top' | 'bottom' | 'center'
  targetTab?: string
}

export interface TourState {
  isActive: boolean
  currentStepIndex: number
  hasSeenTour: boolean
}
