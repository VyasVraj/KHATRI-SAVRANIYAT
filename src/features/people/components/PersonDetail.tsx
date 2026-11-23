/**
 * PersonDetail — read-only full-detail view of a person record.
 *
 * Renders all user-visible fields from a PersonRow. Does NOT render:
 * - id, created_by, user_id (internal identifiers)
 * - status, verification_status (admin-only fields, Phase 13)
 * - deleted_at (internal)
 *
 * This is a presentation component only. It takes data already fetched and
 * makes no network calls. Use usePerson() in the parent page to load data.
 *
 * No dangerouslySetInnerHTML. All values are rendered as React text.
 */

import { useState, useEffect, useContext } from 'react'
import type { Tables } from '@/types/database.types'
import { PRIVACY_LEVEL_LABELS, canManagePrivacy } from '@/constants/app'
import { AuthContext } from '@/features/auth/context/AuthContext'
import type { PrivacyLevel } from '@/types'
import { AvatarImage, AvatarUploadDialog } from '@/features/media'
import { Button } from '@/components/forms/Button'
import { usePersonFamilyMukhi } from '@/features/community'
import { formatBloodGroup } from '@/constants/bloodGroup'
import { toProperCaseName } from '@/utils/text-casing'
import { Shield, ShieldAlert, Phone, Briefcase, Pencil, Camera } from 'lucide-react'
import { MyOccupationRequestsSection } from './MyOccupationRequestsSection'
import { UpdateOccupationModal } from './UpdateOccupationModal'

type PersonRow = Tables<'persons'> & {
  blood_group?: string | null
  age?: number | null
  is_same_family?: boolean
  occupation_category?: string | null
  custom_occupation?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  can_edit?: boolean
}

/** Human-readable gender labels */
const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
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
    <div className="flex justify-between border-b border-navy-100 py-2.5 text-sm gap-2">
      <dt className="text-navy-500 shrink-0">{label}</dt>
      <dd className="max-w-[65%] sm:max-w-[55%] text-right font-medium text-navy-800 break-words">
        {value || '—'}
      </dd>
    </div>
  )
}

interface PersonDetailProps {
  person: PersonRow
  canEdit?: boolean
  onAvatarUpdated?: (newUrl: string | null) => void
}

/**
 * Full read-only person detail panel.
 */
export function PersonDetail({ person, canEdit: _canEdit = false, onAvatarUpdated }: PersonDetailProps) {
  const auth = useContext(AuthContext)
  const isPrivacyManager = canManagePrivacy(auth?.profile?.role)
  const isOwner = Boolean(auth?.user?.id && person.user_id && auth.user.id === person.user_id)
  const isCreator = Boolean(auth?.user?.id && person.created_by && auth.user.id === person.created_by)
  const isSameFamily = Boolean((person as unknown as { is_same_family?: boolean })?.is_same_family)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAuthorizedByPolicy = Boolean((person as any)?.can_edit)
  const hasEditPermission = _canEdit || isOwner || isCreator || isPrivacyManager || isAuthorizedByPolicy
  const canViewProtected = isPrivacyManager || isOwner || isCreator || isSameFamily || isAuthorizedByPolicy

  const [avatarUrl, setAvatarUrl] = useState<string | null>(person.avatar_url ?? null)
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [contactRequested, setContactRequested] = useState(false)
  const [updateOccupationModalOpen, setUpdateOccupationModalOpen] = useState(false)

  // Sync avatarUrl whenever person.avatar_url changes or global update event fires
  useEffect(() => {
    setAvatarUrl(person.avatar_url ?? null)
  }, [person.avatar_url])

  useEffect(() => {
    const handleAvatarUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ target: { type: string; id: string }; url: string | null }>
      if (customEvent.detail && customEvent.detail.target?.type === 'person' && customEvent.detail.target?.id === person.id) {
        setAvatarUrl(customEvent.detail.url)
      }
    }
    window.addEventListener('community-roots:avatar-updated', handleAvatarUpdated)
    return () => window.removeEventListener('community-roots:avatar-updated', handleAvatarUpdated)
  }, [person.id])

  // Resolve authoritative display occupation
  const displayOccupation = (() => {
    const rawOcc = (person.occupation || '').trim()
    const rawCat = (person.occupation_category || '').trim()
    const rawCustom = ((person as unknown as { custom_occupation?: string | null })?.custom_occupation || '').trim()

    const isPlaceholder =
      !rawOcc ||
      rawOcc === 'Occupation Pending' ||
      rawOcc === 'Occupation Not Provided' ||
      rawOcc === 'Occupation Not Available' ||
      rawOcc === 'Occupation Rejected'

    if (!isPlaceholder) {
      if (rawCustom && rawCustom.toLowerCase() !== rawOcc.toLowerCase()) {
        return `${rawOcc} (${rawCustom})`
      }
      return rawOcc
    }

    if (rawCat && rawCat !== 'Other') {
      if (rawCustom && rawCustom.toLowerCase() !== rawCat.toLowerCase()) {
        return `${rawCat} (${rawCustom})`
      }
      return rawCat
    }

    if (rawCustom) return rawCustom

    return null
  })()

  const { data: familyMukhiInfo, isLoading: isMukhiLoading } = usePersonFamilyMukhi(person.id)

  const fullName = toProperCaseName(
    [person.first_name, person.middle_name, person.last_name]
      .filter(Boolean)
      .join(' ')
  )

  return (
    <div className="space-y-6">
      {/* Name and avatar section */}
      <section aria-labelledby="person-name-heading" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-navy-100 pb-5">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="relative group shrink-0">
            <AvatarImage
              src={avatarUrl}
              name={fullName}
              alt={fullName}
              size="xl"
              shape="circle"
            />
            {hasEditPermission && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setAvatarDialogOpen(true)
                }}
                className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-brand-600 text-white shadow-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 transition-transform active:scale-95"
                title={avatarUrl ? 'Change photo' : 'Upload photo'}
                aria-label={avatarUrl ? 'Change photo' : 'Upload photo'}
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 id="person-name-heading" className="text-xl font-semibold text-navy-900 truncate">
                {fullName}
              </h2>
              {(person.is_deceased || person.status === 'DECEASED' || Boolean(person.date_of_death)) && (
                <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-300">
                  Deceased
                </span>
              )}
            </div>
            {person.maiden_name && (
              <p className="mt-0.5 text-sm text-navy-500 truncate">née {toProperCaseName(person.maiden_name)}</p>
            )}
            {hasEditPermission && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setAvatarDialogOpen(true)}
                  className="text-xs text-brand-600 hover:text-brand-800 font-medium inline-flex items-center gap-1 hover:underline"
                >
                  <Camera className="h-3 w-3" />
                  <span>{avatarUrl ? 'Change photo' : 'Upload photo'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Identity */}
      <section aria-labelledby="identity-heading">
        <h3
          id="identity-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Identity
        </h3>
        <dl>
          <DetailRow
            label="Gender"
            value={person.gender ? GENDER_LABELS[person.gender] : null}
          />
          {canViewProtected ? (
            <>
              {person.date_of_birth ? (
                <>
                  <DetailRow label="Date of birth" value={formatDate(person.date_of_birth)} />
                  {person.age !== undefined && person.age !== null && (
                    <DetailRow label="Calculated age" value={`${person.age} years`} />
                  )}
                </>
              ) : (person.current_age !== undefined && person.current_age !== null) || (person.age !== undefined && person.age !== null) ? (
                <DetailRow label="Current age" value={`${person.current_age ?? person.age} years (Recorded age)`} />
              ) : null}
              <DetailRow label="Birth place" value={person.birth_place ? toProperCaseName(person.birth_place) : null} />
              <DetailRow label="Blood Group" value={formatBloodGroup(person.blood_group)} />
            </>
          ) : (
            <>
              {person.age !== undefined && person.age !== null && (
                <DetailRow label="Calculated age" value={`${person.age} years`} />
              )}
            </>
          )}
          {canViewProtected && (person.is_deceased || person.status === 'DECEASED' || Boolean(person.date_of_death)) && (
            <DetailRow
              label="Vital status"
              value={person.date_of_death ? `Deceased (${formatDate(person.date_of_death)})` : 'Deceased'}
            />
          )}
        </dl>
      </section>

      {/* Community identity */}
      <section aria-labelledby="community-heading">
        <h3
          id="community-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Community identity
        </h3>
        <dl>
          <DetailRow label="Gotra" value={person.gotra ? toProperCaseName(person.gotra) : null} />
          <DetailRow label="Nukh" value={person.nukh ? toProperCaseName(person.nukh) : null} />
          <div className="flex justify-between items-center border-b border-navy-100 py-2.5 text-sm gap-2">
            <dt className="text-navy-500 shrink-0">Occupation / Profession</dt>
            <dd className="max-w-[65%] sm:max-w-[55%] text-right font-medium text-navy-800 break-words flex items-center justify-end gap-1.5 flex-wrap">
              {displayOccupation ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 border border-blue-200">
                  <Briefcase className="h-3 w-3 text-blue-600" />
                  <span>{displayOccupation}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
                  <span>Occupation Not Provided</span>
                </span>
              )}

              {hasEditPermission && (
                <button
                  type="button"
                  onClick={() => setUpdateOccupationModalOpen(true)}
                  className="ml-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-colors cursor-pointer"
                  title="Update Occupation / Profession"
                >
                  <Pencil className="h-3 w-3" />
                  <span>{displayOccupation ? 'Edit' : 'Add'}</span>
                </button>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* Contact */}
      <section aria-labelledby="contact-heading">
        <h3
          id="contact-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Contact
        </h3>
        <dl>
          {canViewProtected ? (
            <>
              <DetailRow label="Email" value={person.email_contact} />
              <DetailRow label="Phone" value={person.phone} />
              <DetailRow label="Secondary phone" value={person.phone_secondary} />
            </>
          ) : (
            <>
              <DetailRow label="Contact status" value="Protected by Community Privacy Policy" />
              <DetailRow label="Phone & Email" value="Hidden from public view" />
            </>
          )}
        </dl>
      </section>

      {/* Authoritative Family-Level Mukhi Association */}
      <section aria-labelledby="mukhi-card-heading" className="rounded-lg border border-navy-200 bg-navy-50/60 p-4">
        {isMukhiLoading ? (
          <p className="text-xs text-navy-500 py-2">Loading assigned family Mukhi...</p>
        ) : familyMukhiInfo?.status === 'ASSIGNED' && familyMukhiInfo.mukhi ? (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield className="h-3.5 w-3.5 text-brand-600" />
                  <h4 id="mukhi-card-heading" className="text-xs font-semibold uppercase tracking-wide text-navy-500">
                    Assigned Regional Mukhi
                  </h4>
                  {familyMukhiInfo.family?.family_name && (
                    <span className="text-[11px] text-navy-400">
                      • {familyMukhiInfo.family.family_name}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-navy-900">
                  {familyMukhiInfo.mukhi.full_name}
                </p>
                <p className="text-xs text-navy-600">
                  Official Family Representative • {familyMukhiInfo.mukhi.gram}
                </p>
                {canViewProtected && familyMukhiInfo.mukhi.mobile_number && (
                  <p className="mt-1 text-xs font-mono text-brand-700 flex items-center gap-1">
                    <Phone className="h-3 w-3 inline" />
                    <a
                      href={`tel:${familyMukhiInfo.mukhi.mobile_number}`}
                      className="hover:underline font-semibold"
                    >
                      {familyMukhiInfo.mukhi.mobile_number}
                    </a>
                  </p>
                )}
              </div>
              {!canViewProtected && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setContactRequested(true)}
                  disabled={contactRequested}
                  className="shrink-0 text-xs"
                >
                  {contactRequested ? 'Request Submitted' : 'Request Contact via Mukhi'}
                </Button>
              )}
            </div>
            {contactRequested && (
              <p className="mt-2 text-xs text-emerald-800 bg-emerald-50 rounded p-2 border border-emerald-200">
                Your connection request has been forwarded to Mukhi {familyMukhiInfo.mukhi.full_name}. Community elders will coordinate verified introduction.
              </p>
            )}
          </div>
        ) : familyMukhiInfo?.status === 'INACTIVE_AUTHORITY' ? (
          <div>
            <div className="flex items-center gap-1.5 mb-1 text-amber-700">
              <ShieldAlert className="h-3.5 w-3.5" />
              <h4 id="mukhi-card-heading" className="text-xs font-semibold uppercase tracking-wide">
                Mukhi Authority Inactive
              </h4>
            </div>
            <p className="text-xs text-navy-600">
              The Mukhi previously assigned to this person&apos;s family is currently inactive or removed.
              An authorized family manager or administrator can select an active replacement in the family profile.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-1.5 mb-1 text-navy-400">
              <Shield className="h-3.5 w-3.5" />
              <h4 id="mukhi-card-heading" className="text-xs font-semibold uppercase tracking-wide">
                Assigned Family Mukhi
              </h4>
            </div>
            <p className="text-xs font-medium text-navy-700">Mukhi Not Assigned</p>
            <p className="text-[11px] text-navy-500 mt-0.5">
              {familyMukhiInfo?.status === 'NO_FAMILY'
                ? 'This person is not currently listed in an active family unit.'
                : 'No official Mukhi is currently assigned to this family.'}
            </p>
          </div>
        )}
      </section>

      {/* Member Occupation Update Requests & Administrative Tracking */}
      {canViewProtected && (
        <MyOccupationRequestsSection person={person} canRequest={canViewProtected} />
      )}

      {/* Privacy settings (Restricted to Mukhi / Admins: SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR) */}
      {isPrivacyManager && (
        <section aria-labelledby="privacy-heading">
          <h3
            id="privacy-heading"
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
          >
            Privacy settings
          </h3>
          <dl>
            <DetailRow
              label="Profile visibility"
              value={PRIVACY_LEVEL_LABELS[person.profile_privacy as PrivacyLevel]}
            />
            <DetailRow
              label="Contact visibility"
              value={PRIVACY_LEVEL_LABELS[person.contact_privacy as PrivacyLevel]}
            />
            <DetailRow
              label="Date of birth visibility"
              value={PRIVACY_LEVEL_LABELS[person.dob_privacy as PrivacyLevel]}
            />
          </dl>
        </section>
      )}

      {/* Record meta */}
      <section aria-labelledby="meta-heading">
        <h3
          id="meta-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Record info
        </h3>
        <dl>
          <DetailRow label="Added" value={formatDate(person.created_at)} />
          <DetailRow label="Last updated" value={formatDate(person.updated_at)} />
        </dl>
      </section>

      {/* Direct Occupation Update Modal */}
      {hasEditPermission && updateOccupationModalOpen && (
        <UpdateOccupationModal
          person={person}
          isOpen={updateOccupationModalOpen}
          onClose={() => setUpdateOccupationModalOpen(false)}
        />
      )}

      {/* Profile Photo Upload & Safe Replacement Dialog */}
      {hasEditPermission && avatarDialogOpen && (
        <AvatarUploadDialog
          isOpen={avatarDialogOpen}
          onClose={() => setAvatarDialogOpen(false)}
          target={{ type: 'person', id: person.id }}
          currentAvatarUrl={avatarUrl}
          title="Update Profile Photo"
          onSuccess={(newUrl) => {
            setAvatarUrl(newUrl)
            onAvatarUpdated?.(newUrl)
          }}
        />
      )}
    </div>
  )
}
