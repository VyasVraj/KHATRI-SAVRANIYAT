import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CircularFiltersBar } from '@/features/community/components/CircularFiltersBar'
import type { CircularFilters } from '@/features/community/types'

describe('CircularFiltersBar UI & Dropdown Readability', () => {
  const defaultFilters: CircularFilters = {
    search: '',
    category: 'ALL',
    issuer: 'ALL',
    status: 'PUBLISHED',
  }

  const sampleIssuers = [
    'Central Election Commission',
    'Central Panchayat Apex Trust',
    'Education & Youth Empowerment Trust',
    'Jan Ganna Central Committee & Central Panchayat',
    'Khatri Youth & Sports Wing',
    'Medical & Health Relief Committee',
    'Sarvaniyat & Samajik Samadhan Samiti',
  ]

  it('renders issuing authority dropdown trigger with dark-mode contrast classes', () => {
    const handleChange = vi.fn()
    const handleReset = vi.fn()

    render(
      <CircularFiltersBar
        filters={defaultFilters}
        onChange={handleChange}
        onReset={handleReset}
        totalCount={8}
        availableIssuers={sampleIssuers}
      />
    )

    const triggerButton = screen.getByRole('button', {
      name: /Issuing Authority/i,
    })
    expect(triggerButton).toBeInTheDocument()

    // Must have dark background and light text in dark mode, and light background with dark text in light mode
    expect(triggerButton.className).toContain('dark:bg-slate-800')
    expect(triggerButton.className).toContain('bg-white')
    expect(triggerButton.className).toContain('dark:text-slate-100')
    expect(triggerButton.className).toContain('text-slate-900')
  })

  it('opens custom dropdown menu with high contrast option list on click', () => {
    const handleChange = vi.fn()
    const handleReset = vi.fn()

    render(
      <CircularFiltersBar
        filters={defaultFilters}
        onChange={handleChange}
        onReset={handleReset}
        totalCount={8}
        availableIssuers={sampleIssuers}
      />
    )

    const triggerButton = screen.getByRole('button', {
      name: /Issuing Authority/i,
    })
    fireEvent.click(triggerButton)

    const listbox = screen.getByRole('listbox', {
      name: /Issuing Authority/i,
    })
    expect(listbox).toBeInTheDocument()
    expect(listbox.className).toContain('bg-white')
    expect(listbox.className).toContain('dark:bg-slate-800')

    // Find the option inside the opened custom listbox
    const electionOption = screen
      .getByRole('listbox')
      .querySelector('button[role="option"]:nth-of-type(2)')
    expect(electionOption).toBeTruthy()
    fireEvent.click(electionOption!)

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: 'Central Election Commission',
      })
    )
  })

  it('triggers onChange when synchronized select receives a change event', () => {
    const handleChange = vi.fn()
    const handleReset = vi.fn()

    render(
      <CircularFiltersBar
        filters={defaultFilters}
        onChange={handleChange}
        onReset={handleReset}
        totalCount={8}
        availableIssuers={sampleIssuers}
      />
    )

    const selectElement = screen.getByRole('combobox', {
      name: /Issuing Authority/i,
    })

    fireEvent.change(selectElement, {
      target: { value: 'Central Election Commission' },
    })

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: 'Central Election Commission',
      })
    )
  })
})
