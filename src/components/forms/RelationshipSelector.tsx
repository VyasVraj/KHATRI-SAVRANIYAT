/**
 * RelationshipSelector — Searchable, Categorized Dropdown for Family Member Relationships.
 *
 * Source: Family_Relationships_English_Hindi_Reference(1).pdf
 * Requirements:
 * - Covers all 13 categories (122 specific relationships + 'Other' fallback = 123 options).
 * - Displays options strictly in "English Relationship (Hindi Relationship)" format.
 * - Categorized with clear category headings.
 * - Real-time multilingual search: English, Hindi (Devanagari), and meaning.
 * - Keyboard navigation (Arrow keys, Enter, Escape).
 * - Backward compatible: resolves legacy English or canonical keys into "English (Hindi)".
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Check, X } from 'lucide-react'
import {
  FAMILY_RELATIONSHIP_CATEGORIES,
  formatRelationshipDisplay,
  getRelationshipDefinition,
  type RelationshipItem,
} from '@/constants/familyRelationships'

export interface RelationshipSelectorProps {
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

export const RelationshipSelector: React.FC<RelationshipSelectorProps> = ({
  id = 'relationship-selector',
  label = 'Relationship to Family Head',
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  className = '',
  placeholder = 'Select relationship to head...',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [customValue, setCustomValue] = useState('')
  const [isCustomMode, setIsCustomMode] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Sync custom mode if value is not in standard list and not empty
  useEffect(() => {
    if (value && (value.startsWith('Other: ') || value.startsWith('Other (अन्य / विशिष्ट संबंध): '))) {
      setIsCustomMode(true)
      const cleanCustom = value.replace(/^Other(\s*\([^)]+\))?:\s*/, '')
      setCustomValue(cleanCustom)
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

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearchQuery('')
    }
  }, [isOpen])

  // Formatted display representation of the current value
  const formattedDisplayValue = useMemo(() => {
    return formatRelationshipDisplay(value)
  }, [value])

  // Filtered categories with Unicode-aware Devanagari & English search
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return FAMILY_RELATIONSHIP_CATEGORIES

    return FAMILY_RELATIONSHIP_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => {
        const eng = item.englishLabel.toLowerCase()
        const hindi = item.hindiLabel.toLowerCase()
        const disp = item.displayLabel.toLowerCase()
        const meaning = item.meaning.toLowerCase()
        const key = item.canonicalKey.toLowerCase()
        return (
          eng.includes(q) ||
          hindi.includes(q) ||
          disp.includes(q) ||
          meaning.includes(q) ||
          key.includes(q)
        )
      }),
    })).filter((cat) => cat.items.length > 0)
  }, [searchQuery])

  function handleSelect(item: RelationshipItem) {
    if (item.canonicalKey === 'other') {
      setIsCustomMode(true)
      onChange(item.displayLabel)
    } else {
      setIsCustomMode(false)
      setCustomValue('')
      onChange(item.displayLabel)
    }
    setIsOpen(false)
  }

  function handleCustomSave() {
    const trimmed = customValue.trim()
    if (trimmed) {
      onChange(`Other: ${trimmed}`)
    } else {
      onChange('Other (अन्य / विशिष्ट संबंध)')
    }
    setIsCustomMode(false)
  }

  // Handle keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsOpen(false)
    } else if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault()
      setIsOpen(true)
    }
  }

  return (
    <div className={`relative ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-bold text-navy-800 mb-1"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Hidden native select for standard HTML form accessibility, optgroups, and test automation */}
      <select
        id={`${id}-native`}
        name={id}
        value={formattedDisplayValue || value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only pointer-events-none"
      >
        <option value="">{placeholder}</option>
        {FAMILY_RELATIONSHIP_CATEGORIES.map((cat) => (
          <optgroup key={cat.categoryNumber} label={`${cat.categoryNumber}. ${cat.categoryName}`}>
            {cat.items.map((item) => (
              <option key={item.canonicalKey} value={item.displayLabel}>
                {item.displayLabel}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label || placeholder}
        data-testid="relationship-selector-trigger"
        className={`w-full flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm text-left shadow-sm transition-colors focus:outline-none focus:ring-1 ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500 text-red-900'
            : 'border-navy-300 focus:border-brand-500 focus:ring-brand-500 text-navy-900'
        } ${disabled ? 'bg-slate-100 cursor-not-allowed opacity-75' : 'cursor-pointer hover:border-navy-400'}`}
      >
        <span className={formattedDisplayValue ? 'font-semibold text-navy-900' : 'text-navy-400'}>
          {formattedDisplayValue || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-navy-500 transition-transform duration-200 shrink-0 ml-2 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Custom 'Other' specification input when chosen */}
      {isCustomMode && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="Specify custom relationship..."
            className="flex-1 rounded-md border border-navy-300 px-3 py-1.5 text-xs text-navy-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCustomSave()
              }
            }}
          />
          <button
            type="button"
            onClick={handleCustomSave}
            className="px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-md shadow-sm"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCustomMode(false)
              setCustomValue('')
            }}
            className="p-1.5 text-navy-500 hover:text-navy-700"
            title="Cancel custom specify"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-[100] mt-1.5 rounded-lg border border-navy-200 bg-white shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150 max-h-[380px] flex flex-col">
          {/* Search Header */}
          <div className="p-2.5 border-b border-navy-100 bg-navy-50/70">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-navy-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search English or Hindi (e.g. wife, पत्नी, बुआ, uncle)..."
                className="w-full rounded-md border border-navy-300 bg-white pl-8 pr-8 py-1.5 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 p-0.5 text-navy-400 hover:text-navy-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-navy-500 font-medium">
              <span>13 Categories (English + Hindi Reference)</span>
              <span>123 Options</span>
            </div>
          </div>

          {/* Scrollable Categories List */}
          <div ref={listRef} className="flex-1 overflow-y-auto p-1.5 space-y-2 divide-y divide-navy-100">
            {filteredCategories.length === 0 ? (
              <div className="p-4 text-center text-xs text-navy-500">
                No matching relationship found for &quot;{searchQuery}&quot;.
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const otherItem = getRelationshipDefinition('other')
                      if (otherItem) handleSelect(otherItem)
                    }}
                    className="text-brand-600 hover:text-brand-800 font-semibold underline text-xs"
                  >
                    Select &quot;Other&quot; to specify custom relationship
                  </button>
                </div>
              </div>
            ) : (
              filteredCategories.map((cat) => (
                <div key={cat.categoryNumber} className="pt-2 first:pt-0">
                  {/* Category Header */}
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-navy-600 bg-navy-50/80 rounded flex items-center justify-between mb-1">
                    <span>
                      {cat.categoryNumber}. {cat.categoryName}
                    </span>
                    <span className="text-[10px] text-navy-400 font-normal">
                      {cat.items.length} {cat.items.length === 1 ? 'option' : 'options'}
                    </span>
                  </div>

                  {/* Items in category */}
                  <div className="space-y-0.5">
                    {cat.items.map((item) => {
                      const currentDef = getRelationshipDefinition(value)
                      const isSelected =
                        currentDef?.canonicalKey === item.canonicalKey ||
                        value === item.displayLabel ||
                        value === item.englishLabel ||
                        (item.canonicalKey === 'other' && value.startsWith('Other'))
                      return (
                        <button
                          key={item.canonicalKey}
                          type="button"
                          onClick={() => handleSelect(item)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-brand-50 border border-brand-300 text-brand-900 font-semibold'
                              : 'hover:bg-slate-100 text-navy-800'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <span className="block font-semibold text-navy-900">
                              {item.displayLabel}
                            </span>
                            <span className="block text-[11px] text-navy-500 truncate">
                              {item.meaning}
                            </span>
                          </div>
                          {isSelected && (
                            <Check className="h-4 w-4 text-brand-600 shrink-0 stroke-[2.5]" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-1 font-semibold">{error}</p>}
    </div>
  )
}
