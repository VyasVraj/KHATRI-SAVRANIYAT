/**
 * CitySelector — Searchable City Combobox with Automatic State & Country Selection.
 *
 * Requirements:
 * - Search by city name with partial matching and instant suggestions.
 * - Displays City, State, and Country in suggestions list.
 * - Automatically populates State and Country upon selection.
 * - "+ Add New City" action when city is missing or upon user request.
 * - Persists custom cities in database and local cache.
 * - Keyboard accessible, high z-index, zero overflow clipping.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { MapPin, Plus, Check, X, AlertCircle } from 'lucide-react'
import { searchCities, addNewCity, syncRemoteCities, type CityItem } from '@/services/cities.service'

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
  placeholder = 'Type to search city...',
  id = 'city-selector',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  // Add City Form State
  const [newCityName, setNewCityName] = useState('')
  const [newCityState, setNewCityState] = useState('')
  const [newCityCountry, setNewCityCountry] = useState('India')
  const [addError, setAddError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  // Sync remote cities once on mount
  useEffect(() => {
    void syncRemoteCities()
  }, [])

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

  // Search results
  const suggestions = useMemo(() => {
    return searchCities(searchQuery, 15)
  }, [searchQuery])

  const handleSelect = (item: CityItem) => {
    onSelectCity({
      city: item.name,
      state: item.state,
      country: item.country,
    })
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleOpenAddModal = () => {
    setNewCityName(searchQuery.trim())
    setNewCityState(selectedState || '')
    setNewCityCountry(selectedCountry || 'India')
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

      // Automatically select newly created city
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
      ? `${value}, ${selectedState}`
      : value
    : ''

  return (
    <div className={`space-y-1 relative ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-navy-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
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
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600"
            aria-label="Clear city"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown Suggestions List */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-navy-200 bg-white p-1.5 shadow-xl">
          <ul role="listbox" className="max-h-56 overflow-y-auto space-y-0.5 text-xs scrollbar-thin">
            {suggestions.map((item) => {
              const isSelected = item.name.toLowerCase() === value.toLowerCase()
              return (
                <li
                  key={`${item.name}-${item.state}-${item.country}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item)}
                  className={`flex items-center justify-between rounded px-3 py-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-brand-50 text-brand-700 font-semibold'
                      : 'text-navy-800 hover:bg-navy-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-navy-500 truncate">
                      {item.state}, {item.country}
                    </p>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-brand-600 shrink-0 ml-2" />}
                </li>
              )
            })}

            {/* "+ Add New City" Button Option */}
            <li className="border-t border-navy-100 pt-1 mt-1">
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="w-full flex items-center gap-2 rounded px-3 py-2 text-left font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Add New City &quot;{searchQuery.trim() || 'Missing City'}&quot;</span>
              </button>
            </li>
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      {/* Add New City Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 backdrop-blur-xs p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-city-title"
            className="w-full max-w-sm rounded-xl border border-navy-200 bg-white p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-navy-100 pb-3">
              <h3 id="add-city-title" className="text-base font-bold text-navy-900">
                Add Missing City
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-navy-400 hover:text-navy-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {addError && (
              <div role="alert" className="flex items-center gap-2 rounded bg-red-50 p-2.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleSaveNewCity} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-navy-700 mb-1">
                  City Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  placeholder="e.g. Radhanpur, Deesa, Mandvi"
                  className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>

              <div>
                <label className="block font-medium text-navy-700 mb-1">
                  State / Province <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCityState}
                  onChange={(e) => setNewCityState(e.target.value)}
                  placeholder="e.g. Gujarat, Rajasthan, Maharashtra"
                  className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>

              <div>
                <label className="block font-medium text-navy-700 mb-1">
                  Country <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newCityCountry}
                  onChange={(e) => setNewCityCountry(e.target.value)}
                  placeholder="e.g. India"
                  className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-navy-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isAdding}
                  className="rounded px-3 py-1.5 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="rounded bg-brand-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {isAdding ? 'Saving...' : 'Save & Select City'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
