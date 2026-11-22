/**
 * Unit Tests: TreeLegend Collapsible Behavior
 *
 * Verifies:
 * 1. Default collapsed state: only the Legend toggle button is visible.
 * 2. Opening interaction: clicking the button expands the full Relationship Legend.
 * 3. Content fidelity: all 9 relationship types are present with identical labels.
 * 4. Closing interaction: clicking the toggle button or the X button collapses the legend.
 * 5. Visual indicator and accessible attributes: aria-expanded, aria-label, aria-controls.
 * 6. Event isolation: stopPropagation on click and pointerDown.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import { TreeLegend } from '@/features/tree/components/TreeLegend'

// Mock reactflow's Panel
vi.mock('reactflow', () => ({
  Panel: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="rf-panel" className={className}>
      {children}
    </div>
  ),
}))

describe('TreeLegend Component', () => {
  it('renders in collapsed state by default with compact toggle button', () => {
    render(<TreeLegend />)

    const toggleBtn = screen.getByRole('button', { name: /show relationship legend/i })
    expect(toggleBtn).toBeInTheDocument()
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Legend')).toBeInTheDocument()

    // Full legend panel should not be rendered
    expect(screen.queryByRole('region', { name: /relationship legend/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Parent – Child')).not.toBeInTheDocument()
  })

  it('expands when clicking the toggle button and renders all 9 relationship items', () => {
    render(<TreeLegend />)

    const toggleBtn = screen.getByRole('button', { name: /show relationship legend/i })
    fireEvent.click(toggleBtn)

    // Check button updated state
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true')
    expect(toggleBtn).toHaveAttribute('aria-label', 'Hide Relationship Legend')

    // Legend panel is now visible
    const legendPanel = screen.getByRole('region', { name: /relationship legend/i })
    expect(legendPanel).toBeInTheDocument()
    expect(screen.getByText('Relationship Legend')).toBeInTheDocument()

    // Verify all 9 legend items are present without changes
    expect(screen.getByText('Spouse')).toBeInTheDocument()
    expect(screen.getByText('Parent – Child')).toBeInTheDocument()
    expect(screen.getByText('Siblings')).toBeInTheDocument()
    expect(screen.getByText('Head of Family')).toBeInTheDocument()
    expect(screen.getByText('Male')).toBeInTheDocument()
    expect(screen.getByText('Female')).toBeInTheDocument()
    expect(screen.getByText('Couple (∞)')).toBeInTheDocument()
    expect(screen.getByText('Selected Person')).toBeInTheDocument()
    expect(screen.getByText('Deceased')).toBeInTheDocument()
  })

  it('collapses when clicking the toggle button a second time', () => {
    render(<TreeLegend />)

    const toggleBtn = screen.getByRole('button', { name: /show relationship legend/i })

    // Open
    fireEvent.click(toggleBtn)
    expect(screen.getByRole('region', { name: /relationship legend/i })).toBeInTheDocument()

    // Close
    fireEvent.click(toggleBtn)
    expect(screen.queryByRole('region', { name: /relationship legend/i })).not.toBeInTheDocument()
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapses when clicking the close (X) button inside the expanded panel', () => {
    render(<TreeLegend />)

    const toggleBtn = screen.getByRole('button', { name: /show relationship legend/i })
    fireEvent.click(toggleBtn)

    const closeBtn = screen.getByRole('button', { name: /close relationship legend/i })
    expect(closeBtn).toBeInTheDocument()

    fireEvent.click(closeBtn)
    expect(screen.queryByRole('region', { name: /relationship legend/i })).not.toBeInTheDocument()
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('supports defaultExpanded prop', () => {
    render(<TreeLegend defaultExpanded={true} />)

    expect(screen.getByRole('region', { name: /relationship legend/i })).toBeInTheDocument()
    expect(screen.getByText('Spouse')).toBeInTheDocument()
  })

  it('stops event propagation on click and pointerDown to avoid interfering with canvas', () => {
    render(<TreeLegend />)

    const toggleBtn = screen.getByRole('button', { name: /show relationship legend/i })
    
    const clickEvent = createEvent.click(toggleBtn)
    clickEvent.stopPropagation = vi.fn()
    fireEvent(toggleBtn, clickEvent)
    expect(clickEvent.stopPropagation).toHaveBeenCalled()

    const pointerEvent = createEvent.pointerDown(toggleBtn)
    pointerEvent.stopPropagation = vi.fn()
    fireEvent(toggleBtn, pointerEvent)
    expect(pointerEvent.stopPropagation).toHaveBeenCalled()
  })
})
