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
import { Camera, Crown, User, GitBranch, ShieldAlert } from 'lucide-react'
import type { Tables } from '@/types/database.types'
import { PRIVACY_LEVEL_LABELS, canManagePrivacy, ROUTES } from '@/constants/app'
import { AuthContext } from '@/features/auth/context/AuthContext'
import type { PrivacyLevel } from '@/types'
import { MemberList } from '@/features/family-members'
import { useFamilyMembers } from '@/features/family-members/hooks/useFamilyMembers'
import { AvatarImage, AvatarUploadDialog } from '@/features/media'
import { Button } from '@/components/forms/Button'
import { useTranslation } from '@/features/i18n'

type FamilyRow = Tables<'families'>

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
export function FamilyDetail({ family, canManageMembers = false, onAvatarUpdated }: FamilyDetailProps) {
  const auth = useContext(AuthContext)
  const { t } = useTranslation()
  const isPrivacyManager = canManagePrivacy(auth?.profile?.role)

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(family.avatar_url ?? null)

  // Fetch active family members for census head and stats
  const { data: members = [] } = useFamilyMembers(family.id, { includeFormer: false })
  const currentHead = members.find((m) => m.is_head && !m.left_at)
  const lineageCount = [family.gotra, family.nukh].filter(Boolean).length

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
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-brand-700 border border-brand-200">
                {t('census.page_title')}
              </span>
              <span className="text-xs text-navy-500">
                • {members.length} active
              </span>
            </div>
            <h2 id="family-name-heading" className="mt-1 text-2xl font-bold text-navy-900">
              {family.family_name}
            </h2>
            {family.description && (
              <p className="mt-1 text-sm text-navy-600 whitespace-pre-line">
                {family.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageMembers && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAvatarDialogOpen(true)}
              className="flex items-center gap-2 text-xs"
            >
              <Camera className="h-4 w-4" />
              Change crest
            </Button>
          )}

          {currentHead ? (
            <Link
              to={`/people/${currentHead.person_id}/tree`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-navy-800"
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>{t('census.view_tree')}</span>
            </Link>
          ) : members.length > 0 ? (
            <Link
              to={`/people/${members[0].person_id}/tree`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-navy-800"
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>{t('census.view_tree')}</span>
            </Link>
          ) : null}
        </div>
      </section>

      {/* Family Head Highlight Card */}
      <section aria-labelledby="family-head-heading">
        {currentHead ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 shrink-0">
                  <Crown className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                      Family Head
                    </span>
                    <span className="text-xs text-navy-500">
                      Since {formatDate(currentHead.joined_at)}
                    </span>
                  </div>
                  <Link
                    to={ROUTES.PERSON_DETAIL(currentHead.person_id)}
                    className="text-base font-bold text-navy-900 hover:text-brand-700 hover:underline mt-0.5 block"
                  >
                    {currentHead.person
                      ? `${currentHead.person.first_name} ${currentHead.person.last_name}`
                      : 'Head of Family'}
                  </Link>
                  <p className="text-xs text-navy-600">
                    Primary representative for this family census registry
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to={`/tree?familyId=${family.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-50 transition-colors"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  <span>View Family Tree</span>
                </Link>
                <Link
                  to={ROUTES.PERSON_DETAIL(currentHead.person_id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-2xs hover:bg-navy-50"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>View Profile</span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-navy-200 bg-white p-5 text-center">
            <p className="text-sm font-semibold text-navy-800">No Ghar Mukhi Designated</p>
            <p className="text-xs text-navy-500 mt-0.5">
              Assign a head from the membership roster below to complete the census representation.
            </p>
          </div>
        )}
      </section>

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
            Ghar Mukhi
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

      {avatarDialogOpen && (
        <AvatarUploadDialog
          isOpen={avatarDialogOpen}
          onClose={() => setAvatarDialogOpen(false)}
          target={{ type: 'family', id: family.id }}
          currentAvatarUrl={currentAvatarUrl}
          onSuccess={(newUrl) => {
            setCurrentAvatarUrl(newUrl)
            setAvatarDialogOpen(false)
            onAvatarUpdated?.(newUrl)
          }}
        />
      )}

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
        <MemberList familyId={family.id} canManageMembers={canManageMembers} />
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
