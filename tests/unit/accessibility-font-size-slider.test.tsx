/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit Test: AccessibilityFontSizeSlider & 5-Level Font Scaling (Part 21 Parity)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AccessibilityFontSizeSlider } from '@/components/common/AccessibilityFontSizeSlider'
import * as authContext from '@/features/auth/context/AuthContext'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}))

describe('AccessibilityFontSizeSlider & 5-Level Accessibility (Part 21)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.style.fontSize = '16px'

    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: 'usr-123', email: 'test@khatri.org' } as unknown as User,
      profile: {
        id: 'usr-123',
        role: 'MEMBER',
        display_name: 'Test Member',
        font_size_preference: 'STANDARD',
      } as any,
      isAuthenticated: true,
      isLoading: false,
      session: null,
    })
  })

  it('renders slider header, live level label, reset button, and "A" icons', () => {
    render(<AccessibilityFontSizeSlider variant="light" />)

    expect(screen.getByText(/Text Size \/ Accessibility/i)).toBeInTheDocument()
    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset text size to standard/i })).toBeInTheDocument()

    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('aria-valuemin', '1')
    expect(slider).toHaveAttribute('aria-valuemax', '5')
    expect(slider).toHaveAttribute('aria-valuenow', '2')
  })

  it('updates live label and root font-size when slider step changes to Position 3 (Large)', () => {
    render(<AccessibilityFontSizeSlider variant="light" />)

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '3' } })

    expect(screen.getByText('Large')).toBeInTheDocument()
    expect(document.documentElement.style.fontSize).toBe('18px')
    expect(document.documentElement.classList.contains('font-size-large')).toBe(true)
  })

  it('updates live label and root font-size when slider step changes to Position 5 (Very Large)', () => {
    render(<AccessibilityFontSizeSlider variant="light" />)

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '5' } })

    expect(screen.getByText('Very Large')).toBeInTheDocument()
    expect(document.documentElement.style.fontSize).toBe('24px')
    expect(document.documentElement.classList.contains('font-size-very-large')).toBe(true)
  })

  it('resets back to Standard (Position 2) when clicking the Reset button', () => {
    render(<AccessibilityFontSizeSlider variant="light" />)

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '4' } })
    expect(screen.getByText('Extra Large')).toBeInTheDocument()

    const resetButton = screen.getByRole('button', { name: /Reset text size to standard/i })
    fireEvent.click(resetButton)

    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(document.documentElement.style.fontSize).toBe('16px')
  })

  it('renders dark variant correctly for mobile drawer', () => {
    const { container } = render(<AccessibilityFontSizeSlider variant="dark" />)
    expect(container.firstChild).toHaveClass('bg-navy-800/90')
  })
})
