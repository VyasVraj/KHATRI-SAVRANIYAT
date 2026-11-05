/**
 * PersonConnectionSection — Displays social connection status & actions on PersonDetail
 * (Phase 7 Subtask 4)
 *
 * PRIVACY & ARCHITECTURE INVARIANTS:
 * - PERSON != USER:
 *   If targetUserId is null (unlinked census individual), this component returns null.
 *   Census individuals without user accounts CANNOT receive connection requests.
 * - If targetUserId === callerUserId, renders a self-link confirmation without social actions.
 * - Displays real-time connection status (Not connected, Pending Sent, Pending Received, Connected, Blocked).
 * - Displays mutual connections count.
 */

import { useState } from 'react'
import { Users, UserPlus, Check, Clock, Ban, UserMinus, ShieldCheck } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useConnectionWithUser } from '../hooks/useConnectionWithUser'
import { useMutualConnections } from '../hooks/useMutualConnections'
import { useConnectionMutations } from '../hooks/useConnectionMutations'
import { Button } from '@/components/forms/Button'

export interface PersonConnectionSectionProps {
  targetUserId: string | null | undefined
  personName?: string
}

export function PersonConnectionSection({
  targetUserId,
  personName = 'this member',
}: PersonConnectionSectionProps) {
  const { user, isAuthenticated } = useAuthContext()
  const callerUserId = user?.id ?? ''

  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    data: connection,
    isLoading: isConnectionLoading,
    error: connectionError,
  } = useConnectionWithUser(targetUserId)

  const {
    data: mutualData,
    isLoading: isMutualLoading,
  } = useMutualConnections(targetUserId)

  const { sendRequest, acceptRequest, rejectRequest, remove } = useConnectionMutations()

  // 1. Unlinked census person: zero social graph controls (strict PERSON != USER)
  if (!targetUserId) {
    return null
  }

  // 2. Unauthenticated viewer: handled by ProtectedRoute / parent page
  if (!isAuthenticated || !callerUserId) {
    return null
  }

  // 3. Self-view: Viewer is looking at their own linked person record
  if (targetUserId === callerUserId) {
    return (
      <div
        data-testid="person-connection-self"
        className="rounded-lg border border-brand-200 bg-brand-50/50 p-4 text-sm text-brand-800 flex items-center gap-2.5"
      >
        <ShieldCheck className="h-5 w-5 text-brand-600 shrink-0" aria-hidden="true" />
        <span>This census record is linked to your user account.</span>
      </div>
    )
  }

  // Action handlers
  async function handleSendRequest() {
    if (!targetUserId) return
    setActionError(null)
    try {
      await sendRequest.mutateAsync({ addressee_id: targetUserId })
    } catch (err) {
      setActionError((err as Error).message ?? 'Failed to send connection request')
    }
  }

  async function handleAccept() {
    if (!connection) return
    setActionError(null)
    try {
      await acceptRequest.mutateAsync(connection.id)
    } catch (err) {
      setActionError((err as Error).message ?? 'Failed to accept connection request')
    }
  }

  async function handleReject() {
    if (!connection) return
    setActionError(null)
    try {
      await rejectRequest.mutateAsync(connection.id)
    } catch (err) {
      setActionError((err as Error).message ?? 'Failed to decline request')
    }
  }

  async function handleDisconnect() {
    if (!connection) return
    setActionError(null)
    try {
      await remove.mutateAsync(connection.id)
      setConfirmDisconnect(false)
    } catch (err) {
      setActionError((err as Error).message ?? 'Failed to remove connection')
    }
  }

  const isMutating =
    sendRequest.isPending ||
    acceptRequest.isPending ||
    rejectRequest.isPending ||
    remove.isPending

  const mutualCount = mutualData?.mutual_count ?? 0

  return (
    <div
      data-testid="person-connection-section"
      className="rounded-lg border border-navy-200 bg-white p-5 shadow-sm space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Section title & mutual connections info */}
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand-600 shrink-0" aria-hidden="true" />
            <h3 className="text-base font-semibold text-navy-900">Community connection</h3>
          </div>

          {!isMutualLoading && mutualCount > 0 && (
            <p className="mt-1 text-xs text-navy-500 font-medium">
              {mutualCount} mutual connection{mutualCount > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Connection State & Interactive Actions */}
        <div className="flex items-center gap-2">
          {isConnectionLoading ? (
            <span className="text-xs text-navy-400">Loading connection…</span>
          ) : !connection ? (
            /* 1. NOT CONNECTED */
            <Button
              variant="primary"
              size="sm"
              onClick={handleSendRequest}
              isLoading={sendRequest.isPending}
              disabled={isMutating}
              aria-label={`Connect with ${personName}`}
            >
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Connect
            </Button>
          ) : connection.status === 'PENDING' && connection.requester_id === callerUserId ? (
            /* 2. PENDING (SENT BY CALLER) */
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 border border-amber-200">
                <Clock className="h-3 w-3" />
                Request sent
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDisconnect}
                isLoading={remove.isPending}
                disabled={isMutating}
                className="text-xs text-navy-600 hover:text-red-600"
                aria-label="Cancel connection request"
              >
                Cancel
              </Button>
            </div>
          ) : connection.status === 'PENDING' && connection.addressee_id === callerUserId ? (
            /* 3. PENDING (RECEIVED FROM TARGET) */
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-200">
                <Clock className="h-3 w-3" />
                Received request
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAccept}
                isLoading={acceptRequest.isPending}
                disabled={isMutating}
                aria-label="Accept connection request"
              >
                Accept
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReject}
                isLoading={rejectRequest.isPending}
                disabled={isMutating}
                aria-label="Decline connection request"
              >
                Decline
              </Button>
            </div>
          ) : connection.status === 'ACCEPTED' ? (
            /* 4. ACCEPTED / CONNECTED */
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 border border-green-200">
                <Check className="h-3.5 w-3.5" />
                Connected
              </span>
              {!confirmDisconnect ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmDisconnect(true)}
                  className="text-xs text-navy-500 hover:text-red-600"
                  aria-label="Remove connection"
                >
                  <UserMinus className="h-3.5 w-3.5 mr-1" />
                  Disconnect
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-navy-600">Disconnect?</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDisconnect(false)}
                    className="text-xs px-2 py-0.5"
                  >
                    No
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisconnect}
                    isLoading={remove.isPending}
                    disabled={isMutating}
                    className="text-xs px-2 py-0.5"
                  >
                    Yes
                  </Button>
                </div>
              )}
            </div>
          ) : connection.status === 'BLOCKED' ? (
            /* 5. BLOCKED */
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200">
              <Ban className="h-3.5 w-3.5" />
              Blocked
            </span>
          ) : null}
        </div>
      </div>

      {actionError && (
        <p role="alert" className="text-xs text-red-600">
          {actionError}
        </p>
      )}
      {connectionError && (
        <p role="alert" className="text-xs text-red-600">
          {connectionError.message}
        </p>
      )}
    </div>
  )
}
