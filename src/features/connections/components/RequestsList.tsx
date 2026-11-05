/**
 * RequestsList — Component rendering incoming and outgoing pending connection requests
 * (Phase 7 Subtask 2)
 */

import { Clock, Send, AlertCircle, RefreshCw } from 'lucide-react'
import type { ConnectionWithProfile } from '../types'
import { ConnectionCard } from './ConnectionCard'
import { Button } from '@/components/forms/Button'

export interface RequestsListProps {
  receivedRequests: ConnectionWithProfile[]
  sentRequests: ConnectionWithProfile[]
  isLoading: boolean
  error: Error | null
  onAccept: (connection: ConnectionWithProfile) => void
  onReject: (connection: ConnectionWithProfile) => void
  onBlock: (connection: ConnectionWithProfile) => void
  onCancel: (connection: ConnectionWithProfile) => void
  onRetry?: () => void
  isPendingAction?: boolean
}

export function RequestsList({
  receivedRequests,
  sentRequests,
  isLoading,
  error,
  onAccept,
  onReject,
  onBlock,
  onCancel,
  onRetry,
  isPendingAction = false,
}: RequestsListProps) {
  // 1. Loading State
  if (isLoading) {
    return (
      <div data-testid="requests-list-loading" className="space-y-6">
        <div className="space-y-3">
          <div className="h-5 w-40 rounded bg-navy-100 animate-pulse" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-navy-200 bg-white p-5 shadow-sm space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-navy-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-navy-100" />
                    <div className="h-3 w-1/3 rounded bg-navy-100" />
                  </div>
                </div>
                <div className="h-8 w-28 rounded bg-navy-100 pt-2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 2. Error State
  if (error) {
    return (
      <div
        data-testid="requests-list-error"
        className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6 text-center"
      >
        <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
        <h3 className="text-sm font-semibold text-red-800">Failed to load connection requests</h3>
        <p className="mt-1 text-xs text-red-600 max-w-sm">{error.message}</p>
        {onRetry && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
            className="mt-4 border-red-200 text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Try Again
          </Button>
        )}
      </div>
    )
  }

  const hasReceived = receivedRequests.length > 0
  const hasSent = sentRequests.length > 0

  // 3. Empty State (Both zero)
  if (!hasReceived && !hasSent) {
    return (
      <div
        data-testid="requests-list-empty"
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-navy-200 bg-white p-12 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-500 mb-3">
          <Clock className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-navy-900">No pending requests</h3>
        <p className="mt-1 text-sm text-navy-500 max-w-sm">
          You don't have any incoming invitations or sent connection requests awaiting a response.
        </p>
      </div>
    )
  }

  // 4. Populated State
  return (
    <div data-testid="requests-list-content" className="space-y-8">
      {/* Received Requests Section */}
      {hasReceived && (
        <section aria-labelledby="received-requests-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="received-requests-heading"
              className="text-base font-semibold text-navy-900 flex items-center gap-2"
            >
              <Clock className="h-4 w-4 text-blue-600" />
              Received Requests ({receivedRequests.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {receivedRequests.map((conn) => (
              <ConnectionCard
                key={conn.id}
                connection={conn}
                onAccept={onAccept}
                onReject={onReject}
                onBlock={onBlock}
                isPendingAction={isPendingAction}
              />
            ))}
          </div>
        </section>
      )}

      {/* Sent Requests Section */}
      {hasSent && (
        <section aria-labelledby="sent-requests-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="sent-requests-heading"
              className="text-base font-semibold text-navy-900 flex items-center gap-2"
            >
              <Send className="h-4 w-4 text-amber-600" />
              Sent Requests ({sentRequests.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sentRequests.map((conn) => (
              <ConnectionCard
                key={conn.id}
                connection={conn}
                onCancel={onCancel}
                isPendingAction={isPendingAction}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
