/**
 * PersonDuplicateWarningBanner — Moderator-visible warning banner on person profile.
 * (ANDROID-7: Claims, Verification & Duplicate Flows)
 *
 * CRITICAL ARCHITECTURAL PRINCIPLES:
 * 1. DETECT != MERGE:
 *    - Identifying potential duplicate candidates NEVER automatically merges or alters records.
 * 2. PRIVACY & ACCESS CONTROL:
 *    - Only community moderators and platform administrators (ADMIN_ROLES) see raw duplicate warnings.
 *    - Regular community members are protected from confusing duplicate flags.
 * 3. GRACEFUL QUERY CONTEXT:
 *    - Safely returns null when rendered outside of a QueryClientProvider (e.g., basic unit tests).
 */

import { useContext, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { AlertTriangle, CopyCheck, Eye, ShieldAlert, CheckCircle } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useLanguage } from '@/features/i18n'
import { ADMIN_ROLES } from '@/constants/app'
import { usePersonDuplicateCandidates, useFlagDuplicate } from '../hooks/useDuplicateDetection'
import { Button } from '@/components/forms/Button'
import type { PersonRow, UserRole } from '@/types'
import type { DuplicateCandidate } from '../types/duplicate.types'

export interface PersonDuplicateWarningBannerProps {
  person: PersonRow
}

export function PersonDuplicateWarningBanner({ person }: PersonDuplicateWarningBannerProps) {
  const { profile } = useAuthContext()
  const queryContext = useContext(QueryClientContext)
  const { t } = useLanguage()

  // Only authorized moderators and admins see duplicate warnings
  const isModerator = profile?.role && ADMIN_ROLES.includes(profile.role as UserRole)

  if (!isModerator || !queryContext) {
    return null
  }

  return <PersonDuplicateWarningContent person={person} t={t} />
}

function PersonDuplicateWarningContent({
  person,
  t,
}: {
  person: PersonRow
  t: (key: import('@/features/i18n').TranslationKey, fallback?: string) => string
}) {
  const { data: candidates = [], isLoading } = usePersonDuplicateCandidates(person)
  const flagMutation = useFlagDuplicate()
  const [flaggedIds, setFlaggedIds] = useState<Record<string, boolean>>({})

  if (isLoading || !candidates || candidates.length === 0) {
    return null
  }

  async function handleFlagForReview(candidate: DuplicateCandidate<PersonRow>) {
    try {
      await flagMutation.mutateAsync({
        entityType: 'PERSON',
        recordAId: person.id,
        recordBId: candidate.candidate.id,
        confidence: candidate.confidence,
        matchReasons: candidate.matchSignals,
      })
      setFlaggedIds((prev) => ({ ...prev, [candidate.candidate.id]: true }))
    } catch {
      // Handled by react-query mutation
    }
  }

  return (
    <div
      data-testid="person-duplicate-warning-banner"
      className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 sm:p-5 shadow-sm text-sm text-amber-950 space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-700 shrink-0 mt-0.5">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-amber-950">
              {t('duplicate.warning_title', 'Potential Duplicate Flag')}
            </h3>
            <span className="rounded-full bg-amber-200/80 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              {candidates.length} candidate{candidates.length > 1 ? 's' : ''} detected
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-900/90 leading-relaxed">
            {t('duplicate.warning_desc', 'A potential duplicate record was detected for this individual. Please review to avoid redundant census entries.')}
          </p>
        </div>
      </div>

      {/* Candidate list */}
      <div className="space-y-2 pt-1">
        {candidates.map((cand) => {
          const candName = [cand.candidate.first_name, cand.candidate.middle_name, cand.candidate.last_name]
            .filter(Boolean)
            .join(' ') || 'Unnamed Candidate'
          const isFlagged = flaggedIds[cand.candidate.id]

          return (
            <div
              key={cand.candidate.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/90 p-3 rounded-lg border border-amber-200/80 text-xs text-navy-800"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-navy-950">{candName}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      cand.confidence === 'STRONG'
                        ? 'bg-rose-100 text-rose-800'
                        : cand.confidence === 'POSSIBLE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-navy-100 text-navy-700'
                    }`}
                  >
                    {cand.confidence} MATCH
                  </span>
                  {cand.candidate.date_of_birth && (
                    <span className="text-navy-500">
                      DOB: {cand.candidate.date_of_birth}
                    </span>
                  )}
                  {cand.candidate.birth_place && (
                    <span className="text-navy-500">
                      Place: {cand.candidate.birth_place}
                    </span>
                  )}
                </div>

                {cand.matchSignals.length > 0 && (
                  <div className="text-[11px] text-amber-800 flex items-center gap-1">
                    <CopyCheck className="h-3 w-3 text-amber-600 shrink-0" />
                    <span>Signals: {cand.matchSignals.join(', ')}</span>
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {isFlagged ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs py-1.5 px-3 bg-emerald-50 rounded-md border border-emerald-200">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Flagged for Review
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleFlagForReview(cand)}
                    disabled={flagMutation.isPending}
                    className="min-h-[44px] min-w-[44px] text-xs border-amber-300 hover:bg-amber-100 text-amber-950"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    {t('duplicate.review_btn', 'Review Duplicate')}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="pt-1 text-[11px] text-amber-800/80 italic flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
        <span>{t('duplicate.detect_not_merge_notice', 'Important: Reviewing or flagging duplicates preserves all records. The system never performs destructive automated merges (DETECT != MERGE).')}</span>
      </div>
    </div>
  )
}
