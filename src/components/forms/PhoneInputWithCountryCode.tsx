import React, { useState, useEffect } from 'react'
import { CountryCodeSelect } from './CountryCodeSelect'
import {
  COUNTRY_DIALING_CODES,
  DEFAULT_DIALING_CODE,
} from '@/constants/countryDialingCodes'

export interface PhoneInputWithCountryCodeProps {
  id?: string
  label?: string
  value?: string | null
  onChange: (fullPhoneNumber: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  error?: string
  className?: string
  defaultCountryCode?: string
}

export const PhoneInputWithCountryCode: React.FC<PhoneInputWithCountryCodeProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder = 'Enter mobile number',
  disabled = false,
  required = false,
  error,
  className = '',
  defaultCountryCode = DEFAULT_DIALING_CODE,
}) => {
  const [countryCode, setCountryCode] = useState(defaultCountryCode)
  const [localNumber, setLocalNumber] = useState('')

  // Sync internal state with external value
  useEffect(() => {
    if (!value || value.trim() === '') {
      setLocalNumber('')
      return
    }

    const trimmed = value.trim()
    if (trimmed.startsWith('+')) {
      // Find matching country code (longest match first)
      const sortedCodes = [...COUNTRY_DIALING_CODES].sort(
        (a, b) => b.dialing_code.length - a.dialing_code.length
      )
      const matched = sortedCodes.find((c) => trimmed.startsWith(c.dialing_code))
      if (matched) {
        setCountryCode(matched.dialing_code)
        setLocalNumber(trimmed.slice(matched.dialing_code.length).trim())
      } else {
        setLocalNumber(trimmed)
      }
    } else {
      setLocalNumber(trimmed)
    }
  }, [value])

  const handleCountryChange = (newCode: string) => {
    setCountryCode(newCode)
    if (localNumber.trim()) {
      onChange(`${newCode} ${localNumber.trim()}`)
    } else {
      onChange('')
    }
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value
    // Filter non-phone characters except spaces and dashes
    const cleaned = rawInput.replace(/[^\d\s-]/g, '')
    setLocalNumber(cleaned)

    if (cleaned.trim()) {
      onChange(`${countryCode} ${cleaned.trim()}`)
    } else {
      onChange('')
    }
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-navy-800"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="flex gap-2">
        <div className="w-[170px] shrink-0">
          <CountryCodeSelect
            id={id ? `${id}-country` : undefined}
            value={countryCode}
            onChange={handleCountryChange}
            disabled={disabled}
          />
        </div>

        <div className="flex-1 relative">
          <input
            id={id}
            type="tel"
            inputMode="numeric"
            value={localNumber}
            onChange={handleNumberChange}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-xs font-medium text-navy-900 shadow-2xs placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 h-10 ${
              error ? 'border-red-500' : 'border-navy-200'
            }`}
          />
        </div>
      </div>

      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
