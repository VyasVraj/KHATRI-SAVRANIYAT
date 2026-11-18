import React, { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, Search, X, Check, Briefcase, PlusCircle } from 'lucide-react'
import {
  OCCUPATION_CATEGORIES,
  getOccupationsForCategory,
  getCategoryForOccupation,
} from '@/constants/occupations'
import { supabase } from '@/lib/supabase'

export interface TwoLevelOccupationSelectProps {
  id?: string
  label?: string
  categoryValue?: string | null
  occupationValue?: string | null
  onChange: (occupation: string, category: string) => void
  disabled?: boolean
  required?: boolean
  error?: string
  className?: string
}

export const OTHER_OCCUPATION_CATEGORY = 'Other'
export const OTHER_OPTION_LABEL = 'Other — Add Your Occupation'

export const TwoLevelOccupationSelect: React.FC<TwoLevelOccupationSelectProps> = ({
  id = 'occupation-select',
  label = 'Occupation / Profession',
  categoryValue,
  occupationValue,
  onChange,
  disabled = false,
  required = false,
  error,
  className = '',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedOccupation, setSelectedOccupation] = useState<string>('')
  const [customOccupation, setCustomOccupation] = useState<string>('')

  // Category dropdown state
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState('')
  const categoryContainerRef = useRef<HTMLDivElement>(null)

  // Specific occupation dropdown state
  const [isOccupationOpen, setIsOccupationOpen] = useState(false)
  const [occupationSearch, setOccupationSearch] = useState('')
  const occupationContainerRef = useRef<HTMLDivElement>(null)

  // Reusable custom occupations fetched from database
  const [reusableCustoms, setReusableCustoms] = useState<string[]>([])

  useEffect(() => {
    // Fetch approved reusable custom occupations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from as any)('custom_occupations')
      .select('occupation_name')
      .eq('is_approved', true)
      .eq('is_active', true)
      .then(({ data }: { data: Array<{ occupation_name: string }> | null }) => {
        if (data && Array.isArray(data)) {
          setReusableCustoms(data.map((d) => d.occupation_name).filter(Boolean))
        }
      })
      .then(undefined, () => {
        // Non-blocking
      })
  }, [])

  // Sync external values
  useEffect(() => {
    const rawOcc = (occupationValue || '').trim()
    const rawCat = (categoryValue || '').trim()

    if (!rawOcc && !rawCat) {
      setSelectedCategory('')
      setSelectedOccupation('')
      setCustomOccupation('')
      return
    }

    // 1. If category is explicitly 'Other'
    if (rawCat === OTHER_OCCUPATION_CATEGORY || rawCat === OTHER_OPTION_LABEL) {
      setSelectedCategory(OTHER_OCCUPATION_CATEGORY)
      setSelectedOccupation(rawOcc)
      setCustomOccupation(rawOcc)
      return
    }

    // 2. If valid official category provided
    if (rawCat && OCCUPATION_CATEGORIES.includes(rawCat as (typeof OCCUPATION_CATEGORIES)[number])) {
      setSelectedCategory(rawCat)
      setSelectedOccupation(rawOcc || rawCat)
      return
    }

    // 3. Detect category from occupation string
    if (rawOcc) {
      // Check if it's one of the 30 categories directly
      const isOfficialCat = OCCUPATION_CATEGORIES.find(
        (c) => c.toLowerCase() === rawOcc.toLowerCase()
      )
      if (isOfficialCat) {
        setSelectedCategory(isOfficialCat)
        setSelectedOccupation(isOfficialCat)
        return
      }

      // Check if it's a known sub-occupation under a category
      const detectedCat = getCategoryForOccupation(rawOcc)
      if (detectedCat) {
        setSelectedCategory(detectedCat)
        setSelectedOccupation(rawOcc)
        return
      }

      // Custom occupation without official match -> Treat as 'Other'
      setSelectedCategory(OTHER_OCCUPATION_CATEGORY)
      setSelectedOccupation(rawOcc)
      setCustomOccupation(rawOcc)
    }
  }, [categoryValue, occupationValue])

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        categoryContainerRef.current &&
        !categoryContainerRef.current.contains(e.target as Node)
      ) {
        setIsCategoryOpen(false)
      }
      if (
        occupationContainerRef.current &&
        !occupationContainerRef.current.contains(e.target as Node)
      ) {
        setIsOccupationOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtered categories (30 Official + 'Other — Add Your Occupation')
  const filteredCategories = useMemo(() => {
    const all = [...OCCUPATION_CATEGORIES]
    if (!categorySearch.trim()) return all
    const q = categorySearch.toLowerCase().trim()
    return all.filter((cat) => cat.toLowerCase().includes(q))
  }, [categorySearch])

  const showOtherOption = useMemo(() => {
    if (!categorySearch.trim()) return true
    const q = categorySearch.toLowerCase().trim()
    return 'other'.includes(q) || 'add your occupation'.includes(q)
  }, [categorySearch])

  // Filtered occupations for selected category
  const availableOccupations = useMemo(() => {
    if (!selectedCategory || selectedCategory === OTHER_OCCUPATION_CATEGORY) return []
    return getOccupationsForCategory(selectedCategory)
  }, [selectedCategory])

  const filteredOccupations = useMemo(() => {
    if (!occupationSearch.trim()) return availableOccupations
    const q = occupationSearch.toLowerCase().trim()
    return availableOccupations.filter(
      (occ) =>
        occ.name.toLowerCase().includes(q) ||
        occ.hindiName.toLowerCase().includes(q)
    )
  }, [availableOccupations, occupationSearch])

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat)
    setIsCategoryOpen(false)
    setCategorySearch('')

    if (cat === OTHER_OCCUPATION_CATEGORY) {
      setSelectedOccupation(customOccupation || '')
      onChange(customOccupation || '', OTHER_OCCUPATION_CATEGORY)
      return
    }

    // For official categories: check if current occupation belongs to this category
    const validInNewCat = getOccupationsForCategory(cat).some(
      (o) => o.name.toLowerCase() === selectedOccupation.toLowerCase()
    )

    if (validInNewCat && selectedOccupation && selectedOccupation !== cat) {
      onChange(selectedOccupation, cat)
    } else {
      // Default selected occupation to the category itself so it is never empty!
      setSelectedOccupation(cat)
      onChange(cat, cat)
    }
  }

  const handleSelectOccupation = (occName: string) => {
    setSelectedOccupation(occName)
    setIsOccupationOpen(false)
    setOccupationSearch('')
    onChange(occName, selectedCategory)
  }

  const handleCustomChange = (val: string) => {
    setCustomOccupation(val)
    setSelectedOccupation(val)
    onChange(val, OTHER_OCCUPATION_CATEGORY)
  }

  const handleClear = () => {
    setSelectedCategory('')
    setSelectedOccupation('')
    setCustomOccupation('')
    onChange('', '')
  }

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex items-center justify-between">
        {label && (
          <label
            htmlFor={id}
            className="block text-xs font-semibold text-navy-800"
          >
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        {(selectedCategory || selectedOccupation || customOccupation) && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1 font-medium"
          >
            <X className="h-3 w-3" />
            Clear occupation
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Step 1: Select Occupation Category */}
        <div ref={categoryContainerRef} className="relative">
          <label className="block text-[11px] font-medium text-navy-600 mb-1">
            Step 1: Occupation Category (30 Official)
          </label>
          <button
            id={`${id}-category`}
            type="button"
            disabled={disabled}
            onClick={() => {
              setIsCategoryOpen(!isCategoryOpen)
              setIsOccupationOpen(false)
            }}
            className="flex h-10 w-full items-center justify-between rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-medium text-navy-900 shadow-2xs hover:border-navy-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            aria-haspopup="listbox"
            aria-expanded={isCategoryOpen}
          >
            <span className="truncate flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-navy-400 shrink-0" />
              <span className={selectedCategory ? 'text-navy-900 font-semibold' : 'text-navy-400 font-normal'}>
                {selectedCategory === OTHER_OCCUPATION_CATEGORY
                  ? OTHER_OPTION_LABEL
                  : selectedCategory || 'Select category...'}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-navy-400 shrink-0 ml-1" />
          </button>

          {isCategoryOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full rounded-lg border border-navy-200 bg-white p-1.5 shadow-xl animate-in fade-in-50">
              <div className="relative mb-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-navy-400" />
                <input
                  type="text"
                  placeholder="Search 30 categories..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="w-full rounded-md border border-navy-200 py-1.5 pl-8 pr-2 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  autoFocus
                />
              </div>

              <div className="max-h-48 overflow-y-auto space-y-0.5" role="listbox">
                {filteredCategories.length === 0 && !showOtherOption ? (
                  <div className="p-2 text-center text-xs text-navy-400">No category found</div>
                ) : (
                  <>
                    {filteredCategories.map((cat, idx) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleSelectCategory(cat)}
                        className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left hover:bg-navy-50 transition-colors ${
                          cat === selectedCategory ? 'bg-brand-50 text-brand-900 font-semibold' : 'text-navy-800'
                        }`}
                        role="option"
                        aria-selected={cat === selectedCategory}
                      >
                        <span className="truncate">
                          <span className="text-navy-400 text-[10px] mr-1.5 font-mono">{idx + 1}.</span>
                          {cat}
                        </span>
                        {cat === selectedCategory && <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
                      </button>
                    ))}

                    {/* Option: Other — Add Your Occupation */}
                    {showOtherOption && (
                      <button
                        type="button"
                        onClick={() => handleSelectCategory(OTHER_OCCUPATION_CATEGORY)}
                        className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left border-t border-slate-100 hover:bg-amber-50 text-amber-900 transition-colors mt-1 font-medium ${
                          selectedCategory === OTHER_OCCUPATION_CATEGORY ? 'bg-amber-100 font-bold' : ''
                        }`}
                        role="option"
                        aria-selected={selectedCategory === OTHER_OCCUPATION_CATEGORY}
                      >
                        <span className="truncate flex items-center gap-1.5 text-amber-900">
                          <PlusCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          {OTHER_OPTION_LABEL}
                        </span>
                        {selectedCategory === OTHER_OCCUPATION_CATEGORY && (
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

        {/* Step 2: Select Specific Occupation or Enter Custom */}
        {selectedCategory === OTHER_OCCUPATION_CATEGORY ? (
          <div>
            <label htmlFor={`${id}-custom`} className="block text-[11px] font-medium text-navy-600 mb-1">
              Enter Your Occupation <span className="text-red-500">*</span>
            </label>
            <input
              id={`${id}-custom`}
              type="text"
              value={customOccupation}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="e.g. Freelance Photographer, Organic Farming Consultant"
              disabled={disabled}
              className="flex h-10 w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-medium text-navy-900 shadow-2xs placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            />
          </div>
        ) : (
          <div ref={occupationContainerRef} className="relative">
            <label className="block text-[11px] font-medium text-navy-600 mb-1">
              Step 2: Specific Occupation / Profession (Optional)
            </label>
            <button
              id={`${id}-specific`}
              type="button"
              disabled={disabled || !selectedCategory}
              onClick={() => {
                if (selectedCategory) {
                  setIsOccupationOpen(!isOccupationOpen)
                  setIsCategoryOpen(false)
                }
              }}
              className={`flex h-10 w-full items-center justify-between rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-medium text-navy-900 shadow-2xs hover:border-navy-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 ${
                !selectedCategory ? 'cursor-not-allowed bg-slate-50' : ''
              }`}
              aria-haspopup="listbox"
              aria-expanded={isOccupationOpen}
            >
              <span className="truncate">
                {!selectedCategory ? (
                  <span className="text-slate-400 italic">Select category first</span>
                ) : selectedOccupation && selectedOccupation !== selectedCategory ? (
                  <span className="font-semibold text-brand-900">{selectedOccupation}</span>
                ) : (
                  <span className="text-navy-500 font-normal">
                    {selectedCategory} (or choose specific title)
                  </span>
                )}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-navy-400 shrink-0 ml-1" />
            </button>

            {isOccupationOpen && selectedCategory && (
              <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full rounded-lg border border-navy-200 bg-white p-1.5 shadow-xl animate-in fade-in-50">
                <div className="relative mb-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-navy-400" />
                  <input
                    type="text"
                    placeholder={`Search ${selectedCategory} occupations...`}
                    value={occupationSearch}
                    onChange={(e) => setOccupationSearch(e.target.value)}
                    className="w-full rounded-md border border-navy-200 py-1.5 pl-8 pr-2 text-xs text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    autoFocus
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5" role="listbox">
                  {/* Option to keep general category */}
                  <button
                    type="button"
                    onClick={() => handleSelectOccupation(selectedCategory)}
                    className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left hover:bg-navy-50 transition-colors ${
                      selectedOccupation === selectedCategory ? 'bg-brand-50 text-brand-900 font-semibold' : 'text-navy-800'
                    }`}
                    role="option"
                    aria-selected={selectedOccupation === selectedCategory}
                  >
                    <span className="truncate font-medium italic">
                      General: {selectedCategory}
                    </span>
                    {selectedOccupation === selectedCategory && (
                      <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                    )}
                  </button>

                  {filteredOccupations.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectOccupation(item.name)}
                      className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left hover:bg-navy-50 transition-colors ${
                        item.name === selectedOccupation ? 'bg-brand-50 text-brand-900 font-semibold' : 'text-navy-800'
                      }`}
                      role="option"
                      aria-selected={item.name === selectedOccupation}
                    >
                      <div className="truncate pr-2">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-navy-400 text-[11px] ml-1.5 font-normal">({item.hindiName})</span>
                      </div>
                      {item.name === selectedOccupation && (
                        <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                      )}
                    </button>
                  ))}

                  {/* Reusable approved customs matching this category search */}
                  {reusableCustoms.length > 0 && (
                    <div className="pt-1 mt-1 border-t border-slate-100">
                      <div className="px-2 py-0.5 text-[10px] uppercase font-bold text-slate-400">
                        Community Custom Occupations
                      </div>
                      {reusableCustoms.map((customName) => (
                        <button
                          key={customName}
                          type="button"
                          onClick={() => handleSelectOccupation(customName)}
                          className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left hover:bg-navy-50 transition-colors ${
                            customName === selectedOccupation ? 'bg-brand-50 text-brand-900 font-semibold' : 'text-navy-800'
                          }`}
                        >
                          <span className="truncate font-medium">{customName}</span>
                          {customName === selectedOccupation && (
                            <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}
