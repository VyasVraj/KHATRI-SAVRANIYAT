/**
 * Tour Context definition and useTour consumer hook
 *
 * Separated from TourProvider to comply with React Fast Refresh conventions.
 */

import { createContext, useContext } from 'react'
import type { TourStep } from '../types'

export interface TourContextValue {
  isActive: boolean
  currentStepIndex: number
  currentStep: TourStep | null
  totalSteps: number
  hasSeenTour: boolean
  startTour: () => void
  endTour: () => void
  skipTour: () => void
  nextStep: () => void
  prevStep: () => void
  resetTour: () => void
}

export const TourContext = createContext<TourContextValue | null>(null)
TourContext.displayName = 'TourContext'

export function useTour(): TourContextValue {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within a TourProvider')
  }
  return context
}
