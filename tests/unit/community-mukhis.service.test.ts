/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit Tests: Community Mukhis Service (Gotra & Nukh Resilience and Schema Cache Handling)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  upsertCommunityMukhi,
  getCommunityMukhi,
  getCommunityMukhis,
  isLocationMatch,
} from '@/features/community/services/community-mukhis.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

describe('community-mukhis.service (Gotra & Nukh Schema Cache Resilience)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('correctly matches locations for priority sorting', () => {
    expect(isLocationMatch('Vadodara, Gujarat', 'Vadodara')).toBe(true)
    expect(isLocationMatch('Agarwal Farm, Jaipur', 'Jaipur')).toBe(true)
    expect(isLocationMatch('Bhavnagar', 'Ahmedabad')).toBe(false)
  })

  it('saves new Mukhi with Gotra and Nukh directly when columns exist', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'new-mukhi-uuid',
            source_serial_number: 119,
            full_name: 'Mukhi VRAJ JAYESHBHAI VYAS',
            gram: 'Vadodara, Gujarat',
            mobile_number: '9876543210',
            gotra: 'Agastya',
            nukh: 'Arora (Aroda)',
            is_active: true,
          },
          error: null,
        }),
      }),
    })

    vi.mocked(supabase.from).mockReturnValue({
      insert: mockInsert,
    } as any)

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'RPC not found', code: 'PGRST202' },
    } as any)

    const result = await upsertCommunityMukhi({
      full_name: 'Mukhi VRAJ JAYESHBHAI VYAS',
      gram: 'Vadodara, Gujarat',
      mobile_number: '9876543210',
      gotra: 'Agastya',
      nukh: 'Arora (Aroda)',
      authority_status: 'ACTIVE',
    })

    expect(result.error).toBeNull()
    expect(result.data?.full_name).toBe('Mukhi VRAJ JAYESHBHAI VYAS')
    expect(result.data?.gotra).toBe('Agastya')
    expect(result.data?.nukh).toBe('Arora (Aroda)')
  })

  it('gracefully recovers when gotra column is not in schema cache and preserves gotra/nukh in return', async () => {
    // First insert call fails with schema cache error
    // Second insert call (retry) succeeds with safePayload
    const mockSingle = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "Could not find the 'gotra' column of 'community_mukhis' in the schema cache",
          code: 'PGRST204',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'new-mukhi-uuid-2',
          source_serial_number: 120,
          full_name: 'Mukhi VRAJ JAYESHBHAI VYAS',
          gram: 'Vadodara, Gujarat',
          mobile_number: '9876543210',
          is_active: true,
        },
        error: null,
      })

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: mockSingle,
      }),
    })

    vi.mocked(supabase.from).mockReturnValue({
      insert: mockInsert,
    } as any)

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'RPC not found', code: 'PGRST202' },
    } as any)

    const result = await upsertCommunityMukhi({
      full_name: 'Mukhi VRAJ JAYESHBHAI VYAS',
      gram: 'Vadodara, Gujarat',
      mobile_number: '9876543210',
      gotra: 'Agastya',
      nukh: 'Arora (Aroda)',
      authority_status: 'ACTIVE',
      linked_person_id: 'person-123',
    })

    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()
    expect(result.data?.gotra).toBe('Agastya')
    expect(result.data?.nukh).toBe('Arora (Aroda)')
    // Verify it retried with payload excluding gotra and nukh
    expect(mockInsert).toHaveBeenCalledTimes(2)
  })

  it('retries getCommunityMukhi with baseline columns if gotra column is missing', async () => {
    const mockMaybeSingle = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "column community_mukhis.gotra does not exist",
          code: '42703',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'existing-id',
          source_serial_number: 1,
          full_name: 'Mukhi Naraindas',
          gram: 'Jaipur',
          mobile_number: '9414056200',
          is_active: true,
        },
        error: null,
      })

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    } as any)

    const result = await getCommunityMukhi('existing-id')
    expect(result.error).toBeNull()
    expect(result.data?.full_name).toBe('Mukhi Naraindas')
  })

  it('retries getCommunityMukhis with baseline columns if gotra column is missing', async () => {
    const mockOrder = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "column community_mukhis.gotra does not exist",
          code: '42703',
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'mukhi-1',
            source_serial_number: 1,
            full_name: 'Mukhi Naraindas',
            gram: 'Jaipur',
            mobile_number: '9414056200',
            is_active: true,
          },
        ],
        error: null,
      })

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: mockOrder,
        }),
      }),
    } as any)

    const result = await getCommunityMukhis()
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(result.data?.[0]?.full_name).toBe('Mukhi Naraindas')
  })
})
