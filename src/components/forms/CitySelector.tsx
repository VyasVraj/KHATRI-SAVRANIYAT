/**
 * CitySelector — Searchable Worldwide Location Selector with Instant Autofill & Cascading Modes.
 *
 * Source: Official World Countries, States & Cities Registry (222 countries, 3,934 divisions, 137k+ places).
 *
 * Requirements:
 * - Search by city name worldwide with instant one-click selection.
 * - Automatic State and Country population in "City Name, State/Province, Country" format.
 * - Cascading Country -> State -> City dropdown filter toggle.
 * - Full 222-country coverage (e.g., Russia -> Moscow -> Moscow).
 * - Multi-tier partial, exact, and Unicode-aware matching.
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape).
 * - "+ Add New City to Directory" action when unlisted locality is needed.
 * - 100% backwards compatible with existing form signatures.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { MapPin, Plus, Check, X, Globe, Filter, Loader2, AlertCircle } from 'lucide-react'
import {
  searchCities,
  searchCitiesAsync,
  addNewCity,
  getCountries,
  getStatesForCountry,
  type CityItem,
  type CountryItem,
  type StateItem,
} from '@/services/cities.service'

export interface CitySelectorProps {
  label?: string
  value?: string
  selectedState?: string
  selectedCountry?: string
  onSelectCity: (selected: { city: string; state: string; country: string }) => void
  error?: string
  disabled?: boolean
  required?: boolean
  className?: string
  placeholder?: string
  id?: string
  showCascadingToggle?: boolean
}

/**
 * Parses a composite birthplace string like "Moscow, Moscow, Russia" into components.
 */
function parseLocationParts(raw: string): { city: string; state: string; country: string } {
  if (!raw || !raw.includes(',')) {
    return { city: raw.trim(), state: '', country: '' }
  }
  const parts = raw.split(',').map((p) => p.trim())
  if (parts.length >= 3) {
    return { city: parts[0], state: parts[1], country: parts.slice(2).join(', ') }
  }
  if (parts.length === 2) {
    return { city: parts[0], state: parts[1], country: '' }
  }
  return { city: raw.trim(), state: '', country: '' }
}

export const CitySelector: React.FC<CitySelectorProps> = ({
  label = 'City / Location',
  value = '',
  selectedState = '',
  selectedCountry = '',
  onSelectCity,
  error,
  disabled = false,
  required = false,
  className = '',
  placeholder = 'Search birthplace worldwide...',
  id = 'city-selector',
  showCascadingToggle = true,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CityItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [showAddModal, setShowAddModal] = useState(false)

  // Cascading Filter Mode
  const [isCascadingOpen, setIsCascadingOpen] = useState(false)
  const [filterCountry, setFilterCountry] = useState<string>(selectedCountry || '')
  const [filterState, setFilterState] = useState<string>(selectedState || '')

  // Add City Form State
  const [newCityName, setNewCityName] = useState('')
  const [newCityState, setNewCityState] = useState('')
  const [newCityCountry, setNewCityCountry] = useState('India')
  const [addError, setAddError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const activeRequestIdRef = useRef<number>(0)

  // Pre-load country and state options
  const countries = useMemo<CountryItem[]>(() => getCountries(), [])
  const states = useMemo<StateItem[]>(() => {
    return filterCountry ? getStatesForCountry(filterCountry) : []
  }, [filterCountry])

  // Parse initial or incoming value to pre-populate filters if empty
  useEffect(() => {
    if (value && !filterCountry && !filterState) {
      const parsed = parseLocationParts(value)
      if (parsed.country) setFilterCountry(parsed.country)
      if (parsed.state) setFilterState(parsed.state)
    }
  }, [value, filterCountry, filterState])

  // Sync internal filter state when props change
  useEffect(() => {
    if (selectedCountry && selectedCountry !== filterCountry) {
      setFilterCountry(selectedCountry)
    }
    if (selectedState && selectedState !== filterState) {
      setFilterState(selectedState)
    }
  }, [selectedCountry, selectedState, filterCountry, filterState])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Execute debounced search whenever query, filterCountry, filterState, or isOpen changes
  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(-1)
      return
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

    const requestId = ++activeRequestIdRef.current
    setIsSearching(true)
    setSearchError(null)

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchCitiesAsync(searchQuery, 25, {
          country: filterCountry || undefined,
          state: filterState || undefined,
        })

        // Guard against race conditions / stale results
        if (requestId === activeRequestIdRef.current) {
          setSuggestions(results)
          setHighlightedIndex(-1)
        }
      } catch {
        if (requestId === activeRequestIdRef.current) {
          setSuggestions([])
          setSearchError('Failed to search locations. Please try again or add a new place.')
        }
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsSearching(false)
        }
      }
    }, 120)

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [searchQuery, isOpen, filterCountry, filterState])

  // One-Click City Selection
  const handleSelect = (item: CityItem) => {
    onSelectCity({
      city: item.name,
      state: item.state,
      country: item.country,
    })
    setFilterCountry(item.country)
    setFilterState(item.state)
    setIsOpen(false)
    setSearchQuery('')
    setHighlightedIndex(-1)
  }

  // Handle Country change in cascading filter
  const handleCountryChange = (newCountry: string) => {
    setFilterCountry(newCountry)
    setFilterState('')
    onSelectCity({ city: '', state: '', country: newCountry })
    setSearchQuery('')
    setHighlightedIndex(-1)
    const immediate = searchCities('', 25, { country: newCountry || undefined })
    setSuggestions(immediate)
    setIsOpen(true)
  }

  // Handle State change in cascading filter
  const handleStateChange = (newState: string) => {
    setFilterState(newState)
    onSelectCity({ city: '', state: newState, country: filterCountry })
    setSearchQuery('')
    setHighlightedIndex(-1)
    const immediate = searchCities('', 25, {
      country: filterCountry || undefined,
      state: newState || undefined,
    })
    setSuggestions(immediate)
    setIsOpen(true)
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleSelect(suggestions[highlightedIndex])
      } else if (suggestions.length === 1) {
        handleSelect(suggestions[0])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setHighlightedIndex(-1)
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listboxRef.current) {
      const items = listboxRef.current.querySelectorAll('[data-option-item]')
      const activeEl = items[highlightedIndex] as HTMLElement
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  // Open modal to add custom city
  const handleOpenAddModal = () => {
    setNewCityName(searchQuery.trim())
    setNewCityState(filterState || selectedState || '')
    setNewCityCountry(filterCountry || selectedCountry || 'India')
    setAddError(null)
    setShowAddModal(true)
    setIsOpen(false)
  }

  // Save new custom city and immediately select with one click
  const handleSaveNewCity = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)

    if (!newCityName.trim()) {
      setAddError('City / Town / Village name is required.')
      return
    }
    if (!newCityState.trim()) {
      setAddError('State / Province name is required.')
      return
    }

    setIsAdding(true)
    try {
      const res = await addNewCity({
        name: newCityName,
        state: newCityState,
        country: newCityCountry || 'India',
      })

      if (res.error || !res.data) {
        setAddError(res.error?.message || 'Failed to add city.')
        return
      }

      onSelectCity({
        city: res.data.name,
        state: res.data.state,
        country: res.data.country,
      })

      setFilterCountry(res.data.country)
      setFilterState(res.data.state)
      setShowAddModal(false)
      setSearchQuery('')
      setIsOpen(false)
    } catch (err) {
      setAddError((err as Error).message || 'Failed to add city.')
    } finally {
      setIsAdding(false)
    }
  }

  // Determine display string for input
  const displayValue = useMemo(() => {
    if (!value) return ''
    if (value.includes(',')) return value
    if (selectedState) {
      return `${value}, ${selectedState}${selectedCountry ? `, ${selectedCountry}` : ''}`
    }
    return value
  }, [value, selectedState, selectedCountry])

  return (
    <div className={`space-y-1 relative ${className}`} ref={containerRef}>
      <div className="flex items-center justify-between">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-navy-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        {showCascadingToggle && (
          <button
            type="button"
            onClick={() => setIsCascadingOpen((prev) => !prev)}
            className="text-xs text-brand-600 hover:text-brand-800 font-medium inline-flex items-center gap-1 transition-colors"
          >
            <Filter className="h-3 w-3" />
            {isCascadingOpen ? 'Hide Country/State Filters' : 'Filter by Country/State'}
          </button>
        )}
      </div>

      {/* Cascading Filter Section */}
      {isCascadingOpen && (
        <div className="p-2.5 mb-2 bg-navy-50/70 border border-navy-200 rounded-lg space-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-navy-800 font-semibold mb-1">
            <Globe className="h-3.5 w-3.5 text-brand-600" />
            <span>Select Region Hierarchy (222 Countries & 3,934 States)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${id}-country-select`} className="block text-[11px] font-medium text-navy-700 mb-0.5">
                Country
              </label>
              <select
                id={`${id}-country-select`}
                aria-label="Country"
                value={filterCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="w-full text-xs h-8 px-2 rounded border border-navy-200 bg-white text-navy-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">-- All Countries (Worldwide) --</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.name}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-state-select`} className="block text-[11px] font-medium text-navy-700 mb-0.5">
                State / Province
              </label>
              <select
                id={`${id}-state-select`}
                aria-label="State / Province"
                value={filterState}
                onChange={(e) => handleStateChange(e.target.value)}
                disabled={!filterCountry}
                className="w-full text-xs h-8 px-2 rounded border border-navy-200 bg-white text-navy-900 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
              >
                <option value="">-- All States / Provinces --</option>
                {states.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Input / Selector Box */}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400 pointer-events-none" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={isOpen ? searchQuery : displayValue}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => {
            setSearchQuery('')
            setIsOpen(true)
            if (suggestions.length === 0) {
              const immediate = searchCities('', 25, {
                country: filterCountry || undefined,
                state: filterState || undefined,
              })
              setSuggestions(immediate)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={!!error}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          autoComplete="off"
          className={[
            'h-10 w-full rounded-md border pl-9 pr-8 text-sm text-navy-900 bg-white placeholder:text-navy-400',
            'transition-colors focus:outline-none focus:ring-1',
            disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : '',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
              : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400',
          ].join(' ')}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onSelectCity({ city: '', state: '', country: '' })
              setSearchQuery('')
              setIsOpen(false)
              inputRef.current?.focus()
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-navy-400 hover:text-navy-600 rounded-full"
            aria-label="Clear city"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Selected location indicator badge */}
      {displayValue && !isOpen && (
        <div className="flex items-center gap-1.5 text-xs text-navy-600 pt-0.5">
          <span className="inline-flex items-center gap-1 bg-navy-50 text-navy-700 px-2 py-0.5 rounded border border-navy-200">
            <Check className="h-3 w-3 text-emerald-600" />
            <span className="font-semibold">{displayValue}</span>
          </span>
        </div>
      )}

      {/* Dropdown Suggestions Panel */}
      {isOpen && (
        <div
          ref={listboxRef}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-navy-200 bg-white shadow-xl text-sm"
        >
          {isSearching && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-navy-500 italic bg-navy-50/40">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
              <span>Searching worldwide locations...</span>
            </div>
          )}

          {searchError && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 bg-red-50">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {!isSearching && !searchError && suggestions.length === 0 && (
            <div className="px-3 py-3 text-center text-xs text-navy-500 bg-slate-50">
              No matching cities found in master registry.
            </div>
          )}

          {suggestions.map((item, index) => {
            const isSelected =
              displayValue.toLowerCase().startsWith(item.name.toLowerCase()) ||
              item.name.toLowerCase() === value.toLowerCase()
            const isHighlighted = highlightedIndex === index

            return (
              <div
                key={`${item.name}-${item.state}-${item.country}-${index}`}
                data-option-item
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={[
                  'flex items-center justify-between px-3 py-2 cursor-pointer transition-colors border-b border-navy-50 last:border-b-0',
                  isHighlighted ? 'bg-brand-50/70 text-brand-900' : isSelected ? 'bg-brand-50 text-brand-900 font-medium' : 'hover:bg-navy-50 text-navy-800',
                ].join(' ')}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-navy-900">{item.name}</span>
                  <span className="text-xs text-navy-500">
                    {item.state}, {item.country}
                    {item.is_custom && (
                      <span className="ml-1 text-[10px] text-amber-700 bg-amber-50 px-1 rounded border border-amber-200">
                        Custom
                      </span>
                    )}
                  </span>
                </div>
                {isSelected && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
              </div>
            )
          })}

          {/* Add New Missing City Action */}
          <div
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-brand-600 hover:text-brand-800 hover:bg-brand-50 cursor-pointer border-t border-navy-100 transition-colors bg-white sticky bottom-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add &quot;{searchQuery.trim() || 'New City'}&quot; to Directory</span>
          </div>
        </div>
      )}

      {/* Add City Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-navy-200">
            <div className="flex items-center justify-between border-b border-navy-100 pb-3">
              <h4 className="text-base font-bold text-navy-900">Add New Place</h4>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-navy-400 hover:text-navy-600 p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewCity} className="space-y-3 text-sm">
              {addError && <p className="text-xs text-red-500">{addError}</p>}

              <div>
                <label className="block text-xs font-medium text-navy-700 mb-1">
                  City / Town / Village Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  placeholder="e.g. Anand"
                  required
                  className="w-full h-9 rounded border border-navy-300 px-3 text-sm text-navy-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-navy-700 mb-1">
                  State / Province <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCityState}
                  onChange={(e) => setNewCityState(e.target.value)}
                  placeholder="e.g. Gujarat"
                  required
                  className="w-full h-9 rounded border border-navy-300 px-3 text-sm text-navy-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-navy-700 mb-1">Country</label>
                <input
                  type="text"
                  value={newCityCountry}
                  onChange={(e) => setNewCityCountry(e.target.value)}
                  placeholder="e.g. India"
                  className="w-full h-9 rounded border border-navy-300 px-3 text-sm text-navy-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-navy-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded text-xs font-medium text-navy-600 hover:bg-navy-50 border border-navy-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="px-4 py-1.5 rounded text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50"
                >
                  {isAdding ? 'Saving...' : 'Add & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
