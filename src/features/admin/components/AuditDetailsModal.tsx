/**
 * AuditDetailsModal — Detailed human-readable modal for audit log events
 *
 * Phase 13 — Subtask 3: User Administration & Audit Viewer
 *
 * Features:
 * - Formatted actor and target entity displays
 * - Structured change comparison (old vs new values) instead of raw JSON dump
 * - Contextual metadata display (reasons, action subtypes, timestamps)
 * - Accessible keyboard navigation (Escape to close) and focus visible states
 */

import { useEffect, useRef } from 'react'
import {
  Calendar,
  User,
  Target,
  ArrowRight,
  Info,
  X,
} from 'lucide-react'
import type { AdminAuditLogItem } from '../types'
import { AUDIT_ACTION_CONFIG } from '../constants'

export interface AuditDetailsModalProps {
  log: AdminAuditLogItem | null
  isOpen: boolean
  onClose: () => void
}

export function AuditDetailsModal({
  log,
  isOpen,
  onClose,
}: AuditDetailsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !log) {
    return null
  }

  const actionMeta = AUDIT_ACTION_CONFIG[log.action] ?? {
    label: log.action,
    category: 'ADMIN',
    badgeClasses: 'bg-navy-100 text-navy-800 border-navy-200',
  }

  const formattedDate = new Date(log.created_at).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  // Extract keys present in either old_data or new_data for comparison
  const changeKeys = Array.from(
    new Set([
      ...Object.keys(log.old_data ?? {}),
      ...Object.keys(log.new_data ?? {}),
    ])
  )

  const metadataEntries = Object.entries(log.metadata ?? {})

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      aria-describedby="audit-modal-description"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-navy-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        ref={dialogRef}
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-navy-200 bg-white p-6 shadow-2xl transition-all"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2
              id="audit-modal-title"
              className="text-lg font-bold text-navy-900"
            >
              Audit Event Details
            </h2>
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${actionMeta.badgeClasses}`}
            >
              {actionMeta.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div id="audit-modal-description" className="sr-only">
          Detailed breakdown of audit event {log.action} occurred at {formattedDate}.
        </div>

        {/* Overview Grid */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Timestamp */}
          <div className="flex items-start gap-2.5 rounded-lg border border-navy-100 bg-navy-50/50 p-3">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" aria-hidden="true" />
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-navy-500">
                Timestamp
              </span>
              <span className="block text-xs font-medium text-navy-900">
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Actor */}
          <div className="flex items-start gap-2.5 rounded-lg border border-navy-100 bg-navy-50/50 p-3">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" aria-hidden="true" />
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-navy-500">
                Actor
              </span>
              <span className="block text-xs font-medium text-navy-900">
                {log.actor_name || log.actor_email || 'System Automated'}
              </span>
              {log.actor_email && log.actor_name && (
                <span className="block text-[11px] text-navy-500">
                  {log.actor_email}
                </span>
              )}
            </div>
          </div>

          {/* Target */}
          <div className="flex items-start gap-2.5 rounded-lg border border-navy-100 bg-navy-50/50 p-3 sm:col-span-2">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-navy-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-navy-500">
                Target Entity
              </span>
              <div className="flex flex-wrap items-center gap-2 text-xs text-navy-900">
                <span className="font-semibold text-brand-700">
                  {log.target_type ?? 'N/A'}
                </span>
                {log.target_id && (
                  <code className="rounded bg-navy-100 px-1.5 py-0.5 text-[11px] font-mono text-navy-700">
                    {log.target_id}
                  </code>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Changes: Old vs New Comparison */}
        {changeKeys.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-navy-700">
              State Changes
            </h3>
            <div className="mt-2 divide-y divide-navy-100 rounded-lg border border-navy-200">
              {changeKeys.map((key) => {
                const oldVal = log.old_data ? log.old_data[key] : undefined
                const newVal = log.new_data ? log.new_data[key] : undefined

                return (
                  <div key={key} className="p-3 text-xs">
                    <div className="font-semibold capitalize text-navy-800">
                      {key.replace(/_/g, ' ')}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded bg-rose-50 px-2 py-0.5 font-mono text-rose-800 border border-rose-200">
                        {oldVal !== undefined ? JSON.stringify(oldVal) : 'none'}
                      </span>
                      <ArrowRight className="h-3 w-3 text-navy-400" aria-hidden="true" />
                      <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-emerald-800 border border-emerald-200">
                        {newVal !== undefined ? JSON.stringify(newVal) : 'none'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Metadata Details */}
        {metadataEntries.length > 0 && (
          <div className="mt-5">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-navy-700">
              <Info className="h-3.5 w-3.5 text-navy-400" aria-hidden="true" />
              Event Metadata
            </h3>
            <div className="mt-2 rounded-lg border border-navy-200 bg-navy-50/50 p-3 text-xs">
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {metadataEntries.map(([key, val]) => (
                  <div key={key}>
                    <dt className="text-[11px] font-semibold text-navy-500 uppercase">
                      {key.replace(/_/g, ' ')}
                    </dt>
                    <dd className="font-medium text-navy-900 break-words">
                      {typeof val === 'object' && val !== null
                        ? JSON.stringify(val)
                        : String(val)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex justify-end border-t border-navy-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
