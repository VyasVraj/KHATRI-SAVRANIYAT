/**
 * FamilyTreePage — Dedicated full-page interactive genealogical family tree viewer,
 * strictly matching the reference design layout without gradients:
 * - Top header with Back button, Title, Subtitle, and action buttons:
 *   [Expand All], [Collapse All], [Fit to Screen], [View List]
 * - Interactive central graph canvas with custom person cards, edge labels, and couple indicators
 * - Left floating Relationship Legend
 * - Right floating Selected Person Panel
 * - Bottom-left Tree Overview MiniMap
 * - Bottom-right Zoom and Fullscreen controls
 * - Toggleable structured Member List View
 */

import { useState, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
import { usePerson } from '@/features/people/hooks/usePerson'
import { useFamily } from '@/features/families/hooks/useFamily'
import { useFamilyRealtime } from '@/features/families/hooks/useFamilyRealtime'
import { useFamilyMembers } from '@/features/family-members/hooks/useFamilyMembers'
import { FamilyTreeCanvas } from '../components/FamilyTreeCanvas'
import { FamilyTreeHeader } from '../components/FamilyTreeHeader'
import { FamilyMemberListView } from '../components/FamilyMemberListView'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'
import type { TreeGraph, TreeNode } from '../types'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function FamilyTreePage() {
  const params = useParams<{ personId?: string; familyId?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const queryFamilyId = searchParams.get('familyId')
  const queryPersonId =
    searchParams.get('personId') || searchParams.get('rootPersonId')

  const rawFamilyId = params.familyId || queryFamilyId
  const rawPersonId = params.personId || queryPersonId

  const isValidFamilyId =
    typeof rawFamilyId === 'string' && UUID_REGEX.test(rawFamilyId)
  const isValidPersonId =
    typeof rawPersonId === 'string' && UUID_REGEX.test(rawPersonId)

  // 1. Fetch family record if familyId is provided
  const {
    data: family,
    isLoading: isFamilyLoading,
    error: familyError,
  } = useFamily(isValidFamilyId ? rawFamilyId : undefined)

  // Real-time synchronization across multiple tabs and sessions
  useFamilyRealtime(isValidFamilyId ? rawFamilyId : undefined)

  // 2. Fetch family members to resolve the active head or primary person
  const {
    data: familyMembers = [],
    isLoading: isMembersLoading,
  } = useFamilyMembers(isValidFamilyId ? rawFamilyId : undefined, {
    includeFormer: false,
  })

  // Determine root person UUID:
  // - Direct person parameter takes precedence
  // - Otherwise, designated active family head
  // - Otherwise, first active member of the family
  const resolvedPersonId =
    isValidPersonId
      ? rawPersonId
      : familyMembers.find((m) => m.is_head && !m.left_at)?.person_id ||
        familyMembers[0]?.person_id

  const hasResolvedPersonId =
    typeof resolvedPersonId === 'string' && UUID_REGEX.test(resolvedPersonId)

  // 3. Fetch root person details
  const {
    data: person,
    isLoading: isPersonLoading,
    error: personError,
  } = usePerson(hasResolvedPersonId ? resolvedPersonId : undefined)

  // Interactive Tree View state
  const [isListView, setIsListView] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [fitTrigger, setFitTrigger] = useState(0)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(
    resolvedPersonId || null
  )
  const [currentTreeGraph, setCurrentTreeGraph] = useState<TreeGraph | null>(null)

  const handleTreeLoaded = useCallback((graph: TreeGraph) => {
    setCurrentTreeGraph(graph)
  }, [])

  const handleBack = () => {
    if (isValidFamilyId) {
      navigate(ROUTES.FAMILY_DETAIL(rawFamilyId!))
    } else if (isValidPersonId) {
      navigate(ROUTES.PERSON_DETAIL(rawPersonId!))
    } else {
      navigate(ROUTES.FAMILIES)
    }
  }

  const handleExpandAll = () => {
    setIsCollapsed(false)
    setFitTrigger((prev) => prev + 1)
  }

  const handleCollapseAll = () => {
    setIsCollapsed(true)
    setFitTrigger((prev) => prev + 1)
  }

  const handleFitToScreen = () => {
    setFitTrigger((prev) => prev + 1)
  }

  const handleToggleViewList = () => {
    setIsListView((prev) => !prev)
  }

  const handleSelectPersonInTree = (personId: string) => {
    setSelectedPersonId(personId)
    setIsListView(false)
  }

  const isLoading =
    (isValidFamilyId && (isFamilyLoading || isMembersLoading)) ||
    (hasResolvedPersonId && isPersonLoading)

  // Handle completely missing or invalid IDs
  if (!isValidFamilyId && !isValidPersonId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Button
          variant="secondary"
          onClick={() => navigate(ROUTES.PEOPLE)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to census
        </Button>
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <h2 className="text-base font-semibold">Invalid Tree Identifier</h2>
              <p className="mt-1 text-sm text-red-700">
                The requested URL does not contain a valid person or family identifier. Please select an
                individual or family from the community census.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="secondary"
            onClick={handleBack}
            disabled
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Family
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[450px] rounded-2xl border border-[#DCE3EF] bg-white p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#2563EB] mb-3" />
          <p className="text-sm font-semibold text-[#101828]">
            Loading interactive family tree…
          </p>
        </div>
      </div>
    )
  }

  // Error handling for family
  if (isValidFamilyId && familyError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Button
          variant="secondary"
          onClick={() => navigate(ROUTES.FAMILIES)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to families
        </Button>
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <h2 className="text-base font-semibold">Family Record Not Found</h2>
              <p className="mt-1 text-sm text-red-700">
                {(familyError as Error)?.message ||
                  'Unable to locate this family census record or you do not have permission to view it.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Empty family roster
  if (isValidFamilyId && (!familyMembers || familyMembers.length === 0)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Button
          variant="secondary"
          onClick={handleBack}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Family Record
        </Button>
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <h2 className="text-base font-semibold">No Members in Family Roster</h2>
              <p className="mt-1 text-sm text-amber-800">
                This family has no members assigned yet. Add members to the family roster first to view its genealogical tree.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state for root person
  if (personError || !person) {
    const errorMessage =
      (personError as { message?: string } | null)?.message ??
      'Person record not found or you do not have permission to view this tree.'

    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Button
          variant="secondary"
          onClick={handleBack}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Family
        </Button>
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <div>
              <h2 className="text-base font-semibold">Unable to Load Family Tree</h2>
              <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const effectiveFamilyName =
    family?.family_name ||
    currentTreeGraph?.familyName ||
    (person ? `${person.last_name || person.first_name} Family` : 'Family')

  const effectiveMemberCount =
    familyMembers.length ||
    currentTreeGraph?.totalMemberCount ||
    currentTreeGraph?.nodes.size ||
    1

  const treeNodesList: TreeNode[] = currentTreeGraph
    ? Array.from(currentTreeGraph.nodes.values())
    : []

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
      {/* Family Tree Header matching reference image */}
      <FamilyTreeHeader
        familyName={effectiveFamilyName}
        memberCount={effectiveMemberCount}
        onBack={handleBack}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onFitToScreen={handleFitToScreen}
        isListView={isListView}
        onToggleViewList={handleToggleViewList}
      />

      {/* Main Content: Interactive Canvas or Structured List View */}
      <main aria-label="Family tree workspace">
        {isListView ? (
          <FamilyMemberListView
            nodes={treeNodesList}
            onSelectPersonInTree={handleSelectPersonInTree}
          />
        ) : (
          <FamilyTreeCanvas
            rootPersonId={person.id}
            familyId={family?.id || (isValidFamilyId ? rawFamilyId : undefined)}
            selectedPersonId={selectedPersonId}
            onSelectPerson={setSelectedPersonId}
            fitTrigger={fitTrigger}
            isCollapsed={isCollapsed}
            onTreeLoaded={handleTreeLoaded}
            className="h-[calc(100vh-230px)] min-h-[550px] w-full"
          />
        )}
      </main>
    </div>
  )
}
