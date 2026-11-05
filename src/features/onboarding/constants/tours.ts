/**
 * App Tour Definitions
 *
 * Direct parity with KhatriSetu 49-page reference PDF (Screens 00 to 06):
 * STEP 1 OF 7: Choose your language
 * STEP 2 OF 7: Community updates
 * STEP 3 OF 7: Start here
 * STEP 4 OF 7: Search families
 * STEP 5 OF 7: My Family
 * STEP 6 OF 7: Community
 * STEP 7 OF 7: Profile
 */

import type { TourStep } from '../types'

export const MAIN_COMMUNITY_TOUR_STEPS: TourStep[] = [
  {
    id: 'step-1-language',
    stepNumber: 1,
    totalSteps: 7,
    titleKey: 'tour.step1.title',
    descriptionKey: 'tour.step1.desc',
    targetSelector: '[data-tour-target="header-language-select"]',
    position: 'bottom',
  },
  {
    id: 'step-2-updates',
    stepNumber: 2,
    totalSteps: 7,
    titleKey: 'tour.step2.title',
    descriptionKey: 'tour.step2.desc',
    targetSelector: '[data-tour-target="community-updates"]',
    position: 'bottom',
  },
  {
    id: 'step-3-census',
    stepNumber: 3,
    totalSteps: 7,
    titleKey: 'tour.step3.title',
    descriptionKey: 'tour.step3.desc',
    targetSelector: '[data-tour-target="census-start"]',
    position: 'top',
  },
  {
    id: 'step-4-search',
    stepNumber: 4,
    totalSteps: 7,
    titleKey: 'tour.step4.title',
    descriptionKey: 'tour.step4.desc',
    targetSelector: '[data-tour-target="nav-discover"]',
    position: 'bottom',
    targetTab: 'discover',
  },
  {
    id: 'step-5-family',
    stepNumber: 5,
    totalSteps: 7,
    titleKey: 'tour.step5.title',
    descriptionKey: 'tour.step5.desc',
    targetSelector: '[data-tour-target="nav-my-family"]',
    position: 'bottom',
    targetTab: 'family',
  },
  {
    id: 'step-6-community',
    stepNumber: 6,
    totalSteps: 7,
    titleKey: 'tour.step6.title',
    descriptionKey: 'tour.step6.desc',
    targetSelector: '[data-tour-target="nav-community"]',
    position: 'bottom',
    targetTab: 'community',
  },
  {
    id: 'step-7-profile',
    stepNumber: 7,
    totalSteps: 7,
    titleKey: 'tour.step7.title',
    descriptionKey: 'tour.step7.desc',
    targetSelector: '[data-tour-target="nav-profile"]',
    position: 'bottom',
    targetTab: 'profile',
  },
]
export const NOTIFICATION_TOUR_STEPS: TourStep[] = [
  {
    id: 'notif-step-1-filters',
    stepNumber: 1,
    totalSteps: 2,
    titleKey: 'tour.notif_step1.title',
    descriptionKey: 'tour.notif_step1.desc',
    targetSelector: '[data-tour-target="notification-filter-tabs"]',
    position: 'bottom',
  },
  {
    id: 'notif-step-2-card',
    stepNumber: 2,
    totalSteps: 2,
    titleKey: 'tour.notif_step2.title',
    descriptionKey: 'tour.notif_step2.desc',
    targetSelector: '[data-tour-target="notification-card-item"]',
    position: 'bottom',
  },
]
