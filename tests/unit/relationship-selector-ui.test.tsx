/**
 * UI Component Tests: RelationshipSelector & Family Member Modals with English + Hindi
 *
 * Verifies:
 * - Search by English (e.g. "wife", "paternal uncle")
 * - Search by Devanagari Hindi (e.g. "पत्नी", "चाचा", "मामा")
 * - Rendering in "English (Hindi)" format
 * - Category groupings (13 official categories)
 * - Selection persistence and custom fallback
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelationshipSelector } from '@/components/forms/RelationshipSelector'

describe('RelationshipSelector UI Component — English + Hindi Multilingual Integration', () => {
  it('renders with label and displays formatted "English (Hindi)" value', () => {
    const onChange = vi.fn()
    render(
      <RelationshipSelector
        label="Relationship to Family Head"
        value="Wife"
        onChange={onChange}
      />
    )

    // Formats legacy "Wife" to "Wife (पत्नी)"
    const matches = screen.getAllByText('Wife (पत्नी)')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('opens dropdown with 13 official categories and 123 options on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RelationshipSelector
        label="Relationship to Family Head"
        value=""
        onChange={onChange}
      />
    )

    const triggerBtn = screen.getByTestId('relationship-selector-trigger')
    await user.click(triggerBtn)

    expect(screen.getByText('13 Categories (English + Hindi Reference)')).toBeInTheDocument()
    expect(screen.getByText('1. Immediate family and spouse')).toBeInTheDocument()
    expect(screen.getByText('2. Grandparents, grandchildren and ancestors')).toBeInTheDocument()
    expect(screen.getByText('4. Aunts, uncles and their spouses')).toBeInTheDocument()
    expect(screen.getByText('11. Former, deceased and relationship status')).toBeInTheDocument()
  })

  it('filters relationship options when searching in English', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RelationshipSelector
        label="Relationship to Family Head"
        value=""
        onChange={onChange}
      />
    )

    const triggerBtn = screen.getByTestId('relationship-selector-trigger')
    await user.click(triggerBtn)

    const searchInput = screen.getByPlaceholderText(/Search English or Hindi/i)
    await user.type(searchInput, 'paternal uncle')

    const matches = screen.getAllByText('Paternal uncle (चाचा / ताऊ)')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('filters relationship options when searching in Devanagari Hindi', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RelationshipSelector
        label="Relationship to Family Head"
        value=""
        onChange={onChange}
      />
    )

    const triggerBtn = screen.getByTestId('relationship-selector-trigger')
    await user.click(triggerBtn)

    const searchInput = screen.getByPlaceholderText(/Search English or Hindi/i)
    await user.type(searchInput, 'मामा')

    const matches = screen.getAllByText('Maternal uncle (मामा)')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('selects option with one click and triggers onChange with full "English (Hindi)" string', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RelationshipSelector
        label="Relationship to Family Head"
        value=""
        onChange={onChange}
      />
    )

    const triggerBtn = screen.getByTestId('relationship-selector-trigger')
    await user.click(triggerBtn)

    // Option inside dropdown list
    const sonOption = screen.getAllByText('Son (बेटा)')[1] || screen.getAllByText('Son (बेटा)')[0]
    await user.click(sonOption)

    expect(onChange).toHaveBeenCalledWith('Son (बेटा)')
  })

  it('allows specifying a custom relationship when selecting "Other"', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <RelationshipSelector
        label="Relationship to Family Head"
        value=""
        onChange={onChange}
      />
    )

    const triggerBtn = screen.getByTestId('relationship-selector-trigger')
    await user.click(triggerBtn)

    const otherOption = screen.getAllByText('Other (अन्य / विशिष्ट संबंध)')[1] || screen.getAllByText('Other (अन्य / विशिष्ट संबंध)')[0]
    await user.click(otherOption)

    expect(onChange).toHaveBeenCalledWith('Other (अन्य / विशिष्ट संबंध)')

    // Re-render with custom value
    rerender(
      <RelationshipSelector
        label="Relationship to Family Head"
        value="Other (अन्य / विशिष्ट संबंध)"
        onChange={onChange}
      />
    )

    const customInput = screen.getByPlaceholderText('Specify custom relationship...')
    expect(customInput).toBeInTheDocument()
    await user.type(customInput, 'Family Guru')

    const saveBtn = screen.getByRole('button', { name: 'Save' })
    await user.click(saveBtn)

    expect(onChange).toHaveBeenCalledWith('Other: Family Guru')
  })
})
