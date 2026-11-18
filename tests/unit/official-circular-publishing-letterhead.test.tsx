/**
 * Official Circular Publishing System & Letterhead PDF Generation Tests
 *
 * Validates:
 * 1. Admin and Super Admin permissions (hides action from normal users & Mukhis)
 * 2. Method A: Upload Existing PDF (file validation, letterhead cover sheet generation)
 * 3. Method B: Create Notice Online (rich formatting, live document preview, PDF generation)
 * 4. Official letterhead branding: AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
 * 5. Download Official PDF and View PDF workflows
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { CircularsView } from '@/features/community/components/CircularsView'
import { CircularCard } from '@/features/community/components/CircularCard'
import { CircularDetailModal } from '@/features/community/components/CircularDetailModal'
import { IssueOfficialNoticeModal } from '@/features/community/components/IssueOfficialNoticeModal'
import {
  generateOnlineNoticePdf,
  generateBrandedUploadedPdf,
  type CircularPdfPayload,
} from '@/utils/circular-pdf-generator'
import * as authContext from '@/features/auth/context/AuthContext'
import type { CircularItem } from '@/features/community/types'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        is: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'test-circ-id' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: true, error: null }),
      })),
    })),
    rpc: vi.fn().mockResolvedValue({ data: 'new-circular-id', error: null }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test/path.pdf' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://storage.khatrisarvaniyat.org/test/path.pdf' },
        }),
      })),
    },
  },
}))

// Mock Auth
vi.mock('@/features/auth/context/AuthContext', () => ({
  useAuthContext: vi.fn(),
}))

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

const mockCircular: CircularItem = {
  id: 'cir-test-001',
  circular_number: 'CIR-2026-001',
  title: 'Annual Census Verification & Family Seat Registration Drive',
  summary: 'Official directive from the Central Census Committee and Panchayat Secretariat.',
  content: `AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
HEADQUARTERS: CENTRAL PANCHAYAT SECRETARIAT
CIRCULAR NO: CIR-2026-001                                      DATE: 15 JANUARY 2026

SUBJECT: ANNUAL CENSUS VERIFICATION & FAMILY SEAT REGISTRATION DRIVE 2026-27

Respected Community Members and Regional Mukhis,
Every Family Head is requested to log in and verify their household census tree.`,
  category: 'CENSUS',
  issuing_authority: 'Jan Ganna Central Committee & Central Panchayat',
  signatory_name: 'Chandrakant Mohanlal Keria',
  signatory_title: 'Chief Census Commissioner & Secretary',
  issue_date: '2026-01-15T00:00:00Z',
  formatted_date: '15 Jan 2026',
  is_pinned: true,
  status: 'PUBLISHED',
  creation_method: 'ONLINE_EDITOR',
}

describe('Official Circular Publishing & Letterhead System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. PDF Generation Tests
  describe('PDF Generation Engine (Client-side Vector & Merging)', () => {
    it('generates a branded vector PDF with authentic letterhead for online circulars (Method B)', async () => {
      const payload: CircularPdfPayload = {
        title: 'Executive Council Resolution 2026',
        circular_number: 'CIR-2026-088',
        category: 'GOVERNANCE',
        issuing_authority: 'Central Panchayat Secretariat',
        issue_date: '2026-11-18',
        subject: 'EXECUTIVE APPOINTMENT NOTIFICATION',
        content: 'The Executive Council announces key appointments for the upcoming term.',
        instructions: 'All regional branches must acknowledge receipt within 7 days.',
        contact_info: 'secretariat@khatrisarvaniyat.org',
        signatory_name: 'Pravinbhai Khetani',
        signatory_title: 'Council Chairman',
        creation_method: 'ONLINE_EDITOR',
      }

      const result = await generateOnlineNoticePdf(payload)
      expect(result).toBeDefined()
      expect(result.blob).toBeInstanceOf(Blob)
      expect(result.blob.size).toBeGreaterThan(1000)
      expect(result.filename).toContain('CIR-2026-088')
      expect(result.dataUri).toContain('data:application/pdf')
    })

    it('prepends official branded cover sheet to user-uploaded PDFs without distorting content (Method A)', async () => {
      const samplePdfPayload: CircularPdfPayload = {
        title: 'Uploaded Legal Resolution',
        circular_number: 'CIR-2026-099',
        category: 'WELFARE',
        issuing_authority: 'Sarvaniyat Samiti',
        issue_date: '2026-11-18',
        content: 'Summary of uploaded legal directives.',
        signatory_name: 'Advocate Rameshchandra Khatri',
        signatory_title: 'Legal Commissioner',
        creation_method: 'PDF_UPLOAD',
      }

      // Generate a base online PDF first to act as uploaded file
      const basePdf = await generateOnlineNoticePdf(samplePdfPayload)
      const uploadedBytes = basePdf.arrayBuffer

      const brandedResult = await generateBrandedUploadedPdf(uploadedBytes, samplePdfPayload)
      expect(brandedResult).toBeDefined()
      expect(brandedResult.blob).toBeInstanceOf(Blob)
      expect(brandedResult.blob.size).toBeGreaterThan(basePdf.blob.size)
      expect(brandedResult.filename).toContain('branded')
    })
  })

  // 2. Role Gating & Permissions
  describe('Strict Role Verification (Section 1)', () => {
    it('shows "Issue Official Notice" button when user is ADMIN or SUPER_ADMIN', async () => {
      vi.mocked(authContext.useAuthContext).mockReturnValue({
        user: { id: 'admin-id' } as never,
        profile: { id: 'admin-id', role: 'ADMIN' } as never,
        isAuthenticated: true,
        isLoading: false,
        session: null,
      })

      renderWithProviders(<CircularsView />)

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Issue Official Notice/i })
        ).toBeInTheDocument()
      })
    })

    it('strictly hides "Issue Official Notice" button from regular users and shows read-only notice shield', async () => {
      vi.mocked(authContext.useAuthContext).mockReturnValue({
        user: { id: 'user-id' } as never,
        profile: { id: 'user-id', role: 'MEMBER' } as never,
        isAuthenticated: true,
        isLoading: false,
        session: null,
      })

      renderWithProviders(<CircularsView />)

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /Issue Official Notice/i })
        ).not.toBeInTheDocument()
      })

      expect(
        screen.getByText(/Official circulars are published by authorized Panchayat Secretariat/i)
      ).toBeInTheDocument()
    })

    it('strictly hides "Issue Official Notice" from MUKHI unless they hold Admin role', async () => {
      vi.mocked(authContext.useAuthContext).mockReturnValue({
        user: { id: 'mukhi-id' } as never,
        profile: { id: 'mukhi-id', role: 'MUKHI' } as never,
        isAuthenticated: true,
        isLoading: false,
        session: null,
      })

      renderWithProviders(<CircularsView />)

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /Issue Official Notice/i })
        ).not.toBeInTheDocument()
      })
    })
  })

  // 3. Modal Functionality (Method A and Method B)
  describe('IssueOfficialNoticeModal (Methods A & B)', () => {
    it('renders both creation methods: "Upload PDF Notice / Circular" and "Create Notice Online"', () => {
      render(
        <IssueOfficialNoticeModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      )

      expect(screen.getByText('Upload PDF Notice / Circular')).toBeInTheDocument()
      expect(screen.getByText('Create Notice Online')).toBeInTheDocument()
      expect(screen.getByText('AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)', { exact: false })).toBeInTheDocument()
    })

    it('switches between Method A (Upload) and Method B (Online Editor) tabs', () => {
      render(
        <IssueOfficialNoticeModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      )

      // Initially on Upload tab
      expect(
        screen.getByText(/Click to select or drag and drop official PDF/i)
      ).toBeInTheDocument()

      // Switch to Online Editor tab
      const onlineTab = screen.getByText('Create Notice Online')
      fireEvent.click(onlineTab)

      expect(screen.getByText(/Main Notice Content/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Write the full directive/i)).toBeInTheDocument()
    })

    it('displays live document preview with official letterhead when "Preview Document" is clicked', () => {
      render(
        <IssueOfficialNoticeModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      )

      // Click preview button
      const previewBtn = screen.getByRole('button', { name: /Preview Document/i })
      fireEvent.click(previewBtn)

      expect(screen.getByText('Document Preview (Official Letterhead)')).toBeInTheDocument()
      expect(screen.getAllByText('AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)').length).toBeGreaterThan(0)
    })

    it('validates file upload format (rejects non-PDFs)', () => {
      render(
        <IssueOfficialNoticeModal
          isOpen={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      )

      const fileInput = document.getElementById('pdf-upload-input') as HTMLInputElement
      const txtFile = new File(['sample'], 'sample.txt', { type: 'text/plain' })

      fireEvent.change(fileInput, { target: { files: [txtFile] } })

      expect(screen.getByText(/Only PDF documents are supported/i)).toBeInTheDocument()
    })
  })

  // 4. Card & Reader Features
  describe('CircularCard & Detail Modal Official Branded Reader', () => {
    it('renders CircularCard with "Read Circular" and "Download PDF" buttons', () => {
      const onViewMock = vi.fn()
      render(
        <CircularCard
          circular={mockCircular}
          onView={onViewMock}
        />
      )

      expect(screen.getByText(mockCircular.circular_number)).toBeInTheDocument()
      expect(screen.getByText(mockCircular.title)).toBeInTheDocument()
      expect(screen.getByText(/Download PDF/i)).toBeInTheDocument()

      const readBtn = screen.getByRole('button', { name: /Read Official Circular/i })
      fireEvent.click(readBtn)
      expect(onViewMock).toHaveBeenCalledWith(mockCircular)
    })

    it('renders CircularDetailModal with official letterhead and "Download Official PDF" button', () => {
      const onCloseMock = vi.fn()
      render(
        <CircularDetailModal
          circular={mockCircular}
          isOpen={true}
          onClose={onCloseMock}
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getAllByText('AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)').length).toBeGreaterThan(0)
      expect(screen.getByText('Download Official PDF')).toBeInTheDocument()
      expect(screen.getByText('Print Notice')).toBeInTheDocument()
      expect(screen.getByText(mockCircular.signatory_name)).toBeInTheDocument()
    })
  })
})
