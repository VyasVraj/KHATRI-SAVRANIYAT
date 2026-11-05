/**
 * Tour Provider Component
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { MAIN_COMMUNITY_TOUR_STEPS } from '../constants/tours'
import { TourContext, type TourContextValue } from './TourContext'

const STORAGE_KEY = 'app_tour_completed'

interface TourProviderProps {
  children: ReactNode
  autoStart?: boolean
}

export function TourProvider({ children, autoStart = true }: TourProviderProps) {
  const [hasSeenTour, setHasSeenTour] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(STORAGE_KEY) === 'true'
      }
    } catch {
      // Ignore storage access errors
    }
    return false
  })

  const [isActive, setIsActive] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  // Auto-start for first-time visitors after short mount delay
  useEffect(() => {
    if (autoStart && !hasSeenTour) {
      const timer = setTimeout(() => {
        setIsActive(true)
        setCurrentStepIndex(0)
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [autoStart, hasSeenTour])

  const markTourCompleted = useCallback(() => {
    setHasSeenTour(true)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, 'true')
      }
    } catch {
      // Ignore storage access errors
    }
  }, [])

  const startTour = useCallback(() => {
    setCurrentStepIndex(0)
    setIsActive(true)
  }, [])

  const endTour = useCallback(() => {
    setIsActive(false)
    markTourCompleted()
  }, [markTourCompleted])

  const skipTour = useCallback(() => {
    setIsActive(false)
    markTourCompleted()
  }, [markTourCompleted])

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prev) => {
      if (prev >= MAIN_COMMUNITY_TOUR_STEPS.length - 1) {
        endTour()
        return prev
      }
      return prev + 1
    })
  }, [endTour])

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1))
  }, [])

  const resetTour = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Ignore storage access errors
    }
    setHasSeenTour(false)
    startTour()
  }, [startTour])

  const currentStep = isActive ? MAIN_COMMUNITY_TOUR_STEPS[currentStepIndex] ?? null : null

  const value: TourContextValue = {
    isActive,
    currentStepIndex,
    currentStep,
    totalSteps: MAIN_COMMUNITY_TOUR_STEPS.length,
    hasSeenTour,
    startTour,
    endTour,
    skipTour,
    nextStep,
    prevStep,
    resetTour,
  }

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}
