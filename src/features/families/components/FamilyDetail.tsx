/**
 * FamilyDetail — read-only full-detail view of a family record.
 *
 * Implements Android Screen 14 & 15 Parity:
 * - Ghar Mukhi (Head of Family) Highlight Card
 * - Family Census Summary & Lineage completeness
 * - Direct navigation to visual Family Tree
 * - Live MemberList roster component with role and relationship indicators
 * - Strict ANDROID-2 privacy lock (privacy controls only visible to authorized roles)
 *
 * No dangerouslySetInnerHTML. All values rendered as React text.
 */

import { useState, useContext } from 'react'
import { Link } from 'react-router-dom'
import { Crown, User, GitBranch, ShieldAlert, Award, Pencil } from 'lucide-react'
import type { Tables } from '@/types/database.types'
import { PRIVACY_LEVEL_LABELS, canManagePrivacy, ROUTES } from '@/constants/app'
import { AuthContext } from '@/features/auth/context/AuthContext'
import type { PrivacyLevel } from '@/types'
import { MemberList } from '@/features/family-members'
import { useFamilyMembers } from '@/features/family-members/hooks/useFamilyMembers'
import { AvatarImage } from '@/features/media'
import { Button } from '@/components/forms/Button'
import { useTranslation } from '@/features/i18n'
import { useCommunityMukhis } from '@/features/community/hooks/useCommunityMukhis'
import type { CommunityMukhi } from '@/features/community/services/community-mukhis.service'
import { MukhiDetailsModal } from '@/features/community/components/MukhiDetailsModal'
import type { MukhiLeaderItem } from '@/features/community/types'
import { ChangeMukhiDialog } from './ChangeMukhiDialog'
import { toProperCaseName, toSentenceCase } from '@/utils/text-casing'

type FamilyRow = Tables<'families'> & {
  selected_mukhi_id?: string | null
  selected_mukhi?: CommunityMukhi | null
}

/** Formats an ISO date string to a locale-readable date. */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Render a detail row: label + value */
function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between border-b border-navy-100 py-2.5 text-sm">
      <dt className="text-navy-500">{label}</dt>
      <dd className="max-w-[55%] text-right font-medium text-navy-800 break-words">
        {value || '—'}
      </dd>
    </div>
  )
}

export interface FamilyDetailProps {
  family: FamilyRow
  canManageMembers?: boolean
  onAvatarUpdated?: (newUrl: string | null) => void
}

/**
 * Full read-only family detail panel.
 */
export function FamilyDetail({ family, canManageMembers = false, onAvatarUpdated: _onAvatarUpdated }: FamilyDetailProps) {
  const auth = useContext(AuthContext)
  const { t } = useTranslation()
  const isPrivacyManager = canManagePrivacy(auth?.profile?.role)

  const currentAvatarUrl = family.avatar_url ?? null

  const { mukhis: communityMukhis } = useCommunityMukhis({ priorityLocation: family.city ?? undefined })
  const [currentMukhi, setCurrentMukhi] = useState<CommunityMukhi | null>(
    family.selected_mukhi ?? null
  )
  const [changeMukhiOpen, setChangeMukhiOpen] = useState(false)
  const [viewMukhiModalOpen, setViewMukhiModalOpen] = useState(false)

  // Resolve Mukhi from list if not already resolved on family prop
  const effectiveMukhi = currentMukhi || (
    family.selected_mukhi_id
      ? communityMukhis.find((m) => m.id === family.selected_mukhi_id) || null
      : null
  )

  const selectedMukhiLeaderItem: MukhiLeaderItem | null = effectiveMukhi ? {
    id: effectiveMukhi.id,
    name: effectiveMukhi.full_name,
    gram: effectiveMukhi.gram,
    phone: effectiveMukhi.mobile_number,
    mukhi_unique_id: `MUK-${String(effectiveMukhi.source_serial_number || 1).padStart(4, '0')}`,
    authority_status: effectiveMukhi.is_active ? 'ACTIVE' : 'INACTIVE',
    account_linking_status: effectiveMukhi.linked_user_id ? 'LINKED' : 'UNLINKED',
    person_id: effectiveMukhi.linked_person_id ?? null,
    user_id: effectiveMukhi.linked_user_id ?? null,
    gotra: effectiveMukhi.gotra ?? null,
    nukh: effectiveMukhi.nukh ?? null,
    designation: 'Mukhi',
    role: 'MUKHI',
    is_active: effectiveMukhi.is_active,
    status: effectiveMukhi.is_active ? 'ACTIVE' : 'INACTIVE',
    is_verified: true,
    profile_privacy: 'COMMUNITY',
  } : null

  // Fetch active family members for census head and stats
  const { data: members = [] } = useFamilyMembers(family.id, { includeFormer: false })
  const activeMembers = members.filter((m) => !m.left_at)
  const activeCount = activeMembers.length
  const currentHead = activeMembers.find((m) => (m.is_head || m.role === 'HEAD'))
  const lineageCount = [family.gotra, family.nukh].filter(Boolean).length

  const currentUserId = auth?.user?.id
  const isCreator = Boolean(currentUserId && family.created_by === currentUserId)
  const isManager = Boolean(currentUserId && family.manager_user_id === currentUserId)
  const isClaimedManager = Boolean(currentUserId && (family as unknown as { claimed_by_user_id?: string })?.claimed_by_user_id === currentUserId)
  const isMember = Boolean(currentUserId && members.some((m) => m.person?.user_id === currentUserId))
  const isAdminOrMukhi = Boolean(auth?.profile?.is_active && ['ADMIN', 'SUPER_ADMIN', 'MUKHI'].includes(auth.profile.role))
  const canViewTree = isCreator || isManager || isClaimedManager || isMember || isAdminOrMukhi
  const canViewRoster = canViewTree

  return (
    <div className="space-y-6">
      {/* Overview section */}
      <section aria-labelledby="family-name-heading" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-navy-100 pb-5">
        <div className="flex items-center gap-4">
          <AvatarImage
            src={currentAvatarUrl}
            name={family.family_name}
            alt={family.family_name}
            size="xl"
            shape="rounded"
            isFamily
          />
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-slate-700 border border-slate-200">
                {t('census.page_title')}
              </span>
              <span className="inline-flex items-center text-xs font-medium text-slate-500">
                • {activeCount} active {activeCount === 1 ? 'member' : 'members'}
              </span>
            </div>
            <h2 id="family-name-heading" className="mt-1 text-2xl font-bold text-navy-900">
              {toProperCaseName(family.family_name)}
            </h2>
            {family.description && (
              <p className="mt-1 text-sm text-navy-600 whitespace-pre-line">
                {toSentenceCase(family.description)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageMembers && (
            <Link
              to={ROUTES.FAMILY_EDIT(family.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-2xs hover:bg-navy-50 hover:text-navy-900 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5 text-navy-500" />
              <span>Edit Family</span>
            </Link>
          )}

          {members.length > 0 && canViewTree ? (
            <Link
              to={ROUTES.FAMILY_TREE(family.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-navy-800"
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>{t('census.view_tree')}</span>
            </Link>
          ) : null}
        </div>
      </section>

      {/* Family Leadership: Head of Family & Selected Mukhi */}
      <section aria-label="Family Leadership" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* FAMILY HEAD SECTION */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          {currentHead ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                  Family Head
                </span>
                <span className="text-xs text-navy-500">
                  Since {formatDate(currentHead.joined_at)}
                </span>
              </div>

              <div className="flex items-center gap-3.5 mt-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 shrink-0">
                  <Crown className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <Link
                    to={ROUTES.PERSON_DETAIL(currentHead.person_id)}
                    className="text-base font-bold text-navy-900 hover:text-brand-700 hover:underline block"
                  >
                    {currentHead.person
                      ? toProperCaseName(`${currentHead.person.first_name} ${currentHead.person.last_name}`)
                      : 'Head of Family'}
                  </Link>
                  <p className="text-xs text-navy-600 mt-0.5">
                    Primary representative for this family census registry
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-amber-200/60">
                <Link
                  to={ROUTES.FAMILY_TREE(family.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-50 transition-colors"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  <span>View Family Tree</span>
                </Link>
                <Link
                  to={ROUTES.PERSON_DETAIL(currentHead.person_id)}
                  className="inline-flex items-center gap-1 rounded-md border border-navy-200 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 shadow-2xs hover:bg-navy-50"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>View Profile</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm font-semibold text-navy-800">No Head of Family Designated</p>
              <p className="text-xs text-navy-500 mt-1">
                Assign a head from the membership roster below to complete the census representation.
              </p>
            </div>
          )}
        </div>

        {/* SELECTED MUKHI SECTION */}
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-800 uppercase tracking-wider">
                  Selected Mukhi
                </span>
                <span className="text-[11px] text-navy-500">Executive Committee</span>
              </div>
              {canManageMembers && (
                <button
                  type="button"
                  onClick={() => setChangeMukhiOpen(true)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-800 hover:underline"
                >
                  Change Mukhi
                </button>
              )}
            </div>

            {effectiveMukhi ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setViewMukhiModalOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setViewMukhiModalOpen(true)
                  }
                }}
                className="mt-3 flex items-start gap-3.5 p-3 rounded-xl border border-blue-100 bg-blue-50/40 hover:bg-blue-100/50 hover:border-blue-300 transition-all cursor-pointer group shadow-2xs"
                title="Click to view full Mukhi details"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-sm shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                  #{effectiveMukhi.source_serial_number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-navy-900 group-hover:text-brand-700 transition-colors truncate">
                      {effectiveMukhi.full_name}
                    </h4>
                    <span className="text-[11px] font-medium text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      View details →
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800">
                      Official Mukhi
                    </span>
                    <span className="text-xs text-navy-600">
                      • {effectiveMukhi.gram}
                    </span>
                  </div>
                  {effectiveMukhi.mobile_number && (
                    <p className="text-xs text-navy-500 mt-1.5">
                      📞 <a
                        href={`tel:${effectiveMukhi.mobile_number}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline font-medium text-navy-700"
                      >
                        {effectiveMukhi.mobile_number}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-2">
                <p className="text-sm font-semibold text-navy-800">No Mukhi assigned to this family or region.</p>
                <p className="text-xs text-navy-500 mt-1">
                  Designate an official Community Mukhi from the Community Mukhi Directory for this family unit.
                </p>
                {canManageMembers && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setChangeMukhiOpen(true)}
                    className="mt-3 text-xs"
                  >
                    <Award className="h-3.5 w-3.5" />
                    Select Mukhi
                  </Button>
                )}
              </div>
            )}
          </div>

          {effectiveMukhi && (
            <div className="mt-4 pt-3 border-t border-brand-100 flex items-center justify-between text-[11px] text-brand-800">
              <span>Official Mukhi representing all {activeCount} registered members of this family</span>
              {canManageMembers && (
                <button
                  type="button"
                  onClick={() => setChangeMukhiOpen(true)}
                  className="font-semibold underline hover:text-brand-950"
                >
                  Edit Selection
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Change Mukhi Dialog */}
      {changeMukhiOpen && (
        <ChangeMukhiDialog
          isOpen={changeMukhiOpen}
          onClose={() => setChangeMukhiOpen(false)}
          familyId={family.id}
          familyCity={family.city}
          currentMukhiId={family.selected_mukhi_id}
          onMukhiChanged={(newMukhi) => {
            setCurrentMukhi(newMukhi)
          }}
        />
      )}

      {/* Mukhi Details Modal (Phase Enhancement: Interactive Mukhi card) */}
      {viewMukhiModalOpen && selectedMukhiLeaderItem && (
        <MukhiDetailsModal
          isOpen={viewMukhiModalOpen}
          onClose={() => setViewMukhiModalOpen(false)}
          mukhi={selectedMukhiLeaderItem}
        />
      )}

      {/* Census Completeness & Lineage Summary */}
      <section aria-label="Census Summary Metrics" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-navy-100 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">
            Roster Members
          </span>
          <p className="text-sm font-bold text-navy-900 mt-1">
            {members.length} {members.length === 1 ? 'Person' : 'People'}
          </p>
        </div>

        <div className="rounded-xl border border-navy-100 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">
            Head of Family
          </span>
          <p className="text-sm font-bold text-navy-900 mt-1">
            {currentHead ? (
              <span className="text-teal-700">Designated</span>
            ) : (
              <span className="text-amber-700">Pending</span>
            )}
          </p>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-xl border border-navy-100 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">
            Lineage Records
          </span>
          <p className="text-sm font-bold text-navy-900 mt-1">
            {lineageCount === 2
              ? 'Complete (2/2)'
              : lineageCount > 0
              ? `Partial (${lineageCount}/2)`
              : 'Unrecorded'}
          </p>
        </div>
      </section>

      {/* Location */}
      <section aria-labelledby="location-heading">
        <h3
          id="location-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Location
        </h3>
        <dl>
          <DetailRow label="City" value={family.city} />
          <DetailRow label="State / Province" value={family.state} />
          <DetailRow label="Country" value={family.country} />
        </dl>
      </section>

      {/* Community Identity */}
      <section aria-labelledby="community-heading">
        <h3
          id="community-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Community Identity
        </h3>
        <dl>
          <DetailRow label="Gotra" value={family.gotra} />
          <DetailRow label="Nukh" value={family.nukh} />
        </dl>
      </section>

      {/* Privacy Settings (Strictly restricted to Mukhi / Admins: SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR) */}
      {isPrivacyManager && (
        <section aria-labelledby="privacy-heading">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldAlert className="h-3.5 w-3.5 text-navy-500" />
            <h3
              id="privacy-heading"
              className="text-xs font-semibold uppercase tracking-wide text-navy-400"
            >
              Privacy Settings (Restricted Access)
            </h3>
          </div>
          <dl>
            <DetailRow
              label="Family profile visibility"
              value={PRIVACY_LEVEL_LABELS[family.profile_privacy as PrivacyLevel] ?? family.profile_privacy}
            />
            <DetailRow
              label="Members list visibility"
              value={PRIVACY_LEVEL_LABELS[family.members_privacy as PrivacyLevel] ?? family.members_privacy}
            />
          </dl>
        </section>
      )}

      {/* Family Membership Roster (Phase 4 Subtask 2) */}
      <section aria-labelledby="family-roster-section-heading">
        {canViewRoster ? (
          <MemberList
            familyId={family.id}
            canManageMembers={canManageMembers}
            familyMukhi={effectiveMukhi}
          />
        ) : (
          <div className="rounded-xl border border-navy-200 bg-navy-50/50 p-6 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-navy-400 mb-2" />
            <h4 className="text-sm font-semibold text-navy-800">Member Roster Protected</h4>
            <p className="mt-1 text-xs text-navy-600 max-w-md mx-auto">
              The full member roster is accessible only to confirmed family members, the family creator, and community leadership.
            </p>
          </div>
        )}
      </section>



      {/* Record Metadata */}
      <section aria-labelledby="meta-heading">
        <h3
          id="meta-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Record Info
        </h3>
        <dl>
          <DetailRow label="Created" value={formatDate(family.created_at)} />
          <DetailRow label="Last updated" value={formatDate(family.updated_at)} />
        </dl>
      </section>
    </div>
  )
}
