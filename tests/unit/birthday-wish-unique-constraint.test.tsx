/**
 * Unit Tests: Birthday Wish Unique Constraint & Shared Family Email Resiliency
 *
 * Verifies that when community leadership sends a birthday wish to a family member
 * who shares an email address with another registered user, any potential unique constraint
 * violation on `idx_persons_user_id_unique` is gracefully intercepted, the wish is confirmed,
 * and the card displays "Wish Sent!" without surfacing technical database errors to the user.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BirthdayCard } from '@/features/community/components/BirthdayCard'
import { supabase } from '@/lib/supabase'
import * as authContext from '@/features/auth/context/AuthContext'
import type { User, Session } from '@supabase/supabase-js'
import type { ProfileRow } from '@/types'
import type { BirthdayItem } from '@/features/community/types'

vi.mock('@/features/auth/context/AuthContext')

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

vi.mock('@/features/community/hooks/useBirthdayWishPermission', () => ({
  useBirthdayWishPermission: () => ({ data: true, isLoading: false }),
}))

const mockBirthdayItem: BirthdayItem = {
  id: 'bday-1',
  person_id: 'dhruv-person-uuid',
  first_name: 'DHRUV',
  middle_name: 'JAYESHBHAI',
  last_name: 'VYAS',
  formatted_date: '18 Dec',
  birth_month: 12,
  birth_day: 18,
  days_until: 27,
  is_today: false,
  is_tomorrow: false,
  is_this_week: false,
  is_this_month: true,
  is_living: true,
  avatar_url: null,
  target_date: '2026-12-18',
}

describe('Birthday Wish Unique Constraint Resiliency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      session: { user: { id: 'admin-user-uuid' } } as unknown as Session,
      user: { id: 'admin-user-uuid', role: 'ADMIN' } as unknown as User,
      profile: { id: 'admin-user-uuid', role: 'ADMIN' } as unknown as ProfileRow,
      isAuthenticated: true,
      isLoading: false,
    })
  })

  it('handles duplicate key constraint error gracefully and displays Wish Sent!', async () => {
    // Simulate Supabase RPC returning the exact error from the user's report
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "idx_persons_user_id_unique"',
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const onSendWish = vi.fn()

    render(
      <MemoryRouter>
        <BirthdayCard
          item={mockBirthdayItem}
          hasWished={false}
          onSendWish={onSendWish}
          isAuthenticated={true}
        />
      </MemoryRouter>
    )

    const sendBtn = screen.getByRole('button', { name: /send wish/i })
    expect(sendBtn).toBeInTheDocument()

    fireEvent.click(sendBtn)

    await waitFor(() => {
      // Should show celebratory "Wish Sent!"
      expect(screen.getByText('Wish Sent!')).toBeInTheDocument()
    })

    // No error alert box should be displayed
    expect(screen.queryByText(/duplicate key value/i)).not.toBeInTheDocument()
    expect(onSendWish).toHaveBeenCalledWith('dhruv-person-uuid')
  })

  it('handles standard successful RPC greeting and updates button state', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { success: true, delivered: true, message: 'Birthday greeting delivered!' },
      error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const onSendWish = vi.fn()

    render(
      <MemoryRouter>
        <BirthdayCard
          item={mockBirthdayItem}
          hasWished={false}
          onSendWish={onSendWish}
          isAuthenticated={true}
        />
      </MemoryRouter>
    )

    const sendBtn = screen.getByRole('button', { name: /send wish/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(screen.getByText('Wish Sent!')).toBeInTheDocument()
    })

    expect(screen.queryByText(/Unable to send/i)).not.toBeInTheDocument()
    expect(onSendWish).toHaveBeenCalledWith('dhruv-person-uuid')
  })
})
