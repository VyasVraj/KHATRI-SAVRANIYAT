/**
 * ConnectionCard — Card component displaying a single social connection item
 * (Phase 7 Subtask 2)
 *
 * PRIVACY & SECURITY INVARIANTS:
 * - Strictly displays ONLY privacy-safe profile fields: display_name and avatar_url.
 * - Sensitive contact information (phone, email) and system internals (id, timestamps)
 *   are NEVER rendered.
 * - Actions are conditioned on connection status and direction (is_requester).
 */

import { Check, X, Ban, UserMinus, Clock } from 'lucide-react'
import type { ConnectionWithProfile } from '../types'
import { Button } from '@/components/forms/Button'

export interface ConnectionCardProps {
  connection: ConnectionWithProfile
  onAccept?: (connection: ConnectionWithProfile) => void
  onReject?: (connection: ConnectionWithProfile) => void
  onRemove?: (connection: ConnectionWithProfile) => void
  onBlock?: (connection: ConnectionWithProfile) => void
  onCancel?: (connection: ConnectionWithProfile) => void
  isPendingAction?: boolean
}

function getInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function ConnectionCard({
  connection,
  onAccept,
  onReject,
  onRemove,
  onBlock,
  onCancel,
  isPendingAction = false,
}: ConnectionCardProps) {
  const { status, is_requester, other_user } = connection
  const displayName = other_user.display_name?.trim() || 'Community Member'
  const initials = getInitials(other_user.display_name)

  const isPendingReceived = status === 'PENDING' && !is_requester
  const isPendingSent = status === 'PENDING' && is_requester
  const isAccepted = status === 'ACCEPTED'
  const isBlocked = status === 'BLOCKED'

  return (
    <div
      data-testid="connection-card"
      className="flex flex-col justify-between rounded-xl border border-navy-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Profile Avatar & Name */}
        <div className="flex min-w-0 items-center gap-3">
          {other_user.avatar_url ? (
            <img
              src={other_user.avatar_url}
              alt={displayName}
              className="h-11 w-11 shrink-0 rounded-full object-cover border border-navy-100"
            />
          ) : (
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
              aria-hidden="true"
            >
              {initials}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-navy-900" title={displayName}>
              {displayName}
            </h3>

            {/* Status Badges */}
            <div className="mt-1 flex items-center gap-1.5">
              {isAccepted && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                  <Check className="h-3 w-3" />
                  Connected
                </span>
              )}
              {isPendingReceived && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                  <Clock className="h-3 w-3" />
                  Request Received
                </span>
              )}
              {isPendingSent && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                  <Clock className="h-3 w-3" />
                  Request Sent
                </span>
              )}
              {isBlocked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200">
                  <Ban className="h-3 w-3" />
                  Blocked
                </span>
              )}
              {status === 'REJECTED' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 border border-zinc-200">
                  Declined
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-navy-100 pt-3">
        {/* Accepted Connection Actions */}
        {isAccepted && (
          <>
            {onRemove && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRemove(connection)}
                disabled={isPendingAction}
                aria-label={`Remove connection with ${displayName}`}
                className="text-navy-700 hover:text-red-600 hover:border-red-200"
              >
                <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                Remove
              </Button>
            )}
            {onBlock && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onBlock(connection)}
                disabled={isPendingAction}
                aria-label={`Block ${displayName}`}
                className="text-navy-500 hover:text-red-600"
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" />
                Block
              </Button>
            )}
          </>
        )}

        {/* Received Pending Request Actions */}
        {isPendingReceived && (
          <>
            {onAccept && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onAccept(connection)}
                disabled={isPendingAction}
                aria-label={`Accept connection request from ${displayName}`}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Accept
              </Button>
            )}
            {onReject && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onReject(connection)}
                disabled={isPendingAction}
                aria-label={`Decline connection request from ${displayName}`}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Ignore
              </Button>
            )}
            {onBlock && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onBlock(connection)}
                disabled={isPendingAction}
                aria-label={`Block ${displayName}`}
                className="text-navy-500 hover:text-red-600 ml-auto"
              >
                <Ban className="mr-1 h-3.5 w-3.5" />
                Block
              </Button>
            )}
          </>
        )}

        {/* Sent Pending Request Actions */}
        {isPendingSent && onCancel && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onCancel(connection)}
            disabled={isPendingAction}
            aria-label={`Cancel connection request to ${displayName}`}
            className="text-navy-600 hover:text-red-600 hover:border-red-200"
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Cancel Request
          </Button>
        )}

        {/* Blocked Connection Notice */}
        {isBlocked && (
          <span className="text-xs text-navy-400 italic">
            This relationship is blocked.
          </span>
        )}
      </div>
    </div>
  )
}
