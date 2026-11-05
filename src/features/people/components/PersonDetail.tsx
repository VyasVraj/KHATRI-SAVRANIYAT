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
import { Camera } from 'lucide-react'
import type { Tables } from '@/types/database.types'
import { PRIVACY_LEVEL_LABELS, canManagePrivacy } from '@/constants/app'
import { AuthContext } from '@/features/auth/context/AuthContext'
import type { PrivacyLevel } from '@/types'
import { AvatarImage, AvatarUploadDialog } from '@/features/media'
import { Button } from '@/components/forms/Button'
import { getRespectiveMukhi } from '@/features/community/services/mukhi.service'

type PersonRow = Tables<'persons'>

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
export function PersonDetail({ person, canEdit = false, onAvatarUpdated }: PersonDetailProps) {
  const auth = useContext(AuthContext)
  const isPrivacyManager = canManagePrivacy(auth?.profile?.role)
  const isOwner = Boolean(auth?.user?.id && person.user_id && auth.user.id === person.user_id)
  const isSameFamily = Boolean((person as unknown as { is_same_family?: boolean })?.is_same_family)
  const canViewProtected = isPrivacyManager || isOwner || isSameFamily

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(person.avatar_url ?? null)
  const [contactRequested, setContactRequested] = useState(false)

  const respectiveMukhi = getRespectiveMukhi(person.birth_place, null, canViewProtected)

  const fullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')

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
            <h2 id="person-name-heading" className="text-xl font-semibold text-navy-900 truncate">
              {fullName}
            </h2>
            {person.maiden_name && (
              <p className="mt-0.5 text-sm text-navy-500 truncate">née {person.maiden_name}</p>
            )}
          </div>
        </div>

        {canEdit && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAvatarDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Camera className="h-4 w-4" />
              Change photo
            </Button>
          </div>
        )}
      </section>

      {avatarDialogOpen && (
        <AvatarUploadDialog
          isOpen={avatarDialogOpen}
          onClose={() => setAvatarDialogOpen(false)}
          target={{ type: 'person', id: person.id }}
          currentAvatarUrl={currentAvatarUrl}
          onSuccess={(newUrl) => {
            setCurrentAvatarUrl(newUrl)
            setAvatarDialogOpen(false)
            onAvatarUpdated?.(newUrl)
          }}
        />
      )}

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
              <DetailRow label="Birth place" value={person.birth_place} />
            </>
          ) : (
            <>
              {person.age !== undefined && person.age !== null && (
                <DetailRow label="Calculated age" value={`${person.age} years`} />
              )}
            </>
          )}
          <DetailRow label="Date of death" value={formatDate(person.date_of_death)} />
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
          <DetailRow label="Gotra" value={person.gotra} />
          <DetailRow label="Nukh" value={person.nukh} />
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

      {/* Respective Regional Mukhi Association */}
      <section aria-labelledby="mukhi-card-heading" className="rounded-lg border border-navy-200 bg-navy-50/60 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 id="mukhi-card-heading" className="text-xs font-semibold uppercase tracking-wide text-navy-500">
              Assigned Regional Mukhi
            </h4>
            <p className="mt-1 text-sm font-semibold text-navy-900">
              {respectiveMukhi.name}
            </p>
            <p className="text-xs text-navy-600">
              {respectiveMukhi.designation} • {respectiveMukhi.city}, {respectiveMukhi.state}
            </p>
            {canViewProtected && respectiveMukhi.phone && (
              <p className="mt-1 text-xs font-mono text-brand-700">
                Direct Contact: {respectiveMukhi.phone}
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
            Your connection request has been forwarded to Mukhi {respectiveMukhi.display_name}. Community elders will coordinate verified introduction.
          </p>
        )}
      </section>

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
