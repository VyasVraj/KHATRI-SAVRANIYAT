/**
 * DataQualityIndicator — UI component displaying deterministic data quality score,
 * completeness breakdown, missing fields, and actionable recommendations.
 * (Phase 9 — Subtask 4)
 *
 * CRITICAL ARCHITECTURAL DISTINCTION:
 * DATA QUALITY != VERIFICATION
 * - Displays an explicit notice distinguishing completeness scoring from official community verification.
 */

import { useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import type { PersonRow, FamilyRow } from '@/types'
import type { DataQualityScore, DataQualityTier } from '../types/quality.types'
import {
  calculatePersonDataQuality,
  calculateFamilyDataQuality,
} from '../services/dataQuality.service'

export interface DataQualityIndicatorProps {
  person?: Partial<PersonRow> | null
  family?: Partial<FamilyRow> | null
  score?: DataQualityScore
  showDetailsInitially?: boolean
}

function getTierBadgeClasses(tier: DataQualityTier): string {
  switch (tier) {
    case 'EXCELLENT':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'GOOD':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'ADEQUATE':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'NEEDS_IMPROVEMENT':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300'
  }
}

function getProgressBarClasses(tier: DataQualityTier): string {
  switch (tier) {
    case 'EXCELLENT':
      return 'bg-emerald-500'
    case 'GOOD':
      return 'bg-blue-500'
    case 'ADEQUATE':
      return 'bg-amber-500'
    case 'NEEDS_IMPROVEMENT':
    default:
      return 'bg-slate-400'
  }
}

function formatTierLabel(tier: DataQualityTier): string {
  switch (tier) {
    case 'EXCELLENT':
      return 'Excellent Quality'
    case 'GOOD':
      return 'Good Quality'
    case 'ADEQUATE':
      return 'Adequate'
    case 'NEEDS_IMPROVEMENT':
      return 'Needs Details'
  }
}

export function DataQualityIndicator({
  person,
  family,
  score: externalScore,
  showDetailsInitially = false,
}: DataQualityIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(showDetailsInitially)

  // Compute quality score if not explicitly passed
  const quality: DataQualityScore =
    externalScore ??
    (person
      ? calculatePersonDataQuality(person)
      : family
        ? calculateFamilyDataQuality(family)
        : {
            entityType: 'PERSON',
            entityId: '',
            score: 0,
            tier: 'NEEDS_IMPROVEMENT',
            categories: {},
            missingFields: [],
            recommendations: [],
            warnings: [],
            calculatedAt: new Date().toISOString(),
          })

  const tierBadgeClasses = getTierBadgeClasses(quality.tier)
  const progressBarColor = getProgressBarClasses(quality.tier)

  return (
    <div
      data-testid="data-quality-indicator"
      className="rounded-lg border border-navy-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-navy-900">
              Record Completeness & Quality
            </h4>
            <span
              data-testid="quality-tier-badge"
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${tierBadgeClasses}`}
            >
              {formatTierLabel(quality.tier)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              data-testid="quality-score-value"
              className="text-sm font-bold text-navy-900"
            >
              {quality.score}%
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs text-navy-600 hover:text-navy-900 transition-colors"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Hide quality breakdown' : 'Show quality breakdown'}
            >
              {isExpanded ? (
                <>
                  <span>Hide Details</span>
                  <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  <span>View Breakdown</span>
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-navy-100 rounded-full h-2 overflow-hidden">
          <div
            data-testid="quality-progress-bar"
            className={`h-2 rounded-full transition-all duration-300 ${progressBarColor}`}
            style={{ width: `${Math.min(100, Math.max(0, quality.score))}%` }}
          />
        </div>

        {/* Explicit Architectural Notice: DATA QUALITY != VERIFICATION */}
        <div className="flex items-start gap-2 rounded-md bg-navy-50/60 p-2 text-xs text-navy-600 border border-navy-100">
          <Info className="h-4 w-4 text-navy-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>Note:</strong> Data Quality measures record completeness and genealogical utility. It does <em>not</em> imply or substitute for official moderator verification.
          </span>
        </div>

        {/* Collapsible Details */}
        {isExpanded && (
          <div data-testid="quality-details-section" className="mt-2 space-y-4 pt-3 border-t border-navy-100">
            {/* Category Scores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(quality.categories).map(([key, category]) => {
                const percentage =
                  category.max > 0 ? Math.round((category.earned / category.max) * 100) : 0
                return (
                  <div
                    key={key}
                    data-testid={`quality-category-${key}`}
                    className="rounded-md border border-navy-100 bg-navy-50/30 p-2.5 text-xs"
                  >
                    <div className="flex justify-between items-center font-medium text-navy-800">
                      <span>{category.label}</span>
                      <span>
                        {category.earned} / {category.max} pts ({percentage}%)
                      </span>
                    </div>
                    <p className="mt-0.5 text-navy-500 text-[11px]">{category.description}</p>
                  </div>
                )
              })}
            </div>

            {/* Warnings (if any) */}
            {quality.warnings.length > 0 && (
              <div
                data-testid="quality-warnings-list"
                className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200"
              >
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Consistency Warnings</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  {quality.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations & Missing Fields */}
            {quality.recommendations.length > 0 && (
              <div
                data-testid="quality-recommendations-list"
                className="rounded-md bg-navy-50/40 p-3 text-xs text-navy-700 border border-navy-100"
              >
                <div className="flex items-center gap-1.5 font-semibold mb-1 text-navy-900">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 shrink-0" />
                  <span>Improvement Recommendations</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  {quality.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
