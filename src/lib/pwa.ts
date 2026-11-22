/**
 * Client PWA Registration & Lifecycle Management
 *
 * Capabilities:
 * - Safe service worker registration (guards against unsupported environments, SSR, or insecure contexts).
 * - Detects background updates and tracks waiting service workers.
 * - Captures beforeinstallprompt event for deferred app installation.
 * - Detects standalone mode (app already installed).
 * - Identifies platform (Android, iOS, Windows, macOS) for tailored install guidance.
 * - Dispatches 'pwa-update-available', 'pwa-install-ready', and 'pwa-offline-change' events.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export type PwaPlatform = 'ios' | 'android' | 'windows' | 'macos' | 'other'
export type PwaBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other'

export interface PwaInstallState {
  isInstalled: boolean
  canPrompt: boolean
  platform: PwaPlatform
  browser: PwaBrowser
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
let registrationInstance: ServiceWorkerRegistration | null = null

type UpdateListener = (registration: ServiceWorkerRegistration) => void
type OfflineListener = (isOnline: boolean) => void
type InstallStateListener = (state: PwaInstallState) => void

const updateListeners = new Set<UpdateListener>()
const offlineListeners = new Set<OfflineListener>()
const installListeners = new Set<InstallStateListener>()

/**
 * Returns whether service workers are supported in the current runtime environment.
 */
export function isPwaSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Detects whether the application is running in standalone mode (already installed).
 */
export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false

  // Standard PWA standalone display mode
  const isStandaloneMedia =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false
  // iOS Safari standalone flag
  const isIosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  // Android TWA / WebAPK flag
  const isAndroidApp = typeof document !== 'undefined' && document.referrer.includes('android-app://')

  return Boolean(isStandaloneMedia || isIosStandalone || isAndroidApp)
}

/**
 * Detects the user's operating system platform.
 */
export function getPlatform(): PwaPlatform {
  if (typeof navigator === 'undefined') return 'other'

  const ua = navigator.userAgent || ''
  const platform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || ''

  if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios'
  }
  if (/Android/i.test(ua)) {
    return 'android'
  }
  if (/Win/i.test(platform) || /Windows/i.test(ua)) {
    return 'windows'
  }
  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) {
    return 'macos'
  }

  return 'other'
}

/**
 * Detects the user's browser.
 */
export function getBrowser(): PwaBrowser {
  if (typeof navigator === 'undefined') return 'other'

  const ua = navigator.userAgent || ''

  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Edg/i.test(ua)) return 'edge'
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'chrome'
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'safari'
  if (/Firefox/i.test(ua)) return 'firefox'

  return 'other'
}

/**
 * Returns the current PWA installability snapshot.
 */
export function getInstallState(): PwaInstallState {
  return {
    isInstalled: isAppInstalled(),
    canPrompt: Boolean(deferredInstallPrompt),
    platform: getPlatform(),
    browser: getBrowser(),
  }
}

function notifyInstallListeners() {
  const state = getInstallState()
  installListeners.forEach((listener) => {
    try {
      listener(state)
    } catch {
      // Safe no-op
    }
  })
}

/**
 * Registers the production service worker (/sw.js) with lifecycle update listeners.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPwaSupported()) {
    return null
  }

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
 * Global beforeinstallprompt and appinstalled event listeners.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferredInstallPrompt = e as BeforeInstallPromptEvent
    notifyInstallListeners()
  })

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    try {
      localStorage.setItem('khatri_pwa_installed', 'true')
    } catch {
      // Non-blocking
    }
    notifyInstallListeners()
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
 * Subscribes a listener to PWA installation state changes.
 */
export function onInstallStateChange(listener: InstallStateListener): () => void {
  installListeners.add(listener)
  listener(getInstallState())
  return () => {
    installListeners.delete(listener)
  }
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

  try {
    await deferredInstallPrompt.prompt()
    const choice = await deferredInstallPrompt.userChoice
    if (choice.outcome === 'accepted') {
      deferredInstallPrompt = null
      notifyInstallListeners()
      return true
    }
    return false
  } catch {
    return false
  }
}
