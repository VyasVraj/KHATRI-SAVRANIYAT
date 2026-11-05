/**
 * GotraNukhSelect — Accessible, Authoritative Gotra and Nukh Selection Component.
 *
 * Requirements:
 * - Source of truth: Brahm_Kshatriya_Gotra_Nukh_List_English.pdf (all 29 Gotras).
 * - Gotra dropdown: shows all 29 authoritative Gotras.
 * - Nukh dropdown: initially disabled, enabled only after Gotra selected.
 * - Displays ONLY Nukhs belonging to the selected Gotra.
 * - Resets Nukh immediately when Gotra changes.
 * - Prevents saving invalid combinations.
 * - Full keyboard and screen reader accessibility with native select primitives.
 * - Zero clipping across cards, drawers, and modal dialogs.
 */

import React, { useState, useMemo } from 'react'
import { AlertCircle, RefreshCw, Search } from 'lucide-react'
import { useGotraNukhRegistry } from '@/services/gotraNukh.service'
import {
  resolveCanonicalGotra,
  resolveCanonicalNukh,
  isValidNukhForGotra,
} from '@/constants/gotraNukh'

export interface GotraNukhSelectProps {
  selectedGotra?: string | null
  selectedNukh?: string | null
  onGotraChange: (gotra: string) => void
  onNukhChange: (nukh: string) => void
  gotraError?: string
  nukhError?: string
  disabled?: boolean
  required?: boolean
  className?: string
  gotraId?: string
  nukhId?: string
}

export const GotraNukhSelect: React.FC<GotraNukhSelectProps> = ({
  selectedGotra = '',
  selectedNukh = '',
  onGotraChange,
  onNukhChange,
  gotraError,
  nukhError,
  disabled = false,
  required = false,
  className = '',
  gotraId = 'select-gotra',
  nukhId = 'select-nukh',
}) => {
  const { gotras, getNukhsForGotra, isLoading, isError, error, refetch } = useGotraNukhRegistry()
  const [nukhSearch, setNukhSearch] = useState('')

  const resolvedGotra = resolveCanonicalGotra(selectedGotra) || selectedGotra || ''
  const availableNukhs = useMemo(
    () => (resolvedGotra ? getNukhsForGotra(resolvedGotra) : []),
    [resolvedGotra, getNukhsForGotra]
  )
  const resolvedNukh = resolveCanonicalNukh(resolvedGotra, selectedNukh) || selectedNukh || ''

  const filteredNukhs = useMemo(() => {
    if (!nukhSearch.trim()) return availableNukhs
    const q = nukhSearch.toLowerCase().trim()
    return availableNukhs.filter((n) => n.toLowerCase().includes(q))
  }, [availableNukhs, nukhSearch])

  const handleGotraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    onGotraChange(val)
    setNukhSearch('')
    // Changing Gotra resets Nukh selection if the previous Nukh is not valid for the new Gotra
    if (selectedNukh && !isValidNukhForGotra(val, selectedNukh)) {
      onNukhChange('')
    }
  }

  const handleNukhChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onNukhChange(e.target.value)
  }

  if (isError && gotras.length === 0) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 p-4 text-xs text-red-700 space-y-2"
      >
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <span>Failed to load Gotra & Nukh directory</span>
        </div>
        <p className="text-red-600">{error?.message || 'Database connection error'}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    )
  }

  const isGotraDisabled = disabled || isLoading
  const isNukhDisabled = disabled || isLoading || !resolvedGotra

  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${className}`}>
      {/* Gotra Selection */}
      <div className="space-y-1">
        <label htmlFor={gotraId} className="block text-sm font-medium text-navy-700">
          Gotra {required && <span className="text-red-500">*</span>}
        </label>
        <select
          id={gotraId}
          value={resolvedGotra}
          onChange={handleGotraChange}
          disabled={isGotraDisabled}
          aria-invalid={Boolean(gotraError)}
          aria-describedby={gotraError ? `${gotraId}-error` : undefined}
          className={`flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm bg-white transition-colors focus:outline-none focus:ring-1 ${
            isGotraDisabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'text-navy-900'
          } ${
            gotraError
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400'
          }`}
        >
          {isLoading ? (
            <option value="">— Loading Gotras... —</option>
          ) : (
            <>
              <option value="">— Select Gotra —</option>
              {gotras.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </>
          )}
        </select>
        {gotraError && (
          <p id={`${gotraId}-error`} role="alert" className="text-xs text-red-600">
            {gotraError}
          </p>
        )}
      </div>

      {/* Nukh Selection with optional Quick Search */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor={nukhId} className="block text-sm font-medium text-navy-700">
            Nukh {required && <span className="text-red-500">*</span>}
          </label>
          {availableNukhs.length > 5 && !isNukhDisabled && (
            <div className="relative flex items-center">
              <Search className="absolute left-1.5 h-3 w-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={nukhSearch}
                onChange={(e) => setNukhSearch(e.target.value)}
                placeholder="Filter Nukh..."
                className="h-6 w-28 rounded border border-navy-200 pl-5 pr-1.5 text-[11px] text-navy-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
              />
            </div>
          )}
        </div>
        <select
          id={nukhId}
          value={resolvedNukh}
          onChange={handleNukhChange}
          disabled={isNukhDisabled}
          aria-invalid={Boolean(nukhError)}
          aria-describedby={nukhError ? `${nukhId}-error` : undefined}
          className={`flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm bg-white transition-colors focus:outline-none focus:ring-1 ${
            isNukhDisabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'text-navy-900'
          } ${
            nukhError
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400'
          }`}
        >
          {!selectedGotra ? (
            <option value="">— Select Gotra first —</option>
          ) : (
            <>
              <option value="">— Select Nukh —</option>
              {resolvedNukh && !filteredNukhs.includes(resolvedNukh) && (
                <option value={resolvedNukh}>{resolvedNukh}</option>
              )}
              {filteredNukhs.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </>
          )}
        </select>
        {nukhError && (
          <p id={`${nukhId}-error`} role="alert" className="text-xs text-red-600">
            {nukhError}
          </p>
        )}
      </div>
    </div>
  )
}
