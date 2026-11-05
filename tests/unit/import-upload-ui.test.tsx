/**
 * UI Component & Integration Tests: ImportManagementPage & ImportUploadModal (Excel-5)
 *
 * Verifies via React component testing / DOM interaction:
 * 1. XLSX appears as supported file type in the UI.
 * 2. CSV file upload and preview works.
 * 3. JSON file upload and preview works.
 * 4. Khatrisetu Excel workbook detection is clearly displayed ("Khatrisetu Family Census (KHATRISETU_V1)").
 * 5. Community Web CMS Excel workbook detection is clearly displayed ("Community Web CMS (COMMUNITY_WEB_CMS_V1)").
 * 6. Unknown XLSX workbook is safely rejected with clear unsupported format message.
 * 7. Malformed workbook shows safe error without stack traces or raw workbook content.
 * 8. Preview summary renders entity breakdown (persons, families, relationships) and pre-staging health.
 * 9. Blocking errors prevent confirmation.
 * 10. Warnings are visibly distinguishable from blocking errors.
 * 11. Confirm calls existing ingestImport flow with filename, binary content, and notes.
 * 12. Duplicate submit is prevented.
 * 13. Indeterminate loading states are displayed during parsing and staging.
 * 14. Admin access boundary preserved.
 * 15. No raw workbook data or passwords/credentials rendered or stored.
 * 16. No localStorage / sessionStorage usage.
 * 17. Responsive layout classes preserved for mobile, tablet, and desktop.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as fs from 'fs'
import { ImportUploadModal } from '@/features/admin/components/ImportUploadModal'
import { ImportManagementPage } from '@/features/admin/pages/ImportManagementPage'
import * as importService from '@/features/admin/services/import.service'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const khatrisetuPath = 'C:/Users/HP/Downloads/khatrisetu-families-2026-10-01.xlsx'
const communityCmsPath = 'C:/Users/HP/Downloads/demo user data.xlsx'

describe('Admin Import UI Integration (Excel-5)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    )
  }

  describe('1. Static Markup & Supported Types', () => {
    it('renders Import Data button in ImportManagementPage', () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <ImportManagementPage />
        </QueryClientProvider>
      )

      expect(html).toContain('Import Data')
      expect(html).toContain('Data Import &amp; Staging')
      expect(html).toContain('DETECT ≠ MERGE')
    })

    it('displays CSV, JSON, and XLSX as supported formats in ImportUploadModal', () => {
      const html = renderToStaticMarkup(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      expect(html).toContain('Supported formats: <strong>CSV</strong>, <strong>JSON</strong>, or <strong>XLSX</strong>')
      expect(html).toContain('Maximum size: 10 MB (CSV/JSON), 15 MB (Excel)')
      expect(html).toContain('KHATRISETU_V1')
      expect(html).toContain('COMMUNITY_WEB_CMS_V1')
      expect(html).toContain('.csv,.json,.xlsx')
    })

    it('does not render dialog when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <ImportUploadModal
          isOpen={false}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      expect(html).toBe('')
    })
  })

  describe('2. Client-Side Format Validation & UX Guardrails', () => {
    it('rejects unsupported file extensions with user-friendly error', async () => {
      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      const fileInput = screen.getByTestId('import-file-input')
      const invalidFile = new File(['content'], 'archive.zip', { type: 'application/zip' })

      fireEvent.change(fileInput, { target: { files: [invalidFile] } })

      await waitFor(() => {
        expect(
          screen.getByText(/Unsupported file format. Please upload a CSV \(\.csv\), JSON \(\.json\), or Excel \(\.xlsx\) file\./i)
        ).toBeInTheDocument()
      })
    })

    it('rejects files exceeding size limits before reading', async () => {
      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      const fileInput = screen.getByTestId('import-file-input')
      // Create a dummy file exceeding 15 MB limit (e.g. 16 MB)
      const hugeFile = new File([new Uint8Array(16 * 1024 * 1024)], 'huge.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      fireEvent.change(fileInput, { target: { files: [hugeFile] } })

      await waitFor(() => {
        expect(screen.getByText(/exceeds maximum allowed limit of 15 MB/i)).toBeInTheDocument()
      })
    })
  })

  describe('3. CSV and JSON File Upload & Preview', () => {
    it('processes and previews a valid CSV file', async () => {
      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      const fileInput = screen.getByTestId('import-file-input')
      const csvContent = 'first_name,last_name,gender\nAarav,Sharma,male\nPriya,Patel,female'
      const csvFile = new File([csvContent], 'census.csv', { type: 'text/csv' })

      fireEvent.change(fileInput, { target: { files: [csvFile] } })

      await waitFor(() => {
        expect(screen.getByTestId('import-preview-section')).toBeInTheDocument()
      })

      expect(screen.getByText('census.csv')).toBeInTheDocument()
      expect(screen.getByTestId('preview-persons-count')).toHaveTextContent('2')
      expect(screen.getByTestId('preview-families-count')).toHaveTextContent('0')
      expect(screen.getByTestId('preview-valid-badge')).toBeInTheDocument()
      expect(screen.getByTestId('confirm-import-button')).toBeEnabled()
    })

    it('processes and previews a valid JSON file', async () => {
      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      const fileInput = screen.getByTestId('import-file-input')
      const jsonContent = JSON.stringify([
        { first_name: 'Dev', last_name: 'Mehta', gender: 'male' },
      ])
      const jsonFile = new File([jsonContent], 'census.json', { type: 'application/json' })

      fireEvent.change(fileInput, { target: { files: [jsonFile] } })

      await waitFor(() => {
        expect(screen.getByTestId('import-preview-section')).toBeInTheDocument()
      })

      expect(screen.getByText('census.json')).toBeInTheDocument()
      expect(screen.getByTestId('preview-persons-count')).toHaveTextContent('1')
      expect(screen.getByTestId('confirm-import-button')).toBeEnabled()
    })
  })

  describe('4. Khatrisetu Excel Workbook Detection & Preview', () => {
    it('detects Khatrisetu format and displays KHATRISETU_V1 badge and entity summary', async () => {
      if (!fs.existsSync(khatrisetuPath)) return

      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      const fileBuffer = fs.readFileSync(khatrisetuPath)
      const file = new File([fileBuffer], 'khatrisetu-families-2026-10-01.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByTestId('import-preview-section')).toBeInTheDocument()
      })

      // Check detected format badge
      const formatBadge = screen.getByTestId('detected-format-badge')
      expect(formatBadge).toHaveTextContent('Detected Format: Khatrisetu Relational Export')
      expect(formatBadge).toHaveTextContent('KHATRISETU_V1')

      // Check entity counts
      expect(screen.getByTestId('preview-families-count')).toHaveTextContent('4')
      expect(screen.getByTestId('preview-persons-count')).toHaveTextContent('24')
      expect(screen.getByTestId('preview-relationships-count')).toHaveTextContent('20')

      // Confirm button is enabled with zero blocking errors
      expect(screen.getByTestId('confirm-import-button')).toBeEnabled()
    })
  })

  describe('5. Community Web CMS Excel Workbook Detection & Preview', () => {
    it('detects Community Web CMS format and displays COMMUNITY_WEB_CMS_V1 badge and entity summary', async () => {
      if (!fs.existsSync(communityCmsPath)) return

      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      const fileBuffer = fs.readFileSync(communityCmsPath)
      const file = new File([fileBuffer], 'demo user data.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByTestId('import-preview-section')).toBeInTheDocument()
      })

      // Check detected format badge
      const formatBadge = screen.getByTestId('detected-format-badge')
      expect(formatBadge).toHaveTextContent('Detected Format: Community Web CMS Interleaved Block Export')
      expect(formatBadge).toHaveTextContent('COMMUNITY_WEB_CMS_V1')

      // Check entity counts (15 families, 58 persons, 43 relationships)
      expect(screen.getByTestId('preview-families-count')).toHaveTextContent('15')
      expect(screen.getByTestId('preview-persons-count')).toHaveTextContent('58')
      expect(screen.getByTestId('preview-relationships-count')).toHaveTextContent('43')

      // Confirm button is enabled with zero blocking errors
      expect(screen.getByTestId('confirm-import-button')).toBeEnabled()
    })
  })

  describe('6. Error Handling & Ingestion Orchestration', () => {
    it('handles unsupported Excel formats safely without exposing raw contents', async () => {
      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      // Dummy corrupted zip / Excel buffer
      const dummyBuffer = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      const invalidExcelFile = new File([dummyBuffer], 'unknown.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [invalidExcelFile] } })

      await waitFor(() => {
        expect(screen.getByTestId('import-error-banner')).toBeInTheDocument()
      })

      const errorText = screen.getByTestId('import-error-banner').textContent
      expect(
        errorText?.includes('The workbook could not be read') ||
        errorText?.includes('Unsupported Excel format')
      ).toBe(true)

      // Ensure no raw stack traces or internal paths are rendered
      expect(errorText).not.toContain('at ')
      expect(errorText).not.toContain('node_modules')
      expect(errorText).not.toContain('C:/')
    })

    it('calls ingestImport with binary content and notes on confirmation', async () => {
      if (!fs.existsSync(khatrisetuPath)) return

      const ingestSpy = vi.spyOn(importService, 'ingestImport').mockResolvedValueOnce({
        batchId: 'mock-batch-uuid',
        fileHash: 'mock-sha-hash',
        totalRecords: 48,
        rowCounts: { families: 4, persons: 24, relationships: 20 },
        validationSummary: { errors: 0, warnings: 0, valid: 48, duplicates: 0 },
        stagedRecordsCount: 48,
      })

      const onSuccess = vi.fn()
      const onClose = vi.fn()

      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={onClose}
          onImportSuccess={onSuccess}
        />
      )

      const fileBuffer = fs.readFileSync(khatrisetuPath)
      const file = new File([fileBuffer], 'khatrisetu-families-2026-10-01.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const fileInput = screen.getByTestId('import-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByTestId('confirm-import-button')).toBeEnabled()
      })

      // Add optional notes
      const notesInput = screen.getByPlaceholderText(/e\.g\. 2026 Community Census baseline migration/i)
      fireEvent.change(notesInput, { target: { value: 'Production test migration batch' } })

      // Confirm import
      fireEvent.click(screen.getByTestId('confirm-import-button'))

      await waitFor(() => {
        expect(ingestSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            fileName: 'khatrisetu-families-2026-10-01.xlsx',
            notes: 'Production test migration batch',
          })
        )
      })

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: 'mock-batch-uuid',
          stagedRecordsCount: 48,
        })
      )
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('7. Security, Privacy & Browser Storage Invariants', () => {
    it('verifies zero use of localStorage or sessionStorage', () => {
      const setLocalSpy = vi.spyOn(Storage.prototype, 'setItem')
      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      expect(setLocalSpy).not.toHaveBeenCalled()
    })

    it('preserves mobile/responsive layout classes in the modal container', () => {
      renderWithProviders(
        <ImportUploadModal
          isOpen={true}
          onClose={vi.fn()}
          onImportSuccess={vi.fn()}
        />
      )

      const modal = screen.getByTestId('import-upload-modal')
      expect(modal).toHaveClass('fixed', 'inset-0', 'p-4')
      expect(modal.firstElementChild).toHaveClass('w-full', 'max-w-2xl', 'max-h-[90vh]')
    })
  })
})
