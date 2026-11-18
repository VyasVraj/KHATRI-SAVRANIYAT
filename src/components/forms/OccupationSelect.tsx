/**
 * OccupationSelect Component
 * Searchable dropdown for the 30 Official Occupation Categories (PDF reference)
 * and Custom "Other — Add Your Occupation" option.
 *
 * Source: "30_Main_Occupation_Categories(2).pdf"
 * - Displays exactly 30 categories in PDF sequence.
 * - Real-time filtering by category name.
 * - Support for "Other — Add Your Occupation" with inline text input.
 * - Full keyboard navigation (Escape to close, Enter to select).
 * - Accessible ARIA attributes and focus management.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Check, Briefcase, X, PlusCircle } from 'lucide-react'
import {
  OCCUPATION_CATEGORIES,
  OCCUPATION_PENDING,
} from '@/constants/occupations'

export interface OccupationSelectProps {
  id?: string
  label?: string
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  required?: boolean
  className?: string
  placeholder?: string
}

export const OTHER_OPTION_LABEL = 'Other — Add Your Occupation'

export const OccupationSelect: React.FC<OccupationSelectProps> = ({
  id = 'occupation-select',
  label = 'Occupation / Profession',
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  className = '',
  placeholder = 'Select occupation category...',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isOtherSelected, setIsOtherSelected] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Sync initial or changed value
  useEffect(() => {
    const clean = (value || '').trim()
    if (!clean || clean === OCCUPATION_PENDING) {
      setIsOtherSelected(false)
      setCustomValue('')
      return
    }

    const isOfficial = OCCUPATION_CATEGORIES.some(
      (c) => c.toLowerCase() === clean.toLowerCase()
    )

    if (isOfficial) {
      setIsOtherSelected(false)
      setCustomValue('')
    } else {
      setIsOtherSelected(true)
      setCustomValue(clean)
    }
  }, [value])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearchQuery('')
    }
  }, [isOpen])

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return OCCUPATION_CATEGORIES
    }
    const q = searchQuery.toLowerCase().trim()
    return OCCUPATION_CATEGORIES.filter((category) =>
      category.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const showOther = useMemo(() => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    return 'other'.includes(q) || 'add your occupation'.includes(q)
  }, [searchQuery])

  const handleSelect = (category: string) => {
    setIsOtherSelected(false)
    setCustomValue('')
    onChange(category)
    setIsOpen(false)
  }

  const handleSelectOther = () => {
    setIsOtherSelected(true)
    setIsOpen(false)
    if (customValue) {
      onChange(customValue)
    }
  }

  const handleCustomChange = (val: string) => {
    setCustomValue(val)
    onChange(val)
  }

  const handleClear = () => {
    setIsOtherSelected(false)
    setCustomValue('')
    onChange('')
  }

  const isPending = value === OCCUPATION_PENDING || !value

  return (
    <div className={`relative space-y-1.5 ${className}`} ref={containerRef}>
      <div className="flex items-center justify-between">
        {label && (
          <label
            htmlFor={id}
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        )}
        {(value || isOtherSelected) && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] text-slate-500 hover:text-rose-600 transition-colors flex items-center gap-1 font-medium"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Main Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50 disabled:bg-slate-100 ${
          error
            ? 'border-rose-400 bg-rose-50/30 text-rose-900 focus:ring-rose-400'
            : isPending
            ? 'border-slate-300 bg-white text-slate-500'
            : 'border-slate-300 bg-white text-slate-900 font-medium'
        }`}
      >
        <span className="flex items-center gap-2 truncate">
          <Briefcase className="h-4 w-4 text-brand-600 shrink-0" />
          <span className="truncate">
            {isOtherSelected
              ? `Other: ${customValue || 'Enter custom occupation below'}`
              : value && value !== OCCUPATION_PENDING
              ? value
              : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-brand-600' : ''
          }`}
        />
      </button>

      {/* Custom Occupation Text Box */}
      {isOtherSelected && (
        <div className="space-y-1 pt-1">
          <label htmlFor={`${id}-custom-text`} className="block text-[11px] font-semibold text-navy-700">
            Enter Your Occupation <span className="text-red-500">*</span>
          </label>
          <input
            id={`${id}-custom-text`}
            type="text"
            value={customValue}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder="e.g. Freelance Photographer, Organic Farming Consultant"
            disabled={disabled}
            autoFocus
            className="w-full flex h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          />
        </div>
      )}

      {/* Error Message */}
      {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
          {/* Search Box */}
          <div className="border-b border-slate-100 p-2.5 bg-slate-50/70">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search 30 categories..."
                className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false)
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 px-1">
              <span>Official 30 Categories</span>
              <span>{filteredCategories.length} available</span>
            </div>
          </div>

          {/* List Options */}
          <div
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-50 focus:outline-none"
          >
            {filteredCategories.length === 0 && !showOther ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No matching occupation category found.
              </div>
            ) : (
              <>
                {filteredCategories.map((category, idx) => {
                  const isSelected = value === category && !isOtherSelected
                  return (
                    <button
                      key={category}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(category)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition text-left ${
                        isSelected
                          ? 'bg-brand-50 text-brand-900 font-bold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span className="text-[10px] font-mono text-slate-400 w-5">
                          {idx + 1}.
                        </span>
                        <span>{category}</span>
                      </span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                      )}
                    </button>
                  )
                })}

                {/* Option: Other — Add Your Occupation */}
                {showOther && (
                  <button
                    type="button"
                    onClick={handleSelectOther}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition text-left border-t border-slate-100 hover:bg-amber-50 text-amber-900 font-medium ${
                      isOtherSelected ? 'bg-amber-100 font-bold' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <PlusCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span>{OTHER_OPTION_LABEL}</span>
                    </span>
                    {isOtherSelected && (
                      <Check className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
