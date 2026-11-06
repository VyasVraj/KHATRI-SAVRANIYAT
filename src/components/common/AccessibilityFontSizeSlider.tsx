/**
 * AccessibilityFontSizeSlider (Part 21 Parity)
 *
 * Interactive 5-level horizontal text size slider matching Khatri Sarvaniyat theme:
 * - Position 1: Small (14px / 0.90)
 * - Position 2: Standard (16px / 1.00) [Default]
 * - Position 3: Large (18px / 1.15)
 * - Position 4: Extra Large (21px / 1.30)
 * - Position 5: Very Large (24px / 1.45)
 *
 * Visual layout:
 * - Lavender panel container with subtle border & shadow
 * - Live updating level label
 * - Quick Reset button to restore Standard
 * - Small "A" on left, larger "A" on right
 * - Purple progress track and circular thumb
 * - Keyboard (arrow keys, Home, End), touch, and mouse drag support
 */

import React from 'react'
import { RotateCcw } from 'lucide-react'
import { useAccessibilityFontSize } from '@/hooks/useAccessibilityFontSize'

interface AccessibilityFontSizeSliderProps {
  variant?: 'light' | 'dark'
  className?: string
}

export const AccessibilityFontSizeSlider: React.FC<AccessibilityFontSizeSliderProps> = ({
  variant = 'light',
  className = '',
}) => {
  const { step, levelLabel, setStep, resetFontSize } = useAccessibilityFontSize()

  const isDark = variant === 'dark'

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val)) {
      setStep(val)
    }
  }

  // Calculate percentage for progress fill: (step - 1) / 4 * 100
  const progressPercent = ((step - 1) / 4) * 100

  return (
    <div
      className={`rounded-xl p-3 transition-colors ${
        isDark
          ? 'bg-navy-800/90 border border-navy-700 text-white'
          : 'bg-purple-50/80 border border-purple-200/80 text-navy-900 shadow-2xs'
      } ${className}`}
      role="region"
      aria-label="Text Size and Accessibility Controls"
    >
      {/* Header and Reset Button */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`text-[11px] font-bold uppercase tracking-wider ${
            isDark ? 'text-purple-300' : 'text-purple-900'
          }`}
        >
          Text Size / Accessibility
        </span>

        <button
          type="button"
          onClick={resetFontSize}
          title="Reset to Standard (100%)"
          aria-label="Reset text size to standard"
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded transition-colors ${
            isDark
              ? 'text-purple-200 hover:text-white hover:bg-navy-700'
              : 'text-purple-700 hover:text-purple-900 hover:bg-purple-100/80'
          }`}
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Live Label Indicator */}
      <div className="text-center my-1">
        <span
          className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border transition-all ${
            isDark
              ? 'bg-purple-900/60 text-purple-200 border-purple-700/60'
              : 'bg-white text-purple-900 border-purple-200 shadow-2xs'
          }`}
        >
          {levelLabel}
        </span>
      </div>

      {/* Slider Controls with "A" Icons */}
      <div className="flex items-center gap-2.5 pt-1">
        {/* Left Small 'A' */}
        <span
          className={`text-xs font-extrabold select-none ${
            isDark ? 'text-purple-300' : 'text-purple-800'
          }`}
          aria-hidden="true"
        >
          A
        </span>

        {/* Custom Range Slider Track */}
        <div className="relative flex-1 flex items-center py-1">
          {/* Background Track */}
          <div
            className={`absolute left-0 right-0 h-1.5 rounded-full ${
              isDark ? 'bg-navy-950' : 'bg-purple-200'
            }`}
          />

          {/* Active Progress Fill */}
          <div
            className="absolute left-0 h-1.5 rounded-full bg-purple-600 transition-all pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Range Input */}
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={step}
            onChange={handleSliderChange}
            aria-label="Adjust website text size"
            aria-valuemin={1}
            aria-valuemax={5}
            aria-valuenow={step}
            aria-valuetext={levelLabel}
            className="relative z-10 w-full h-4 opacity-0 cursor-pointer"
          />

          {/* Visual Custom Circular Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-white border-2 border-purple-600 shadow-sm pointer-events-none transition-all ring-2 ring-purple-400/20"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Right Large 'A' */}
        <span
          className={`text-base font-black select-none ${
            isDark ? 'text-purple-300' : 'text-purple-900'
          }`}
          aria-hidden="true"
        >
          A
        </span>
      </div>

      {/* Step Tick Marks */}
      <div className="flex justify-between items-center px-4 pt-1 text-[10px] text-purple-400 select-none">
        <span className={step === 1 ? 'font-bold text-purple-700 dark:text-purple-200' : ''}>•</span>
        <span className={step === 2 ? 'font-bold text-purple-700 dark:text-purple-200' : ''}>•</span>
        <span className={step === 3 ? 'font-bold text-purple-700 dark:text-purple-200' : ''}>•</span>
        <span className={step === 4 ? 'font-bold text-purple-700 dark:text-purple-200' : ''}>•</span>
        <span className={step === 5 ? 'font-bold text-purple-700 dark:text-purple-200' : ''}>•</span>
      </div>
    </div>
  )
}
