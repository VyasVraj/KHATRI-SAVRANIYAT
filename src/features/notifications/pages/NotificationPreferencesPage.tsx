/**
 * NotificationPreferencesPage — User communication channel & category settings
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 *
 * Invariants:
 * - Scoped strictly to authenticated caller via auth.uid().
 * - In-app notifications are authoritative and mandatory.
 * - Account security alerts are mandatory and cannot be disabled.
 * - Only genuine database columns from public.notification_preferences are manipulated.
 */

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Mail,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Loader2,
  Lock,
} from 'lucide-react'
import { ROUTES } from '@/constants/app'
import { useNotificationPreferences } from '../hooks/useNotificationPreferences'
import type { UpdatePreferencesInput } from '../types'

export function NotificationPreferencesPage() {
  const {
    preferences,
    isLoading,
    isError,
    error,
    refetch,
    updatePreferences,
    isUpdating,
  } = useNotificationPreferences()

  // Local form state initialized directly from loaded preferences
  const [emailEnabled, setEmailEnabled] = useState(preferences?.email_enabled ?? true)
  const [connections, setConnections] = useState(preferences?.email_connections ?? true)
  const [invitations, setInvitations] = useState(preferences?.email_invitations ?? true)
  const [claims, setClaims] = useState(preferences?.email_claims ?? true)
  const [verifications, setVerifications] = useState(preferences?.email_verifications ?? true)
  const [announcements, setAnnouncements] = useState(preferences?.email_announcements ?? false)
  const [events, setEvents] = useState(preferences?.email_events ?? true)

  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  // Sync state when preferences are loaded
  useEffect(() => {
    if (preferences) {
      setEmailEnabled(preferences.email_enabled)
      setConnections(preferences.email_connections)
      setInvitations(preferences.email_invitations)
      setClaims(preferences.email_claims)
      setVerifications(preferences.email_verifications)
      setAnnouncements(preferences.email_announcements)
      setEvents(preferences.email_events)
      setIsDirty(false)
    }
  }, [preferences])

  const handleToggle = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.checked)
      setIsDirty(true)
      setSaveSuccess(false)
      setSaveError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveError(null)
    setSaveSuccess(false)

    const payload: UpdatePreferencesInput = {
      in_app_enabled: true, // Always true (authoritative)
      email_enabled: emailEnabled,
      email_connections: connections,
      email_invitations: invitations,
      email_claims: claims,
      email_verifications: verifications,
      email_announcements: announcements,
      email_events: events,
      email_family_media: false,
    }

    updatePreferences.mutate(payload, {
      onSuccess: () => {
        setSaveSuccess(true)
        setIsDirty(false)
        setTimeout(() => setSaveSuccess(false), 4000)
      },
      onError: (err) => {
        setSaveError(err.message || 'Failed to save notification preferences.')
      },
    })
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center p-12 text-navy-500">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600 mb-3" />
          <p className="text-sm font-medium">Loading preferences...</p>
        </div>
      </div>
    )
  }

  if (isError && !preferences) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-red-600 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-red-900">Failed to load preferences</h2>
          <p className="mt-1 text-sm text-red-700 max-w-md mx-auto">
            {error?.message || 'Unable to connect to the notification service. Please try again.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link & breadcrumb */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          to={ROUTES.PROFILE}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-600 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Profile
        </Link>
        <Link
          to={ROUTES.NOTIFICATIONS}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <Bell className="h-3.5 w-3.5" />
          View Notification Center
        </Link>
      </div>

      {/* Page Title & Intro */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">
          Notification Preferences
        </h1>
        <p className="mt-1 text-sm text-navy-600">
          Configure how you receive activity updates, invitations, and alerts across the platform.
        </p>
      </div>

      {/* Feedback Alerts */}
      {saveSuccess && (
        <div
          role="status"
          className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800"
        >
          <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <span>Your notification preferences have been saved successfully.</span>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800"
        >
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: In-App Notifications (Authoritative / Always On) */}
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Bell className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-navy-900">
                    In-App Notification Center
                  </h2>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    Always Active
                  </span>
                </div>
                <p className="mt-1 text-xs text-navy-600 max-w-xl">
                  In-app notifications are delivered to your header bell and notification center in real time.
                  This canonical platform inbox ensures you never miss critical community records and verified requests.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Email Notifications Settings */}
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm space-y-6">
          {/* Master Email Switch */}
          <div className="flex items-center justify-between border-b border-navy-200 pb-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                <Mail className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <label
                  htmlFor="master-email-toggle"
                  className="text-base font-semibold text-navy-900 cursor-pointer"
                >
                  Email Notifications
                </label>
                <p className="text-xs text-navy-600 mt-0.5">
                  Send important alerts and digests to your registered email address.
                </p>
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="master-email-toggle"
                type="checkbox"
                checked={emailEnabled}
                onChange={handleToggle(setEmailEnabled)}
                className="h-5 w-5 rounded border-navy-300 text-brand-600 focus:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Category-Level Email Controls */}
          <div className={`space-y-5 transition-opacity ${emailEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              Email Notification Categories
            </h3>

            {/* Connections */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor="pref-connections" className="text-sm font-medium text-navy-900 cursor-pointer">
                  Connection Requests & Acceptances
                </label>
                <p className="text-xs text-navy-500 mt-0.5">
                  Receive an email when someone requests to connect with you or accepts your request.
                </p>
              </div>
              <input
                id="pref-connections"
                type="checkbox"
                checked={connections}
                disabled={!emailEnabled}
                onChange={handleToggle(setConnections)}
                className="h-4 w-4 mt-1 rounded border-navy-300 text-brand-600 focus:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              />
            </div>

            {/* Invitations */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor="pref-invitations" className="text-sm font-medium text-navy-900 cursor-pointer">
                  Family Member Invitations
                </label>
                <p className="text-xs text-navy-500 mt-0.5">
                  Receive an email when a family member accepts an invitation you sent.
                </p>
              </div>
              <input
                id="pref-invitations"
                type="checkbox"
                checked={invitations}
                disabled={!emailEnabled}
                onChange={handleToggle(setInvitations)}
                className="h-4 w-4 mt-1 rounded border-navy-300 text-brand-600 focus:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              />
            </div>

            {/* Claims */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor="pref-claims" className="text-sm font-medium text-navy-900 cursor-pointer">
                  Person Claims & Outcomes
                </label>
                <p className="text-xs text-navy-500 mt-0.5">
                  Receive an email when your claim to a census record is reviewed, approved, or rejected.
                </p>
              </div>
              <input
                id="pref-claims"
                type="checkbox"
                checked={claims}
                disabled={!emailEnabled}
                onChange={handleToggle(setClaims)}
                className="h-4 w-4 mt-1 rounded border-navy-300 text-brand-600 focus:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              />
            </div>

            {/* Verifications */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor="pref-verifications" className="text-sm font-medium text-navy-900 cursor-pointer">
                  Verification Reviews
                </label>
                <p className="text-xs text-navy-500 mt-0.5">
                  Receive an email when your submitted verification requests are reviewed by moderators.
                </p>
              </div>
              <input
                id="pref-verifications"
                type="checkbox"
                checked={verifications}
                disabled={!emailEnabled}
                onChange={handleToggle(setVerifications)}
                className="h-4 w-4 mt-1 rounded border-navy-300 text-brand-600 focus:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              />
            </div>

            {/* Announcements */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor="pref-announcements" className="text-sm font-medium text-navy-900 cursor-pointer">
                  Community Announcements & Group Roles
                </label>
                <p className="text-xs text-navy-500 mt-0.5">
                  Receive an email when community leadership publishes major bulletins or assigns group roles.
                </p>
              </div>
              <input
                id="pref-announcements"
                type="checkbox"
                checked={announcements}
                disabled={!emailEnabled}
                onChange={handleToggle(setAnnouncements)}
                className="h-4 w-4 mt-1 rounded border-navy-300 text-brand-600 focus:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              />
            </div>

            {/* Events */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor="pref-events" className="text-sm font-medium text-navy-900 cursor-pointer">
                  Community Events & RSVPs
                </label>
                <p className="text-xs text-navy-500 mt-0.5">
                  Receive an email when an event you are attending is cancelled or when guests confirm RSVPs.
                </p>
              </div>
              <input
                id="pref-events"
                type="checkbox"
                checked={events}
                disabled={!emailEnabled}
                onChange={handleToggle(setEvents)}
                className="h-4 w-4 mt-1 rounded border-navy-300 text-brand-600 focus:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Card 3: Account Security (Mandatory / Immutable) */}
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-navy-900">
                    Account Security & Critical Notices
                  </h2>
                  <span className="flex items-center gap-1 rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
                    <Lock className="h-3 w-3" />
                    Mandatory
                  </span>
                </div>
                <p className="mt-1 text-xs text-navy-600 max-w-xl">
                  Crucial emails regarding password resets, sign-in anomalies, and security policy alerts are
                  always sent to ensure account protection and cannot be disabled.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to={ROUTES.PROFILE}
            className="rounded-lg border border-navy-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 shadow-sm hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isUpdating || !isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUpdating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save Preferences
          </button>
        </div>
      </form>
    </div>
  )
}
