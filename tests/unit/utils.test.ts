/**
 * Unit tests for src/lib/utils.ts
 */

import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn (className merger)', () => {
  it('returns a single class unchanged', () => {
    expect(cn('text-sm')).toBe('text-sm')
  })

  it('merges multiple classes', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2')
  })

  it('handles conditional falsy values', () => {
    const isHidden = false
    expect(cn('text-sm', isHidden && 'hidden', undefined, null, 'font-bold')).toBe(
      'text-sm font-bold'
    )
  })

  it('resolves Tailwind conflicts (later class wins)', () => {
    // tailwind-merge resolves px-2 vs px-4 — last one wins
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles object syntax from clsx', () => {
    expect(cn({ 'bg-red-500': false, 'bg-blue-500': true })).toBe('bg-blue-500')
  })
})
