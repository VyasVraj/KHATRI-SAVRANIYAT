/**
 * InvitationRedemptionPage — Public preview & authenticated redemption page for invitations.
 *
 * Route: /invite/:token
 *
 * Requirements:
 * - Public preview: Accessible without authentication via get_invitation_by_token RPC.
 * - Displays safe projection: family_name, person_name, invited_email, role, status, expires_at.
 * - State handling:
 *   1. Loading
 *   2. Valid pending invitation
 *   3. Expired invitation
 *   4. Already accepted / revoked
 *   5. Invalid / missing token
 * - Acceptance:
 *   - Requires authentication.
 *   - If unauthenticated, displays "Sign in to accept this invitation" with redirect preserving token in URL.
 *   - Calls canonical RPC accept_invitation with token_hash.
 *   - PERSON != USER: Adds person to family_members, does NOT modify persons.user_id.
 *   - Invalidation of queries & navigation to family detail.
 */

import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Users, Clock, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, LogIn } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useInvitationPreview, useInvitationMutations } from '../hooks/useInvitations'
import { FAMILY_ROLE_LABELS, ROUTES } from '@/constants/app'
import { Button } from '@/components/forms/Button'
import { MobileVerificationNotice } from '../components/MobileVerificationNotice'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function InvitationRedemptionPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthContext()
  const { data: preview, isLoading, error } = useInvitationPreview(token)
  const { acceptInvitation } = useInvitationMutations()

  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [acceptedSuccess, setAcceptedSuccess] = useState(false)

  // Derived status states
  const isPending = preview?.status === 'PENDING' && !preview?.is_expired
  const isExpired = preview?.status === 'EXPIRED' || preview?.is_expired
  const isAlreadyAccepted = preview?.status === 'ACCEPTED'
  const isRevoked = preview?.status === 'REVOKED'

  async function handleAccept() {
    if (!token || !preview) return
    setAcceptError(null)

    try {
      await acceptInvitation.mutateAsync({
        token,
        familyId: preview.family_id,
        personId: preview.person_id,
      })
      setAcceptedSuccess(true)
    } catch (err) {
      setAcceptError(
        (err as { message?: string }).message ??
          'Failed to accept invitation. Please verify and try again.'
      )
    }
  }

  // Missing or malformed token in URL
  if (!token || token.trim().length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-xl border border-navy-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
          <h1 className="text-xl font-bold text-navy-900">Missing Invitation Link</h1>
          <p className="mt-2 text-sm text-navy-600">
            This invitation link appears to be invalid or incomplete. Please request a new invitation link from your family coordinator.
          </p>
          <div className="mt-6">
            <Button variant="secondary" onClick={() => navigate(ROUTES.HOME)}>
              Go to Home
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-r-transparent" />
        <p className="mt-4 text-sm font-medium text-navy-600">Resolving invitation details…</p>
      </div>
    )
  }

  // Not found or error loading invitation
  if (error || !preview) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-xl border border-navy-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-xl font-bold text-navy-900">Invitation Not Found</h1>
          <p className="mt-2 text-sm text-navy-600">
            {(error as Error)?.message ?? 'The invitation link you followed does not exist, was replaced, or has expired.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="secondary" onClick={() => navigate(ROUTES.HOME)}>
              Return Home
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="rounded-xl border border-navy-200 bg-white shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="bg-navy-900 px-6 py-6 text-white">
          <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold uppercase tracking-wider">
            <Users className="h-4 w-4" />
            <span>Family Community Invitation</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold">
            {preview.family_name || 'Community Family'}
          </h1>
          <p className="mt-1 text-sm text-navy-300">
            You have been invited to join this family record on KHATRI SARVANIYAT.
          </p>
        </div>

        {/* Card Body */}
        <div className="p-6 space-y-6">
          {/* Success banner if just accepted */}
          {acceptedSuccess ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 mb-2" />
              <h2 className="text-lg font-bold text-emerald-900">Invitation Accepted!</h2>
              <p className="mt-1 text-sm text-emerald-800">
                You have joined <strong>{preview.family_name}</strong> as a {FAMILY_ROLE_LABELS[preview.role] ?? preview.role}.
              </p>
              <div className="mt-6">
                <Button onClick={() => navigate(ROUTES.FAMILY_DETAIL(preview.family_id))}>
                  View Family Record
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Status alerts */}
              {isExpired && (
                <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  <p className="font-semibold text-sm">This invitation has expired</p>
                  <p className="mt-0.5">
                    This link expired on {formatDate(preview.expires_at)}. Please contact the family creator to request a fresh invitation link.
                  </p>
                </div>
              )}

              {isAlreadyAccepted && (
                <div role="alert" className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-xs text-teal-900">
                  <p className="font-semibold text-sm">Invitation already accepted</p>
                  <p className="mt-0.5">
                    This invitation has already been accepted and fulfilled into the family roster.
                  </p>
                </div>
              )}

              {isRevoked && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900">
                  <p className="font-semibold text-sm">Invitation has been revoked</p>
                  <p className="mt-0.5">
                    This invitation is no longer active.
                  </p>
                </div>
              )}

              {acceptError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                  <p className="font-semibold">Unable to accept invitation</p>
                  <p className="mt-0.5">{acceptError}</p>
                </div>
              )}

              {/* Details List */}
              <div className="rounded-lg border border-navy-100 bg-navy-50/50 p-4 space-y-3">
                <div className="flex justify-between text-sm py-1 border-b border-navy-100">
                  <span className="text-navy-500">Target Family</span>
                  <span className="font-semibold text-navy-900">{preview.family_name || '—'}</span>
                </div>

                <div className="flex justify-between text-sm py-1 border-b border-navy-100">
                  <span className="text-navy-500">Invited Individual</span>
                  <span className="font-semibold text-navy-900">{preview.person_name || 'Census Person'}</span>
                </div>

                <div className="flex justify-between text-sm py-1 border-b border-navy-100">
                  <span className="text-navy-500">Assigned Family Role</span>
                  <span className="font-semibold text-navy-900">
                    {FAMILY_ROLE_LABELS[preview.role] ?? preview.role}
                  </span>
                </div>

                <div className="flex justify-between text-sm py-1 border-b border-navy-100">
                  <span className="text-navy-500">Recipient Email</span>
                  <span className="font-mono text-xs text-navy-800">{preview.invited_email}</span>
                </div>

                <div className="flex justify-between text-sm py-1">
                  <span className="text-navy-500">Expiration</span>
                  <span className="text-navy-700 flex items-center gap-1 text-xs">
                    <Clock className="h-3.5 w-3.5 text-navy-400" />
                    {formatDate(preview.expires_at)}
                  </span>
                </div>
              </div>

              {/* Security & Boundary Notice */}
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Community Census Membership</p>
                  <p className="text-blue-800 mt-0.5">
                    Accepting connects this family record to the census individual. It does not automatically grant ownership or claim of this person record.
                  </p>
                </div>
              </div>

              <MobileVerificationNotice />

              {/* Action Buttons */}
              <div className="pt-2">
                {isPending && (
                  isAuthenticated ? (
                    <Button
                      className="w-full justify-center py-2.5"
                      onClick={handleAccept}
                      disabled={acceptInvitation.isPending}
                    >
                      {acceptInvitation.isPending ? 'Joining Family…' : 'Accept Invitation & Join Family'}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <Button
                        className="w-full justify-center py-2.5"
                        onClick={() => navigate(`${ROUTES.SIGN_IN}?redirect=/invite/${token}`)}
                      >
                        <LogIn className="h-4 w-4 mr-2" />
                        Sign in to Accept Invitation
                      </Button>
                      <p className="text-center text-xs text-navy-500">
                        Don't have an account?{' '}
                        <Link
                          to={`${ROUTES.SIGN_UP}?redirect=/invite/${token}`}
                          className="text-teal-600 font-semibold hover:underline"
                        >
                          Sign up
                        </Link>
                      </p>
                    </div>
                  )
                )}

                {!isPending && (
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={() => navigate(ROUTES.HOME)}
                  >
                    Go to Homepage
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
