/**
 * Unit tests for GotraNukhSelect component
 * (src/components/forms/GotraNukhSelect.tsx)
 *
 * Verifies:
 * - Rendering of all 29 authoritative Gotras from database hook
 * - Disabled state of Nukh when no Gotra is selected
 * - Dependent Nukh population upon Gotra selection
 * - Preservation of distinct Nukhs between Garg (#9) and Garga (#10)
 * - Accessible error states (aria-invalid, aria-describedby, role="alert")
 * - Form disablement and interaction callbacks
 * - Honest error & retry state when database registry fails
 * - Loading indicator state when database query is in flight
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { GotraNukhSelect } from '@/components/forms/GotraNukhSelect'
import * as gotraNukhService from '@/services/gotraNukh.service'
import { GOTRAS, GOTRA_NUKH_MAP } from '@/constants/gotraNukh'

describe('GotraNukhSelect Component', () => {
  const mockRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(gotraNukhService, 'useGotraNukhRegistry').mockReturnValue({
      gotras: [...GOTRAS],
      gotraNukhMap: { ...GOTRA_NUKH_MAP },
      getNukhsForGotra: (g?: string | null) => (g ? GOTRA_NUKH_MAP[g] ?? [] : []),
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof gotraNukhService.useGotraNukhRegistry>)
  })

  it('renders all 29 authoritative Gotras in the Gotra dropdown', () => {
    render(
      <GotraNukhSelect
        selectedGotra=""
        selectedNukh=""
        onGotraChange={vi.fn()}
        onNukhChange={vi.fn()}
      />
    )

    const gotraSelect = screen.getByLabelText(/Gotra/i) as HTMLSelectElement
    expect(gotraSelect).toBeInTheDocument()

    // 1 placeholder option ("— Select Gotra —") + 29 Gotra options = 30 options
    expect(gotraSelect.options).toHaveLength(GOTRAS.length + 1)
    expect(gotraSelect.options[0].text).toBe('— Select Gotra —')

    // Verify key Gotras exist
    expect(screen.getByRole('option', { name: 'Agastya' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bharadwaj' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Gargya' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Vashishtha' })).toBeInTheDocument()
  })

  it('disables the Nukh dropdown when no Gotra is selected', () => {
    render(
      <GotraNukhSelect
        selectedGotra=""
        selectedNukh=""
        onGotraChange={vi.fn()}
        onNukhChange={vi.fn()}
      />
    )

    const nukhSelect = screen.getByLabelText(/Nukh/i) as HTMLSelectElement
    expect(nukhSelect).toBeDisabled()
    expect(screen.getByText(/— Select Gotra first —/i)).toBeInTheDocument()
  })

  it('populates dependent Nukhs when a Gotra is selected', () => {
    render(
      <GotraNukhSelect
        selectedGotra="Bharadwaj"
        selectedNukh=""
        onGotraChange={vi.fn()}
        onNukhChange={vi.fn()}
      />
    )

    const nukhSelect = screen.getByLabelText(/Nukh/i) as HTMLSelectElement
    expect(nukhSelect).not.toBeDisabled()

    const expectedNukhs = GOTRA_NUKH_MAP['Bharadwaj']
    expect(expectedNukhs.length).toBeGreaterThan(0)

    // Check that expected Nukhs are options within the Nukh dropdown
    expectedNukhs.forEach((nukhName) => {
      expect(within(nukhSelect).getByRole('option', { name: nukhName })).toBeInTheDocument()
    })
  })

  it('preserves distinct Nukhs between Gargya and Gautam from authoritative PDF', () => {
    const { rerender } = render(
      <GotraNukhSelect
        selectedGotra="Gargya"
        selectedNukh=""
        onGotraChange={vi.fn()}
        onNukhChange={vi.fn()}
      />
    )

    let nukhSelect = screen.getByLabelText(/Nukh/i) as HTMLSelectElement
    const gargyaNukhs = GOTRA_NUKH_MAP['Gargya']
    expect(gargyaNukhs).toEqual([
      'Gajkaran (Gaj Karan)',
      'Gumara',
      'Vankala',
      'Chhuchha (Chhuchha)',
    ])
    gargyaNukhs.forEach((n) => {
      expect(within(nukhSelect).getByRole('option', { name: n })).toBeInTheDocument()
    })

    // Rerender with Gautam
    rerender(
      <GotraNukhSelect
        selectedGotra="Gautam"
        selectedNukh=""
        onGotraChange={vi.fn()}
        onNukhChange={vi.fn()}
      />
    )

    nukhSelect = screen.getByLabelText(/Nukh/i) as HTMLSelectElement
    const gautamNukhs = GOTRA_NUKH_MAP['Gautam']
    expect(gautamNukhs).toEqual(['Shirach', 'Goratola', 'Gila', 'Madhur', 'Madhu'])
    gautamNukhs.forEach((n) => {
      expect(within(nukhSelect).getByRole('option', { name: n })).toBeInTheDocument()
    })
  })

  it('triggers onGotraChange and resets Nukh on Gotra selection change', () => {
    const onGotraChange = vi.fn()
    const onNukhChange = vi.fn()

    render(
      <GotraNukhSelect
        selectedGotra="Agastya"
        selectedNukh="Tatiya"
        onGotraChange={onGotraChange}
        onNukhChange={onNukhChange}
      />
    )

    const gotraSelect = screen.getByLabelText(/Gotra/i)
    fireEvent.change(gotraSelect, { target: { value: 'Bharadwaj' } })

    expect(onGotraChange).toHaveBeenCalledWith('Bharadwaj')
    expect(onNukhChange).toHaveBeenCalledWith('')
  })

  it('triggers onNukhChange on Nukh selection change', () => {
    const onNukhChange = vi.fn()

    render(
      <GotraNukhSelect
        selectedGotra="Bharadwaj"
        selectedNukh=""
        onGotraChange={vi.fn()}
        onNukhChange={onNukhChange}
      />
    )

    const nukhSelect = screen.getByLabelText(/Nukh/i)
    fireEvent.change(nukhSelect, { target: { value: 'Bhut (Nirmal)' } })

    expect(onNukhChange).toHaveBeenCalledWith('Bhut (Nirmal)')
  })

  it('renders validation errors with role="alert" and aria-invalid attributes', () => {
    render(
      <GotraNukhSelect
        selectedGotra=""
        selectedNukh=""
        onGotraChange={vi.fn()}
        onNukhChange={vi.fn()}
        gotraError="Gotra is required"
        nukhError="Invalid Nukh"
      />
    )

    const gotraSelect = screen.getByLabelText(/Gotra/i)
    const nukhSelect = screen.getByLabelText(/Nukh/i)

    expect(gotraSelect).toHaveAttribute('aria-invalid', 'true')
    expect(nukhSelect).toHaveAttribute('aria-invalid', 'true')

    const alerts = screen.getAllByRole('alert')
    expect(alerts.map((a) => a.textContent)).toContain('Gotra is required')
    expect(alerts.map((a) => a.textContent)).toContain('Invalid Nukh')
  })

  it('disables both selects when disabled prop is true', () => {
    render(
      <GotraNukhSelect
        selectedGotra="Agastya"
        selectedNukh="Tatiya"
        onGotraChange={vi.fn()}
        onNukhChange={vi.fn()}
        disabled={true}
      />
    )

    expect(screen.getByLabelText(/Gotra/i)).toBeDisabled()
    expect(screen.getByLabelText(/Nukh/i)).toBeDisabled()
  })

  it('renders an honest error state and retry button when database loading fails', () => {
    vi.spyOn(gotraNukhService, 'useGotraNukhRegistry').mockReturnValue({
      gotras: [],
      gotraNukhMap: {},
      getNukhsForGotra: () => [],
      isLoading: false,
      isError: true,
      error: new Error('PostgreSQL connection timed out'),
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof gotraNukhService.useGotraNukhRegistry>)

    render(
      <GotraNukhSelect
        selectedGotra=""
        selectedNukh=""
        onGotraChange={vi.fn()}
        onNukhChange={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Failed to load Gotra & Nukh directory')).toBeInTheDocument()
    expect(screen.getByText('PostgreSQL connection timed out')).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: /retry/i })
    expect(retryBtn).toBeInTheDocument()
    fireEvent.click(retryBtn)
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('displays loading indicator when master registry query is in flight', () => {
    vi.spyOn(gotraNukhService, 'useGotraNukhRegistry').mockReturnValue({
      gotras: [],
      gotraNukhMap: {},
      getNukhsForGotra: () => [],
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof gotraNukhService.useGotraNukhRegistry>)

    render(
      <GotraNukhSelect
        selectedGotra=""
        selectedNukh=""
        onGotraChange={vi.fn()}
        onNukhChange={vi.fn()}
      />
    )

    expect(screen.getByText('— Loading Gotras... —')).toBeInTheDocument()
    expect(screen.getByLabelText(/Gotra/i)).toBeDisabled()
    expect(screen.getByLabelText(/Nukh/i)).toBeDisabled()
  })
})
