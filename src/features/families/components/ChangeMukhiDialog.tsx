/**
 * ChangeMukhiDialog — Modal dialog allowing authorized family managers / heads
 * to assign or update the family's official Mukhi from the 118-member Community Mukhi Directory.
 */

import React, { useState, useMemo } from 'react'
import { X, Search, Check, Shield, Loader2, AlertCircle, MapPin, Phone } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useCommunityMukhis } from '@/features/community/hooks/useCommunityMukhis'
import { isLocationMatch } from '@/features/community/services/community-mukhis.service'
import { updateFamilyMukhi } from '../services/families.service'
import type { CommunityMukhi } from '@/features/community/services/community-mukhis.service'
import { useQueryClient } from '@tanstack/react-query'

export interface ChangeMukhiDialogProps {
  isOpen: boolean
  onClose: () => void
  familyId: string
  familyCity?: string | null
  currentMukhiId?: string | null
  onMukhiChanged?: (newMukhi: CommunityMukhi | null) => void
}

export const ChangeMukhiDialog: React.FC<ChangeMukhiDialogProps> = ({
  isOpen,
  onClose,
  familyId,
  familyCity,
  currentMukhiId,
  onMukhiChanged,
}) => {
  const queryClient = useQueryClient()
  const { mukhis, isLoading } = useCommunityMukhis({ priorityLocation: familyCity || undefined })
  const [selectedId, setSelectedId] = useState<string | null>(currentMukhiId ?? null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Filter members
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return mukhis
    const q = searchQuery.toLowerCase().trim()
    return mukhis.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        m.gram.toLowerCase().includes(q) ||
        (m.mobile_number && m.mobile_number.includes(q)) ||
        String(m.source_serial_number) === q
    )
  }, [mukhis, searchQuery])

  if (!isOpen) return null

  const currentlySelected = mukhis.find((m) => m.id === selectedId) || null

  async function handleSave() {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const res = await updateFamilyMukhi(familyId, selectedId)
      if (res.error) {
        throw new Error(res.error.message || 'Failed to update family Mukhi.')
      }

      await queryClient.invalidateQueries({ queryKey: ['family', familyId] })
      await queryClient.invalidateQueries({ queryKey: ['families'] })

      onMukhiChanged?.(res.data?.selected_mukhi ?? currentlySelected)
      onClose()
    } catch (err) {
      setErrorMessage(
        (err as { message?: string }).message || 'Failed to update Mukhi. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-mukhi-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-navy-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-800">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 id="change-mukhi-title" className="text-base font-bold text-navy-900">
                Change Community Mukhi
              </h2>
              <p className="text-xs text-navy-500">
                Choose an official representative from the 118-member Community Mukhi Directory.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-navy-400 hover:bg-navy-100 hover:text-navy-600 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400" />
          <input
            type="text"
            placeholder="Search by Mukhi name, Gram / City, or Mobile..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-navy-200 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        {/* Active Selection Summary */}
        {currentlySelected && (
          <div className="flex items-center justify-between p-2.5 rounded-lg border border-blue-200 bg-blue-50/70 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-blue-900">Selected:</span>
              <span className="font-semibold text-navy-950">{currentlySelected.full_name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                #{currentlySelected.source_serial_number}
              </span>
              <span className="text-navy-500">({currentlySelected.gram})</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-xs text-blue-700 hover:text-blue-900 underline font-medium"
            >
              Clear
            </button>
          </div>
        )}

        {/* List of candidates */}
        <div className="max-h-64 overflow-y-auto divide-y divide-navy-100 border border-navy-200 rounded-lg">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-navy-500 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span>Loading Community Mukhi Directory...</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-6 text-center text-xs text-navy-500">
              No Mukhis match &quot;{searchQuery}&quot;.
            </div>
          ) : (
            filteredMembers.map((member) => {
              const isSelected = selectedId === member.id
              const isMatchingCity = isLocationMatch(member.gram, familyCity)
              return (
                <div
                  key={member.id || member.source_serial_number}
                  onClick={() => setSelectedId(member.id)}
                  className={`flex items-center justify-between p-2.5 cursor-pointer text-xs transition-colors ${
                    isSelected ? 'bg-blue-50/80 font-medium' : 'hover:bg-navy-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-navy-100 text-navy-600'
                      }`}
                    >
                      #{member.source_serial_number}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-navy-900">{member.full_name}</span>
                        {isMatchingCity && (
                          <span className="text-[9px] px-1 py-0.2 rounded font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            📍 Matches Family City
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-navy-500 flex items-center gap-1.5 mt-0.5">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {member.gram}
                        </span>
                        {member.mobile_number && (
                          <span className="flex items-center gap-1">
                            • <Phone className="h-3 w-3 text-slate-400" />
                            {member.mobile_number}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="flex items-center gap-1 text-xs font-bold text-blue-600">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-navy-100">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            isLoading={isSubmitting}
            className="font-bold shadow-xs"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
