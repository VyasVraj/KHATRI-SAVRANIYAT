/**
 * Circular Card Component
 *
 * Displays official community notice card with:
 * - Ref number, title, category, authority, date, pinned badge
 * - "Read Official Circular" (View PDF)
 * - "Download Official PDF" button
 * - Admin management options (for Admin & Super Admin)
 */

import React, { useState } from 'react'
import {
  FileText,
  Pin,
  Calendar,
  Building,
  ShieldAlert,
  Award,
  Download,
  MoreVertical,
  Edit2,
  Trash2,
} from 'lucide-react'
import { useLanguage, type TranslationKey } from '@/features/i18n'
import type { CircularItem } from '../types'
import {
  generateOnlineNoticePdf,
  triggerPdfDownload,
} from '@/utils/circular-pdf-generator'

interface CircularCardProps {
  circular: CircularItem
  onView: (circular: CircularItem) => void
  isAdmin?: boolean
  onEdit?: (circular: CircularItem) => void
  onTogglePin?: (circular: CircularItem) => void
  onDelete?: (circular: CircularItem) => void
}

const getCategoryTranslationKey = (category: string): TranslationKey => {
  switch (category) {
    case 'URGENT':
      return 'circular.cat_urgent'
    case 'CENSUS':
      return 'circular.cat_census'
    case 'GOVERNANCE':
      return 'circular.cat_governance'
    case 'WELFARE':
      return 'circular.cat_welfare'
    case 'ELECTION':
      return 'circular.cat_election'
    default:
      return 'circular.cat_general'
  }
}

export const CircularCard: React.FC<CircularCardProps> = ({
  circular,
  onView,
  isAdmin = false,
  onEdit,
  onTogglePin,
  onDelete,
}) => {
  const { t } = useLanguage()
  const [isDownloading, setIsDownloading] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'URGENT':
        return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
      case 'CENSUS':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
      case 'GOVERNANCE':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300'
      case 'WELFARE':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
      case 'ELECTION':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  const handleDownloadPdf = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      setIsDownloading(true)

      // If PDF URL already exists and is an external or storage link
      if (circular.pdf_url && circular.pdf_url.startsWith('http')) {
        const link = document.createElement('a')
        link.href = circular.pdf_url
        link.download = `${circular.circular_number}.pdf`
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return
      }

      // Generate branded PDF on the fly
      const result = await generateOnlineNoticePdf({
        title: circular.title,
        circular_number: circular.circular_number,
        category: circular.category,
        issuing_authority: circular.issuing_authority,
        issue_date: circular.issue_date,
        effective_date: circular.effective_date,
        subject: circular.subject,
        content: circular.content,
        instructions: circular.instructions,
        contact_info: circular.contact_info,
        signatory_name: circular.signatory_name,
        signatory_title: circular.signatory_title,
        creation_method: circular.creation_method,
      })

      triggerPdfDownload(result.blob, result.filename)
    } catch {
      // Non-blocking download exception
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div
      role="article"
      aria-label={`${circular.circular_number} - ${circular.title}`}
      className={`relative flex flex-col justify-between rounded-xl border bg-white dark:bg-slate-900 p-5 shadow-sm transition hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md ${
        circular.is_pinned
          ? 'border-amber-300 bg-amber-50/20 dark:border-amber-700/50 dark:bg-amber-950/10'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="space-y-3">
        {/* Top Badges & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 px-2 py-0.5 text-xs font-mono font-bold tracking-wide">
              <FileText className="h-3 w-3" />
              {circular.circular_number}
            </span>

            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${getCategoryBadgeClass(
                circular.category
              )}`}
            >
              {circular.category === 'URGENT' && (
                <ShieldAlert className="h-3 w-3" />
              )}
              {t(getCategoryTranslationKey(circular.category), circular.category)}
            </span>

            {circular.status === 'DRAFT' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Draft
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {circular.is_pinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                <Pin className="h-3 w-3 fill-amber-600 dark:fill-amber-400" />
                {t('circular.pinned', 'Pinned')}
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Calendar className="h-3.5 w-3.5" />
              {circular.formatted_date}
            </span>

            {/* Admin Management Dropdown */}
            {isAdmin && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition"
                  aria-label="Admin options"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 shadow-lg z-30 space-y-0.5 text-xs">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false)
                          onEdit(circular)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        <Edit2 className="h-3.5 w-3.5 text-blue-500" />
                        <span>Edit Notice</span>
                      </button>
                    )}

                    {onTogglePin && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false)
                          onTogglePin(circular)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        <Pin className="h-3.5 w-3.5 text-amber-500" />
                        <span>{circular.is_pinned ? 'Unpin Directive' : 'Pin Directive'}</span>
                      </button>
                    )}

                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false)
                          onDelete(circular)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Archive Notice</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Issuing Authority */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          <Building className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{circular.issuing_authority}</span>
        </div>

        {/* Circular Title */}
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
          {circular.title}
        </h3>

        {/* Summary Snippet */}
        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
          {circular.summary}
        </p>

        {/* Signatory Snippet */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-100 dark:border-slate-800/60 text-xs">
          <div className="text-[11px] text-slate-400 font-medium">
            {t('circular.authorized_signatory', 'Authorized Signatory')}:
          </div>
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            {circular.signatory_name}
          </div>
          <div className="text-[11px] text-slate-500">
            {circular.signatory_title}
          </div>
        </div>
      </div>

      {/* Action Buttons: Read & Download */}
      <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onView(circular)}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-900/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`${t('circular.read_circular', 'Read Official Circular')}: ${circular.circular_number}`}
        >
          <Award className="h-3.5 w-3.5" />
          <span>{t('circular.read_circular', 'Read Official Circular')}</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={isDownloading}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          title="Download Official Branded PDF"
        >
          <Download className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          <span>{isDownloading ? 'Preparing...' : 'Download PDF'}</span>
        </button>
      </div>
    </div>
  )
}
