/**
 * DataExportPage Component
 * Dedicated Administrative Data Export & Reports Page (Feature 3).
 *
 * Implements:
 * - Route: /admin/export
 * - Formats: Excel (.csv / .xlsx) and PDF report.
 * - Multi-faceted filters: Geographic, Mukhi region mapping, Gotra, Nukh, Occupation (30 categories), Status.
 * - Live matching record count & preview.
 * - Audit logging to export_audit_logs.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  Home,
  ShieldCheck,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'
import { GotraNukhSelect } from '@/components/forms/GotraNukhSelect'
import { OccupationSelect } from '@/components/forms/OccupationSelect'
import {
  fetchExportData,
  logExportAudit,
  downloadCsvExcel,
  generatePdfReport,
  type ExportFilters,
} from '../services/export.service'
import { useCommunityMukhis } from '@/features/community/hooks/useCommunityMukhis'

export function DataExportPage() {
  const [dataType, setDataType] = useState<'PEOPLE' | 'FAMILIES' | 'MUKHIS'>('PEOPLE')

  // Filters
  const [country, setCountry] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [selectedMukhiId, setSelectedMukhiId] = useState('')
  const [gotra, setGotra] = useState('')
  const [nukh, setNukh] = useState('')
  const [occupation, setOccupation] = useState('')
  const [gender, setGender] = useState('ALL')
  const [deceasedStatus, setDeceasedStatus] = useState<'ALL' | 'LIVING' | 'DECEASED'>('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // State
  const [previewRecords, setPreviewRecords] = useState<Record<string, unknown>[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { mukhis: communityMukhis } = useCommunityMukhis()

  const currentFilters: ExportFilters = useMemo(
    () => ({
      dataType,
      country: country.trim() || undefined,
      state: state.trim() || undefined,
      city: city.trim() || undefined,
      mukhiId: selectedMukhiId || undefined,
      gotra: gotra.trim() || undefined,
      nukh: nukh.trim() || undefined,
      occupation: occupation.trim() || undefined,
      gender: gender !== 'ALL' ? gender : undefined,
      deceasedStatus: deceasedStatus !== 'ALL' ? deceasedStatus : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [dataType, country, state, city, selectedMukhiId, gotra, nukh, occupation, gender, deceasedStatus, startDate, endDate]
  )

  const loadPreview = async () => {
    setIsLoading(true)
    setStatusMessage(null)
    const res = await fetchExportData(currentFilters)
    if (res.error) {
      setStatusMessage({ type: 'error', text: res.error.message })
    } else {
      setPreviewRecords(res.data?.records || [])
      setTotalCount(res.data?.count || 0)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilters])

  const clearAllFilters = () => {
    setCountry('')
    setState('')
    setCity('')
    setSelectedMukhiId('')
    setGotra('')
    setNukh('')
    setOccupation('')
    setGender('ALL')
    setDeceasedStatus('ALL')
    setStartDate('')
    setEndDate('')
  }

  const filtersSummary = useMemo(() => {
    const list: string[] = []
    if (country) list.push(`Country: ${country}`)
    if (state) list.push(`State: ${state}`)
    if (city) list.push(`City: ${city}`)
    if (selectedMukhiId) {
      const found = communityMukhis.find((m) => m.id === selectedMukhiId)
      list.push(`Mukhi: ${found?.full_name || 'Selected Mukhi'}`)
    }
    if (gotra) list.push(`Gotra: ${gotra}`)
    if (nukh) list.push(`Nukh: ${nukh}`)
    if (occupation) list.push(`Occupation: ${occupation}`)
    if (gender !== 'ALL') list.push(`Gender: ${gender}`)
    if (deceasedStatus !== 'ALL') list.push(`Status: ${deceasedStatus}`)
    if (startDate) list.push(`From: ${startDate}`)
    if (endDate) list.push(`To: ${endDate}`)
    return list
  }, [country, state, city, selectedMukhiId, gotra, nukh, occupation, gender, deceasedStatus, startDate, endDate, communityMukhis])

  const handleExportExcel = async () => {
    setIsExporting(true)
    try {
      const res = await fetchExportData(currentFilters)
      if (res.error || !res.data) {
        setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to export data.' })
        setIsExporting(false)
        return
      }

      const filename = `KHATRI_SARVANIYAT_${dataType}_${new Date().toISOString().split('T')[0]}`
      downloadCsvExcel(filename, res.data.records)
      await logExportAudit(dataType, 'EXCEL_CSV', res.data.count, currentFilters as unknown as Record<string, unknown>)
      setStatusMessage({ type: 'success', text: `Successfully exported ${res.data.count} records to Excel (.csv).` })
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Export failed.' })
    }
    setIsExporting(false)
  }

  const handleExportPdf = async () => {
    setIsExporting(true)
    try {
      const res = await fetchExportData(currentFilters)
      if (res.error || !res.data) {
        setStatusMessage({ type: 'error', text: res.error?.message || 'Failed to generate PDF.' })
        setIsExporting(false)
        return
      }

      const reportTitle = `${dataType === 'PEOPLE' ? 'Community Census Register' : dataType === 'FAMILIES' ? 'Family Records Register' : 'Community Mukhi Register'}`
      generatePdfReport(reportTitle, filtersSummary, res.data.records)
      await logExportAudit(dataType, 'PDF', res.data.count, currentFilters as unknown as Record<string, unknown>)
      setStatusMessage({ type: 'success', text: `Generated printable PDF for ${res.data.count} records.` })
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'PDF generation failed.' })
    }
    setIsExporting(false)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-navy-100 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-900 text-brand-300">
              <Download className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-700">
              Administrative Control
            </span>
          </div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight sm:text-3xl">
            Data Export & Reports
          </h1>
          <p className="text-xs text-navy-600 mt-1">
            Download certified community census data in Excel (.xlsx / .csv) and PDF formats with multi-faceted filtering.
          </p>
        </div>

        {/* Data Type Tab Buttons */}
        <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            type="button"
            onClick={() => setDataType('PEOPLE')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              dataType === 'PEOPLE'
                ? 'bg-navy-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-navy-900'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>People Census</span>
          </button>
          <button
            type="button"
            onClick={() => setDataType('FAMILIES')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              dataType === 'FAMILIES'
                ? 'bg-navy-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-navy-900'
            }`}
          >
            <Home className="h-3.5 w-3.5" />
            <span>Families</span>
          </button>
          <button
            type="button"
            onClick={() => setDataType('MUKHIS')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              dataType === 'MUKHIS'
                ? 'bg-navy-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-navy-900'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Mukhis</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center justify-between gap-2 rounded-xl p-3.5 text-xs ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Controls Accordion / Panel */}
      <div className="rounded-2xl border border-navy-100 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-brand-600" />
            <span className="text-xs font-bold text-navy-900 uppercase tracking-wide">
              Filter Options ({filtersSummary.length} active)
            </span>
          </div>
          {filtersSummary.length > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline"
            >
              Clear All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
          {/* Geographic Filters */}
          <div>
            <label className="block text-slate-600 font-semibold mb-1">Country</label>
            <Input
              type="text"
              placeholder="e.g. India"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-slate-600 font-semibold mb-1">State / Province</label>
            <Input
              type="text"
              placeholder="e.g. Gujarat / Rajasthan"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-slate-600 font-semibold mb-1">City / Location</label>
            <Input
              type="text"
              placeholder="e.g. Ahmedabad / Surat"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          {/* Mukhi Jurisdiction Filter */}
          <div>
            <label className="block text-slate-600 font-semibold mb-1">Mukhi Region Filter</label>
            <select
              value={selectedMukhiId}
              onChange={(e) => setSelectedMukhiId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All Regions / Mukhis</option>
              {communityMukhis.map((m) => (
                <option key={m.id} value={m.id}>
                  #{m.source_serial_number} {m.full_name} ({m.gram})
                </option>
              ))}
            </select>
          </div>

          {/* Cultural Filters */}
          <div className="sm:col-span-2">
            <GotraNukhSelect
              selectedGotra={gotra}
              selectedNukh={nukh}
              onGotraChange={(val) => {
                setGotra(val)
                setNukh('')
              }}
              onNukhChange={(val) => setNukh(val)}
              required={false}
            />
          </div>

          {/* Occupation Filter (People Only) */}
          {dataType === 'PEOPLE' && (
            <div className="sm:col-span-2">
              <OccupationSelect
                value={occupation}
                onChange={setOccupation}
                required={false}
                placeholder="All 30 Occupation Categories"
              />
            </div>
          )}

          {/* Gender & Living Status (People Only) */}
          {dataType === 'PEOPLE' && (
            <>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="ALL">All Genders</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Vital Status</label>
                <select
                  value={deceasedStatus}
                  onChange={(e) => setDeceasedStatus(e.target.value as 'ALL' | 'LIVING' | 'DECEASED')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="ALL">All (Living & Deceased)</option>
                  <option value="LIVING">Living Only</option>
                  <option value="DECEASED">Deceased Only</option>
                </select>
              </div>
            </>
          )}

          {/* Date Range */}
          <div>
            <label className="block text-slate-600 font-semibold mb-1">Registration From</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-slate-600 font-semibold mb-1">Registration To</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Export Action Card */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50/50 via-white to-blue-50/40 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Matching Export Dataset
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-3xl font-extrabold text-navy-900">{totalCount}</span>
            <span className="text-xs font-medium text-navy-600">
              {dataType === 'PEOPLE' ? 'people records' : dataType === 'FAMILIES' ? 'family units' : 'Mukhi entries'}
            </span>
          </div>
          {filtersSummary.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-1 truncate max-w-lg">
              Filtered by: {filtersSummary.join(' • ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={loadPreview}
            disabled={isLoading}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Preview
          </Button>

          <Button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting || totalCount === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Export Excel (.xlsx)
          </Button>

          <Button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting || totalCount === 0}
            className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs"
          >
            <FileText className="h-4 w-4 mr-1.5" />
            Export PDF (.pdf)
          </Button>
        </div>
      </div>

      {/* Live Data Preview Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3 flex items-center justify-between">
          <h3 className="text-xs font-bold text-navy-900 uppercase tracking-wide">
            Dataset Preview (Showing top {Math.min(previewRecords.length, 10)} of {totalCount} records)
          </h3>
          <span className="text-[11px] text-slate-500">
            Official Community Registry Output
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-600" />
            <p className="text-xs">Loading records preview...</p>
          </div>
        ) : previewRecords.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Search className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">No records matching the selected filters.</p>
            <p className="text-xs text-slate-500 mt-1">Try loosening or clearing filters above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold uppercase text-[10px]">
                  {Object.keys(previewRecords[0]).map((h) => (
                    <th key={h} className="px-3 py-2.5 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {previewRecords.slice(0, 10).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    {Object.keys(previewRecords[0]).map((h) => (
                      <td key={h} className="px-3 py-2 whitespace-nowrap font-medium text-slate-700">
                        {row[h] !== null && row[h] !== undefined ? String(row[h]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
