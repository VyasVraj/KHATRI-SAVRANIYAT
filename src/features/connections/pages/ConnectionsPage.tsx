/**
 * ConnectionsPage — Main Connections & Social Graph Management Page
 * (Phase 7 Subtask 2)
 *
 * Primary entry point mounted at /connections (ProtectedRoute).
 * Provides tabbed navigation between Connected, Requests, and Blocked profiles.
 */

import { useState } from 'react'
import { Users, UserPlus, Clock, Ban, CheckCircle2 } from 'lucide-react'
import { useConnections } from '../hooks/useConnections'
import { usePendingRequests } from '../hooks/usePendingRequests'
import { useConnectionMutations } from '../hooks/useConnectionMutations'
import type { ConnectionWithProfile } from '../types'
import { ConnectionsList } from '../components/ConnectionsList'
import { RequestsList } from '../components/RequestsList'
import { SendConnectionModal } from '../components/SendConnectionModal'
import { RemoveConnectionDialog } from '../components/RemoveConnectionDialog'
import { BlockUserDialog } from '../components/BlockUserDialog'
import { Button } from '@/components/forms/Button'

type TabType = 'connected' | 'requests' | 'blocked'

export function ConnectionsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('connected')
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)

  // Target item for dialogs
  const [targetConnectionForRemove, setTargetConnectionForRemove] =
    useState<ConnectionWithProfile | null>(null)
  const [targetConnectionForBlock, setTargetConnectionForBlock] =
    useState<ConnectionWithProfile | null>(null)

  // Data queries
  const {
    data: acceptedConnections = [],
    isLoading: isLoadingAccepted,
    error: errorAccepted,
    refetch: refetchAccepted,
  } = useConnections('ACCEPTED')

  const {
    data: blockedConnections = [],
    isLoading: isLoadingBlocked,
    error: errorBlocked,
    refetch: refetchBlocked,
  } = useConnections('BLOCKED')

  const {
    receivedRequests,
    sentRequests,
    isLoading: isLoadingPending,
    error: errorPending,
    refetch: refetchPending,
  } = usePendingRequests()

  // Mutations
  const { acceptRequest, rejectRequest, remove, block } = useConnectionMutations()

  const pendingCount = receivedRequests.length + sentRequests.length
  const isAnyMutating =
    acceptRequest.isPending ||
    rejectRequest.isPending ||
    remove.isPending ||
    block.isPending

  // Action handlers
  async function handleAccept(conn: ConnectionWithProfile) {
    await acceptRequest.mutateAsync(conn.id)
  }

  async function handleReject(conn: ConnectionWithProfile) {
    await rejectRequest.mutateAsync(conn.id)
  }

  async function handleConfirmRemove(connectionId: string) {
    await remove.mutateAsync(connectionId)
  }

  async function handleConfirmBlock(targetUserId: string) {
    await block.mutateAsync(targetUserId)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="h-6 w-6 text-brand-600" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight text-navy-900">
              My Connections
            </h1>
          </div>
          <p className="mt-1 text-sm text-navy-600">
            Manage your community social network, pending invitations, and connected profiles.
          </p>
        </div>

        <div>
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsSendModalOpen(true)}
            aria-label="Send connection request"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Connect
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-navy-200">
        <nav
          className="-mb-px flex space-x-6 overflow-x-auto"
          aria-label="Connections Tabs"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'connected'}
            aria-controls="connected-panel"
            onClick={() => setActiveTab('connected')}
            className={[
              'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'connected'
                ? 'border-brand-600 text-brand-700 font-semibold'
                : 'border-transparent text-navy-500 hover:border-navy-300 hover:text-navy-700',
            ].join(' ')}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Connected</span>
            <span
              className={[
                'rounded-full px-2 py-0.5 text-xs',
                activeTab === 'connected'
                  ? 'bg-brand-100 text-brand-800'
                  : 'bg-navy-100 text-navy-600',
              ].join(' ')}
            >
              {acceptedConnections.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'requests'}
            aria-controls="requests-panel"
            onClick={() => setActiveTab('requests')}
            className={[
              'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'requests'
                ? 'border-brand-600 text-brand-700 font-semibold'
                : 'border-transparent text-navy-500 hover:border-navy-300 hover:text-navy-700',
            ].join(' ')}
          >
            <Clock className="h-4 w-4" />
            <span>Requests</span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'blocked'}
            aria-controls="blocked-panel"
            onClick={() => setActiveTab('blocked')}
            className={[
              'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'blocked'
                ? 'border-brand-600 text-brand-700 font-semibold'
                : 'border-transparent text-navy-500 hover:border-navy-300 hover:text-navy-700',
            ].join(' ')}
          >
            <Ban className="h-4 w-4" />
            <span>Blocked</span>
            {blockedConnections.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {blockedConnections.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Panels */}
      <div>
        {/* Connected Tab */}
        {activeTab === 'connected' && (
          <div id="connected-panel" role="tabpanel">
            <ConnectionsList
              connections={acceptedConnections}
              isLoading={isLoadingAccepted}
              error={errorAccepted}
              onRemove={(conn) => setTargetConnectionForRemove(conn)}
              onBlock={(conn) => setTargetConnectionForBlock(conn)}
              onRetry={refetchAccepted}
              isPendingAction={isAnyMutating}
            />
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div id="requests-panel" role="tabpanel">
            <RequestsList
              receivedRequests={receivedRequests}
              sentRequests={sentRequests}
              isLoading={isLoadingPending}
              error={errorPending}
              onAccept={handleAccept}
              onReject={handleReject}
              onBlock={(conn) => setTargetConnectionForBlock(conn)}
              onCancel={(conn) => setTargetConnectionForRemove(conn)}
              onRetry={refetchPending}
              isPendingAction={isAnyMutating}
            />
          </div>
        )}

        {/* Blocked Tab */}
        {activeTab === 'blocked' && (
          <div id="blocked-panel" role="tabpanel">
            <ConnectionsList
              connections={blockedConnections}
              isLoading={isLoadingBlocked}
              error={errorBlocked}
              onRemove={(conn) => setTargetConnectionForRemove(conn)}
              onBlock={() => {}}
              onRetry={refetchBlocked}
              isPendingAction={isAnyMutating}
            />
          </div>
        )}
      </div>

      {/* Send Connection Modal */}
      <SendConnectionModal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
      />

      {/* Remove Confirmation Dialog */}
      <RemoveConnectionDialog
        connection={targetConnectionForRemove}
        isOpen={Boolean(targetConnectionForRemove)}
        onClose={() => setTargetConnectionForRemove(null)}
        onConfirm={handleConfirmRemove}
      />

      {/* Block Confirmation Dialog */}
      <BlockUserDialog
        connection={targetConnectionForBlock}
        isOpen={Boolean(targetConnectionForBlock)}
        onClose={() => setTargetConnectionForBlock(null)}
        onConfirm={handleConfirmBlock}
      />
    </div>
  )
}
