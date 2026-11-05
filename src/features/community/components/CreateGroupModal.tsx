/**
 * Create Group Modal Component (Phase 10 — Subtask 1)
 */

import React, { useState, useEffect } from 'react'
import { X, Loader2, Info } from 'lucide-react'
import {
  createGroupSchema,
  generateSlugFromName,
  GROUP_TYPES,
} from '../schemas/group.schemas'
import type { CreateGroupInput, GroupType } from '../types'

interface CreateGroupModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: CreateGroupInput) => Promise<void>
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false)
  const [groupType, setGroupType] = useState<GroupType>('OTHER')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)

  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Auto-generate slug when name changes unless manually edited
  useEffect(() => {
    if (!isSlugManuallyEdited && name) {
      setSlug(generateSlugFromName(name))
    }
  }, [name, isSlugManuallyEdited])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
    if (fieldErrors.name) {
      setFieldErrors((prev) => ({ ...prev, name: '' }))
    }
  }

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
    setIsSlugManuallyEdited(true)
    if (fieldErrors.slug) {
      setFieldErrors((prev) => ({ ...prev, slug: '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFieldErrors({})

    const payload: CreateGroupInput = {
      name: name.trim(),
      slug: slug.trim(),
      group_type: groupType,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      is_private: isPrivate,
    }

    const validation = createGroupSchema.safeParse(payload)
    if (!validation.success) {
      const errMap: Record<string, string> = {}
      validation.error.errors.forEach((err) => {
        const field = err.path[0]?.toString() || 'form'
        errMap[field] = err.message
      })
      setFieldErrors(errMap)
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(payload)
      // Reset and close
      setName('')
      setSlug('')
      setIsSlugManuallyEdited(false)
      setGroupType('OTHER')
      setLocation('')
      setDescription('')
      setIsPrivate(false)
      onClose()
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to create group.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-group-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl transition-all max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2
            id="create-group-title"
            className="text-lg font-semibold text-slate-900"
          >
            Create Community Group
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notice */}
        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-blue-50 p-3 text-xs text-blue-700 border border-blue-200">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            You will become the initial <strong>Group Administrator</strong>.
            Community groups are separate from family census records.
          </div>
        </div>

        {formError && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-600 border border-red-200">
            {formError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Group Name */}
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Group Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="e.g., Kutch Khatri Youth Wing"
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                fieldErrors.name
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500'
              }`}
              required
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs font-medium text-slate-700">
              URL Slug <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 flex rounded-lg border border-slate-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <span className="inline-flex items-center px-3 text-xs text-slate-400 bg-slate-50 border-r border-slate-200 rounded-l-lg">
                /groups/
              </span>
              <input
                type="text"
                value={slug}
                onChange={handleSlugChange}
                placeholder="kutch-khatri-youth-wing"
                className="w-full rounded-r-lg px-3 py-2 text-sm focus:outline-none"
                required
              />
            </div>
            {fieldErrors.slug && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.slug}</p>
            )}
          </div>

          {/* Group Type */}
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Group Type <span className="text-red-500">*</span>
            </label>
            <select
              value={groupType}
              onChange={(e) => setGroupType(e.target.value as GroupType)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {GROUP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'VILLAGE_ASSOCIATION'
                    ? 'Village / Watan'
                    : t === 'COMMITTEE'
                    ? 'Committee'
                    : t === 'CULTURAL'
                    ? 'Cultural'
                    : t === 'YOUTH'
                    ? 'Youth Wing'
                    : 'Other Community Group'}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Location / Region
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Mumbai, Maharashtra"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {fieldErrors.location && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.location}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Purpose, activities, and background of this community group..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {fieldErrors.description && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.description}
              </p>
            )}
          </div>

          {/* Private Group Toggle */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="is_private"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="is_private" className="text-xs text-slate-700">
              <strong>Private Group</strong> (Hidden from public catalog; requires invitation to join)
            </label>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
