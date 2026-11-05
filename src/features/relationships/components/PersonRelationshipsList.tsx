/**
 * PersonRelationshipsList — Displays interpersonal relationships on the Person Detail page.
 *
 * Categorizes active relationships into:
 * - Parents
 * - Children
 * - Spouses
 * - Siblings
 *
 * PRIVACY & SECURITY RULES:
 * - Gate 1: anon/PUBLIC have zero privileges on public.relationships.
 *   This component renders and queries data ONLY for authenticated users.
 *   Unauthenticated sessions render nothing.
 * - Gate 2: RLS dual-endpoint visibility ensures only permitted relationship rows
 *   are returned. The UI never manufactures placeholder relationships for
 *   unauthorized or hidden edges.
 */

import { useState } from 'react'
import { HeartHandshake, Plus, AlertCircle } from 'lucide-react'
import { usePersonRelationships } from '../hooks/usePersonRelationships'
import { RelationshipCard } from './RelationshipCard'
import { AddRelationshipModal } from './AddRelationshipModal'
import { EditRelationshipModal } from './EditRelationshipModal'
import { RemoveRelationshipDialog } from './RemoveRelationshipDialog'
import type { PersonRelationshipItem } from '../types'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { Button } from '@/components/forms/Button'

export interface PersonRelationshipsListProps {
  personId: string
}

export function PersonRelationshipsList({ personId }: PersonRelationshipsListProps) {
  const { isAuthenticated } = useAuthContext()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PersonRelationshipItem | null>(null)
  const [removingItem, setRemovingItem] = useState<PersonRelationshipItem | null>(null)

  // Gate 1: Unauthenticated callers have zero privileges on public.relationships.
  // Do not fetch or render relationship section for guest/anon visitors.
  const {
    data: summary,
    isLoading,
    error,
  } = usePersonRelationships(personId)

  if (!isAuthenticated) {
    return null
  }

  const hasAnyRelationships = Boolean(summary && summary.all.length > 0)

  return (
    <section
      aria-labelledby="relationships-heading"
      className="rounded-lg border border-navy-200 bg-white p-6 shadow-sm"
    >
      {/* Section Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-5 w-5 text-navy-600" aria-hidden="true" />
          <h2 id="relationships-heading" className="text-lg font-semibold text-navy-900">
            Interpersonal Relationships
          </h2>
        </div>

        <Button
          size="sm"
          onClick={() => setIsAddOpen(true)}
          className="gap-1 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add relationship
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <p className="py-4 text-sm text-navy-500">Loading relationships…</p>
      )}

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <span>
            {(error as { message?: string })?.message ?? 'Could not load relationships.'}
          </span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && !hasAnyRelationships && (
        <div className="rounded-lg border border-dashed border-navy-200 p-6 text-center text-sm text-navy-500">
          No interpersonal relationships recorded yet. Click &ldquo;Add relationship&rdquo; to connect
          parents, children, spouses, or siblings.
        </div>
      )}

      {/* Categorized relationship lists */}
      {!isLoading && !error && summary && hasAnyRelationships && (
        <div className="space-y-6">
          {/* Parents */}
          {summary.parents.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500">
                Parents ({summary.parents.length})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {summary.parents.map((item: PersonRelationshipItem) => (
                  <RelationshipCard
                    key={item.relationship.id}
                    item={item}
                    onEdit={setEditingItem}
                    onRemove={setRemovingItem}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Children */}
          {summary.children.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500">
                Children ({summary.children.length})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {summary.children.map((item: PersonRelationshipItem) => (
                  <RelationshipCard
                    key={item.relationship.id}
                    item={item}
                    onEdit={setEditingItem}
                    onRemove={setRemovingItem}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Spouses */}
          {summary.spouses.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500">
                Spouses ({summary.spouses.length})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {summary.spouses.map((item: PersonRelationshipItem) => (
                  <RelationshipCard
                    key={item.relationship.id}
                    item={item}
                    onEdit={setEditingItem}
                    onRemove={setRemovingItem}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Siblings */}
          {summary.siblings.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500">
                Siblings ({summary.siblings.length})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {summary.siblings.map((item: PersonRelationshipItem) => (
                  <RelationshipCard
                    key={item.relationship.id}
                    item={item}
                    onEdit={setEditingItem}
                    onRemove={setRemovingItem}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AddRelationshipModal
        targetPersonId={personId}
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
      />

      <EditRelationshipModal
        item={editingItem}
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
      />

      <RemoveRelationshipDialog
        item={removingItem}
        isOpen={Boolean(removingItem)}
        onClose={() => setRemovingItem(null)}
      />
    </section>
  )
}
