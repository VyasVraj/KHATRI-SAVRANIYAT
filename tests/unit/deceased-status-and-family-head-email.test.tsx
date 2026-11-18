/**
 * Unit & Integration Tests:
 * 1. Deceased Status Checkbox (is_deceased) & Date of Death replacement
 * 2. Automatic Family Head Email Prefill & Independent Member Email
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { createPerson, updatePerson } from '@/features/people/services/people.service'
import { getFamilyHeadEmail } from '@/features/family-members/services/family-members.service'
import { EditMemberModal } from '@/features/family-members/components/EditMemberModal'
import { supabase } from '@/lib/supabase'
import type { FamilyMemberWithPerson } from '@/features/family-members/services/family-members.service'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    })),
  },
}))

vi.mock('@/features/auth/context/AuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user-uuid', email: 'jayesh@example.com' },
    profile: { role: 'FAMILY_HEAD' },
    isAuthenticated: true,
  }),
}))

describe('CHANGE 1: Deceased Status (is_deceased)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createPerson sets is_deceased = false and leaves status for DB default when person is living', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'p-1', first_name: 'Vraj', last_name: 'Vyas', is_deceased: false, status: 'ACTIVE' },
      error: null,
    })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)

    const res = await createPerson(
      {
        first_name: 'Vraj',
        last_name: 'Vyas',
        gender: 'MALE',
        date_of_birth: '2004-05-15',
        birth_place: 'Ahmedabad',
        gotra: 'Agastya',
        nukh: 'Arora',
        blood_group: 'A+',
        occupation: 'Software Engineer',
        email_contact: 'vraj@example.com',
        phone: '9876543210',
        is_deceased: false,
      },
      'test-user-uuid'
    )

    expect(res.error).toBeNull()
    const payload = mockInsert.mock.calls[0][0]
    expect(payload.is_deceased).toBe(false)
    expect(payload.status).toBeUndefined()
  })

  it('createPerson sets is_deceased = true and status = DECEASED when person is deceased', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'p-2', first_name: 'Chandrakant', last_name: 'Vyas', is_deceased: true, status: 'DECEASED' },
      error: null,
    })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)

    const res = await createPerson(
      {
        first_name: 'Chandrakant',
        last_name: 'Vyas',
        gender: 'MALE',
        date_of_birth: '1940-01-01',
        birth_place: 'Ahmedabad',
        gotra: 'Agastya',
        nukh: 'Arora',
        blood_group: 'A+',
        occupation: 'Retired',
        email_contact: 'chandrakant@example.com',
        phone: '9876543210',
        is_deceased: true,
      },
      'test-user-uuid'
    )

    expect(res.error).toBeNull()
    const payload = mockInsert.mock.calls[0][0]
    expect(payload.is_deceased).toBe(true)
    expect(payload.status).toBe('DECEASED')
  })

  it('updatePerson updates is_deceased = true and synchronizes status = DECEASED', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'p-1', is_deceased: true, status: 'DECEASED' },
      error: null,
    })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq = vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ select: mockSelect }) })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    const res = await updatePerson('p-1', { is_deceased: true })

    expect(res.error).toBeNull()
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.is_deceased).toBe(true)
    expect(payload.status).toBe('DECEASED')
  })

  it('updatePerson updates is_deceased = false and restores status = ACTIVE', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'p-1', is_deceased: false, status: 'ACTIVE' },
      error: null,
    })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq = vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ select: mockSelect }) })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    const res = await updatePerson('p-1', { is_deceased: false })

    expect(res.error).toBeNull()
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.is_deceased).toBe(false)
    expect(payload.status).toBe('ACTIVE')
  })
})

describe('CHANGE 2: Family Head Email Prefill & Independent Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getFamilyHeadEmail fetches the active head contact email for a family', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { person: { email_contact: 'jayesh.vyas@example.com' } },
      error: null,
    })
    const mockIs = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEqHead = vi.fn().mockReturnValue({ is: mockIs })
    const mockEqFam = vi.fn().mockReturnValue({ eq: mockEqHead })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqFam })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    const email = await getFamilyHeadEmail('11111111-1111-1111-1111-111111111111')
    expect(email).toBe('jayesh.vyas@example.com')
  })

  it('getFamilyHeadEmail returns null when head has no email', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { person: { email_contact: null } },
      error: null,
    })
    const mockIs = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEqHead = vi.fn().mockReturnValue({ is: mockIs })
    const mockEqFam = vi.fn().mockReturnValue({ eq: mockEqHead })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqFam })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    const email = await getFamilyHeadEmail('11111111-1111-1111-1111-111111111111')
    expect(email).toBeNull()
  })

  it('EditMemberModal loads member own email and does NOT overwrite with head email', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const mockMember: FamilyMemberWithPerson = {
      id: 'fm-2',
      family_id: 'fam-1',
      person_id: 'p-2',
      role: 'CHILD',
      relationship_to_head: 'Son (बेटा)',
      is_head: false,
      joined_at: '2024-01-01',
      left_at: null,
      added_by: 'creator-uuid',
      created_at: '2024-01-01',
      person: {
        id: 'p-2',
        first_name: 'Vraj',
        last_name: 'Vyas',
        gender: 'MALE',
        status: 'ACTIVE',
        is_deceased: false,
        email_contact: 'vraj.own@example.com',
        occupation: 'Software Engineer',
      } as any,
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <EditMemberModal
            familyId="fam-1"
            isOpen={true}
            member={mockMember}
            onClose={() => {}}
          />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const emailInput = screen.getByLabelText(/Email Address/i) as HTMLInputElement
    expect(emailInput.value).toBe('vraj.own@example.com')
    // Must NOT be the logged-in user or head's email (jayesh@example.com)
    expect(emailInput.value).not.toBe('jayesh@example.com')
  })
})
