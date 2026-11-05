/**
 * Unit Tests: App Tour & Guided Onboarding System
 * ANDROID-3 Parity Requirement
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TourProvider, useTour, AppTourOverlay, AppTourReplayButton, MAIN_COMMUNITY_TOUR_STEPS } from '@/features/onboarding'
import { LanguageProvider } from '@/features/i18n'

function TestTourConsumer() {
  const { isActive, currentStepIndex, currentStep, startTour, endTour, resetTour } = useTour()
  return (
    <div>
      <div data-testid="is-active">{isActive ? 'true' : 'false'}</div>
      <div data-testid="step-index">{currentStepIndex}</div>
      <div data-testid="step-number">{currentStep?.stepNumber ?? 'none'}</div>
      <button onClick={startTour}>Manual Start</button>
      <button onClick={endTour}>Manual End</button>
      <button onClick={resetTour}>Manual Reset</button>

      {/* Mock target anchors */}
      <div data-tour-target="header-language-select">Language Select Target</div>
      <div data-tour-target="community-updates">Updates Target</div>
      <div data-tour-target="census-start">Census Start Target</div>
      <div data-tour-target="nav-discover">Discover Target</div>
      <div data-tour-target="nav-my-family">My Family Target</div>
      <div data-tour-target="nav-community">Community Target</div>
      <div data-tour-target="nav-profile">Profile Target</div>
    </div>
  )
}

describe('ANDROID-3: App Tour & Guided Onboarding System', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defines the complete 7-step community onboarding tour', () => {
    expect(MAIN_COMMUNITY_TOUR_STEPS).toHaveLength(7)
    expect(MAIN_COMMUNITY_TOUR_STEPS[0].stepNumber).toBe(1)
    expect(MAIN_COMMUNITY_TOUR_STEPS[6].stepNumber).toBe(7)
    expect(MAIN_COMMUNITY_TOUR_STEPS[0].id).toBe('step-1-language')
    expect(MAIN_COMMUNITY_TOUR_STEPS[1].id).toBe('step-2-updates')
    expect(MAIN_COMMUNITY_TOUR_STEPS[2].id).toBe('step-3-census')
    expect(MAIN_COMMUNITY_TOUR_STEPS[3].id).toBe('step-4-search')
    expect(MAIN_COMMUNITY_TOUR_STEPS[4].id).toBe('step-5-family')
    expect(MAIN_COMMUNITY_TOUR_STEPS[5].id).toBe('step-6-community')
    expect(MAIN_COMMUNITY_TOUR_STEPS[6].id).toBe('step-7-profile')
  })

  it('auto-starts tour for first-time visitors and navigates all 7 steps to completion', () => {
    render(
      <LanguageProvider>
        <TourProvider autoStart={true}>
          <TestTourConsumer />
          <AppTourOverlay />
        </TourProvider>
      </LanguageProvider>
    )

    // Initially unmounted until timer fires
    expect(screen.getByTestId('is-active')).toHaveTextContent('false')

    // Advance timer for autoStart
    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(screen.getByTestId('is-active')).toHaveTextContent('true')
    expect(screen.getByTestId('step-number')).toHaveTextContent('1')
    expect(screen.getByText('STEP 1 OF 7')).toBeInTheDocument()
    expect(screen.getByText('Choose your language')).toBeInTheDocument()

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('STEP 2 OF 7')).toBeInTheDocument()
    expect(screen.getByText('Community updates')).toBeInTheDocument()

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('STEP 3 OF 7')).toBeInTheDocument()
    expect(screen.getByText('Start here')).toBeInTheDocument()

    // Step 3 -> Step 4
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('STEP 4 OF 7')).toBeInTheDocument()
    expect(screen.getByText('Search families')).toBeInTheDocument()

    // Step 4 -> Step 5
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('STEP 5 OF 7')).toBeInTheDocument()
    expect(screen.getByText('My Family')).toBeInTheDocument()

    // Step 5 -> Step 6
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('STEP 6 OF 7')).toBeInTheDocument()
    expect(screen.getByText('Community')).toBeInTheDocument()

    // Step 6 -> Step 7 (Final step)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('STEP 7 OF 7')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
    const doneButton = screen.getByRole('button', { name: /done/i })
    expect(doneButton).toBeInTheDocument()

    // Complete tour via Done button
    fireEvent.click(doneButton)
    expect(screen.getByTestId('is-active')).toHaveTextContent('false')
    expect(window.localStorage.getItem('app_tour_completed')).toBe('true')
  })

  it('allows skipping the tour at any step and remembers completion', () => {
    render(
      <LanguageProvider>
        <TourProvider autoStart={true}>
          <TestTourConsumer />
          <AppTourOverlay />
        </TourProvider>
      </LanguageProvider>
    )

    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(screen.getByText('STEP 1 OF 7')).toBeInTheDocument()

    // Click Skip
    const skipButton = screen.getByRole('button', { name: /skip/i })
    fireEvent.click(skipButton)

    expect(screen.getByTestId('is-active')).toHaveTextContent('false')
    expect(window.localStorage.getItem('app_tour_completed')).toBe('true')
  })

  it('supports keyboard navigation (Escape to skip, Enter to advance)', () => {
    render(
      <LanguageProvider>
        <TourProvider autoStart={true}>
          <TestTourConsumer />
          <AppTourOverlay />
        </TourProvider>
      </LanguageProvider>
    )

    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(screen.getByText('STEP 1 OF 7')).toBeInTheDocument()

    // Press Enter to advance
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByText('STEP 2 OF 7')).toBeInTheDocument()

    // Press Escape to dismiss
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByTestId('is-active')).toHaveTextContent('false')
  })

  it('replays tour when AppTourReplayButton is clicked', () => {
    window.localStorage.setItem('app_tour_completed', 'true')

    render(
      <LanguageProvider>
        <TourProvider autoStart={true}>
          <TestTourConsumer />
          <AppTourReplayButton />
          <AppTourOverlay />
        </TourProvider>
      </LanguageProvider>
    )

    act(() => {
      vi.advanceTimersByTime(800)
    })

    // Because app_tour_completed is true, tour is not active
    expect(screen.getByTestId('is-active')).toHaveTextContent('false')

    // Click Replay Button
    const replayBtn = screen.getByRole('button', { name: /replay/i })
    fireEvent.click(replayBtn)

    expect(screen.getByTestId('is-active')).toHaveTextContent('true')
    expect(screen.getByText('STEP 1 OF 7')).toBeInTheDocument()
  })
})
