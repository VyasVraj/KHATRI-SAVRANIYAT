/**
 * Client PWA Registration & Lifecycle Management
 *
 * Capabilities:
 * - Safe service worker registration (guards against unsupported environments, SSR, or insecure contexts).
 * - Detects background updates and tracks waiting service workers.
 * - Captures beforeinstallprompt event for deferred app installation.
 * - Dispatches 'pwa-update-available' and 'pwa-offline-change' events to the client.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
let registrationInstance: ServiceWorkerRegistration | null = null

type UpdateListener = (registration: ServiceWorkerRegistration) => void
type OfflineListener = (isOnline: boolean) => void

const updateListeners = new Set<UpdateListener>()
const offlineListeners = new Set<OfflineListener>()

/**
 * Returns whether service workers are supported in the current runtime environment.
 */
export function isPwaSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Registers the production service worker (/sw.js) with lifecycle update listeners.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPwaSupported()) {
    return null
  }

  // Only register in production or when explicitly enabled
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })
    registrationInstance = reg

    // Check if an updated worker is already waiting
    if (reg.waiting) {
      notifyUpdateAvailable(reg)
    }

    // Detect new worker installing
    reg.addEventListener('updatefound', () => {
      const installingWorker = reg.installing
      if (!installingWorker) return

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // A new version has been installed and is waiting
          notifyUpdateAvailable(reg)
        }
      })
    })

    // Listen for controllerchange (when a new worker takes over via skipWaiting)
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })

    return reg
  } catch {
    // Graceful error logging: do not throw or break page rendering
    return null
  }
}

/**
 * Notifies all registered listeners that a service worker update is ready.
 */
function notifyUpdateAvailable(reg: ServiceWorkerRegistration) {
  updateListeners.forEach((listener) => {
    try {
      listener(reg)
    } catch {
      // Safe no-op on listener error
    }
  })
}

/**
 * Subscribes a listener to service worker update events.
 * Returns an unsubscribe function.
 */
export function onPwaUpdateAvailable(listener: UpdateListener): () => void {
  updateListeners.add(listener)

  // Immediately notify if a worker is already waiting
  if (registrationInstance && registrationInstance.waiting) {
    listener(registrationInstance)
  }

  return () => {
    updateListeners.delete(listener)
  }
}

/**
 * Signals the waiting service worker to activate via SKIP_WAITING.
 */
export function activateWaitingWorker(reg?: ServiceWorkerRegistration | null): void {
  const targetReg = reg || registrationInstance
  if (targetReg && targetReg.waiting) {
    targetReg.waiting.postMessage({ type: 'SKIP_WAITING' })
  }
}

/**
 * Sets up global beforeinstallprompt listener.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferredInstallPrompt = e as BeforeInstallPromptEvent
  })

  // Online / Offline network event listeners
  window.addEventListener('online', () => {
    offlineListeners.forEach((cb) => cb(true))
  })

  window.addEventListener('offline', () => {
    offlineListeners.forEach((cb) => cb(false))
  })
}

/**
 * Subscribes a listener to network connectivity changes.
 */
export function onNetworkStatusChange(listener: OfflineListener): () => void {
  offlineListeners.add(listener)
  return () => {
    offlineListeners.delete(listener)
  }
}

/**
 * Checks current online status.
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

/**
 * Prompts the user to install the PWA if an installation prompt was captured.
 */
export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) {
    return false
  }

  await deferredInstallPrompt.prompt()
  const choice = await deferredInstallPrompt.userChoice
  deferredInstallPrompt = null
  return choice.outcome === 'accepted'
}
