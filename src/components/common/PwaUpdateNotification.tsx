/**
 * PwaUpdateNotification — Non-intrusive Update Toast & Offline Mode Banner
 *
 * Capabilities:
 * - Listens for waiting service worker updates.
 * - Displays a non-intrusive floating toast: "A new version of Community Roots is available. [Update Now]".
 * - Signals the waiting worker via `SKIP_WAITING` on click.
 * - Displays an ambient "Offline Mode" indicator when navigator.onLine is false.
 */

import { useState, useEffect } from 'react'
import { RefreshCw, WifiOff, X } from 'lucide-react'
import {
  onPwaUpdateAvailable,
  activateWaitingWorker,
  onNetworkStatusChange,
  isOnline,
} from '@/lib/pwa'

export function PwaUpdateNotification() {
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [isUpdateVisible, setIsUpdateVisible] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isNetworkOffline, setIsNetworkOffline] = useState(!isOnline())

  useEffect(() => {
    // 1. Subscribe to service worker updates
    const unsubscribeUpdate = onPwaUpdateAvailable((reg) => {
      setUpdateRegistration(reg)
      setIsUpdateVisible(true)
    })

    // 2. Subscribe to network status changes
    const unsubscribeNetwork = onNetworkStatusChange((online) => {
      setIsNetworkOffline(!online)
    })

    return () => {
      unsubscribeUpdate()
      unsubscribeNetwork()
    }
  }, [])

  const handleUpdate = () => {
    setIsUpdating(true)
    activateWaitingWorker(updateRegistration)
  }

  return (
    <>
      {/* Offline Mode Banner (Ambient, top of viewport) */}
      {isNetworkOffline && (
        <div
          data-testid="pwa-offline-banner"
          role="status"
          aria-live="polite"
          className="bg-amber-600 text-white px-4 py-2 text-xs font-medium text-center flex items-center justify-center gap-2 shadow-sm sticky top-0 z-50 transition-all"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            You are currently in <strong>Offline Mode</strong>. Live database synchronization and data mutations are paused until connection is restored.
          </span>
        </div>
      )}

      {/* PWA Update Toast (Floating, bottom-right) */}
      {isUpdateVisible && (
        <div
          data-testid="pwa-update-toast"
          role="alert"
          aria-live="assertive"
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-navy-200 bg-white p-4 shadow-xl space-y-3 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600 shrink-0">
                <RefreshCw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-navy-900">Update Available</h4>
                <p className="text-xs text-navy-500">A new version of KHATRI SARVANIYAT is ready.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsUpdateVisible(false)}
              className="text-navy-400 hover:text-navy-600 transition-colors p-1"
              aria-label="Dismiss update notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-navy-100">
            <button
              type="button"
              onClick={() => setIsUpdateVisible(false)}
              className="rounded-lg px-2.5 py-1 text-xs text-navy-600 hover:bg-navy-50 transition-colors"
            >
              Later
            </button>
            <button
              type="button"
              onClick={handleUpdate}
              disabled={isUpdating}
              data-testid="pwa-update-button"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Now'
              )}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
