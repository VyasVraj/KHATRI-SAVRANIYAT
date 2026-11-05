/**
 * PrivacyLevelSelect — shared form control for privacy level fields.
 *
 * Uses a native <select> with existing Tailwind brand styling.
 * Compatible with React Hook Form's register() via forwardRef.
 *
 * Used by PersonForm for: profile_privacy, contact_privacy, dob_privacy.
 * Reusable by FamilyForm (Phase 3 Subtask 4) for: profile_privacy, members_privacy.
 *
 * Privacy values and labels come from the project constants — the database
 * enum (public.privacy_level) is the authoritative source.
 */

import { forwardRef, type SelectHTMLAttributes } from 'react'
import { PRIVACY_LEVELS, PRIVACY_LEVEL_LABELS } from '@/constants/app'
import type { PrivacyLevel } from '@/types'

interface PrivacyLevelSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** Label rendered above the select */
  label?: string
  /** Validation error message */
  error?: string
  /** Helper text shown below the select when no error */
  hint?: string
}

const ORDERED_LEVELS: PrivacyLevel[] = [
  PRIVACY_LEVELS.PRIVATE,
  PRIVACY_LEVELS.FAMILY,
  PRIVACY_LEVELS.CONNECTIONS,
  PRIVACY_LEVELS.COMMUNITY,
  PRIVACY_LEVELS.PUBLIC,
]

export const PrivacyLevelSelect = forwardRef<
  HTMLSelectElement,
  PrivacyLevelSelectProps
>(({ label, error, hint, id, className = '', ...props }, ref) => {
  const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-navy-700"
        >
          {label}
          {props.required && (
            <span className="ml-1 text-red-500" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={!!error}
        aria-describedby={
          error
            ? `${selectId}-error`
            : hint
              ? `${selectId}-hint`
              : undefined
        }
        className={[
          'w-full rounded border px-3 py-2 text-sm text-navy-900 bg-white',
          'transition-colors focus:outline-none focus:ring-1',
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
            : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {ORDERED_LEVELS.map((level) => (
          <option key={level} value={level}>
            {PRIVACY_LEVEL_LABELS[level]}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${selectId}-error`} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${selectId}-hint`} className="text-xs text-navy-500">
          {hint}
        </p>
      )}
    </div>
  )
})
PrivacyLevelSelect.displayName = 'PrivacyLevelSelect'
