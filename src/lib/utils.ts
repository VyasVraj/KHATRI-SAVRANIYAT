/**
 * Utility function: cn (className merger)
 *
 * Combines clsx conditional classes with tailwind-merge to resolve conflicts.
 * This is the standard shadcn/ui pattern for composing class names.
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-brand-500', className)
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
