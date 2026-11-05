/**
 * ImportUploadModal — File Selection, Format Detection, Preview & Ingestion Modal
 *
 * Phase 14 & Excel-5 UI Integration
 *
 * Capabilities:
 * - Supports CSV, JSON, and XLSX file formats.
 * - Client-side file size guardrails before parsing (10 MB CSV/JSON, 15 MB XLSX).
 * - Instant in-memory parsing & deterministic format detection via ExcelFormatRegistry.
 * - Displays clear format detection badges (e.g. "Khatrisetu Family Census — KHATRISETU_V1", "Community Web CMS — COMMUNITY_WEB_CMS_V1").
 * - Displays structured preview summary: total rows, persons, families, relationships, warnings, and blocking errors.
 * - Enforces security & privacy: zero auth accounts/passwords rendered, zero storage in localStorage/sessionStorage, canonical_id = null.
 * - Confirms import via existing `ingestImport()` service without duplicating backend logic.
 */

import { useState, useRef } from 'react'
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  FileText,
  ShieldCheck,
  Info,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import type { ParseImportResult, IngestImportResult } from '../types'
import { parseImportFile, IMPORT_LIMITS } from '../services/importParser.service'
import { EXCEL_READER_LIMITS } from '../services/excel/reader'
import { ingestImport } from '../services/import.service'

export interface ImportUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onImportSuccess: (result: IngestImportResult) => void
}

type UploadStep = 'SELECT' | 'PARSING' | 'PREVIEW' | 'SUBMITTING'

export function ImportUploadModal({
  isOpen,
  onClose,
  onImportSuccess,
}: ImportUploadModalProps) {
  const [step, setStep] = useState<UploadStep>('SELECT')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileContent, setFileContent] = useState<string | ArrayBuffer | null>(null)
  const [parseResult, setParseResult] = useState<ParseImportResult | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const resetState = () => {
    setStep('SELECT')
    setSelectedFile(null)
    setFileContent(null)
    setParseResult(null)
    setClientError(null)
    setNotes('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClose = () => {
    if (step === 'SUBMITTING') return // Prevent closing while staging
    resetState()
    onClose()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setClientError(null)
    setSelectedFile(file)

    const ext = file.name.split('.').pop()?.toLowerCase()
    const isExcel = ext === 'xlsx'
    const isCsvOrJson = ext === 'csv' || ext === 'json'

    if (!isExcel && !isCsvOrJson) {
      setClientError(
        'Unsupported file format. Please upload a CSV (.csv), JSON (.json), or Excel (.xlsx) file.'
      )
      return
    }

    // Basic file size UX check before reading
    const maxBytes = isExcel
      ? EXCEL_READER_LIMITS.MAX_FILE_SIZE_BYTES
      : IMPORT_LIMITS.MAX_FILE_SIZE_BYTES
    const maxMb = Math.round(maxBytes / (1024 * 1024))

    if (file.size > maxBytes) {
      setClientError(
        `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${maxMb} MB.`
      )
      return
    }

    // Read file and parse client-side for immediate format detection and preview
    setStep('PARSING')
    try {
      let content: string | ArrayBuffer
      if (isExcel) {
        if (typeof file.arrayBuffer === 'function') {
          content = await file.arrayBuffer()
        } else {
          content = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as ArrayBuffer)
            reader.onerror = () => reject(new Error('Failed to read file as ArrayBuffer'))
            reader.readAsArrayBuffer(file)
          })
        }
      } else {
        if (typeof file.text === 'function') {
          content = await file.text()
        } else {
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('Failed to read file as text'))
            reader.readAsText(file)
          })
        }
      }
      setFileContent(content)

      const result = await parseImportFile(file.name, content)
      setParseResult(result)
      setStep('PREVIEW')
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to read or parse the uploaded file.'

      // Translate specific parser error codes to safe user-facing language
      if (msg.includes('UNSUPPORTED_EXCEL_FORMAT')) {
        setClientError(
          'Unsupported Excel format. This import currently supports: Khatrisetu Family Census and Community Web CMS workbooks.'
        )
      } else if (msg.includes('INVALID_EXCEL_FILE')) {
        setClientError(
          'The workbook could not be read. Please ensure the Excel file is not corrupted or password-protected.'
        )
      } else if (msg.includes('EMPTY_FILE') || msg.includes('EMPTY_WORKBOOK')) {
        setClientError('The selected file contains no census data records.')
      } else if (msg.includes('MALFORMED_JSON')) {
        setClientError('The JSON file contains invalid syntax.')
      } else {
        setClientError(msg)
      }
      setStep('SELECT')
    }
  }

  const handleConfirmImport = async () => {
    if (!selectedFile || !fileContent || !parseResult) return

    setStep('SUBMITTING')
    setClientError(null)

    try {
      const ingestResult = await ingestImport({
        fileName: selectedFile.name,
        content: fileContent,
        notes: notes.trim() || undefined,
      })

      resetState()
      onImportSuccess(ingestResult)
      onClose()
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to stage records on the server. Please verify permissions and try again.'
      setClientError(msg)
      setStep('PREVIEW')
    }
  }

  const hasBlockingErrors = (parseResult?.validationSummary.errors ?? 0) > 0
  const isExcelFile = selectedFile?.name.toLowerCase().endsWith('.xlsx')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-xs"
      data-testid="import-upload-modal"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-navy-200 bg-white p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-navy-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900">Import Census Data</h2>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                <ShieldCheck className="h-3 w-3" />
                STAGING ONLY
              </span>
            </div>
            <p className="mt-1 text-xs text-navy-600">
              Upload census files to stage, inspect, and validate records before canonical promotion.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={step === 'SUBMITTING'}
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-50 hover:text-navy-600 transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Client Error Banner */}
        {clientError && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"
            data-testid="import-error-banner"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to process file</p>
                <p className="mt-0.5 text-red-700">{clientError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Step: SELECT File */}
        {step === 'SELECT' && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-navy-200 bg-navy-50/50 p-8 text-center cursor-pointer hover:border-navy-400 hover:bg-navy-50 transition-all"
              data-testid="file-drop-zone"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-xs text-brand-600 mb-3">
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-navy-900">
                Click to browse or drop census file
              </p>
              <p className="mt-1 text-xs text-navy-500">
                Supported formats: <strong>CSV</strong>, <strong>JSON</strong>, or <strong>XLSX</strong>
              </p>
              <p className="mt-2 text-[11px] text-navy-400">
                Maximum size: 10 MB (CSV/JSON), 15 MB (Excel)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,.xlsx"
                onChange={handleFileChange}
                className="hidden"
                data-testid="import-file-input"
              />
            </div>

            {/* Format Info Callout */}
            <div className="rounded-xl border border-navy-200 bg-navy-50/40 p-3.5 space-y-2 text-xs text-navy-700">
              <div className="flex items-center gap-1.5 font-semibold text-navy-900">
                <Info className="h-4 w-4 text-brand-600" />
                Supported Excel Workbooks:
              </div>
              <ul className="list-disc list-inside space-y-1 text-navy-600 pl-1">
                <li>
                  <strong>Khatrisetu Family Census</strong> (<code>KHATRISETU_V1</code>): Multi-sheet relational export with Families & Members sheets.
                </li>
                <li>
                  <strong>Community Web CMS</strong> (<code>COMMUNITY_WEB_CMS_V1</code>): Single-sheet export with interleaved Ghar Mukhi and Member blocks.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Step: PARSING In-Progress */}
        {step === 'PARSING' && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="text-sm font-semibold text-navy-900">Reading and analyzing workbook...</p>
            <p className="text-xs text-navy-500 max-w-xs">
              Detecting format signatures, verifying columns, and extracting draft staging entities.
            </p>
          </div>
        )}

        {/* Step: PREVIEW File & Summary */}
        {step === 'PREVIEW' && parseResult && (
          <div className="space-y-4" data-testid="import-preview-section">
            {/* File & Detected Format Card */}
            <div className="rounded-xl border border-navy-200 bg-navy-50/60 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-navy-200 text-brand-600 shrink-0">
                    {isExcelFile ? (
                      <FileSpreadsheet className="h-5 w-5" />
                    ) : (
                      <FileText className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-xs text-navy-900 truncate max-w-xs">
                      {parseResult.fileName}
                    </div>
                    <div className="text-[11px] text-navy-500">
                      {(parseResult.fileSizeBytes / 1024).toFixed(1)} KB • {parseResult.totalRows} records
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-navy-100 px-2 py-1 text-[11px] font-semibold text-navy-800">
                    {isExcelFile ? 'Excel Workbook' : parseResult.fileFormat}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetState}
                    className="text-xs text-navy-600 hover:text-navy-900"
                  >
                    Change File
                  </Button>
                </div>
              </div>

              {/* Excel Format Detection Badge */}
              {parseResult.detectedFormat && (
                <div
                  className="rounded-lg border border-brand-200 bg-brand-50/80 p-2.5 flex items-start gap-2 text-xs"
                  data-testid="detected-format-badge"
                >
                  <CheckCircle2 className="h-4 w-4 text-brand-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-brand-900">
                      Detected Format: {parseResult.detectedFormat.displayName}
                    </span>
                    <span className="ml-2 font-mono text-[11px] text-brand-700">
                      ({parseResult.detectedFormat.formatId})
                    </span>
                    <p className="text-[11px] text-brand-800 mt-0.5">
                      Source System: {parseResult.detectedFormat.sourceSystem} • Confidence: {parseResult.detectedFormat.confidence}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Entity Extraction Breakdown */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-navy-200 bg-white p-3 text-center">
                <span className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Persons</span>
                <p className="text-xl font-bold text-navy-900 mt-0.5" data-testid="preview-persons-count">
                  {parseResult.rowCounts.persons}
                </p>
              </div>
              <div className="rounded-xl border border-navy-200 bg-white p-3 text-center">
                <span className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Families</span>
                <p className="text-xl font-bold text-navy-900 mt-0.5" data-testid="preview-families-count">
                  {parseResult.rowCounts.families}
                </p>
              </div>
              <div className="rounded-xl border border-navy-200 bg-white p-3 text-center">
                <span className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Relationships</span>
                <p className="text-xl font-bold text-navy-900 mt-0.5" data-testid="preview-relationships-count">
                  {parseResult.rowCounts.relationships}
                </p>
              </div>
            </div>

            {/* Validation & Quality Overview */}
            <div className="rounded-xl border border-navy-200 bg-white p-4 space-y-2 text-xs">
              <span className="font-semibold text-navy-900">Pre-Staging Health:</span>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                {parseResult.validationSummary.errors > 0 ? (
                  <span className="flex items-center gap-1 font-semibold text-red-600" data-testid="preview-errors-badge">
                    <XCircle className="h-4 w-4" />
                    {parseResult.validationSummary.errors} Blocking Error(s)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-semibold text-emerald-600" data-testid="preview-valid-badge">
                    <CheckCircle2 className="h-4 w-4" />
                    {parseResult.validationSummary.valid} Valid Records
                  </span>
                )}

                {parseResult.validationSummary.warnings > 0 && (
                  <span className="flex items-center gap-1 font-semibold text-amber-600" data-testid="preview-warnings-badge">
                    <AlertTriangle className="h-4 w-4" />
                    {parseResult.validationSummary.warnings} Warning(s)
                  </span>
                )}
              </div>

              {hasBlockingErrors && (
                <p className="text-red-600 text-[11px] mt-1">
                  The file contains records with blocking errors that cannot be staged. Please correct the source file and re-upload.
                </p>
              )}
            </div>

            {/* Optional Notes */}
            <div className="space-y-1">
              <label htmlFor="import-notes" className="text-xs font-semibold text-navy-700">
                Batch Description / Notes (Optional):
              </label>
              <textarea
                id="import-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. 2026 Community Census baseline migration"
                className="w-full rounded-lg border border-navy-200 p-2 text-xs focus:border-navy-500 focus:outline-hidden"
              />
            </div>
          </div>
        )}

        {/* Step: SUBMITTING / Staging In-Progress */}
        {step === 'SUBMITTING' && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <p className="text-sm font-semibold text-navy-900">Staging records on the server...</p>
            <p className="text-xs text-navy-500 max-w-xs">
              Writing staging records in chunked batches. Invariant STAGING ≠ CANONICAL is enforced.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 border-t border-navy-100 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={step === 'SUBMITTING'}
          >
            Cancel
          </Button>

          {step === 'PREVIEW' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmImport}
              disabled={hasBlockingErrors}
              className="gap-1.5"
              data-testid="confirm-import-button"
            >
              Confirm & Stage Import
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
