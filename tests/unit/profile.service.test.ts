/**
 * Unit tests for Profile Service (src/features/profile/services/profile.service.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getProfile, updateProfile } from '@/features/profile/services/profile.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('Profile Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getProfile', () => {
    it('returns profile data on success', async () => {
      const mockProfile = {
        id: 'user-123',
        display_name: 'Test User',
        avatar_url: null,
        role: 'MEMBER',
        is_active: true,
        created_at: '2026-10-02T12:00:00Z',
        updated_at: '2026-10-02T12:00:00Z',
      }

      const mockSingle = vi.fn().mockResolvedValueOnce({ data: mockProfile, error: null })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await getProfile('user-123')

      expect(result.error).toBeNull()
      expect(result.data).toEqual(mockProfile)
      expect(supabase.from).toHaveBeenCalledWith('profiles')
      expect(mockSelect).toHaveBeenCalledWith('*')
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123')
    })

    it('returns error when profile query fails', async () => {
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Row not found', code: 'PGRST116' },
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await getProfile('non-existent-user')

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe('Could not load profile. Please try again.')
      expect(result.error?.code).toBe('PGRST116')
    })
  })

  describe('updateProfile', () => {
    it('updates profile and returns updated row', async () => {
      const updatedProfile = {
        id: 'user-123',
        display_name: 'Updated Name',
        avatar_url: null,
        role: 'MEMBER',
        is_active: true,
        created_at: '2026-10-02T12:00:00Z',
        updated_at: '2026-10-02T12:05:00Z',
      }

      const mockSingle = vi.fn().mockResolvedValueOnce({ data: updatedProfile, error: null })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)

      const result = await updateProfile('user-123', { display_name: 'Updated Name' })

      expect(result.error).toBeNull()
      expect(result.data).toEqual(updatedProfile)
      expect(supabase.from).toHaveBeenCalledWith('profiles')
      expect(mockUpdate).toHaveBeenCalledWith({ display_name: 'Updated Name' })
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123')
    })

    it('returns error when profile update fails', async () => {
      const mockSingle = vi.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Permission denied', code: '42501' },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)

      const result = await updateProfile('user-123', { display_name: 'Forbidden Name' })

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe('Could not update profile. Please try again.')
      expect(result.error?.code).toBe('42501')
    })
  })
})
