/**
 * SendConnectionModal — Modal dialog to initiate a connection request
 * (Phase 7 Subtask 2)
 */

import { useState, useEffect } from 'react'
import { X, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useConnectionMutations } from '../hooks/useConnectionMutations'
import { sendConnectionRequestSchema } from '../schemas/connections.schemas'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'

export interface SendConnectionModalProps {
  isOpen: boolean
  onClose: () => void
  initialAddresseeId?: string
}

export function SendConnectionModal({
  isOpen,
  onClose,
  initialAddresseeId = '',
}: SendConnectionModalProps) {
  const { user } = useAuthContext()
  const callerUserId = user?.id ?? ''
  const { sendRequest } = useConnectionMutations()

  const [addresseeId, setAddresseeId] = useState(initialAddresseeId)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setAddresseeId(initialAddresseeId)
      setErrorMessage(null)
      setIsSuccess(false)
    }
  }, [isOpen, initialAddresseeId])

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

    const trimmedId = addresseeId.trim()
    if (!trimmedId) {
      setErrorMessage('Please enter a user ID.')
      return
    }

    if (trimmedId === callerUserId) {
      setErrorMessage('You cannot connect with yourself.')
      return
    }

    const validation = sendConnectionRequestSchema.safeParse({ addressee_id: trimmedId })
    if (!validation.success) {
      setErrorMessage(validation.error.errors[0]?.message ?? 'Invalid user ID format.')
      return
    }

    try {
      await sendRequest.mutateAsync({ addressee_id: trimmedId })
      setIsSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to send connection request.')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-connection-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-navy-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="send-connection-title" className="text-base font-semibold text-navy-900">
                Send Connection Request
              </h2>
              <p className="text-xs text-navy-500">
                Connect with an authenticated community member
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        {isSuccess ? (
          <div className="mt-6 flex flex-col items-center justify-center py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mb-2" />
            <h3 className="text-sm font-semibold text-navy-900">Request Sent!</h3>
            <p className="mt-1 text-xs text-navy-500">
              Your connection invitation has been sent and is awaiting acceptance.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <span className="flex-1">{errorMessage}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="addressee-id-input"
                className="block text-xs font-medium text-navy-700 mb-1"
              >
                Target User Account ID (UUID)
              </label>
              <Input
                id="addressee-id-input"
                type="text"
                value={addresseeId}
                onChange={(e) => setAddresseeId(e.target.value)}
                placeholder="e.g. 11111111-1111-4111-8111-111111111111"
                disabled={sendRequest.isPending}
                autoFocus
              />
              <p className="mt-1.5 text-xs text-navy-400">
                Enter the platform user ID of the person you wish to connect with.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-navy-100 pt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={sendRequest.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={sendRequest.isPending}
                isLoading={sendRequest.isPending}
              >
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Send Request
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
