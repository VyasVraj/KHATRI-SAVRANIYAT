import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import {
  COUNTRY_DIALING_CODES,
  DEFAULT_DIALING_CODE,
  getCountryFlag,
} from '@/constants/countryDialingCodes'

interface CountryCodeSelectProps {
  id?: string
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

export function CountryCodeSelect({
  id = 'country-code-select',
  value = DEFAULT_DIALING_CODE,
  onChange,
  disabled = false,
  className = '',
}: CountryCodeSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Find currently selected item
  const selected =
    COUNTRY_DIALING_CODES.find((c) => c.dialing_code === value) ||
    COUNTRY_DIALING_CODES.find((c) => c.dialing_code === DEFAULT_DIALING_CODE) ||
    COUNTRY_DIALING_CODES[0]

  const filtered = COUNTRY_DIALING_CODES.filter(
    (c) =>
      c.country.toLowerCase().includes(search.toLowerCase()) ||
      c.dialing_code.includes(search)
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-navy-200 bg-white px-2.5 py-2 text-xs font-medium text-navy-900 shadow-2xs hover:border-navy-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate flex items-center gap-1.5">
          <span className="text-sm shrink-0">{getCountryFlag(selected.country)}</span>
          <span className="font-semibold text-navy-800 truncate">{selected.country}</span>
          <span className="font-mono text-navy-500 text-[11px] shrink-0">{selected.dialing_code}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-navy-400 shrink-0 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-64 rounded-lg border border-navy-200 bg-white p-1.5 shadow-xl animate-in fade-in-50">
          <div className="relative mb-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-navy-400" />
            <input
              type="text"
              placeholder="Search country or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-navy-200 py-1.5 pl-8 pr-2 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5" role="listbox">
            {filtered.length === 0 ? (
              <div className="p-2 text-center text-xs text-navy-400">No countries found</div>
            ) : (
              filtered.map((item) => (
                <button
                  key={`${item.no}-${item.country}`}
                  type="button"
                  onClick={() => {
                    onChange(item.dialing_code)
                    setIsOpen(false)
                    setSearch('')
                  }}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs text-left hover:bg-navy-50 transition-colors ${
                    item.dialing_code === value ? 'bg-brand-50 text-brand-900 font-semibold' : 'text-navy-800'
                  }`}
                  role="option"
                  aria-selected={item.dialing_code === value}
                >
                  <span className="truncate pr-2 flex items-center gap-1.5">
                    <span className="text-sm shrink-0">{getCountryFlag(item.country)}</span>
                    <span className="truncate">{item.country}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-navy-500">{item.dialing_code}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
