/**
 * Issue Official Notice Modal
 *
 * Implements two methods of publishing official notices & circulars:
 * - Method A: Upload PDF Notice / Circular (auto letterhead + cover sheet)
 * - Method B: Create Notice Online (rich document editor with live letterhead preview)
 *
 * Role verification: Strictly ADMIN and SUPER_ADMIN
 */

import React, { useState } from 'react'
import {
  X,
  Upload,
  FileText,
  Eye,
  CheckCircle,
  AlertCircle,
  User,
  ShieldCheck,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react'
import { BrandLogo } from '@/components/common/BrandLogo'
import {
  publishOfficialCircular,
  type PublishOfficialNoticeInput,
} from '../services/circulars.service'
import type { CircularCategory } from '../types'

interface IssueOfficialNoticeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  userManagedGroups?: Array<{ id: string; name: string }>
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

export const IssueOfficialNoticeModal: React.FC<IssueOfficialNoticeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  userManagedGroups = [],
}) => {
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'ONLINE'>('UPLOAD')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shared / Method A & B state
  const [title, setTitle] = useState('')
  const [circularNumber, setCircularNumber] = useState('')
  const [category, setCategory] = useState<CircularCategory>('GENERAL')
  const [issuingAuthority, setIssuingAuthority] = useState('Central Panchayat Secretariat')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [effectiveDate, setEffectiveDate] = useState('')
  const [description, setDescription] = useState('')
  const [destinationGroupId, setDestinationGroupId] = useState<string>('GLOBAL')
  const [signatoryName, setSignatoryName] = useState('Central Secretariat')
  const [signatoryTitle, setSignatoryTitle] = useState('Authorized Signatory')

  // Method A state (Uploaded PDF)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Method B state (Online Editor)
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [instructions, setInstructions] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left')

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setError('Invalid file format. Only PDF documents are supported.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10MB limit. Please upload a smaller PDF.')
      return
    }

    setPdfFile(file)
    if (!title) {
      // Auto-populate title from filename without extension
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ')
      setTitle(baseName.charAt(0).toUpperCase() + baseName.slice(1))
    }
  }

  const applyFormatting = (tag: string) => {
    const textarea = document.getElementById('online-notice-textarea') as HTMLTextAreaElement
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = content.substring(start, end)
    let replacement = ''

    switch (tag) {
      case 'bold':
        replacement = `**${selected || 'bold text'}**`
        break
      case 'italic':
        replacement = `*${selected || 'italic text'}*`
        break
      case 'underline':
        replacement = `__${selected || 'underlined text'}__`
        break
      case 'heading':
        replacement = `\n# ${selected || 'Section Heading'}\n`
        break
      case 'bullet':
        replacement = `\n• ${selected || 'List item'}`
        break
      case 'number':
        replacement = `\n1. ${selected || 'Numbered item'}`
        break
      default:
        return
    }

    const updated = content.substring(0, start) + replacement + content.substring(end)
    setContent(updated)
  }

  const handleSubmit = async (status: 'PUBLISHED' | 'DRAFT') => {
    setError(null)

    if (!title.trim()) {
      setError('Notice title is required.')
      return
    }

    if (activeTab === 'UPLOAD' && !pdfFile) {
      setError('Please select a PDF document to upload.')
      return
    }

    if (activeTab === 'ONLINE' && !content.trim()) {
      setError('Notice content is required.')
      return
    }

    try {
      setIsSubmitting(true)
      setUploadProgress(25)

      const payload: PublishOfficialNoticeInput = {
        title: title.trim(),
        circular_number: circularNumber.trim() || undefined,
        category,
        issuing_authority: issuingAuthority.trim(),
        issue_date: issueDate,
        effective_date: effectiveDate || null,
        subject: subject.trim() || null,
        content: activeTab === 'UPLOAD' ? (description.trim() || title.trim()) : content.trim(),
        instructions: instructions.trim() || null,
        contact_info: contactInfo.trim() || null,
        signatory_name: signatoryName.trim() || 'Central Secretariat',
        signatory_title: signatoryTitle.trim() || 'Authorized Signatory',
        creation_method: activeTab === 'UPLOAD' ? 'PDF_UPLOAD' : 'ONLINE_EDITOR',
        status,
        group_id: destinationGroupId === 'GLOBAL' ? null : destinationGroupId,
        original_pdf_file: activeTab === 'UPLOAD' ? pdfFile : null,
      }

      setUploadProgress(60)
      const res = await publishOfficialCircular(payload)
      setUploadProgress(100)

      if (res.error) {
        setError(res.error.message)
        setIsSubmitting(false)
        return
      }

      onSuccess(
        status === 'PUBLISHED'
          ? 'Official notice published successfully with Khatri Sarvaniyat letterhead.'
          : 'Official notice saved as draft.'
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish notice.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-notice-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-900/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 backdrop-blur px-6 py-4">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <div>
              <h2 id="issue-notice-title" className="text-lg font-bold text-white flex items-center gap-2">
                <span>Issue Official Notice & Circular</span>
                <span className="rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 px-2 py-0.5 text-xs font-semibold">
                  Admin Only
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Akhil Bharat Sindhi Brahmkhatri Panchayat (Sarvaniyat) Official Directorate
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

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('UPLOAD')
              setIsPreviewOpen(false)
            }}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === 'UPLOAD'
                ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="h-4 w-4" />
            <span>Upload PDF Notice / Circular</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('ONLINE')
              setIsPreviewOpen(false)
            }}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === 'ONLINE'
                ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Create Notice Online</span>
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
          {/* Method A: Upload PDF Section */}
          {activeTab === 'UPLOAD' && (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-950/50 p-6 text-center transition">
                <input
                  type="file"
                  id="pdf-upload-input"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="pdf-upload-input"
                  className="flex flex-col items-center justify-center cursor-pointer space-y-2"
                >
                  <div className="h-12 w-12 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {pdfFile ? pdfFile.name : 'Click to select or drag and drop official PDF'}
                  </div>
                  <p className="text-xs text-slate-400">
                    PDF document only (max 10MB). Branded letterhead will automatically be attached.
                  </p>
                  {pdfFile && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium pt-1">
                      <CheckCircle className="h-4 w-4" />
                      <span>Ready: {(pdfFile.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  )}
                </label>
              </div>
            </div>
          )}

          {/* Common Fields: Title, Ref Number, Category, Destination */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Notice / Circular Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Annual Census Verification & Family Seat Registration Drive"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Reference Number (Optional)
              </label>
              <input
                type="text"
                value={circularNumber}
                onChange={(e) => setCircularNumber(e.target.value)}
                placeholder="e.g. CIR-2026-007 (Auto-generated if empty)"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Announcement Category <span className="text-red-400">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CircularCategory)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none [color-scheme:dark] cursor-pointer"
              >
                <option value="GENERAL" className="bg-slate-800 text-white">General Notice</option>
                <option value="CENSUS" className="bg-slate-800 text-white">Census & Lineage</option>
                <option value="GOVERNANCE" className="bg-slate-800 text-white">Governance & Elections</option>
                <option value="WELFARE" className="bg-slate-800 text-white">Social Welfare & Arbitration</option>
                <option value="URGENT" className="bg-slate-800 text-white">Urgent Alert</option>
                <option value="ELECTION" className="bg-slate-800 text-white">Election Commission</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Issuing Authority <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                list="issuing-authorities-list"
                value={issuingAuthority}
                onChange={(e) => setIssuingAuthority(e.target.value)}
                placeholder="Select or enter issuing authority"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <datalist id="issuing-authorities-list">
                {COMMON_ISSUERS.map((issuer) => (
                  <option key={issuer} value={issuer} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Publication Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Effective Date (Optional)
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Publishing Destination
              </label>
              <select
                value={destinationGroupId}
                onChange={(e) => setDestinationGroupId(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none [color-scheme:dark] cursor-pointer"
              >
                <option value="GLOBAL" className="bg-slate-800 text-white">Community-Wide Notice (Global)</option>
                {userManagedGroups.map((g) => (
                  <option key={g.id} value={g.id} className="bg-slate-800 text-white">
                    {g.name} (Group)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Method A: Short Description */}
          {activeTab === 'UPLOAD' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Executive Summary / Description (Optional)
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of the official directive or resolutions contained in this document..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>
          )}

          {/* Method B: Online Rich Text Editor */}
          {activeTab === 'ONLINE' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Subject Line (Optional)
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. ANNUAL CENSUS VERIFICATION & FAMILY SEAT DIRECTIVE"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none uppercase"
                />
              </div>

              {/* Formatting Toolbar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Main Notice Content <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-1">
                    <button
                      type="button"
                      onClick={() => applyFormatting('bold')}
                      title="Bold"
                      className="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormatting('italic')}
                      title="Italic"
                      className="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormatting('underline')}
                      title="Underline"
                      className="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
                    >
                      <Underline className="h-3.5 w-3.5" />
                    </button>
                    <div className="h-3 w-px bg-slate-700 mx-1" />
                    <button
                      type="button"
                      onClick={() => applyFormatting('heading')}
                      title="Heading"
                      className="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
                    >
                      <Heading className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormatting('bullet')}
                      title="Bullet List"
                      className="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormatting('number')}
                      title="Numbered List"
                      className="rounded p-1 hover:bg-slate-700 text-slate-300 hover:text-white"
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                    </button>
                    <div className="h-3 w-px bg-slate-700 mx-1" />
                    <button
                      type="button"
                      onClick={() => setTextAlign('left')}
                      className={`rounded p-1 ${textAlign === 'left' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                    >
                      <AlignLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextAlign('center')}
                      className={`rounded p-1 ${textAlign === 'center' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                    >
                      <AlignCenter className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextAlign('right')}
                      className={`rounded p-1 ${textAlign === 'right' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                    >
                      <AlignRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <textarea
                  id="online-notice-textarea"
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write the full directive, preamble, paragraphs, and numbered guidelines here..."
                  className={`w-full rounded-xl border border-slate-700 bg-slate-800/80 p-4 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none font-serif leading-relaxed text-${textAlign}`}
                />
              </div>

              {/* Important Instructions Box */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Important Instructions / Compliance Callout (Optional)
                </label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Key deadlines, compliance conditions, or mandatory instructions..."
                  className="w-full rounded-xl border border-amber-600/40 bg-amber-950/20 px-4 py-2 text-sm text-amber-200 placeholder-amber-700/60 focus:border-amber-500 focus:outline-none resize-none"
                />
              </div>

              {/* Contact Info */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Secretariat Contact Information (Optional)
                </label>
                <input
                  type="text"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="e.g. Email: secretariat@khatrisarvaniyat.org | Helpline: +91 98765 43210"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Signatory Details (Shared) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Authorized Signatory Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={signatoryName}
                  onChange={(e) => setSignatoryName(e.target.value)}
                  placeholder="e.g. Pravinbhai Khetani"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Signatory Designation / Title
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={signatoryTitle}
                  onChange={(e) => setSignatoryTitle(e.target.value)}
                  placeholder="e.g. Executive Secretary, Central Panchayat"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Live Document Preview Panel */}
          {isPreviewOpen && (
            <div className="rounded-2xl border-2 border-blue-500/50 bg-white text-slate-900 p-6 sm:p-8 shadow-xl space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b pb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Document Preview (Official Letterhead)
                </span>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Hide Preview
                </button>
              </div>

              {/* Letterhead Header */}
              <div className="text-center space-y-2 border-b-2 border-slate-900 pb-5">
                <div className="flex justify-center">
                  <BrandLogo size="md" />
                </div>
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-900 font-serif">
                  AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
                </h1>
                <p className="text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-600">
                  {issuingAuthority}
                </p>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-bold text-blue-900">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                  <span>OFFICIAL COMMUNITY CIRCULAR & DIRECTIVE</span>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex justify-between text-xs font-semibold text-slate-600 border-b border-slate-200 pb-2">
                <span>REF NO: {circularNumber || 'CIR-2026-AUTO'}</span>
                <span>DATE: {new Date(issueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              </div>

              {/* Preview Title & Content */}
              <div className="space-y-3">
                <h2 className="text-lg font-bold font-serif text-slate-900 text-center">
                  {title || 'Untitled Official Notice'}
                </h2>

                {subject && (
                  <p className="text-xs font-bold text-slate-700 uppercase">
                    SUBJECT: {subject}
                  </p>
                )}

                <div className="text-xs sm:text-sm text-slate-800 whitespace-pre-wrap font-serif leading-relaxed">
                  {activeTab === 'UPLOAD'
                    ? (description || 'Official attached PDF document will follow this letterhead cover sheet upon publication.')
                    : (content || 'Notice content will appear here...')}
                </div>

                {instructions && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="font-bold mb-1">DIRECTIVES & INSTRUCTIONS:</div>
                    <div>{instructions}</div>
                  </div>
                )}
              </div>

              {/* Preview Signatory & Seal */}
              <div className="flex justify-between items-end pt-4 border-t border-slate-200">
                <div className="border border-blue-900 p-2 text-center rounded text-[10px] text-blue-950 font-bold">
                  <div>OFFICIAL SEAL</div>
                  <div className="font-normal text-[8px] text-slate-600">AKHIL BHARAT SINDHI BRAHMKHATRI</div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-slate-500 text-[11px]">Authorized Signatory:</div>
                  <div className="font-bold text-slate-900 font-serif">{signatoryName}</div>
                  <div className="text-slate-600">{signatoryTitle}</div>
                  <div className="font-semibold text-slate-800 text-[11px]">{issuingAuthority}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between border-t border-slate-800 bg-slate-900/95 backdrop-blur px-6 py-4 gap-3">
          <button
            type="button"
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <Eye className="h-4 w-4" />
            <span>{isPreviewOpen ? 'Hide Preview' : 'Preview Document'}</span>
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

            <button
              type="button"
              onClick={() => handleSubmit('DRAFT')}
              disabled={isSubmitting}
              className="rounded-xl border border-blue-600/60 bg-blue-950/40 px-4 py-2.5 text-xs sm:text-sm font-semibold text-blue-300 hover:bg-blue-900/40 transition disabled:opacity-50"
            >
              Save as Draft
            </button>

            <button
              type="button"
              onClick={() => handleSubmit('PUBLISHED')}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md hover:bg-blue-500 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Publishing ({uploadProgress}%)...</span>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Publish Official Notice</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
