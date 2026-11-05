/**
 * useDebounce hook
 *
 * Debounces a value with a configurable delay. Used by the Discovery
 * search input to prevent rapid query dispatching while typing.
 */

import { useState, useEffect } from 'react'

/**
 * Returns a debounced version of the passed value.
 *
 * @param value - The value to debounce.
 * @param delayMs - Debounce delay in milliseconds (default: 300ms).
 */
export function useDebounce<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delayMs])

  return debouncedValue
}
