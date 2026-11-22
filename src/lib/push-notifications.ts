/**
 * Push Notification Service & Client Subscription Management
 *
 * Capabilities:
 * - Checks Web Push API & Notification API support.
 * - Platform awareness (handles iOS 16.4+ standalone Home Screen requirement).
 * - User-permission request handler (only invoked on explicit user gesture).
 * - Secure subscription registration (never leaks VAPID private keys or service-role secrets).
 * - Privacy invariant: Never exposes personal phone numbers, emails, or sensitive census data in notification payload.
 */

import { isPwaSupported, getPlatform, isAppInstalled } from './pwa'

export interface PushSupportStatus {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  isStandalone: boolean
  requiresHomeScreen: boolean
}

/**
 * Checks whether Web Push Notifications are supported on the current device and browser.
 */
export function getPushSupportStatus(): PushSupportStatus {
  if (typeof window === 'undefined' || !isPwaSupported() || !('Notification' in window)) {
    return {
      supported: false,
      permission: 'unsupported',
      isStandalone: false,
      requiresHomeScreen: false,
    }
  }

  const platform = getPlatform()
  const standalone = isAppInstalled()
  // On iOS, Web Push requires the app to be added to Home Screen (iOS 16.4+)
  const requiresHomeScreen = platform === 'ios' && !standalone

  const hasPushManager = 'serviceWorker' in navigator && 'PushManager' in window

  return {
    supported: hasPushManager && !requiresHomeScreen,
    permission: Notification.permission,
    isStandalone: standalone,
    requiresHomeScreen,
  }
}

/**
 * Requests notification permission on explicit user gesture.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) {
    return 'unsupported'
  }

  try {
    const permission = await Notification.requestPermission()
    return permission
  } catch {
    return 'denied'
  }
}

/**
 * Subscribes the current device to Web Push notifications using the public VAPID key.
 */
export async function subscribeToPush(vapidPublicKey?: string): Promise<PushSubscription | null> {
  const status = getPushSupportStatus()
  if (!status.supported) {
    return null
  }

  try {
    const reg = await navigator.serviceWorker.ready
    if (!reg.pushManager) {
      return null
    }

    // Check if subscription already exists
    let subscription = await reg.pushManager.getSubscription()
    if (subscription) {
      return subscription
    }

    if (!vapidPublicKey) {
      // In development or when VAPID key is configured via backend
      return null
    }

    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey)
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey as unknown as BufferSource,
    })

    return subscription
  } catch {
    return null
  }
}

/**
 * Unsubscribes the current device from Web Push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.ready
    if (!reg.pushManager) return false

    const subscription = await reg.pushManager.getSubscription()
    if (subscription) {
      return await subscription.unsubscribe()
    }
    return true
  } catch {
    return false
  }
}

/**
 * Helper to convert a URL-safe Base64 string to a Uint8Array for VAPID applicationServerKey.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
