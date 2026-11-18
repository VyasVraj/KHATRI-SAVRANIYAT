import { useState, useEffect, useCallback } from 'react'
import {
  X,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Users,
  Clock,
  Loader2,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/forms/Button'
import {
  getRecentlyRemovedMembers,
  restoreFamilyMember,
  type FamilyMemberWithPerson,
} from '../services/family-members.service'
import { toProperCaseName } from '@/utils/text-casing'

export interface RecentlyRemovedMembersModalProps {
  familyId: string
  isOpen: boolean
  onClose: () => void
}

export const RecentlyRemovedMembersModal: React.FC<RecentlyRemovedMembersModalProps> = ({
  familyId,
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient()
  const [removedMembers, setRemovedMembers] = useState<FamilyMemberWithPerson[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const loadRemovedMembers = useCallback(async () => {
    setIsLoading(true)
    const res = await getRecentlyRemovedMembers(familyId)
    if (res.data) {
      setRemovedMembers(res.data)
    }
    setIsLoading(false)
  }, [familyId])

  useEffect(() => {
    if (isOpen && familyId) {
      loadRemovedMembers()
      setStatusMessage(null)
    }
  }, [isOpen, familyId, loadRemovedMembers])

  if (!isOpen) return null

  const handleRestore = async (member: FamilyMemberWithPerson) => {
    setRestoringId(member.id)
    setStatusMessage(null)

    try {
      const res = await restoreFamilyMember(member.id)
      if (res.error) {
        throw new Error(res.error.message || 'Failed to restore member.')
      }

      setStatusMessage({
        type: 'success',
        text: `${member.person?.first_name || 'Member'} restored to family successfully!`,
      })

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['family-members', familyId] })
      queryClient.invalidateQueries({ queryKey: ['family', familyId] })
      queryClient.invalidateQueries({ queryKey: ['persons'] })

      // Reload list
      await loadRemovedMembers()
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: (err as Error).message || 'Failed to restore member.',
      })
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs animate-in fade-in-50"
    >
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-brand-300 shadow-xs">
              <RotateCcw className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-navy-900">
                Recently Removed Members
              </h2>
              <p className="text-xs text-navy-600 font-medium">
                30-Day Recovery Period — Restore members with all data intact
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {statusMessage && (
            <div
              className={`flex items-center gap-2 rounded-xl p-3 text-xs border ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mb-2 text-brand-600" />
              <span className="text-xs">Loading removed members...</span>
            </div>
          ) : removedMembers.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="text-xs sm:text-sm font-medium">
                No members currently in the 30-day recovery period.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {removedMembers.map((m) => {
                const removedAt = m.left_at ? new Date(m.left_at) : new Date()
                const daysElapsed = Math.floor(
                  (Date.now() - removedAt.getTime()) / (1000 * 60 * 60 * 24)
                )
                const daysRemaining = Math.max(0, 30 - daysElapsed)

                return (
                  <div
                    key={m.id}
                    className="py-3.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-navy-900 text-xs sm:text-sm">
                        {toProperCaseName(
                          `${m.person?.first_name || ''} ${m.person?.last_name || ''}`.trim()
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                        <span className="font-medium text-slate-700">
                          Role: {m.relationship_to_head || m.role}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-amber-700 font-medium">
                          <Clock className="h-3 w-3" />
                          {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left to restore
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={restoringId === m.id}
                      onClick={() => handleRestore(m)}
                      className="text-xs font-semibold hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                    >
                      {restoringId === m.id ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Restoring...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Restore
                        </>
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 flex justify-end">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
