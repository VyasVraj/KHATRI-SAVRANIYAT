/**
 * ClaimFamilyModal Component
 * Modal dialog for requesting management access to an existing complete family.
 *
 * Implements Feature 2:
 * - Read-only Family details (Name, ID, Head of Family).
 * - User's name and registered email.
 * - User's relationship to the family.
 * - Reason for claiming.
 * - Supporting documentation/reference notes.
 * - Required notice: "By submitting this request, you are asking for permission to manage this existing family record. The family will not be transferred or modified until an authorized reviewer approves your request."
 */

import React, { useState, useEffect } from 'react'
import { X, ShieldAlert, AlertCircle, CheckCircle2, Loader2, Home } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { submitFamilyClaim } from '../services/family-claims.service'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'

export interface ClaimFamilyModalProps {
  isOpen: boolean
  onClose: () => void
  family: {
    id: string
    family_name: string
    city?: string | null
    head_name?: string | null
  } | null
  onSuccess?: () => void
}

export const ClaimFamilyModal: React.FC<ClaimFamilyModalProps> = ({
  isOpen,
  onClose,
  family,
  onSuccess,
}) => {
  const { user, profile, isAuthenticated } = useAuthContext()

  const [relationship, setRelationship] = useState('')
  const [reason, setReason] = useState('')
  const [supportingDocs, setSupportingDocs] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setRelationship('')
      setReason('')
      setSupportingDocs('')
      setErrorMessage(null)
      setSuccessMessage(null)
      setIsSubmitting(false)
    }
  }, [isOpen])

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, isSubmitting])

  if (!isOpen || !family) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!isAuthenticated || !user) {
      setErrorMessage('You must be logged in to submit a family claim.')
      return
    }

    if (!relationship.trim()) {
      setErrorMessage('Please state your relationship to this family.')
      return
    }

    if (!reason.trim()) {
      setErrorMessage('Please provide the reason for claiming this family.')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await submitFamilyClaim({
        family_id: family.id,
        requested_relationship: relationship.trim(),
        reason: reason.trim(),
        supporting_document_reference: supportingDocs.trim() || undefined,
      })

      if (res.error) {
        setErrorMessage(res.error.message)
        setIsSubmitting(false)
        return
      }

      setSuccessMessage(res.data?.message || 'Family claim submitted successfully.')
      setIsSubmitting(false)
      if (onSuccess) onSuccess()
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit claim.')
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-family-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (!isSubmitting) onClose()
      }}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-navy-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-navy-900 via-navy-950 to-brand-950 p-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/30 text-brand-300 border border-brand-400/30">
              <Home className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-300">
              Family Census Management
            </span>
          </div>
          <h2 id="claim-family-title" className="text-xl font-bold text-white tracking-tight">
            Claim Family Management
          </h2>
          <p className="text-xs text-navy-200 mt-1">
            Request authorization to manage this existing family record.
          </p>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Family Read-only Summary */}
          <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-4 space-y-2 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-slate-500 font-medium">Family Name</span>
                <div className="text-sm font-bold text-navy-900 mt-0.5">{family.family_name}</div>
              </div>
              <div className="text-right">
                <span className="text-slate-500 font-medium">Family ID</span>
                <div className="font-mono text-slate-700 text-[11px] mt-0.5 truncate max-w-[140px]">
                  {family.id}
                </div>
              </div>
            </div>
            {family.head_name && (
              <div className="pt-2 border-t border-navy-100/60 flex justify-between">
                <span className="text-slate-500">Current Family Head:</span>
                <span className="font-semibold text-navy-900">{family.head_name}</span>
              </div>
            )}
            {family.city && (
              <div className="flex justify-between">
                <span className="text-slate-500">Location:</span>
                <span className="font-medium text-navy-800">{family.city}</span>
              </div>
            )}
          </div>

          {/* Requester Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div>
              <span className="text-slate-500">Requester Name:</span>
              <div className="font-semibold text-slate-900 mt-0.5">
                {profile?.display_name || user?.email?.split('@')[0] || 'Authenticated User'}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Registered Email:</span>
              <div className="font-mono text-slate-700 text-[11px] mt-0.5 truncate">
                {user?.email || '—'}
              </div>
            </div>
          </div>

          {/* Relationship to family */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Your Relationship with this Family <span className="text-rose-500">*</span>
            </label>
            <Input
              type="text"
              required
              placeholder="e.g. Eldest Son / Family Member / Direct Descendant"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Reason for claiming */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Reason for Claiming Management <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Please explain why you are requesting management access to this family unit..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Supporting documentation */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Supporting Information or References (Optional)
            </label>
            <Input
              type="text"
              placeholder="e.g. Aadhaar reference, Ration card number, or elder reference"
              value={supportingDocs}
              onChange={(e) => setSupportingDocs(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Mandatory Governance Notice */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0" />
              <span>Important Notice</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              &ldquo;By submitting this request, you are asking for permission to manage this existing family record. The family will not be transferred or modified until an authorized reviewer approves your request.&rdquo;
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !relationship.trim() || !reason.trim()}
              className="bg-brand-600 hover:bg-brand-700 text-white font-bold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Submitting Request...
                </>
              ) : (
                'Submit Claim Request'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
