/**
 * CitySelector — Searchable Worldwide Location Selector with Instant Autofill & Cascading Modes.
 *
 * Requirements:
 * - Search by city name worldwide (222 countries, 3,934 divisions, 137k+ places from official master).
 * - Automatic State and Country population on selection.
 * - Mode A: Instant city search with debounced server/client suggestions.
 * - Mode B: Cascading Country -> State -> City dropdown filter toggle.
 * - "+ Add New City" action when custom place is needed.
 * - High z-index, zero overflow clipping, keyboard navigation.
 * - 100% backwards compatible with existing form signatures.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { MapPin, Plus, Check, X, Globe, Filter } from 'lucide-react'
import {
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
  placeholder = 'Type to search city worldwide...',
  id = 'city-selector',
  showCascadingToggle = true,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CityItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
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
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Pre-load country and state options
  const countries = useMemo<CountryItem[]>(() => getCountries(), [])
  const states = useMemo<StateItem[]>(() => {
    return filterCountry ? getStatesForCountry(filterCountry) : []
  }, [filterCountry])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Sync internal filter state when props change
  useEffect(() => {
    if (selectedCountry && !filterCountry) setFilterCountry(selectedCountry)
    if (selectedState && !filterState) setFilterState(selectedState)
  }, [selectedCountry, selectedState, filterCountry, filterState])

  // Debounced search
  useEffect(() => {
    if (!isOpen) return

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

    setIsSearching(true)
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchCitiesAsync(searchQuery, 20, {
          country: filterCountry || undefined,
          state: filterState || undefined,
        })
        setSuggestions(results)
      } catch {
        setSuggestions([])
      } finally {
        setIsSearching(false)
      }
    }, 150)

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [searchQuery, isOpen, filterCountry, filterState])

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
  }

  const handleOpenAddModal = () => {
    setNewCityName(searchQuery.trim())
    setNewCityState(filterState || selectedState || '')
    setNewCityCountry(filterCountry || selectedCountry || 'India')
    setAddError(null)
    setShowAddModal(true)
    setIsOpen(false)
  }

  const handleSaveNewCity = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)

    if (!newCityName.trim()) {
      setAddError('City name is required.')
      return
    }
    if (!newCityState.trim()) {
      setAddError('State name is required.')
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

      setShowAddModal(false)
      setSearchQuery('')
    } catch (err) {
      setAddError((err as Error).message || 'Failed to add city.')
    } finally {
      setIsAdding(false)
    }
  }

  const displayValue = value
    ? selectedState
      ? `${value}, ${selectedState}${selectedCountry ? `, ${selectedCountry}` : ''}`
      : value
    : ''

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
              <label className="block text-[11px] font-medium text-navy-700 mb-0.5">Country</label>
              <select
                value={filterCountry}
                onChange={(e) => {
                  const c = e.target.value
                  setFilterCountry(c)
                  setFilterState('')
                }}
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
              <label className="block text-[11px] font-medium text-navy-700 mb-0.5">State / Province</label>
              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
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
          id={id}
          type="text"
          value={isOpen ? searchQuery : displayValue}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => {
            setSearchQuery(value || '')
            setIsOpen(true)
          }}
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
      {value && selectedState && !isOpen && (
        <div className="flex items-center gap-1.5 text-xs text-navy-600 pt-0.5">
          <span className="inline-flex items-center gap-1 bg-navy-50 text-navy-700 px-2 py-0.5 rounded border border-navy-200">
            <Check className="h-3 w-3 text-emerald-600" />
            <span className="font-semibold">{value}</span>, {selectedState}
            {selectedCountry ? ` (${selectedCountry})` : ''}
          </span>
        </div>
      )}

      {/* Dropdown Suggestions Panel */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border border-navy-200 bg-white shadow-lg text-sm"
        >
          {isSearching && (
            <div className="px-3 py-2 text-xs text-navy-400 italic">Searching worldwide locations...</div>
          )}

          {!isSearching && suggestions.length === 0 && (
            <div className="px-3 py-3 text-center text-xs text-navy-500">
              No matching cities found in master registry.
            </div>
          )}

          {suggestions.map((item, index) => {
            const isSelected = item.name.toLowerCase() === value.toLowerCase()
            return (
              <div
                key={`${item.name}-${item.state}-${item.country}-${index}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(item)}
                className={[
                  'flex items-center justify-between px-3 py-2 cursor-pointer transition-colors',
                  isSelected ? 'bg-brand-50 text-brand-900 font-medium' : 'hover:bg-navy-50 text-navy-800',
                ].join(' ')}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-navy-500">
                    {item.state}, {item.country}
                    {item.is_custom && (
                      <span className="ml-1 text-[10px] text-amber-700 bg-amber-50 px-1 rounded border border-amber-200">
                        Custom
                      </span>
                    )}
                  </span>
                </div>
                {isSelected && <Check className="h-4 w-4 text-brand-600 shrink-0" />}
              </div>
            )
          })}

          {/* Add New Missing City Action */}
          <div
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-brand-600 hover:text-brand-800 hover:bg-brand-50 cursor-pointer border-t border-navy-100 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Add &quot;{searchQuery.trim() || 'New City'}&quot; to Directory</span>
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
