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

  // Listen for Escape key and print events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    const handleBeforePrint = () => {
      if (isOpen && circular) {
        document.body.classList.add('printing-circular-active')
      }
    }
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-circular-active')
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
      document.body.classList.remove('printing-circular-active')
    }
  }, [isOpen, circular, onClose])

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
    document.body.classList.add('printing-circular-active')
    window.print()
    setTimeout(() => {
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('printing-circular-active')
      }
    }, 1000)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="circular-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto print:static print:inset-auto print:z-auto print:block print:p-0 print:m-0 print:overflow-visible print:bg-white"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity print:hidden"
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl z-10 flex flex-col print:static print:max-w-none print:max-h-none print:overflow-visible print:rounded-none print:border-none print:shadow-none print:bg-white print:p-0 print:m-0 print:block">
        {/* Top Action Bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-3.5 print:hidden">
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
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              aria-label={t('circular.action_print', 'Print notice')}
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{t('circular.action_print', 'Print Notice')}</span>
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
        <div className="p-6 sm:p-8 space-y-6 print:p-0 print:space-y-4 print:text-black">
          {/* Letterhead Header */}
          <div className="text-center border-b-2 border-slate-900/80 dark:border-slate-100/80 pb-6 space-y-2 print:border-slate-900 print:pb-3 print:space-y-1">
            <div className="flex items-center justify-center gap-2 text-blue-700 dark:text-blue-400 print:text-slate-900">
              <Award className="h-8 w-8 print:h-9 print:w-9" />
            </div>
            <h1 className="text-lg sm:text-2xl font-extrabold uppercase tracking-widest text-slate-900 dark:text-slate-100 print:text-slate-950 font-serif">
              SHREE KHATRI SAMAJ CENTRAL PANCHAYAT
            </h1>
            <p className="text-xs sm:text-sm font-bold tracking-wider uppercase text-slate-600 dark:text-slate-400 print:text-slate-700">
              {circular.issuing_authority}
            </p>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 print:bg-slate-100 px-3.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 print:text-slate-900 print:border print:border-slate-300 mt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 print:text-slate-900" />
              <span>OFFICIAL COMMUNITY CIRCULAR & DIRECTIVE</span>
            </div>
          </div>

          {/* Official Print Header Divider Rule */}
          <div className="hidden print:block border-t border-b border-slate-900 h-1 my-2" />

          {/* Meta Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm border-b border-slate-100 dark:border-slate-800 print:border-slate-300 pb-3 pt-1">
            <div>
              <span className="font-semibold text-slate-500 uppercase tracking-wider print:text-slate-700">
                {t('circular.label_ref', 'Ref No')}:{' '}
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 print:text-black">
                {circular.circular_number}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 uppercase tracking-wider print:text-slate-700">
                {t('circular.label_date', 'Date of Issue')}:{' '}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 print:text-black">
                {circular.formatted_date}
              </span>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5 pt-1">
            <h2
              id="circular-detail-title"
              className="text-lg sm:text-2xl font-bold font-serif text-slate-900 dark:text-slate-100 print:text-black leading-snug tracking-tight"
            >
              {circular.title}
            </h2>
            {circular.summary && (
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 print:text-slate-700 italic font-serif leading-relaxed">
                {circular.summary}
              </p>
            )}
          </div>

          {/* Official Content Body */}
          <div className="rounded-xl bg-slate-50/70 dark:bg-slate-800/40 p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 text-xs sm:text-sm font-serif leading-relaxed text-slate-800 dark:text-slate-200 space-y-4 print:bg-transparent print:p-0 print:border-none print:text-black print:text-[11pt] print:leading-relaxed print:space-y-3">
            {circular.content.split('\n\n').map((paragraph, idx) => (
              <p
                key={idx}
                className="whitespace-pre-line break-inside-avoid print:break-inside-avoid"
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* Signatory Stamp / Signature Block */}
          <div className="pt-6 border-t-2 border-slate-200 dark:border-slate-800 print:border-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 break-inside-avoid print:break-inside-avoid">
            {circular.official_seal_text && (
              <div className="border-2 border-dashed border-slate-400 dark:border-slate-600 print:border-slate-800 rounded-lg p-3 sm:p-4 text-[11px] sm:text-xs font-mono text-slate-600 dark:text-slate-400 print:text-slate-800 max-w-xs text-center print:bg-slate-50">
                <div className="font-bold tracking-widest text-slate-700 print:text-slate-900">
                  ★ {circular.official_seal_text} ★
                </div>
                <div className="text-[9px] text-slate-500 mt-1 uppercase tracking-wider">
                  Shree Khatri Samaj Central Panchayat
                </div>
              </div>
            )}

            <div className="text-right sm:ml-auto space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 print:text-slate-700">
                {t('circular.by_order', 'By Order of the Panchayat')}
              </div>
              <div className="text-base sm:text-lg font-bold font-serif text-slate-900 dark:text-slate-100 print:text-black">
                {circular.signatory_name}
              </div>
              <div className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 print:text-slate-800">
                {circular.signatory_title}
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 print:text-slate-600">
                {circular.issuing_authority}
              </div>
            </div>
          </div>

          {/* Printable Official Document Footer */}
          <div className="hidden print:flex items-center justify-between pt-4 mt-6 border-t border-slate-300 text-[9pt] text-slate-600 uppercase tracking-wider font-sans">
            <div>
              Shree Khatri Samaj Central Panchayat • Official Circular Directive
            </div>
            <div>
              Ref: {circular.circular_number}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-3.5 flex justify-end print:hidden">
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
