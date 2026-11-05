/**
 * ConnectionsList — Component rendering accepted social connections
 * (Phase 7 Subtask 2)
 */

import { Users, AlertCircle, RefreshCw } from 'lucide-react'
import type { ConnectionWithProfile } from '../types'
import { ConnectionCard } from './ConnectionCard'
import { Button } from '@/components/forms/Button'

export interface ConnectionsListProps {
  connections: ConnectionWithProfile[]
  isLoading: boolean
  error: Error | null
  onRemove: (connection: ConnectionWithProfile) => void
  onBlock: (connection: ConnectionWithProfile) => void
  onRetry?: () => void
  isPendingAction?: boolean
}

export function ConnectionsList({
  connections,
  isLoading,
  error,
  onRemove,
  onBlock,
  onRetry,
  isPendingAction = false,
}: ConnectionsListProps) {
  // 1. Loading State
  if (isLoading) {
    return (
      <div
        data-testid="connections-list-loading"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-navy-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-navy-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-navy-100" />
                <div className="h-3 w-1/3 rounded bg-navy-100" />
              </div>
            </div>
            <div className="mt-4 border-t border-navy-100 pt-3">
              <div className="h-8 w-20 rounded bg-navy-100" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 2. Error State
  if (error) {
    return (
      <div
        data-testid="connections-list-error"
        className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6 text-center"
      >
        <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
        <h3 className="text-sm font-semibold text-red-800">Failed to load connections</h3>
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

  // 3. Empty State
  if (connections.length === 0) {
    return (
      <div
        data-testid="connections-list-empty"
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-navy-200 bg-white p-12 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-3">
          <Users className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-navy-900">No connections yet</h3>
        <p className="mt-1 text-sm text-navy-500 max-w-md">
          Connect with fellow community members using their user account ID to stay in touch
          and share verified family relationships.
        </p>
      </div>
    )
  }

  // 4. Populated State
  return (
    <div
      data-testid="connections-list-grid"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {connections.map((conn) => (
        <ConnectionCard
          key={conn.id}
          connection={conn}
          onRemove={onRemove}
          onBlock={onBlock}
          isPendingAction={isPendingAction}
        />
      ))}
    </div>
  )
}
