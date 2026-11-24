/**
 * Circular Detail Modal / Official Document Reader
 *
 * Implements authoritative official letterhead reader:
 * - Authentic Emblem: AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
 * - Ref No, Date, Issuing Authority, Category
 * - Official Content & Directives
 * - Signatory Block & Insignia Seal
 * - One-click Download Official PDF
 * - Print Notice
 * - Share URL
 */

import React, { useEffect, useState } from 'react'
import {
  X,
  FileText,
  Share2,
  Check,
  ShieldCheck,
  Printer,
  Download,
  ExternalLink,
} from 'lucide-react'
import { BrandLogo } from '@/components/common/BrandLogo'
import { useLanguage } from '@/features/i18n'
import type { CircularItem } from '../types'
import {
  generateOnlineNoticePdf,
  triggerPdfDownload,
} from '@/utils/circular-pdf-generator'

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
  const [isDownloading, setIsDownloading] = useState(false)

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

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true)
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
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 transition disabled:opacity-50"
              title="Download Official Branded PDF"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isDownloading ? 'Preparing...' : 'Download Official PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
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
              className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              aria-label={t('circular.action_print', 'Print notice')}
            >
              <Printer className="h-3.5 w-3.5" />
              <span>{t('circular.action_print', 'Print Notice')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition"
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
            <div className="flex items-center justify-center gap-2">
              <BrandLogo size="md" />
            </div>
            <h1 className="text-lg sm:text-2xl font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 print:text-slate-950 font-serif">
              AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
            </h1>
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-slate-700 dark:text-slate-300 print:text-slate-800">
              SHREE KHATRI SAMAJ CENTRAL PANCHAYAT
            </h2>
            <p className="text-xs sm:text-sm font-bold tracking-wider uppercase text-slate-600 dark:text-slate-400 print:text-slate-700">
              {circular.issuing_authority}
            </p>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 print:bg-slate-100 px-3.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 print:text-slate-900 print:border print:border-slate-300 mt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400 print:text-slate-900" />
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

          {/* Title & Subject */}
          <div className="space-y-2 pt-1 text-center sm:text-left">
            <h2
              id="circular-detail-title"
              className="text-lg sm:text-2xl font-bold font-serif text-slate-900 dark:text-slate-100 print:text-black leading-snug tracking-tight"
            >
              {circular.title}
            </h2>

            {circular.subject && (
              <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                SUBJECT: {circular.subject}
              </p>
            )}

            {circular.summary && (
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 print:text-slate-700 italic font-serif leading-relaxed">
                {circular.summary}
              </p>
            )}
          </div>

          {/* Method A: Uploaded PDF Banner with Direct Open/Download */}
          {circular.creation_method === 'PDF_UPLOAD' && circular.pdf_url && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 print:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-blue-900 dark:text-blue-200">
                    Official Document Attached
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    Certified with SINDHI KHATRI SAMAJ official letterhead & endorsement
                  </div>
                </div>
              </div>
              <a
                href={circular.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition shrink-0"
              >
                <span>View Certified PDF</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

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

          {/* Instructions Callout Box */}
          {circular.instructions && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 p-4 text-xs sm:text-sm text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Directives & Compliance Instructions:
              </div>
              <div className="whitespace-pre-wrap">{circular.instructions}</div>
            </div>
          )}

          {/* Signatory Stamp / Signature Block */}
          <div className="pt-6 border-t-2 border-slate-200 dark:border-slate-800 print:border-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 break-inside-avoid print:break-inside-avoid">
            <div className="border-2 border-dashed border-slate-400 dark:border-slate-600 print:border-slate-800 rounded-lg p-3 sm:p-4 text-[11px] sm:text-xs font-mono text-slate-600 dark:text-slate-400 print:text-slate-800 max-w-xs text-center print:bg-slate-50">
              <div className="font-bold tracking-widest text-slate-700 dark:text-slate-200 print:text-slate-900">
                ★ {circular.official_seal_text || 'SEAL OF AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT'} ★
              </div>
              <div className="text-[9px] text-slate-500 mt-1 uppercase tracking-wider">
                AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
              </div>
            </div>

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

          {/* Contact info footer */}
          {circular.contact_info && (
            <div className="text-xs text-slate-500 dark:text-slate-400 border-t pt-3 text-center sm:text-left">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Secretariat Contact: </span>
              <span>{circular.contact_info}</span>
            </div>
          )}

          {/* Printable Official Document Footer */}
          <div className="hidden print:block pt-4 border-t border-slate-300 text-[9pt] text-slate-600 text-center space-y-0.5">
            <div>
              Shree Khatri Samaj Central Panchayat • Official Circular Directive
            </div>
            <div>
              Ref: {circular.circular_number}
            </div>
            <div>
              Akhil Bharat Sindhi Brahmkhatri Panchayat (Sarvaniyat) — Official Directive Archive
            </div>
            <div>
              Certified Digitally via Community Roots Census & Lineage Platform
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
