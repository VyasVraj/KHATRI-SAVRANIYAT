/**
 * Circular Detail Modal / Official Document Reader (Screen 48 — ANDROID-13 Parity)
 */

import React, { useEffect, useState } from 'react'
import {
  X,
  FileText,
  Award,
  Share2,
  Check,
  ShieldCheck,
  Printer,
} from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { CircularItem } from '../types'

interface CircularDetailModalProps {
  circular: CircularItem | null
  isOpen: boolean
  onClose: () => void
}

export const CircularDetailModal: React.FC<CircularDetailModalProps> = ({
  circular,
  isOpen,
  onClose,
}) => {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)

  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !circular) return null

  const handleShare = async () => {
    const shareUrl = window.location.href
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(
        `${circular.circular_number}: ${circular.title}\n${shareUrl}`
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="circular-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-10 flex flex-col">
        {/* Top Action Bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-3.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-900 text-white dark:bg-slate-800 px-2 py-0.5 text-xs font-mono font-bold">
              <FileText className="h-3 w-3" />
              {circular.circular_number}
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {circular.formatted_date}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              aria-label={t('circular.action_share', 'Share circular')}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600">{t('circular.copied', 'Copied')}</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5" />
                  <span>{t('circular.action_share', 'Share')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="hidden sm:flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              aria-label={t('circular.action_print', 'Print notice')}
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{t('circular.action_print', 'Print')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition"
              aria-label={t('action.close', 'Close')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Official Letterhead Reader Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Letterhead Header */}
          <div className="text-center border-b-2 border-slate-900/80 dark:border-slate-100/80 pb-6 space-y-2">
            <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
              <Award className="h-7 w-7" />
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold uppercase tracking-widest text-slate-900 dark:text-slate-100">
              SHREE KHATRI SAMAJ CENTRAL PANCHAYAT
            </h1>
            <p className="text-xs font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
              {circular.issuing_authority}
            </p>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>OFFICIAL COMMUNITY CIRCULAR & DIRECTIVE</span>
            </div>
          </div>

          {/* Meta Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <span className="font-semibold text-slate-400 uppercase">
                {t('circular.label_ref', 'Ref No')}:{' '}
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {circular.circular_number}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-400 uppercase">
                {t('circular.label_date', 'Date of Issue')}:{' '}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {circular.formatted_date}
              </span>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1">
            <h2
              id="circular-detail-title"
              className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug"
            >
              {circular.title}
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              {circular.summary}
            </p>
          </div>

          {/* Official Content Body */}
          <div className="rounded-xl bg-slate-50/70 dark:bg-slate-800/40 p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 text-xs sm:text-sm font-serif leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line space-y-4">
            {circular.content}
          </div>

          {/* Signatory Stamp / Signature Block */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            {circular.official_seal_text && (
              <div className="border border-dashed border-slate-400 dark:border-slate-600 rounded-lg p-3 text-[11px] font-mono text-slate-500 max-w-xs">
                ★ {circular.official_seal_text} ★
              </div>
            )}

            <div className="text-right sm:ml-auto space-y-0.5">
              <div className="text-xs text-slate-400 font-medium">
                {t('circular.by_order', 'By Order of the Panchayat')}
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {circular.signatory_name}
              </div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {circular.signatory_title}
              </div>
              <div className="text-[11px] text-slate-400">
                {circular.issuing_authority}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            {t('action.close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  )
}
