/**
 * Unit & Integration Tests: Print Notice & Official PDF Generation
 * Module: Community → Circulars → Notice Details → Print Notice
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import { CircularDetailModal } from '@/features/community/components/CircularDetailModal'
import { CANONICAL_CIRCULARS_REGISTRY } from '@/features/community/services/circulars.service'
import type { CircularItem } from '@/features/community/types'

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('Community Circulars: Print Notice Functionality & Official Document Layout', () => {
  const mockCircular: CircularItem = CANONICAL_CIRCULARS_REGISTRY[1] || {
    id: 'cir-2026-002',
    circular_number: 'CIR-2026-002',
    title: 'Resolution on Modest Social Observances & Matrimonial Dispute Protocol',
    summary:
      'Sarvaniyat Samiti guidance encouraging simplicity in community ceremonies and establishing confidential family conciliation procedures.',
    content:
      'SHREE KHATRI SAMAJ CENTRAL PANCHAYAT\nSARVANIYAT & SAMAJIK SAMADHAN SAMITI\nCIRCULAR NO: CIR-2026-002 DATE: 20 FEBRUARY 2026\n\nSUBJECT: RESOLUTION ON MODEST SOCIAL OBSERVANCES\n\n1. SIMPLICITY IN CEREMONIES:\nFamilies are warmly urged to observe modest arrangements during ceremonies.',
    category: 'WELFARE',
    issuing_authority:
      'SARVANIYAT & SAMAJIK SAMADHAN SAMITI (SOCIAL WELFARE COMMISSION)',
    signatory_name: 'Shri Ramniklal Vyas',
    signatory_title: 'Executive Chairman, Sarvaniyat Samiti',
    issue_date: '2026-02-20',
    formatted_date: '20 Feb 2026',
    is_pinned: true,
    status: 'PUBLISHED',
    official_seal_text: 'SEAL-SARVANIYAT-SAMITI-2026',
  }

  let printSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    document.body.className = ''
  })

  afterEach(() => {
    printSpy.mockRestore()
    document.body.className = ''
  })

  it('renders official letterhead header with community title, issuing authority, and directive badge', () => {
    renderWithProviders(
      <CircularDetailModal
        circular={mockCircular}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('SHREE KHATRI SAMAJ CENTRAL PANCHAYAT')).toBeInTheDocument()
    expect(screen.getAllByText(mockCircular.issuing_authority).length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByText('OFFICIAL COMMUNITY CIRCULAR & DIRECTIVE')
    ).toBeInTheDocument()
  })

  it('renders circular metadata (reference number, date of issue) and prominent title', () => {
    renderWithProviders(
      <CircularDetailModal
        circular={mockCircular}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    expect(screen.getAllByText(mockCircular.circular_number).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(mockCircular.formatted_date).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(mockCircular.title)).toBeInTheDocument()
    expect(screen.getByText(mockCircular.summary)).toBeInTheDocument()
  })

  it('renders paragraphs formatted with break-inside avoidance for natural page breaking', () => {
    renderWithProviders(
      <CircularDetailModal
        circular={mockCircular}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    const paragraphs = screen.getAllByText((content) =>
      content.includes('SIMPLICITY IN CEREMONIES')
    )
    expect(paragraphs.length).toBeGreaterThan(0)
    expect(paragraphs[0].className).toContain('break-inside-avoid')
  })

  it('renders official signatory stamp and seal block intact', () => {
    renderWithProviders(
      <CircularDetailModal
        circular={mockCircular}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('By Order of the Panchayat')).toBeInTheDocument()
    expect(screen.getByText(mockCircular.signatory_name)).toBeInTheDocument()
    expect(screen.getByText(mockCircular.signatory_title)).toBeInTheDocument()
    expect(
      screen.getByText(`★ ${mockCircular.official_seal_text} ★`)
    ).toBeInTheDocument()
  })

  it('renders official document print footer with Samaj name and reference number', () => {
    renderWithProviders(
      <CircularDetailModal
        circular={mockCircular}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    expect(
      screen.getByText((content) =>
        content.includes('Shree Khatri Samaj Central Panchayat • Official Circular Directive')
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(`Ref: ${mockCircular.circular_number}`)
    ).toBeInTheDocument()
  })

  it('hides top action bar (Share, Print Notice, Close) and bottom footer in print media via print:hidden', () => {
    renderWithProviders(
      <CircularDetailModal
        circular={mockCircular}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    const shareButton = screen.getByRole('button', { name: /Share/i })
    const printButton = screen.getByRole('button', { name: /Print Notice/i })
    const closeButtons = screen.getAllByRole('button', { name: /Close/i })

    // All these buttons are inside containers with print:hidden
    const topBar = shareButton.closest('div.sticky')
    expect(topBar?.className).toContain('print:hidden')

    const bottomBar = closeButtons[closeButtons.length - 1].closest('div.sticky')
    expect(bottomBar?.className).toContain('print:hidden')
    expect(printButton).toBeInTheDocument()
  })

  it('triggers window.print() and activates print classes when Print Notice is clicked', () => {
    renderWithProviders(
      <CircularDetailModal
        circular={mockCircular}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    const printButton = screen.getByRole('button', { name: /Print Notice/i })
    fireEvent.click(printButton)

    expect(printSpy).toHaveBeenCalled()
    expect(document.body.classList.contains('printing-circular-active')).toBe(true)
  })

  it('preserves Share functionality by copying link and notice title to clipboard', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy,
      },
    })

    renderWithProviders(
      <CircularDetailModal
        circular={mockCircular}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    const shareButton = screen.getByRole('button', { name: /Share/i })
    await act(async () => {
      fireEvent.click(shareButton)
    })

    expect(writeTextSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${mockCircular.circular_number}: ${mockCircular.title}`)
    )
  })
})
