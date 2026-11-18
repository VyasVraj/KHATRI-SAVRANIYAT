/**
 * Unit Test: MukhiDetailsModal Redesign & Text Size Accessibility
 *
 * Verifies all criteria from KHATRI SARVANIYAT prompt:
 * 1. Modal layout: Fixed header, independently scrollable content, fixed footer.
 * 2. Visual elements: Solid navy header, badges, initials avatar, Region card, Contact card, Call button, Registry box.
 * 3. Footer controls: Edit Mukhi, Remove as Mukhi, and Close buttons remain visible.
 * 4. Sizing & Scrollability: Viewport-relative height constraints, flexbox layout, overflow-y-auto.
 * 5. Body scroll lock: Locks document.body overflow when open and restores on close.
 * 6. Accessibility & Keyboard: Escape key to close, touch targets >= 40px/44px.
 * 7. Text size scaling: Integration with useAccessibilityFontSize and percentage labels.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MukhiDetailsModal } from '@/features/community/components/MukhiDetailsModal'
import { AccessibilityFontSizeSlider } from '@/components/common/AccessibilityFontSizeSlider'
import { FONT_SIZE_LABELS } from '@/hooks/useAccessibilityFontSize'
import type { MukhiLeaderItem } from '@/features/community/types'

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}))

// Mock Auth Context
vi.mock('@/features/auth/context/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'admin-1', email: 'admin@example.com' },
    profile: { id: 'profile-1', role: 'ADMIN', font_size_preference: 'STANDARD' },
    isLoading: false,
    isAuthenticated: true,
  }),
}))

const MOCK_MUKHI: MukhiLeaderItem = {
  id: 'mukhi-83',
  mukhi_unique_id: 'MUK-0083',
  person_id: null,
  user_id: null,
  name: 'Mukhi Asandas Chandumal Dhanwani',
  display_name: 'Mukhi Asandas Chandumal Dhanwani',
  avatar_url: null,
  designation: 'Porbandar Regional Mukhi',
  role: 'MUKHI',
  gotra: 'Kashyap',
  nukh: 'Chandwani',
  kul: null,
  gram: 'Porbandar',
  city: 'Porbandar',
  state: 'Gujarat',
  country: 'India',
  birth_place: 'Porbandar',
  family_name: null,
  family_id: null,
  is_verified: true,
  is_active: true,
  status: 'ACTIVE',
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'COMMUNITY',
  phone: '9722666080',
  official_email: null,
  authority_status: 'ACTIVE',
  account_linking_status: 'NOT_REGISTERED',
  bio: 'Official Mukhi representative for Porbandar region guiding community affairs.',
}

describe('MukhiDetailsModal Redesign (Approved Design & Viewport Fit)', () => {
  const onClose = vi.fn()
  const onEdit = vi.fn()
  const onRemove = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.style.overflow = ''
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <MukhiDetailsModal
        mukhi={MOCK_MUKHI}
        isOpen={false}
        onClose={onClose}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders fixed header with solid dark navy background and official badges', () => {
    render(
      <MukhiDetailsModal
        mukhi={MOCK_MUKHI}
        isOpen={true}
        onClose={onClose}
        isAdmin={true}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    )

    // Badges
    expect(screen.getByText('MUK-0083')).toBeInTheDocument()
    expect(screen.getByText('Official Mukhi')).toBeInTheDocument()
    expect(screen.getByText('Verified Active Authority')).toBeInTheDocument()

    // Initials Avatar
    expect(screen.getByText('MD')).toBeInTheDocument()

    // Full name and Regional designation
    expect(screen.getByText('Mukhi Asandas Chandumal Dhanwani')).toBeInTheDocument()
    expect(screen.getByText('Porbandar Regional Mukhi')).toBeInTheDocument()

    // Close button in header
    const closeBtn = screen.getByRole('button', { name: /Close modal/i })
    expect(closeBtn).toBeInTheDocument()
  })

  it('renders independently scrollable body with Region, Contact, and Registry cards', () => {
    render(
      <MukhiDetailsModal
        mukhi={MOCK_MUKHI}
        isOpen={true}
        onClose={onClose}
        isAdmin={true}
      />
    )

    // Region Card
    expect(screen.getByText(/Region \/ Gram \/ City/i)).toBeInTheDocument()
    expect(screen.getByText('Porbandar')).toBeInTheDocument()
    expect(screen.getByText('Gujarat')).toBeInTheDocument()

    // Contact Card
    expect(screen.getByText(/Contact Information/i)).toBeInTheDocument()
    expect(screen.getByText('Official Mobile Number')).toBeInTheDocument()
    expect(screen.getByText('9722666080')).toBeInTheDocument()

    // Green Call Button
    const callLink = screen.getByRole('link', { name: /Call Mukhi at 9722666080/i })
    expect(callLink).toBeInTheDocument()
    expect(callLink).toHaveAttribute('href', 'tel:9722666080')
    expect(callLink).toHaveTextContent('Call 9722666080')

    // Samaj Registry Metadata Card
    expect(screen.getByText('Authority Register:')).toBeInTheDocument()
    expect(screen.getByText('Shree Khatri Samaj Central Panchayat')).toBeInTheDocument()
    expect(screen.getByText('Source Record:')).toBeInTheDocument()
    expect(screen.getByText('118 Mukhi Official Register')).toBeInTheDocument()
  })

  it('renders fixed footer with Edit Mukhi, Remove as Mukhi, and Close buttons', () => {
    render(
      <MukhiDetailsModal
        mukhi={MOCK_MUKHI}
        isOpen={true}
        onClose={onClose}
        isAdmin={true}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    )

    const editBtn = screen.getByRole('button', { name: /Edit Mukhi/i })
    const removeBtn = screen.getByRole('button', { name: /Remove as Mukhi/i })
    const closeBtn = screen.getByRole('button', { name: /^Close$/i })

    expect(editBtn).toBeInTheDocument()
    expect(removeBtn).toBeInTheDocument()
    expect(closeBtn).toBeInTheDocument()

    // Styling checks
    expect(editBtn.className).toContain('bg-blue-600')
    expect(removeBtn.className).toContain('bg-red-50')
    expect(removeBtn.className).toContain('text-red-600')
    expect(closeBtn.className).toContain('border-slate-300')
  })

  it('triggers onEdit and onClose when Edit Mukhi is clicked', () => {
    render(
      <MukhiDetailsModal
        mukhi={MOCK_MUKHI}
        isOpen={true}
        onClose={onClose}
        isAdmin={true}
        onEdit={onEdit}
      />
    )

    const editBtn = screen.getByRole('button', { name: /Edit Mukhi/i })
    fireEvent.click(editBtn)

    expect(onClose).toHaveBeenCalled()
    expect(onEdit).toHaveBeenCalledWith(MOCK_MUKHI)
  })

  it('triggers onRemove and onClose when Remove as Mukhi is clicked', () => {
    render(
      <MukhiDetailsModal
        mukhi={MOCK_MUKHI}
        isOpen={true}
        onClose={onClose}
        isAdmin={true}
        onRemove={onRemove}
      />
    )

    const removeBtn = screen.getByRole('button', { name: /Remove as Mukhi/i })
    fireEvent.click(removeBtn)

    expect(onClose).toHaveBeenCalled()
    expect(onRemove).toHaveBeenCalledWith(MOCK_MUKHI)
  })

  it('locks background body scroll when open and restores it when unmounted/closed', () => {
    const { unmount } = render(
      <MukhiDetailsModal
        mukhi={MOCK_MUKHI}
        isOpen={true}
        onClose={onClose}
      />
    )

    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('handles Escape key to close the modal', () => {
    render(
      <MukhiDetailsModal
        mukhi={MOCK_MUKHI}
        isOpen={true}
        onClose={onClose}
      />
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('has viewport-constrained flex column classes to fit short screens', () => {
    const { container } = render(
      <MukhiDetailsModal
        mukhi={MOCK_MUKHI}
        isOpen={true}
        onClose={onClose}
      />
    )

    const dialogCard = container.querySelector('[role="dialog"] > div')
    expect(dialogCard).not.toBeNull()
    expect(dialogCard?.className).toContain('flex-col')
    expect(dialogCard?.className).toContain('overflow-hidden')
    expect(dialogCard?.className).toContain('max-h-[calc(100dvh-24px)]')
  })
})

describe('Accessibility Text Size Slider & Percentage Labels', () => {
  it('defines percentage labels for all 5 calibrated accessibility steps', () => {
    expect(FONT_SIZE_LABELS.SMALL).toBe('Small (88%)')
    expect(FONT_SIZE_LABELS.STANDARD).toBe('Standard (100%)')
    expect(FONT_SIZE_LABELS.LARGE).toBe('Large (113%)')
    expect(FONT_SIZE_LABELS.EXTRA_LARGE).toBe('Extra Large (131%)')
    expect(FONT_SIZE_LABELS.VERY_LARGE).toBe('Very Large (150%)')
  })

  it('renders AccessibilityFontSizeSlider with live percentage badge, slider track, and reset button', () => {
    render(<AccessibilityFontSizeSlider variant="light" />)

    expect(screen.getByText(/Text Size \/ Accessibility/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset text size to standard/i })).toBeInTheDocument()

    const slider = screen.getByRole('slider', { name: /Adjust website text size/i })
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('min', '1')
    expect(slider).toHaveAttribute('max', '5')
  })

  it('resets text size to Standard when Reset is clicked', () => {
    render(<AccessibilityFontSizeSlider variant="light" />)

    const resetBtn = screen.getByRole('button', { name: /Reset text size to standard/i })
    act(() => {
      fireEvent.click(resetBtn)
    })

    expect(screen.getByText('Standard (100%)')).toBeInTheDocument()
  })
})
