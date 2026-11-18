/**
 * Edit Official Notice Modal
 *
 * Implements editing, unpublishing, PDF replacement, and document updates
 * for Admin and Super Admin.
 */

import React, { useState, useEffect } from 'react'
import {
  X,
  Upload,
  AlertCircle,
} from 'lucide-react'
import { BrandLogo } from '@/components/common/BrandLogo'
import {
  updateOfficialCircular,
  deleteOfficialCircular,
  type UpdateOfficialNoticeInput,
} from '../services/circulars.service'
import type { CircularItem, CircularCategory } from '../types'

interface EditOfficialNoticeModalProps {
  circular: CircularItem | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (message: string) => void
}

const COMMON_ISSUERS = [
  'Central Panchayat Secretariat',
  'Jan Ganna (Census) Central Committee',
  'Sarvaniyat & Samajik Samadhan Samiti',
  'Central Election Commission',
  'Education & Youth Empowerment Trust',
  'Medical & Health Relief Committee',
  'Khatri Youth & Sports Wing',
  'Senior Advisory Council (Panch)',
]

export const EditOfficialNoticeModal: React.FC<EditOfficialNoticeModalProps> = ({
  circular,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<CircularCategory>('GENERAL')
  const [issuingAuthority, setIssuingAuthority] = useState('Central Panchayat Secretariat')
  const [issueDate, setIssueDate] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [instructions, setInstructions] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [signatoryName, setSignatoryName] = useState('Central Secretariat')
  const [signatoryTitle, setSignatoryTitle] = useState('Authorized Signatory')
  const [status, setStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED')
  const [isPinned, setIsPinned] = useState(false)

  const [replacementPdf, setReplacementPdf] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (circular) {
      setTitle(circular.title || '')
      setCategory(circular.category || 'GENERAL')
      setIssuingAuthority(circular.issuing_authority || 'Central Panchayat Secretariat')
      setIssueDate(
        circular.issue_date
          ? new Date(circular.issue_date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]
      )
      setEffectiveDate(
        circular.effective_date
          ? new Date(circular.effective_date).toISOString().split('T')[0]
          : ''
      )
      setSubject(circular.subject || '')
      setContent(circular.content || '')
      setInstructions(circular.instructions || '')
      setContactInfo(circular.contact_info || '')
      setSignatoryName(circular.signatory_name || 'Central Secretariat')
      setSignatoryTitle(circular.signatory_title || 'Authorized Signatory')
      setStatus(circular.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED')
      setIsPinned(Boolean(circular.is_pinned))
      setReplacementPdf(null)
      setError(null)
    }
  }, [circular, isOpen])

  if (!isOpen || !circular) return null

  const handleReplacementFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setError('Invalid file format. Only PDF documents are supported.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10MB limit.')
      return
    }

    setReplacementPdf(file)
  }

  const handleSave = async (targetStatus?: 'PUBLISHED' | 'DRAFT') => {
    if (!title.trim()) {
      setError('Notice title is required.')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const finalStatus = targetStatus ?? status

      const payload: UpdateOfficialNoticeInput = {
        id: circular.id,
        title: title.trim(),
        circular_number: circular.circular_number,
        category,
        issuing_authority: issuingAuthority.trim(),
        issue_date: issueDate,
        effective_date: effectiveDate || null,
        subject: subject.trim() || null,
        content: content.trim(),
        instructions: instructions.trim() || null,
        contact_info: contactInfo.trim() || null,
        signatory_name: signatoryName.trim() || 'Central Secretariat',
        signatory_title: signatoryTitle.trim() || 'Authorized Signatory',
        creation_method: circular.creation_method || (replacementPdf ? 'PDF_UPLOAD' : 'ONLINE_EDITOR'),
        status: finalStatus,
        is_pinned: isPinned,
        original_pdf_file: replacementPdf,
        existing_pdf_url: circular.pdf_url,
        existing_original_pdf_url: circular.original_pdf_url,
      }

      const res = await updateOfficialCircular(payload)
      if (res.error) {
        setError(res.error.message)
        setIsSubmitting(false)
        return
      }

      onSuccess('Official notice updated and branded PDF regenerated successfully.')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notice.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete / archive this official circular?')) {
      return
    }

    try {
      setIsSubmitting(true)
      const res = await deleteOfficialCircular(circular.id)
      if (res.error) {
        setError(res.error.message)
        setIsSubmitting(false)
        return
      }
      onSuccess('Official circular archived successfully.')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notice.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-notice-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-900/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 backdrop-blur px-6 py-4">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <div>
              <h2 id="edit-notice-title" className="text-lg font-bold text-white flex items-center gap-2">
                <span>Edit Official Circular: {circular.circular_number}</span>
                <span className="rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 px-2 py-0.5 text-xs font-semibold">
                  Admin
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Update document details, replace PDF, or manage publication lifecycle
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Body Form */}
        <div className="p-6 space-y-5">
          {/* Method A PDF Replacement if applicable */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Document File & Replacement
              </span>
              <span className="text-xs text-slate-400">
                Method: {circular.creation_method === 'PDF_UPLOAD' ? 'Uploaded PDF' : 'Online Document'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="edit-pdf-replace"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer transition"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Replace PDF Document</span>
              </label>
              <input
                type="file"
                id="edit-pdf-replace"
                accept="application/pdf"
                onChange={handleReplacementFileChange}
                className="hidden"
              />
              {replacementPdf ? (
                <span className="text-xs text-emerald-400 font-medium">
                  New file selected: {replacementPdf.name} ({(replacementPdf.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              ) : circular.pdf_url ? (
                <span className="text-xs text-slate-400">
                  Current branded PDF is active
                </span>
              ) : null}
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CircularCategory)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="GENERAL">General Notice</option>
                <option value="CENSUS">Census & Lineage</option>
                <option value="GOVERNANCE">Governance & Elections</option>
                <option value="WELFARE">Social Welfare & Arbitration</option>
                <option value="URGENT">Urgent Alert</option>
                <option value="ELECTION">Election Commission</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Issuing Authority
              </label>
              <input
                type="text"
                list="edit-issuing-authorities"
                value={issuingAuthority}
                onChange={(e) => setIssuingAuthority(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
              <datalist id="edit-issuing-authorities">
                {COMMON_ISSUERS.map((iss) => (
                  <option key={iss} value={iss} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Publication Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'PUBLISHED' | 'DRAFT')}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="PUBLISHED">Published (Visible to all community members)</option>
                <option value="DRAFT">Draft / Unpublished (Admin only)</option>
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <span className="text-xs font-semibold text-slate-200">
                  Pin to top of Circulars board
                </span>
              </label>
            </div>
          </div>

          {/* Content text */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Notice Content / Summary
            </label>
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 p-4 text-sm text-white focus:border-blue-500 focus:outline-none font-serif leading-relaxed"
            />
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Important Instructions (Optional)
            </label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full rounded-xl border border-amber-600/40 bg-amber-950/20 px-4 py-2 text-sm text-amber-200 focus:border-amber-500 focus:outline-none resize-none"
            />
          </div>

          {/* Signatory Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Signatory Name
              </label>
              <input
                type="text"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Signatory Designation
              </label>
              <input
                type="text"
                value={signatoryTitle}
                onChange={(e) => setSignatoryTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between border-t border-slate-800 bg-slate-900/95 backdrop-blur px-6 py-4 gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSubmitting}
            className="rounded-xl border border-red-800/60 bg-red-950/30 px-4 py-2.5 text-xs sm:text-sm font-semibold text-red-300 hover:bg-red-900/40 transition disabled:opacity-50"
          >
            Archive / Delete Notice
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
            >
              Cancel
            </button>

            {status === 'PUBLISHED' ? (
              <button
                type="button"
                onClick={() => handleSave('DRAFT')}
                disabled={isSubmitting}
                className="rounded-xl border border-amber-600/60 bg-amber-950/40 px-4 py-2.5 text-xs sm:text-sm font-semibold text-amber-300 hover:bg-amber-900/40 transition disabled:opacity-50"
              >
                Unpublish (Draft)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSave('PUBLISHED')}
                disabled={isSubmitting}
                className="rounded-xl border border-emerald-600/60 bg-emerald-950/40 px-4 py-2.5 text-xs sm:text-sm font-semibold text-emerald-300 hover:bg-emerald-900/40 transition disabled:opacity-50"
              >
                Publish Notice
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md hover:bg-blue-500 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save & Update PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
