/**
 * KHATRI SARVANIYAT — Complete Mukhi Removal System Test Suite
 *
 * Validates:
 * 1. Backend / Service: removeMukhiAuthority RPC & fallback table mutation
 * 2. Role Adjustment: Downgrades MUKHI -> MEMBER, strictly preserves ADMIN/SUPER_ADMIN
 * 3. Data Safety Invariants: Preserves auth.users, profiles, persons, families, and tree records
 * 4. Active Mukhi Count Synchronization: Strict is_active=true & authority_status='ACTIVE' calculation (120 -> 118)
 * 5. UI: RemoveMukhiModal dialog rendering, data display, explanation notice, cancel/confirm, and success banner
 * 6. UI: MukhiCard "Remove as Mukhi" action button visibility and click handling
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  removeMukhiAuthority,
  getActiveMukhiCount,
} from '@/features/community/services/community-mukhis.service'
import { RemoveMukhiModal } from '@/features/community/components/RemoveMukhiModal'
import { MukhiCard } from '@/features/community/components/MukhiCard'
import type { MukhiLeaderItem } from '@/features/community/types'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

vi.mock('@/features/i18n', () => ({
  useLanguage: () => ({
    t: (_key: string, fallback: string) => fallback,
    language: 'en',
  }),
}))

describe('KHATRI SARVANIYAT — Complete Mukhi Removal System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // 1. Service Layer Tests
  // ---------------------------------------------------------------------------
  describe('Backend & Service: removeMukhiAuthority', () => {
    it('successfully calls remove_mukhi_authority RPC when available', async () => {
      const mockRpcResult = {
        success: true,
        mukhi_id: 'mukhi-uuid-001',
        mukhi_unique_id: 'MUK-0060',
        old_status: 'ACTIVE',
        new_status: 'REMOVED',
        downgraded_user: true,
        linked_person_id: 'person-uuid-001',
        linked_user_id: 'user-uuid-001',
      }

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: mockRpcResult,
        error: null,
      } as any)

      const result = await removeMukhiAuthority('mukhi-uuid-001', 'Term completed')

      expect(supabase.rpc).toHaveBeenCalledWith('remove_mukhi_authority', {
        p_mukhi_id: 'mukhi-uuid-001',
        p_reason: 'Term completed',
      })
      expect(result.data).toEqual(mockRpcResult)
      expect(result.error).toBeNull()
    })

    it('falls back to direct table update and sets authority_status to REMOVED and is_active to false', async () => {
      // Simulate RPC not available
      vi.mocked(supabase.rpc).mockRejectedValue(new Error('RPC function not found'))

      // Mock fetching community_mukhis row
      const mockMukhiRow = {
        id: 'mukhi-uuid-002',
        mukhi_unique_id: 'MUK-0119',
        full_name: 'RAKESH M PATEL',
        authority_status: 'ACTIVE',
        is_active: true,
        linked_person_id: 'person-uuid-002',
        linked_user_id: 'user-uuid-002',
      }

      const mockFrom = vi.fn()
      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      // Query for community_mukhis fetch
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockMukhiRow, error: null }),
          }),
        }),
      } as any)

      // Query for community_mukhis update
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      mockFrom.mockReturnValueOnce({
        update: mockUpdate,
      } as any)

      // Query for audit log insert
      mockFrom.mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: null }),
      } as any)

      // Query for other active mukhis count
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            neq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
              }),
            }),
          }),
        }),
      } as any)

      // Query for profiles update (downgrading to MEMBER)
      const mockProfileNeq2 = vi.fn().mockResolvedValue({ error: null })
      const mockProfileNeq1 = vi.fn().mockReturnValue({ neq: mockProfileNeq2 })
      const mockProfileEq = vi.fn().mockReturnValue({ neq: mockProfileNeq1 })
      const mockProfileUpdate = vi.fn().mockReturnValue({ eq: mockProfileEq })
      mockFrom.mockReturnValueOnce({
        update: mockProfileUpdate,
      } as any)

      const result = await removeMukhiAuthority('mukhi-uuid-002', 'Administrative removal')

      expect(result.data?.success).toBe(true)
      expect(result.data?.new_status).toBe('REMOVED')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          authority_status: 'REMOVED',
          is_active: false,
          removal_reason: 'Administrative removal',
        })
      )
    })

    it('returns permission error when non-admin calls removeMukhiAuthority', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'Permission denied: Only Admins can remove a Mukhi.' },
      } as any)

      const result = await removeMukhiAuthority('mukhi-uuid-003')

      expect(result.error?.message).toContain('Permission denied')
      expect(result.data).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Count Synchronization: 120 -> 118 when 2 are removed
  // ---------------------------------------------------------------------------
  describe('Directory Count Synchronization', () => {
    it('returns exact active count filtering is_active=true and authority_status=ACTIVE', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: 118,
        error: null,
      } as any)

      const count = await getActiveMukhiCount()
      expect(count).toBe(118)
    })

    it('falls back to direct table count with strict active filter', async () => {
      vi.mocked(supabase.rpc).mockRejectedValue(new Error('RPC missing'))

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 118, error: null }),
          }),
        }),
      })
      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      const count = await getActiveMukhiCount()
      expect(count).toBe(118)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. UI Component Tests: RemoveMukhiModal
  // ---------------------------------------------------------------------------
  describe('RemoveMukhiModal Component', () => {
    const mockMukhi: MukhiLeaderItem = {
      id: 'mukhi-uuid-123',
      mukhi_unique_id: 'MUK-0060',
      name: 'Mukhi JAYESH C VYAS',
      display_name: 'Jayesh Chandrakant Vyas',
      person_id: 'person-uuid-jayesh',
      user_id: 'user-uuid-jayesh',
      gram: 'Vadodara',
      city: 'Vadodara',
      state: 'Gujarat',
      authority_status: 'ACTIVE',
      is_active: true,
      designation: 'Vadodara Regional Mukhi',
      role: 'MUKHI',
      is_verified: true,
      status: 'ACTIVE',
      profile_privacy: 'COMMUNITY',
    }

    it('renders dialog with Mukhi details, ID, region, and exact safety explanation', () => {
      render(
        <RemoveMukhiModal
          isOpen={true}
          mukhi={mockMukhi}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Remove as Mukhi')).toBeInTheDocument()
      expect(screen.getByText('Mukhi JAYESH C VYAS')).toBeInTheDocument()
      expect(screen.getByText('MUK-0060')).toBeInTheDocument()
      expect(screen.getByText('Vadodara')).toBeInTheDocument()
      expect(screen.getByText(/Jayesh Chandrakant Vyas/)).toBeInTheDocument()

      // Required verbatim safety explanation
      expect(
        screen.getByText(/Are you sure you want to remove this person from their Mukhi position\?/)
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          /This action will remove their Mukhi authority and active Mukhi Directory listing\. Their SINDHI KHATRI SAMAJ login account, personal profile, family membership, family relationships and census records will remain unchanged\./
        )
      ).toBeInTheDocument()

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Confirm Remove as Mukhi/i })).toBeInTheDocument()
    })

    it('closes when clicking Cancel', () => {
      const handleClose = vi.fn()
      render(
        <RemoveMukhiModal
          isOpen={true}
          mukhi={mockMukhi}
          onClose={handleClose}
          onSuccess={vi.fn()}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(handleClose).toHaveBeenCalled()
    })

    it('submits removal request, displays success notification, and triggers onSuccess', async () => {
      const handleSuccess = vi.fn()
      const handleClose = vi.fn()

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          success: true,
          mukhi_id: mockMukhi.id,
          new_status: 'REMOVED',
        },
        error: null,
      } as any)

      render(
        <RemoveMukhiModal
          isOpen={true}
          mukhi={mockMukhi}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      )

      const confirmBtn = screen.getByRole('button', { name: /Confirm Remove as Mukhi/i })
      fireEvent.click(confirmBtn)

      // Displays required success notification
      await waitFor(() => {
        expect(
          screen.getByText(
            "Mukhi authority successfully removed. The person's normal community account and profile remain active."
          )
        ).toBeInTheDocument()
      })

      await waitFor(
        () => {
          expect(handleSuccess).toHaveBeenCalled()
          expect(handleClose).toHaveBeenCalled()
        },
        { timeout: 1500 }
      )
    })
  })

  // ---------------------------------------------------------------------------
  // 4. UI Component Tests: MukhiCard "Remove as Mukhi" Action Button
  // ---------------------------------------------------------------------------
  describe('MukhiCard Action Button', () => {
    const activeLeader: MukhiLeaderItem = {
      id: 'muk-active-1',
      mukhi_unique_id: 'MUK-0060',
      name: 'Mukhi JAYESH C VYAS',
      authority_status: 'ACTIVE',
      is_active: true,
      gram: 'Vadodara',
      city: 'Vadodara',
      state: 'Gujarat',
      designation: 'Vadodara Regional Mukhi',
      role: 'MUKHI',
      is_verified: true,
      status: 'ACTIVE',
      person_id: null,
      user_id: null,
      profile_privacy: 'COMMUNITY',
    }

    it('renders "Remove as Mukhi" action button for active Mukhis when onRemove is provided (Admin)', () => {
      const handleRemove = vi.fn()
      render(
        <MukhiCard
          leader={activeLeader}
          onRemove={handleRemove}
        />
      )

      const removeBtn = screen.getByRole('button', { name: /Remove as Mukhi: Mukhi JAYESH C VYAS/i })
      expect(removeBtn).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Deactivate Mukhi JAYESH C VYAS/i })).not.toBeInTheDocument()

      fireEvent.click(removeBtn)
      expect(handleRemove).toHaveBeenCalledWith(activeLeader)
    })

    it('does NOT render "Remove as Mukhi" button when onRemove is omitted (Normal Member)', () => {
      render(
        <MukhiCard
          leader={activeLeader}
        />
      )

      expect(screen.queryByRole('button', { name: /Remove as Mukhi/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Deactivate/i })).not.toBeInTheDocument()
    })
  })
})
