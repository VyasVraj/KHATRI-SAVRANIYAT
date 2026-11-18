/**
 * CreateInvitationModal — Dialog for family creators/moderators to issue a family invitation.
 *
 * Requirements:
 * - Only authorized for family creator or community moderator.
 * - Sourced from usePersonList() to select an existing census person.
 * - Allows selecting family_role (defaulting to EXTENDED; never grants is_head).
 * - Enforces recipient email validation.
 * - Generates cryptographically secure token client-side and transmits only token_hash.
 * - Displays shareable invitation URL upon success with single-click copy.
 * - Tokens are NEVER logged.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { X, Mail, Check, Copy, AlertCircle, Link as LinkIcon, Search, User } from 'lucide-react'
import { usePersonList } from '@/features/people/hooks/usePersonList'
import { useInvitationMutations } from '../hooks/useInvitations'
import { FAMILY_ROLE_LABELS, FAMILY_ROLES } from '@/constants/app'
import type { FamilyRole } from '@/types'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'
import { MobileVerificationNotice } from './MobileVerificationNotice'
import type { CreatedInvitationResult } from '../types'

export interface CreateInvitationModalProps {
  familyId: string
  isOpen: boolean
  onClose: () => void
}

export function CreateInvitationModal({
  familyId,
  isOpen,
  onClose,
}: CreateInvitationModalProps) {
  const { data: persons = [], isLoading: isLoadingPersons } = usePersonList({ limit: 100 })
  const { createInvitation } = useInvitationMutations()

  const [personId, setPersonId] = useState('')
  const [personSearchQuery, setPersonSearchQuery] = useState('')
  const [isPersonDropdownOpen, setIsPersonDropdownOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [invitedEmail, setInvitedEmail] = useState('')
  const [role, setRole] = useState<FamilyRole>(FAMILY_ROLES.EXTENDED)
  const [expirationDays, setExpirationDays] = useState('7')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createdResult, setCreatedResult] = useState<CreatedInvitationResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setPersonId('')
      setPersonSearchQuery('')
      setIsPersonDropdownOpen(false)
      setInvitedEmail('')
      setRole(FAMILY_ROLES.EXTENDED)
      setExpirationDays('7')
      setErrorMessage(null)
      setCreatedResult(null)
      setCopied(false)
    }
  }, [isOpen])

  const selectedPerson = useMemo(() => {
    return persons.find((p) => p.id === personId) || null
  }, [persons, personId])

  const filteredPersons = useMemo(() => {
    if (!personSearchQuery.trim()) return persons
    const query = personSearchQuery.toLowerCase().trim()
    return persons.filter((p) => {
      const full = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ').toLowerCase()
      const year = p.date_of_birth ? p.date_of_birth.split('-')[0] : ''
      const city = p.city ? p.city.toLowerCase() : ''
      return (
        full.includes(query) ||
        p.first_name?.toLowerCase().includes(query) ||
        p.last_name?.toLowerCase().includes(query) ||
        year.includes(query) ||
        city.includes(query)
      )
    })
  }, [persons, personSearchQuery])

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    if (!personId) {
      setErrorMessage('Please select a census person record to invite.')
      return
    }

    if (!invitedEmail || !invitedEmail.includes('@')) {
      setErrorMessage('A valid recipient email address is required.')
      return
    }

    const days = parseInt(expirationDays, 10) || 7
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    try {
      const result = await createInvitation.mutateAsync({
        familyId,
        personId,
        invitedEmail,
        role,
        expiresAt,
      })
      setCreatedResult(result)
    } catch (err) {
      setErrorMessage(
        (err as { message?: string }).message ??
          'Could not create invitation. Please check the details and try again.'
      )
    }
  }

  async function handleCopy() {
    if (!createdResult?.inviteUrl) return
    try {
      await navigator.clipboard.writeText(createdResult.inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-invitation-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-teal-600" aria-hidden="true" />
            <h2 id="create-invitation-title" className="text-lg font-semibold text-navy-900">
              Invite Family Member
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success View */}
        {createdResult ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <p className="font-semibold text-sm">Invitation Created Successfully</p>
              <p className="mt-1 text-xs text-emerald-700">
                A single-use, cryptographically secure invitation link has been generated. Share this link directly with the recipient.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="shareable-link-input" className="block text-xs font-semibold text-navy-700 uppercase tracking-wide">
                Shareable Invitation Link
              </label>
              <div className="flex gap-2">
                <input
                  id="shareable-link-input"
                  type="text"
                  readOnly
                  value={createdResult.inviteUrl}
                  className="w-full rounded-md border border-navy-200 bg-navy-50 px-3 py-2 text-xs font-mono text-navy-800 focus:outline-none select-all"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCopy}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>
            </div>

            <MobileVerificationNotice />

            <div className="pt-2 flex justify-end">
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* Form View */
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>{errorMessage}</p>
              </div>
            )}

            {/* Person selection - Searchable Combobox */}
            <div className="relative">
              <label
                htmlFor="invitation-person-search"
                className="block text-sm font-medium text-navy-700 mb-1"
              >
                Census Person Record <span className="text-red-500">*</span>
              </label>

              {isLoadingPersons ? (
                <div className="h-10 w-full animate-pulse rounded-md bg-navy-100" />
              ) : selectedPerson ? (
                <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50/70 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-navy-900">
                        {[selectedPerson.first_name, selectedPerson.middle_name, selectedPerson.last_name]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-navy-600 mt-0.5">
                        {selectedPerson.date_of_birth && (
                          <span>b. {selectedPerson.date_of_birth.split('-')[0]}</span>
                        )}
                        {selectedPerson.gender && (
                          <span className="capitalize">• {selectedPerson.gender.toLowerCase()}</span>
                        )}
                        {selectedPerson.city && (
                          <span>• {selectedPerson.city}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPersonId('')
                      setPersonSearchQuery('')
                      setTimeout(() => searchInputRef.current?.focus(), 50)
                    }}
                    className="rounded-md border border-navy-200 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 shadow-2xs hover:bg-navy-50"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative flex items-center">
                    <Search className="pointer-events-none absolute left-3 h-4 w-4 text-navy-400" />
                    <input
                      ref={searchInputRef}
                      id="invitation-person-search"
                      type="text"
                      value={personSearchQuery}
                      onChange={(e) => {
                        setPersonSearchQuery(e.target.value)
                        setIsPersonDropdownOpen(true)
                      }}
                      onFocus={() => setIsPersonDropdownOpen(true)}
                      placeholder="Search census person by name, birth year, city..."
                      className="w-full rounded-md border border-navy-200 bg-white pl-9 pr-8 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    {personSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setPersonSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 p-1 text-navy-400 hover:text-navy-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown Results */}
                  {isPersonDropdownOpen && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-navy-200 bg-white py-1 shadow-lg">
                      {filteredPersons.length === 0 ? (
                        <div className="p-3 text-center text-xs text-navy-500">
                          No matching census person found.
                        </div>
                      ) : (
                        filteredPersons.map((p) => {
                          const name = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setPersonId(p.id)
                                setIsPersonDropdownOpen(false)
                                setPersonSearchQuery('')
                              }}
                              className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-teal-50 flex items-center justify-between group"
                            >
                              <div>
                                <span className="font-semibold text-navy-900 group-hover:text-teal-900 text-sm">
                                  {name}
                                </span>
                                <span className="ml-2 text-navy-500">
                                  {p.date_of_birth ? `(b. ${p.date_of_birth.split('-')[0]})` : ''}
                                  {p.city ? ` • ${p.city}` : ''}
                                </span>
                              </div>
                              <span className="text-[11px] font-medium text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                Select
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Hidden input to ensure HTML form validation passes only when person is chosen */}
              <input
                type="text"
                value={personId}
                onChange={() => {}}
                required
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />

              <p className="mt-1 text-xs text-navy-500">
                The invitation will seat this specific census individual in the family roster.
              </p>
            </div>

            {/* Recipient Email */}
            <div>
              <label
                htmlFor="invitation-email-input"
                className="block text-sm font-medium text-navy-700 mb-1"
              >
                Recipient Email <span className="text-red-500">*</span>
              </label>
              <Input
                id="invitation-email-input"
                type="email"
                required
                value={invitedEmail}
                onChange={(e) => setInvitedEmail(e.target.value)}
                placeholder="recipient@example.com"
              />
              <p className="mt-1 text-xs text-navy-500">
                Email address of the intended recipient.
              </p>
            </div>

            {/* Role Selection */}
            <div>
              <label
                htmlFor="invitation-role-select"
                className="block text-sm font-medium text-navy-700 mb-1"
              >
                Family Role <span className="text-red-500">*</span>
              </label>
              <select
                id="invitation-role-select"
                value={role}
                onChange={(e) => setRole(e.target.value as FamilyRole)}
                className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {Object.entries(FAMILY_ROLES).map(([key, val]) => {
                  if (val === 'HEAD') return null // Family Head is not granted via invitation
                  return (
                    <option key={key} value={val}>
                      {FAMILY_ROLE_LABELS[val]}
                    </option>
                  )
                })}
              </select>
              <p className="mt-1 text-xs text-navy-500">
                Family Head role cannot be assigned via invitation (head-uniqueness preserved).
              </p>
            </div>

            {/* Expiration Days */}
            <div>
              <label
                htmlFor="invitation-expiration-select"
                className="block text-sm font-medium text-navy-700 mb-1"
              >
                Link Validity
              </label>
              <select
                id="invitation-expiration-select"
                value={expirationDays}
                onChange={(e) => setExpirationDays(e.target.value)}
                className="w-full rounded-md border border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="1">24 hours (1 day)</option>
                <option value="3">3 days</option>
                <option value="7">7 days (recommended)</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>

            <MobileVerificationNotice />

            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-navy-100">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createInvitation.isPending}>
                <LinkIcon className="h-4 w-4 mr-1.5" />
                {createInvitation.isPending ? 'Generating Link…' : 'Generate Invitation Link'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
