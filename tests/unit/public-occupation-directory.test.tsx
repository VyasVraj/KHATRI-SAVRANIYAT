/**
 * Unit Tests: Public Occupation Directory & Controlled Contact Routing
 *
 * Validates:
 * 1. Directory is publicly accessible without login/authentication.
 * 2. STRICT PRIVACY: Returns ONLY person_id, full_name, occupation, associated_mukhi_name, associated_mukhi_region, associated_mukhi_id.
 * 3. Never returns or renders private fields (phone, email, dob, gender, blood group, address, gotra, nukh).
 * 4. Search and filtering across 30 categories and Mukhi works.
 * 5. Controlled contact request submits to leadership without disclosing personal numbers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PublicOccupationDirectoryPage } from '@/features/people/pages/PublicOccupationDirectoryPage'
import { ContactThroughMukhiModal } from '@/features/people/components/ContactThroughMukhiModal'
import * as publicOccupationService from '@/features/people/services/public-occupation.service'

const mockDirectoryData: publicOccupationService.PublicOccupationItem[] = [
  {
    person_id: 'person-001',
    full_name: 'Rajesh Khatri',
    occupation: 'Healthcare',
    associated_mukhi_name: 'Mukhi Jayesh C Vyas',
    associated_mukhi_region: 'Vadodara',
    associated_mukhi_id: 'mukhi-001',
  },
  {
    person_id: 'person-002',
    full_name: 'Amitabh Khatri',
    occupation: 'Engineering',
    associated_mukhi_name: 'Mukhi Asandas Chandumal Dhanwani',
    associated_mukhi_region: 'Porbandar',
    associated_mukhi_id: 'mukhi-002',
  },
  {
    person_id: 'person-003',
    full_name: 'Pooja Khatri',
    occupation: 'Information Technology',
    associated_mukhi_name: null,
    associated_mukhi_region: null,
    associated_mukhi_id: null,
  },
]

describe('Public Occupation Directory', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.spyOn(publicOccupationService, 'getPublicOccupationDirectory').mockResolvedValue({
      data: mockDirectoryData,
      error: null,
    })
  })

  it('renders directory heading and privacy notice without requiring login', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText('Profession & Occupation Directory')).toBeInTheDocument()
    expect(
      screen.getByText(/In accordance with strict community privacy standards/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Only public member names, profession categories/i)).toBeInTheDocument()

    // Waits for data to load
    await waitFor(() => {
      expect(screen.getByText('Rajesh Khatri')).toBeInTheDocument()
    })
  })

  it('displays approved public fields and never exposes private contact info in the table', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Rajesh Khatri')).toBeInTheDocument()
    })

    // Approved fields are present
    expect(screen.getAllByText('Healthcare').length).toBeGreaterThan(0)
    expect(screen.getByText('Mukhi Jayesh C Vyas')).toBeInTheDocument()
    expect(screen.getByText('Vadodara')).toBeInTheDocument()

    // Unassigned fallback is handled cleanly
    expect(screen.getByText('Pooja Khatri')).toBeInTheDocument()
    expect(screen.getByText('Mukhi Not Assigned')).toBeInTheDocument()

    // Private fields MUST NOT exist in DOM
    expect(screen.queryByText(/@example\.com/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/9828/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Blood Group/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Date of Birth/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Gotra/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Nukh/i)).not.toBeInTheDocument()
  })

  it('filters directory by search query across name, occupation, and Mukhi', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Rajesh Khatri')).toBeInTheDocument()
      expect(screen.getByText('Amitabh Khatri')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search by person name, occupation/i)
    fireEvent.change(searchInput, { target: { value: 'Amitabh' } })

    await waitFor(() => {
      expect(screen.getByText('Amitabh Khatri')).toBeInTheDocument()
      expect(screen.queryByText('Rajesh Khatri')).not.toBeInTheDocument()
    })
  })

  it('filters directory by occupation category dropdown', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Rajesh Khatri')).toBeInTheDocument()
    })

    const selects = screen.getAllByRole('combobox')
    const occupationSelect = selects[0] // Occupation category
    fireEvent.change(occupationSelect, { target: { value: 'Healthcare' } })

    await waitFor(() => {
      expect(publicOccupationService.getPublicOccupationDirectory).toHaveBeenCalledWith(
        expect.objectContaining({ occupation: 'Healthcare' })
      )
    })
  })

  it('displays BOTH "Contact Through Mukhi" and "Contact Through Admin" buttons for every person', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Rajesh Khatri')).toBeInTheDocument()
    })

    const mukhiButtons = screen.getAllByRole('button', { name: /Contact Through Mukhi/i })
    const adminButtons = screen.getAllByRole('button', { name: /Contact Through Admin/i })

    // Exactly 3 people in mock -> exactly 3 Mukhi buttons and 3 Admin buttons
    expect(mukhiButtons).toHaveLength(3)
    expect(adminButtons).toHaveLength(3)

    // Even person-003 without assigned Mukhi has both buttons
    expect(screen.getByText('Mukhi Not Assigned')).toBeInTheDocument()
    expect(adminButtons[2]).toBeInTheDocument()
  })

  it('opens controlled contact modal when "Contact Through Mukhi" is clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Rajesh Khatri')).toBeInTheDocument()
    })

    const mukhiButtons = screen.getAllByRole('button', { name: /Contact Through Mukhi/i })
    fireEvent.click(mukhiButtons[0])

    // Modal opens
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Contact Through Mukhi/i })).toBeInTheDocument()
    expect(screen.getByText(/Facilitating Authority/i)).toBeInTheDocument()
  })

  it('opens administrative contact dialog when "Contact Through Admin" is clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Rajesh Khatri')).toBeInTheDocument()
    })

    const adminButtons = screen.getAllByRole('button', { name: /Contact Through Admin/i })
    fireEvent.click(adminButtons[0])

    // Admin Modal opens
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Contact Through Admin/i })).toBeInTheDocument()
    expect(screen.getByText(/Mediated communication via Central Administration/i)).toBeInTheDocument()
  })
})

describe('ContactThroughMukhiModal Component', () => {
  const targetPerson: publicOccupationService.PublicOccupationItem = {
    person_id: 'person-123',
    full_name: 'Dinesh Khatri',
    occupation: 'Finance and Banking',
    associated_mukhi_name: 'Mukhi Mohanlal Khatri',
    associated_mukhi_region: 'Ahmedabad',
    associated_mukhi_id: 'mukhi-005',
  }

  it('renders target person, associated Mukhi, and privacy disclaimer', () => {
    render(
      <ContactThroughMukhiModal
        isOpen={true}
        onClose={vi.fn()}
        person={targetPerson}
      />
    )

    expect(screen.getByText('Dinesh Khatri')).toBeInTheDocument()
    expect(screen.getByText('Finance and Banking')).toBeInTheDocument()
    expect(screen.getByText('Mukhi Mohanlal Khatri')).toBeInTheDocument()
    expect(screen.getByText('Ahmedabad')).toBeInTheDocument()
    expect(
      screen.getByText(/Direct personal contact details \(phone, email, residence\) are never displayed/i)
    ).toBeInTheDocument()
  })

  it('submits contact request to leadership and displays confirmation', async () => {
    const submitSpy = vi
      .spyOn(publicOccupationService, 'submitOccupationContactRequest')
      .mockResolvedValue({
        success: true,
        requestId: 'req-999',
        message: 'Your inquiry has been routed to Mukhi Mohanlal Khatri.',
      })

    const onClose = vi.fn()
    render(
      <ContactThroughMukhiModal
        isOpen={true}
        onClose={onClose}
        person={targetPerson}
      />
    )

    fireEvent.change(screen.getByPlaceholderText(/e.g. Ramesh Khatri/i), {
      target: { value: 'Suresh Visitor' },
    })
    fireEvent.change(screen.getByPlaceholderText(/e.g. \+91 98765 43210/i), {
      target: { value: '9876543210' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Briefly describe what you would like to discuss/i), {
      target: { value: 'I would like to consult on financial planning services.' },
    })

    const submitBtn = screen.getByRole('button', { name: /Send Request/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith({
        personId: 'person-123',
        personName: 'Dinesh Khatri',
        associatedMukhiId: 'mukhi-005',
        visitorName: 'Suresh Visitor',
        visitorContact: '9876543210',
        purpose: 'Professional Consultation',
        message: 'I would like to consult on financial planning services.',
      })
    })

    expect(screen.getByText(/Request Submitted Successfully/i)).toBeInTheDocument()
    expect(screen.getByText(/routed to Mukhi Mohanlal Khatri/i)).toBeInTheDocument()
  })
})
