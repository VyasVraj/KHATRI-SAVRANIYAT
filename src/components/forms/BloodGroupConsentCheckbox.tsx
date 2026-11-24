/**
 * BloodGroupConsentCheckbox Component
 * Reusable, accessible privacy consent toggle for Blood Group Directory.
 * Matches the SINDHI KHATRI SAMAJ navy/brand theme.
 * Uses a single robust interactive container with role="checkbox" and pointer-events-none children
 * to eliminate double-firing, dead zones on padding, or unclickable states across all devices.
 */

import React from 'react'

export interface BloodGroupConsentCheckboxProps {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export const BloodGroupConsentCheckbox: React.FC<BloodGroupConsentCheckboxProps> = ({
  id = 'blood-group-directory-consent',
  checked,
  onChange,
  disabled = false,
  className = '',
}) => {
  return (
    <div
      role="checkbox"
      id={id}
      aria-checked={checked}
      aria-label="Show my blood group details in the Blood Group Directory"
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) {
          onChange(!checked)
        }
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault()
          onChange(!checked)
        }
      }}
      className={`mt-2.5 rounded-xl border p-3.5 transition-all select-none cursor-pointer ${
        disabled
          ? 'opacity-60 cursor-not-allowed bg-slate-50 border-slate-200'
          : checked
          ? 'bg-brand-50/60 border-brand-300 shadow-2xs hover:bg-brand-50/80 hover:border-brand-400'
          : 'bg-white border-navy-200 shadow-2xs hover:border-navy-300 hover:bg-navy-50/30'
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={`${id}-input`}
          name={id}
          checked={checked}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 shrink-0 pointer-events-none"
        />
        <div className="space-y-1">
          <span className="text-xs font-semibold text-navy-900 block leading-tight">
            Show my blood group details in the Blood Group Directory.
          </span>
          <p className="text-[11px] text-navy-600 leading-relaxed">
            If enabled, your name, selected blood group, family name, and permitted location details may appear in the community Blood Group Directory. Your personal phone number and email address will remain private.
          </p>
        </div>
      </div>
    </div>
  )
}
