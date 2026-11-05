/**
 * MobileVerificationNotice component (Phase 8 — Subtask 4B)
 *
 * Implements the explicit architectural boundary:
 * - Documents that SMS / phone OTP verification infrastructure is not currently configured.
 * - Confirms that invitations operate via secure email/shareable token redemption links.
 * - Honest representation: does NOT pretend SMS was sent or fake an OTP provider.
 */

import { ShieldAlert } from 'lucide-react'

export function MobileVerificationNotice({ className = '' }: { className?: string }) {
  return (
    <div
      role="note"
      aria-label="Mobile verification boundary notice"
      className={`rounded-lg border border-navy-200 bg-navy-50/60 p-4 text-xs text-navy-600 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-navy-500" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-semibold text-navy-800">
            Secure Link-Based Invitation System
          </p>
          <p>
            Mobile OTP / SMS infrastructure is not configured. Invitations are securely issued and redeemed via cryptographically generated, single-use token links.
          </p>
        </div>
      </div>
    </div>
  )
}
