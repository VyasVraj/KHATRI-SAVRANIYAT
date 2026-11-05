/**
 * FamilyTreePage — Dedicated full-page genealogical family tree viewer.
 *
 * Route:
 *  - /people/:personId/tree
 *  - /families/:familyId/tree
 *  - /tree?familyId=... | /tree?personId=...
 *
 * ARCHITECTURAL REQUIREMENTS:
 * 1. PERSON != USER:
 *    Displays census data (public.persons) and interpersonal relationships (public.relationships).
 *    Never displays or leaks user authentication credentials or internal identifiers.
 * 2. PRIVACY & ACCESS CONTROL:
 *    - Gate 1: Enforced by ProtectedRoute in router.tsx (authenticated users only).
 *    - Gate 2: Enforced by PostgreSQL RLS policies on public.persons and public.relationships.
 *    - Zero synthetic private placeholder nodes are generated or displayed.
 * 3. ROOT CONTEXT:
 *    Presents root individual metadata (full name, birth/death years, gender) without
 *    leaking internal identifiers (id, user_id, created_by) or private contact information.
 * 4. RESPONSIVE DESIGN:
 *    Optimized for desktop and mobile viewports with flexible graph canvas and pan/zoom controls.
 */

import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Network, AlertCircle, Loader2, Users } from 'lucide-react'
import { usePerson } from '@/features/people/hooks/usePerson'
import { useFamily } from '@/features/families/hooks/useFamily'
import { useFamilyRealtime } from '@/features/families/hooks/useFamilyRealtime'
import { useFamilyMembers } from '@/features/family-members/hooks/useFamilyMembers'
import { FamilyTreeCanvas } from '../components/FamilyTreeCanvas'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'

/** UUID validation regular expression (RFC 4122) */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Human-readable gender labels */
const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
}

/**
 * Full page component rendering the interactive genealogical tree for a person or family.
 */
export function FamilyTreePage() {
  const params = useParams<{ personId?: string; familyId?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Extract candidate IDs from route parameters or search parameters
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
          className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900"
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
            onClick={() =>
              isValidFamilyId
                ? navigate(ROUTES.FAMILY_DETAIL(rawFamilyId!))
                : navigate(ROUTES.PERSON_DETAIL(rawPersonId!))
            }
            disabled
          >
            <ArrowLeft className="h-4 w-4" />
            {isValidFamilyId ? 'Back to Family Record' : 'Back to profile'}
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[400px] rounded-xl border border-border bg-card p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm font-medium text-foreground">
            Loading family tree record…
          </p>
        </div>
      </div>
    )
  }

  // Error handling for family or empty family roster
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
          className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900"
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

  if (isValidFamilyId && (!familyMembers || familyMembers.length === 0)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Button
          variant="secondary"
          onClick={() => navigate(ROUTES.FAMILY_DETAIL(rawFamilyId!))}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Family Record
        </Button>
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900"
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
          onClick={() =>
            isValidFamilyId
              ? navigate(ROUTES.FAMILY_DETAIL(rawFamilyId!))
              : navigate(ROUTES.PEOPLE)
          }
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {isValidFamilyId ? 'Back to Family Record' : 'Back to census'}
        </Button>
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900"
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

  // Root person display fields
  const fullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')

  const birthYear =
    person.dob_year ??
    (person.date_of_birth ? new Date(person.date_of_birth).getFullYear() : null)

  const deathYear = person.date_of_death
    ? new Date(person.date_of_death).getFullYear()
    : null

  const isDeceased = person.status === 'DECEASED'

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
      {/* Navigation and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {isValidFamilyId ? (
            <Button
              variant="secondary"
              onClick={() => navigate(ROUTES.FAMILY_DETAIL(rawFamilyId!))}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Family Record
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => navigate(ROUTES.PERSON_DETAIL(person.id))}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to profile
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={() => navigate(ROUTES.PEOPLE)}
            className="text-muted-foreground hover:text-foreground"
          >
            Census directory
          </Button>

          {isValidFamilyId && (
            <Button
              variant="ghost"
              onClick={() => navigate(ROUTES.FAMILIES)}
              className="text-muted-foreground hover:text-foreground"
            >
              Families registry
            </Button>
          )}
        </div>
      </div>

      {/* Root Contextual Header */}
      <header className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Network className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                  {family?.family_name
                    ? `${family.family_name} — Family Tree`
                    : fullName
                      ? `${fullName}’s Family Tree`
                      : 'Family Tree'}
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Interactive genealogical graph centered on {fullName || 'root individual'}
              </p>
            </div>
          </div>

          {/* Root Metadata Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0 shrink-0">
            {family?.family_name && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-foreground">{family.family_name}</span>
              </div>
            )}

            <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium text-foreground">{fullName || 'Unknown'}</span>
            </div>

            {(birthYear || deathYear || isDeceased) && (
              <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                {birthYear && `b. ${birthYear}`}
                {birthYear && deathYear && ' – '}
                {deathYear && `d. ${deathYear}`}
                {!deathYear && isDeceased && !birthYear && 'Deceased'}
                {!deathYear && isDeceased && birthYear && ' (dec.)'}
              </span>
            )}

            {person.gender && GENDER_LABELS[person.gender] && (
              <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                {GENDER_LABELS[person.gender]}
              </span>
            )}

            {person.status && person.status !== 'ACTIVE' && (
              <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-2.5 py-1 text-xs font-mono uppercase text-amber-800 dark:text-amber-200">
                {person.status}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Full Tree React Flow Graph Canvas */}
      <main aria-label="Family tree graph visualization">
        <FamilyTreeCanvas
          rootPersonId={person.id}
          className="h-[calc(100vh-270px)] min-h-[420px] sm:min-h-[550px] w-full"
        />
      </main>
    </div>
  )
}
