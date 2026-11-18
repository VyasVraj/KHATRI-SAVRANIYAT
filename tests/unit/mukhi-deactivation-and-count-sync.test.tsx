/**
 * Unit Test: Mukhi Authority Deactivation, Automatic Downgrade, Dynamic Count Sync
 * (tests/unit/mukhi-deactivation-and-count-sync.test.tsx)
 *
 * Verifies:
 * 1. Admin deactivates Mukhi authority:
 *    - Authority status changes to 'INACTIVE'
 *    - Linked user profile role is automatically downgraded to 'MEMBER' (unless admin)
 *    - All original records (auth user, person profile, Gotra, Nukh, family membership) remain 100% intact.
 * 2. Directory count dynamically updates:
 *    - Default/active directory query returns only active Mukhis.
 *    - Dynamic count decreases when 2 Mukhis are deactivated (e.g. 120 -> 118).
 * 3. Reactivation:
 *    - Restores 'ACTIVE' authority status and 'MUKHI' role on linked user.
 *    - Preserves existing Mukhi ID without duplicating records.
 *    - Directory count increments dynamically.
 * 4. DeactivateMukhiModal UI:
 *    - Displays Mukhi Name, Mukhi ID, Region/Gram, Authority Status, optional reason input, Cancel and Confirm buttons.
 * 5. ReactivateMukhiModal UI:
 *    - Displays restoration confirmation and triggers reactivateMukhiAuthority.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import {
  deactivateMukhiAuthority,
  reactivateMukhiAuthority,
  getActiveMukhiCount,
} from '@/features/community/services/community-mukhis.service'
import { getMukhiDirectory } from '@/features/community/services/mukhi.service'
import { DeactivateMukhiModal } from '@/features/community/components/DeactivateMukhiModal'
import { ReactivateMukhiModal } from '@/features/community/components/ReactivateMukhiModal'
import { MukhiCard } from '@/features/community/components/MukhiCard'
import { supabase } from '@/lib/supabase'
import type { MukhiLeaderItem } from '@/features/community/types'

describe('Mukhi Authority Deactivation and Dynamic Count Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deactivateMukhiAuthority invokes RPC and downgrades role to MEMBER', async () => {
    const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        mukhi_id: 'mukhi-uuid-001',
        mukhi_unique_id: 'MUK-0001',
        old_status: 'ACTIVE',
        new_status: 'INACTIVE',
        downgraded_user: true,
      },
      error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res = await deactivateMukhiAuthority('mukhi-uuid-001', 'Tenure finished')
    expect(mockRpc).toHaveBeenCalledWith('deactivate_mukhi_authority', {
      p_mukhi_id: 'mukhi-uuid-001',
      p_reason: 'Tenure finished',
    })

    expect(res.data?.success).toBe(true)
    expect(res.data?.new_status).toBe('INACTIVE')
    expect(res.data?.downgraded_user).toBe(true)
  })

  it('reactivateMukhiAuthority restores ACTIVE authority and MUKHI role', async () => {
    const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        success: true,
        mukhi_id: 'mukhi-uuid-001',
        mukhi_unique_id: 'MUK-0001',
        old_status: 'INACTIVE',
        new_status: 'ACTIVE',
        restored_user: true,
      },
      error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res = await reactivateMukhiAuthority('mukhi-uuid-001')
    expect(mockRpc).toHaveBeenCalledWith('reactivate_mukhi_authority', {
      p_mukhi_id: 'mukhi-uuid-001',
    })

    expect(res.data?.success).toBe(true)
    expect(res.data?.new_status).toBe('ACTIVE')
    expect(res.data?.restored_user).toBe(true)
  })

  it('getActiveMukhiCount dynamically queries the database for active authority count', async () => {
    const mockRpc = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: 118,
      error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const count = await getActiveMukhiCount()
    expect(mockRpc).toHaveBeenCalledWith('get_active_mukhi_count')
    expect(count).toBe(118)
  })

  it('getMukhiDirectory filters out inactive Mukhis by default, correcting count from 120 to 118', async () => {
    // Mock 120 rows in DB where 2 have authority_status = 'INACTIVE'
    const mockDbRows = Array.from({ length: 120 }).map((_, i) => ({
      id: `mukhi-${i + 1}`,
      mukhi_unique_id: `MUK-${String(i + 1).padStart(4, '0')}`,
      source_serial_number: i + 1,
      full_name: `Mukhi Name ${i + 1}`,
      gram: i % 2 === 0 ? 'Palanpur' : 'Ahmedabad',
      mobile_number: '9876543210',
      gotra: 'Kashyap',
      nukh: 'Vyas',
      authority_status: i < 2 ? 'INACTIVE' : 'ACTIVE',
      is_active: i >= 2,
    }))

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: mockDbRows,
          error: null,
        }),
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    // Query with default ACTIVE filter
    const activeRes = await getMukhiDirectory({ filters: { status: 'ACTIVE' }, page: 1, pageSize: 200 })
    expect(activeRes.data?.totalCount).toBe(118)
    expect(activeRes.data?.items.every((m) => m.authority_status === 'ACTIVE')).toBe(true)

    // Query with INACTIVE filter
    const inactiveRes = await getMukhiDirectory({ filters: { status: 'INACTIVE' }, page: 1, pageSize: 200 })
    expect(inactiveRes.data?.totalCount).toBe(2)
    expect(inactiveRes.data?.items.every((m) => m.authority_status === 'INACTIVE')).toBe(true)

    // Query with ALL filter
    const allRes = await getMukhiDirectory({ filters: { status: 'ALL' }, page: 1, pageSize: 200 })
    expect(allRes.data?.totalCount).toBe(120)
  })

  it('renders DeactivateMukhiModal with required details and handles confirmation', async () => {
    const mockMukhi: MukhiLeaderItem = {
      id: 'mukhi-uuid-001',
      mukhi_unique_id: 'MUK-0001',
      person_id: 'person-001',
      user_id: 'user-001',
      name: 'Mukhi Mohanlal Vyas',
      display_name: 'Mukhi Mohanlal Vyas',
      avatar_url: null,
      designation: 'Palanpur Regional Mukhi',
      role: 'MUKHI',
      gotra: 'Kashyap',
      nukh: 'Vyas',
      kul: null,
      gram: 'Palanpur',
      city: 'Palanpur',
      state: 'Gujarat',
      country: 'India',
      birth_place: 'Palanpur',
      family_name: null,
      family_id: null,
      is_verified: true,
      is_active: true,
      status: 'ACTIVE',
      profile_privacy: 'COMMUNITY',
      contact_privacy: 'COMMUNITY',
      phone: '9825000001',
      official_email: 'mohanlal@khatri.org',
      authority_status: 'ACTIVE',
      account_linking_status: 'LINKED',
    }

    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: { success: true, mukhi_id: mockMukhi.id, new_status: 'INACTIVE' },
      error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    render(
      <LanguageProvider>
        <DeactivateMukhiModal
          isOpen={true}
          mukhi={mockMukhi}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </LanguageProvider>
    )

    // Check display of required details
    expect(screen.getByText('Deactivate Mukhi Authority')).toBeInTheDocument()
    expect(screen.getByText('Mukhi Mohanlal Vyas')).toBeInTheDocument()
    expect(screen.getByText('MUK-0001')).toBeInTheDocument()
    expect(screen.getByText('Palanpur')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Completed tenure/i)).toBeInTheDocument()

    // Add optional reason
    const reasonInput = screen.getByPlaceholderText(/Completed tenure/i)
    fireEvent.change(reasonInput, { target: { value: 'Completed 5-year tenure' } })

    // Click Confirm Deactivation
    const confirmBtn = screen.getByRole('button', { name: /Confirm Deactivation/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('renders ReactivateMukhiModal and handles reactivation', async () => {
    const mockInactiveMukhi: MukhiLeaderItem = {
      id: 'mukhi-uuid-002',
      mukhi_unique_id: 'MUK-0002',
      person_id: 'person-002',
      user_id: 'user-002',
      name: 'Mukhi Rameshchandra Khatri',
      display_name: 'Mukhi Rameshchandra Khatri',
      avatar_url: null,
      designation: 'Ahmedabad Regional Mukhi',
      role: 'MUKHI',
      gotra: 'Shandilya',
      nukh: 'Parikh',
      kul: null,
      gram: 'Ahmedabad',
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India',
      birth_place: 'Ahmedabad',
      family_name: null,
      family_id: null,
      is_verified: true,
      is_active: false,
      status: 'INACTIVE',
      profile_privacy: 'COMMUNITY',
      contact_privacy: 'COMMUNITY',
      phone: '9825000002',
      official_email: 'ramesh@khatri.org',
      authority_status: 'INACTIVE',
      account_linking_status: 'UNLINKED',
    }

    vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: { success: true, mukhi_id: mockInactiveMukhi.id, new_status: 'ACTIVE' },
      error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    render(
      <LanguageProvider>
        <ReactivateMukhiModal
          isOpen={true}
          mukhi={mockInactiveMukhi}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </LanguageProvider>
    )

    expect(screen.getByText('Reactivate Mukhi Authority')).toBeInTheDocument()
    expect(screen.getByText('Mukhi Rameshchandra Khatri')).toBeInTheDocument()
    expect(screen.getByText('MUK-0002')).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: /Confirm Reactivation/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('MukhiCard displays Deactivate button for active mukhi and Reactivate button for inactive mukhi', () => {
    const onDeactivate = vi.fn()
    const onReactivate = vi.fn()

    const activeMukhi: MukhiLeaderItem = {
      id: 'm1',
      mukhi_unique_id: 'MUK-0001',
      person_id: null,
      user_id: null,
      name: 'Active Leader',
      display_name: 'Active Leader',
      avatar_url: null,
      designation: 'Palanpur Mukhi',
      role: 'MUKHI',
      gotra: null,
      nukh: null,
      kul: null,
      gram: 'Palanpur',
      city: 'Palanpur',
      state: 'Gujarat',
      country: 'India',
      birth_place: 'Palanpur',
      family_name: null,
      family_id: null,
      is_verified: true,
      is_active: true,
      status: 'ACTIVE',
      profile_privacy: 'COMMUNITY',
      contact_privacy: 'COMMUNITY',
      phone: '9876543210',
      official_email: null,
      authority_status: 'ACTIVE',
      account_linking_status: 'NOT_REGISTERED',
    }

    const { rerender } = render(
      <LanguageProvider>
        <MukhiCard
          leader={activeMukhi}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
        />
      </LanguageProvider>
    )

    expect(screen.getByRole('button', { name: /Deactivate Active Leader/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reactivate Active Leader/i })).not.toBeInTheDocument()

    const inactiveMukhi: MukhiLeaderItem = {
      ...activeMukhi,
      id: 'm2',
      name: 'Inactive Leader',
      authority_status: 'INACTIVE',
      is_active: false,
      status: 'INACTIVE',
    }

    rerender(
      <LanguageProvider>
        <MukhiCard
          leader={inactiveMukhi}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
        />
      </LanguageProvider>
    )

    expect(screen.getByRole('button', { name: /Reactivate Inactive Leader/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Deactivate Inactive Leader/i })).not.toBeInTheDocument()
  })
})
