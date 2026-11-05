/**
 * Shared Input component
 *
 * Wraps HTML input with consistent brand styling, label, and error display.
 * Designed for use with React Hook Form via the `registration` prop.
 */

import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = '', type, ...props }, ref) => {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
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
        <input
          ref={ref}
          id={inputId}
          type={type}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          className={[
            'w-full min-h-[44px] rounded border px-3 py-2 text-sm text-navy-900 placeholder:text-navy-400',
            'transition-colors focus:outline-none focus:ring-1',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
              : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-navy-500">
            {hint}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

// ---------------------------------------------------------------------------
// PasswordInput — Input with show/hide toggle
// ---------------------------------------------------------------------------

type PasswordInputProps = Omit<InputProps, 'type'>

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, hint, id, className = '', ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
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
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={showPassword ? 'text' : 'password'}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={[
              'w-full rounded border px-3 py-2 pr-10 text-sm text-navy-900 placeholder:text-navy-400',
              'transition-colors focus:outline-none focus:ring-1',
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
                : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-navy-400 hover:text-navy-600"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-navy-500">
            {hint}
          </p>
        )}
      </div>
    )
  }
)
PasswordInput.displayName = 'PasswordInput'
