/**
 * Unit Tests: Mutually Exclusive Date of Birth and Age Selection
 * (KHATRI SARVANIYAT specification)
 *
 * Verifies:
 * 1. User must choose either Date of Birth OR Age.
 * 2. If Date of Birth is selected: Date of Birth is enabled and mandatory,
 *    Age is disabled, age is automatically calculated from Date of Birth.
 * 3. If Age is selected: Age is enabled and mandatory (0-125), Date of Birth is disabled and remains null.
 * 4. Switching options clears the inactive value and disables the other field.
 * 5. Backend schema and service level validation rejects missing both or providing conflicting both.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createPersonSchema, updatePersonSchema } from '@/features/people/schemas/people.schemas'
import { createPerson, updatePerson } from '@/features/people/services/people.service'
import { PersonForm } from '@/features/people/components/PersonForm'
import { calculateAgeFromDob } from '@/utils/common'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const BASE_VALID_PERSON = {
  first_name: 'Harsh',
  last_name: 'Khatri',
  gender: 'MALE' as const,
  blood_group: 'O+' as const,
  gotra: 'Agastya',
  nukh: 'Arora (Aroda)',
}

describe('Backend Schema: Mutually Exclusive DOB vs Age Validation', () => {
  it('succeeds when Date of Birth only is provided', () => {
    const payload = {
      ...BASE_VALID_PERSON,
      date_of_birth: '1995-04-12',
      current_age: null,
    }
    const result = createPersonSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.date_of_birth).toBe('1995-04-12')
      expect(result.data.current_age).toBeNull()
    }
  })

  it('succeeds when Current Age only is provided', () => {
    const payload = {
      ...BASE_VALID_PERSON,
      date_of_birth: null,
      current_age: 30,
    }
    const result = createPersonSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.date_of_birth).toBeNull()
      expect(result.data.current_age).toBe(30)
    }
  })

  it('rejects when neither Date of Birth nor Current Age is provided in createPersonSchema', () => {
    const payload = {
      ...BASE_VALID_PERSON,
      date_of_birth: null,
      current_age: null,
    }
    const result = createPersonSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.errors.map((e) => e.message)
      expect(msgs).toContain('Please provide either Date of Birth OR Current Age.')
    }
  })

  it('rejects when both conflicting Date of Birth and Current Age are provided', () => {
    const payload = {
      ...BASE_VALID_PERSON,
      date_of_birth: '1995-04-12',
      current_age: 29,
    }
    const result = createPersonSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.errors.map((e) => e.message)
      expect(msgs).toContain('Please provide either Date of Birth OR Age, not both.')
    }
  })

  it('rejects future Date of Birth', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const futureDob = tomorrow.toISOString().split('T')[0]

    const payload = {
      ...BASE_VALID_PERSON,
      date_of_birth: futureDob,
    }
    const result = createPersonSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.errors.map((e) => e.message)
      expect(msgs).toContain('Date of birth cannot be in the future')
    }
  })

  it('rejects invalid or negative age in createPersonSchema', () => {
    const payload = {
      ...BASE_VALID_PERSON,
      current_age: -5,
    }
    const result = createPersonSchema.safeParse(payload)
    expect(result.success).toBe(false)

    const payloadOver = {
      ...BASE_VALID_PERSON,
      current_age: 150,
    }
    const resultOver = createPersonSchema.safeParse(payloadOver)
    expect(resultOver.success).toBe(false)
  })

  it('updatePersonSchema rejects conflicting DOB and Age in update payload', () => {
    const payload = {
      date_of_birth: '1990-01-01',
      current_age: 35,
    }
    const result = updatePersonSchema.safeParse(payload)
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.errors.map((e) => e.message)
      expect(msgs).toContain('Please provide either Date of Birth OR Age, not both.')
    }
  })
})

describe('People Service: Mutually Exclusive Storage Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createPerson clears current_age when date_of_birth is provided', async () => {
    let capturedInsert: Record<string, unknown> = {}
    const mockInsert = vi.fn().mockImplementation((payload) => {
      capturedInsert = payload
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'person-123', ...payload },
            error: null,
          }),
        }),
      }
    })

    vi.mocked(supabase.from).mockReturnValue({
      insert: mockInsert,
    } as never)

    const res = await createPerson(
      {
        ...BASE_VALID_PERSON,
        date_of_birth: '1992-06-15',
      },
      'creator-uid'
    )

    expect(res.error).toBeNull()
    expect(capturedInsert.date_of_birth).toBe('1992-06-15')
    expect(capturedInsert.current_age).toBeNull()
  })

  it('createPerson sets date_of_birth to null when current_age is provided', async () => {
    let capturedInsert: Record<string, unknown> = {}
    const mockInsert = vi.fn().mockImplementation((payload) => {
      capturedInsert = payload
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'person-456', ...payload },
            error: null,
          }),
        }),
      }
    })

    vi.mocked(supabase.from).mockReturnValue({
      insert: mockInsert,
    } as never)

    const res = await createPerson(
      {
        ...BASE_VALID_PERSON,
        current_age: 28,
      },
      'creator-uid'
    )

    expect(res.error).toBeNull()
    expect(capturedInsert.current_age).toBe(28)
    expect(capturedInsert.date_of_birth).toBeNull()
  })

  it('updatePerson switching to DOB sets current_age to null in database update', async () => {
    let capturedUpdate: Record<string, unknown> = {}
    const mockUpdate = vi.fn().mockImplementation((payload) => {
      capturedUpdate = payload
      return {
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'person-123', ...payload },
                error: null,
              }),
            }),
          }),
        }),
      }
    })

    vi.mocked(supabase.from).mockReturnValue({
      update: mockUpdate,
    } as never)

    const res = await updatePerson('person-123', {
      date_of_birth: '1988-10-25',
    })

    expect(res.error).toBeNull()
    expect(capturedUpdate.date_of_birth).toBe('1988-10-25')
    expect(capturedUpdate.current_age).toBeNull()
  })
})

describe('PersonForm UI: Mutually Exclusive Selection & Age Calculation', () => {
  it('calculates current age dynamically from Date of Birth', () => {
    const age = calculateAgeFromDob('2000-11-01')
    expect(typeof age).toBe('number')
    expect(age).toBeGreaterThanOrEqual(24)
  })

  it('renders mutually exclusive radio options and disables inactive field', async () => {
    render(
      <MemoryRouter>
        <PersonForm
          mode="create"
          onSubmit={vi.fn()}
        />
      </MemoryRouter>
    )

    // Check radio labels
    expect(screen.getByText('Enter Date of Birth')).toBeInTheDocument()
    expect(screen.getByText('Enter Current Age')).toBeInTheDocument()

    // By default, Date of Birth mode is active
    const dobInput = screen.getByLabelText(/Date of Birth \*/i)
    expect(dobInput).toBeEnabled()

    // Switching to Current Age disables Date of Birth and enables Current Age
    const ageRadio = screen.getByRole('radio', { name: /Enter Current Age/i })
    fireEvent.click(ageRadio)

    await waitFor(() => {
      const ageInput = screen.getByLabelText(/Current Age \(in years\) \*/i)
      expect(ageInput).toBeEnabled()
      expect(screen.getByLabelText(/Date of Birth \(Disabled\)/i)).toBeDisabled()
    })
  })
})
