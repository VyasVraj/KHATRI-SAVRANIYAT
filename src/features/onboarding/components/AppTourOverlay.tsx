/**
 * App Tour Overlay Component
 *
 * Renders the guided tour card with step indicator, localized text,
 * spotlight target tracking, and accessible navigation.
 * Parity with KhatriSetu 49-page PDF screens 00 to 06.
 */

import { useState, useEffect, useRef } from 'react'
import { Sparkles, ArrowRight, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTour } from '../context/TourContext'
import { useLanguage } from '@/features/i18n'

export function AppTourOverlay() {
  const { isActive, currentStep, currentStepIndex, totalSteps, nextStep, prevStep, skipTour, endTour } = useTour()
  const { t } = useLanguage()
  const cardRef = useRef<HTMLDivElement>(null)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  // Track target element bounding rect
  useEffect(() => {
    if (!isActive || !currentStep?.targetSelector) {
      setTargetRect(null)
      return
    }

    function updateRect() {
      if (!currentStep?.targetSelector) return
      const el = document.querySelector(currentStep.targetSelector)
      if (el) {
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
        if (typeof el.getBoundingClientRect === 'function') {
          setTargetRect(el.getBoundingClientRect())
        }
      } else {
        setTargetRect(null)
      }
    }

    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)

    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [isActive, currentStep])

  // Keyboard accessibility
  useEffect(() => {
    if (!isActive) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        skipTour()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        nextStep()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevStep()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, nextStep, prevStep, skipTour])

  if (!isActive || !currentStep) return null

  const isLastStep = currentStepIndex === totalSteps - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Community App Tour - Step ${currentStep.stepNumber} of ${totalSteps}`}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
    >
      {/* Semi-transparent dark backdrop */}
      <div
        className="fixed inset-0 bg-navy-950/70 backdrop-blur-2xs transition-opacity duration-300"
        onClick={skipTour}
        aria-hidden="true"
      />

      {/* Target Element Spotlight Highlight Ring (if target found) */}
      {targetRect && (
        <div
          style={{
            top: `${Math.max(4, targetRect.top - 6)}px`,
            left: `${Math.max(4, targetRect.left - 6)}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
          }}
          className="fixed pointer-events-none rounded-xl border-2 border-brand-400 bg-white/10 ring-4 ring-brand-400/30 transition-all duration-300 ease-out z-50 animate-pulse"
          aria-hidden="true"
        />
      )}

      {/* Tour Card */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className={cn(
          'relative z-50 mx-4 w-full max-w-sm rounded-2xl border border-navy-200 bg-white p-5 shadow-2xl transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-brand-400 sm:max-w-md'
        )}
      >
        {/* Header with Step Badge and Close */}
        <div className="flex items-center justify-between pb-3 border-b border-navy-100">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-900 border border-amber-300">
              <Sparkles className="h-3 w-3 text-amber-600" aria-hidden="true" />
              STEP {currentStep.stepNumber} OF {totalSteps}
            </span>
          </div>

          <button
            type="button"
            onClick={skipTour}
            aria-label={t('action.close')}
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-navy-400 hover:bg-navy-100 hover:text-navy-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Title & Description */}
        <div className="py-4 space-y-2">
          <h2 className="text-lg font-bold text-navy-900 tracking-tight">
            {t(currentStep.titleKey)}
          </h2>
          <p className="text-sm text-navy-600 leading-relaxed">
            {t(currentStep.descriptionKey)}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-2">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                idx === currentStepIndex
                  ? 'w-6 bg-brand-600'
                  : 'w-1.5 bg-navy-200'
              )}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* Actions bar (Skip & Next/Done) */}
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-navy-100">
          <button
            type="button"
            onClick={skipTour}
            className="inline-flex min-h-[44px] items-center justify-center text-xs font-semibold text-navy-500 hover:text-navy-800 px-3 py-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {t('action.skip')}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isLastStep ? endTour : nextStep}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1',
                isLastStep
                  ? 'bg-teal-700 hover:bg-teal-800'
                  : 'bg-brand-600 hover:bg-brand-700'
              )}
            >
              {isLastStep ? (
                <>
                  <span>{t('action.done')}</span>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              ) : (
                <>
                  <span>{t('action.next')}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
