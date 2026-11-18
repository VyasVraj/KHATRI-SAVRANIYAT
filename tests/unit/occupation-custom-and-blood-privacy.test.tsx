import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  OCCUPATION_CATEGORIES,
  isValidOccupation,
} from '@/constants/occupations'
import {
  resolveOccupationDisplay,
} from '@/features/people/services/public-occupation.service'
import {
  getBloodDirectoryMembers,
} from '@/features/community/services/blood-directory.service'
import { TwoLevelOccupationSelect, OTHER_OCCUPATION_CATEGORY, OTHER_OPTION_LABEL } from '@/components/forms/TwoLevelOccupationSelect'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

describe('Feature 2: Official 30 Occupation Categories from PDF', () => {
  it('contains exactly the 30 official categories from the reference PDF', () => {
    expect(OCCUPATION_CATEGORIES).toHaveLength(30)
    expect(OCCUPATION_CATEGORIES[0]).toBe('Agriculture')
    expect(OCCUPATION_CATEGORIES[1]).toBe('Healthcare')
    expect(OCCUPATION_CATEGORIES[2]).toBe('Education')
    expect(OCCUPATION_CATEGORIES[3]).toBe('Engineering')
    expect(OCCUPATION_CATEGORIES[4]).toBe('Information Technology')
    expect(OCCUPATION_CATEGORIES[5]).toBe('Science and Research')
    expect(OCCUPATION_CATEGORIES[6]).toBe('Business and Entrepreneurship')
    expect(OCCUPATION_CATEGORIES[7]).toBe('Finance and Banking')
    expect(OCCUPATION_CATEGORIES[8]).toBe('Law and Legal Services')
    expect(OCCUPATION_CATEGORIES[9]).toBe('Government Services')
    expect(OCCUPATION_CATEGORIES[10]).toBe('Defence and Military')
    expect(OCCUPATION_CATEGORIES[11]).toBe('Police and Security')
    expect(OCCUPATION_CATEGORIES[12]).toBe('Construction and Real Estate')
    expect(OCCUPATION_CATEGORIES[13]).toBe('Manufacturing and Industry')
    expect(OCCUPATION_CATEGORIES[14]).toBe('Skilled Trades and Repair')
    expect(OCCUPATION_CATEGORIES[15]).toBe('Transport and Logistics')
    expect(OCCUPATION_CATEGORIES[16]).toBe('Retail and Trade')
    expect(OCCUPATION_CATEGORIES[17]).toBe('Hospitality and Tourism')
    expect(OCCUPATION_CATEGORIES[18]).toBe('Food and Catering')
    expect(OCCUPATION_CATEGORIES[19]).toBe('Media and Journalism')
    expect(OCCUPATION_CATEGORIES[20]).toBe('Arts and Entertainment')
    expect(OCCUPATION_CATEGORIES[21]).toBe('Design and Fashion')
    expect(OCCUPATION_CATEGORIES[22]).toBe('Beauty and Personal Care')
    expect(OCCUPATION_CATEGORIES[23]).toBe('Sports and Fitness')
    expect(OCCUPATION_CATEGORIES[24]).toBe('Social Work and NGOs')
    expect(OCCUPATION_CATEGORIES[25]).toBe('Energy and Utilities')
    expect(OCCUPATION_CATEGORIES[26]).toBe('Telecommunications')
    expect(OCCUPATION_CATEGORIES[27]).toBe('Domestic and Household Services')
    expect(OCCUPATION_CATEGORIES[28]).toBe('Religious and Cultural Services')
    expect(OCCUPATION_CATEGORIES[29]).toBe('Digital and Online Services')
  })

  it('validates each official category correctly with isValidOccupation', () => {
    OCCUPATION_CATEGORIES.forEach((cat) => {
      expect(isValidOccupation(cat)).toBe(true)
    })
    expect(isValidOccupation('Invalid Category XYZ')).toBe(false)
  })
})

describe('Feature 1 & 3: Occupation Directory Resolution & Custom Occupations', () => {
  it('resolves an official category into APPROVED status with the category name', () => {
    const res = resolveOccupationDisplay('Information Technology')
    expect(res.occupation).toBe('Information Technology')
    expect(res.status).toBe('APPROVED')
  })

  it('resolves a custom occupation into APPROVED status instead of falling back to "Occupation Not Provided"', () => {
    const res1 = resolveOccupationDisplay('Freelance Photographer')
    expect(res1.occupation).toBe('Freelance Photographer')
    expect(res1.status).toBe('APPROVED')

    const res2 = resolveOccupationDisplay('Organic Farming Consultant')
    expect(res2.occupation).toBe('Organic Farming Consultant')
    expect(res2.status).toBe('APPROVED')
  })

  it('resolves approved update request correctly', () => {
    const res = resolveOccupationDisplay('Agriculture', {
      status: 'APPROVED',
      requested_occupation: 'Civil Engineer',
    })
    expect(res.occupation).toBe('Civil Engineer')
    expect(res.status).toBe('APPROVED')
  })

  it('preserves existing approved occupation when a new request is pending review', () => {
    const res = resolveOccupationDisplay('Education', {
      status: 'PENDING',
      requested_occupation: 'Professor',
    })
    expect(res.occupation).toBe('Education')
    expect(res.status).toBe('APPROVED')
  })

  it('displays "Occupation Pending" only when no prior occupation exists and request is pending', () => {
    const res = resolveOccupationDisplay('', {
      status: 'PENDING',
      requested_occupation: 'Software Architect',
    })
    expect(res.occupation).toBe('Occupation Pending')
    expect(res.status).toBe('PENDING')
  })

  it('displays "Occupation Not Provided" only when no occupation has ever been provided', () => {
    expect(resolveOccupationDisplay(null).occupation).toBe('Occupation Not Provided')
    expect(resolveOccupationDisplay('').occupation).toBe('Occupation Not Provided')
    expect(resolveOccupationDisplay('   ').occupation).toBe('Occupation Not Provided')
    expect(resolveOccupationDisplay('Occupation Not Provided').occupation).toBe('Occupation Not Provided')
  })
})

describe('Feature 2 & 3: TwoLevelOccupationSelect UI & Custom Input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => {
        cb({ data: [{ occupation_name: 'Solar Panel Technician' }] })
        return { then: vi.fn() }
      }),
    })
  })

  it('renders all 30 categories and allows category selection', () => {
    const handleChange = vi.fn()
    const { container } = render(
      <TwoLevelOccupationSelect
        categoryValue=""
        occupationValue=""
        onChange={handleChange}
      />
    )

    // Open Step 1 dropdown
    const step1Btn = container.querySelector('#occupation-select-category') as HTMLElement
    expect(step1Btn).toBeInTheDocument()
    fireEvent.click(step1Btn)

    // Agriculture should be available
    const agriOption = screen.getByRole('option', { name: /^1\.\s+Agriculture/i })
    fireEvent.click(agriOption)

    // When selecting category directly, it defaults occupation to the category itself so it is never empty!
    expect(handleChange).toHaveBeenCalledWith('Agriculture', 'Agriculture')
  })

  it('shows "Other — Add Your Occupation" option and renders "Enter Your Occupation" input', () => {
    const handleChange = vi.fn()
    const { container } = render(
      <TwoLevelOccupationSelect
        categoryValue=""
        occupationValue=""
        onChange={handleChange}
      />
    )

    // Open Step 1 dropdown
    const step1Btn = container.querySelector('#occupation-select-category') as HTMLElement
    expect(step1Btn).toBeInTheDocument()
    fireEvent.click(step1Btn)

    // Click "Other — Add Your Occupation"
    const otherOption = screen.getByRole('option', { name: new RegExp(OTHER_OPTION_LABEL, 'i') })
    fireEvent.click(otherOption)

    // Custom occupation text box must appear
    const customInput = screen.getByPlaceholderText(/e\.g\. Freelance Photographer/i)
    expect(customInput).toBeInTheDocument()

    // Type custom occupation
    fireEvent.change(customInput, { target: { value: 'Organic Farming Consultant' } })
    expect(handleChange).toHaveBeenCalledWith('Organic Farming Consultant', OTHER_OCCUPATION_CATEGORY)
  })

  it('loads existing custom occupation in edit mode', () => {
    render(
      <TwoLevelOccupationSelect
        categoryValue="Other"
        occupationValue="Freelance Photographer"
        onChange={vi.fn()}
      />
    )

    const customInput = screen.getByDisplayValue('Freelance Photographer')
    expect(customInput).toBeInTheDocument()
  })
})

describe('Feature 5 & 6: Blood Group Directory Consent Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retrieves ONLY consented members from RPC get_public_blood_group_directory', async () => {
    const mockRpcMembers = [
      {
        person_id: 'p-1',
        full_name: 'Jayesh C Vyas',
        blood_group: 'A+',
        city: 'Anand',
        state: 'Gujarat',
        country: 'India',
        family_id: 'fam-1',
        family_name: 'Vyas Parivar',
        family_head_name: 'Jayesh Vyas',
        family_head_person_id: 'p-1',
      },
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.rpc as any).mockResolvedValueOnce({
      data: mockRpcMembers,
      error: null,
    })

    const res = await getBloodDirectoryMembers({ bloodGroup: 'A+' })
    expect(res.data).toHaveLength(1)
    expect(res.data![0].full_name).toBe('Jayesh C Vyas')
    expect(res.data![0].blood_group).toBe('A+')
    expect(res.data![0].family_head_name).toBe('Jayesh Vyas')
  })

  it('excludes non-consenting members in resilient fallback query via show_blood_group_in_directory check', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.rpc as any).mockRejectedValueOnce(new Error('RPC missing'))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockQuery: any = {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from as any).mockReturnValue(mockQuery)

    const res = await getBloodDirectoryMembers({ bloodGroup: 'B+' })
    expect(mockQuery.or).toHaveBeenCalledWith('show_blood_group_in_directory.eq.true,blood_group_consent.eq.true')
    expect(res.data).toHaveLength(0)
  })
})
