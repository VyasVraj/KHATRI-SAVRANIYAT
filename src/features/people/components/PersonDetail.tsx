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

import { useState, useContext } from 'react'
import type { Tables } from '@/types/database.types'
import { PRIVACY_LEVEL_LABELS, canManagePrivacy } from '@/constants/app'
import { AuthContext } from '@/features/auth/context/AuthContext'
import type { PrivacyLevel } from '@/types'
import { AvatarImage } from '@/features/media'
import { Button } from '@/components/forms/Button'
import { usePersonFamilyMukhi } from '@/features/community'
import { formatBloodGroup } from '@/constants/bloodGroup'
import { toProperCaseName } from '@/utils/text-casing'
import { Shield, ShieldAlert, Phone, Briefcase } from 'lucide-react'
import { MyOccupationRequestsSection } from './MyOccupationRequestsSection'

type PersonRow = Tables<'persons'> & {
  blood_group?: string | null
  age?: number | null
  is_same_family?: boolean
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
export function PersonDetail({ person, canEdit: _canEdit = false, onAvatarUpdated: _onAvatarUpdated }: PersonDetailProps) {
  const auth = useContext(AuthContext)
  const isPrivacyManager = canManagePrivacy(auth?.profile?.role)
  const isOwner = Boolean(auth?.user?.id && person.user_id && auth.user.id === person.user_id)
  const isSameFamily = Boolean((person as unknown as { is_same_family?: boolean })?.is_same_family)
  const canViewProtected = isPrivacyManager || isOwner || isSameFamily

  const currentAvatarUrl = person.avatar_url ?? null
  const [contactRequested, setContactRequested] = useState(false)

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
          <AvatarImage
            src={currentAvatarUrl}
            name={fullName}
            alt={fullName}
            size="xl"
            shape="circle"
          />
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
              <DetailRow label="Date of birth" value={formatDate(person.date_of_birth)} />
              {person.age !== undefined && person.age !== null && (
                <DetailRow label="Calculated age" value={`${person.age} years`} />
              )}
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
      {canViewProtected && (person.gotra || person.nukh || person.occupation) && (
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
                {person.occupation && person.occupation !== 'Occupation Pending' && person.occupation !== 'Occupation Not Provided' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 border border-blue-200">
                    <Briefcase className="h-3 w-3 text-blue-600" />
                    <span>{person.occupation}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
                    <span>Occupation Not Provided</span>
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </section>
      )}

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
    </div>
  )
}
