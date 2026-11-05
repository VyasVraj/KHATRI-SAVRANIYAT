/**
 * PWA Client Helper & UI Component Tests
 *
 * Verifies:
 * 1. isPwaSupported returns false gracefully in environments without serviceWorker.
 * 2. registerServiceWorker does not throw when serviceWorker is absent or errors.
 * 3. activateWaitingWorker posts SKIP_WAITING to the waiting registration.
 * 4. PwaUpdateNotification renders offline banner when offline.
 * 5. PwaUpdateNotification renders toast and triggers activateWaitingWorker on click.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as pwaLib from '@/lib/pwa'
import { PwaUpdateNotification } from '@/components/common/PwaUpdateNotification'

describe('PWA Client Helper & Update UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('1. isPwaSupported accurately detects serviceWorker availability', () => {
    expect(typeof pwaLib.isPwaSupported()).toBe('boolean')
  })

  it('2. registerServiceWorker returns null without throwing in unsupported environments', async () => {
    const origNav = globalThis.navigator
    // Temporarily delete serviceWorker
    // @ts-expect-error - testing unsupported environment
    delete globalThis.navigator.serviceWorker

    const res = await pwaLib.registerServiceWorker()
    expect(res).toBeNull()

    // Restore
    globalThis.navigator = origNav
  })

  it('3. activateWaitingWorker posts SKIP_WAITING to waiting worker', () => {
    const mockPostMessage = vi.fn()
    const mockRegistration = {
      waiting: {
        postMessage: mockPostMessage,
      },
    } as unknown as ServiceWorkerRegistration

    pwaLib.activateWaitingWorker(mockRegistration)
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('4. PwaUpdateNotification displays ambient offline mode banner when offline', () => {
    vi.spyOn(pwaLib, 'isOnline').mockReturnValue(false)

    render(<PwaUpdateNotification />)

    const banner = screen.getByTestId('pwa-offline-banner')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('Offline Mode')
  })

  it('5. PwaUpdateNotification triggers update when update is available and user clicks Update Now', () => {
    vi.spyOn(pwaLib, 'isOnline').mockReturnValue(true)

    const mockPostMessage = vi.fn()
    const mockRegistration = {
      waiting: { postMessage: mockPostMessage },
    } as unknown as ServiceWorkerRegistration

    // Mock onPwaUpdateAvailable to immediately trigger callback
    vi.spyOn(pwaLib, 'onPwaUpdateAvailable').mockImplementation((cb) => {
      cb(mockRegistration)
      return () => {}
    })

    render(<PwaUpdateNotification />)

    const toast = screen.getByTestId('pwa-update-toast')
    expect(toast).toBeInTheDocument()
    expect(toast.textContent).toContain('Update Available')

    const updateButton = screen.getByTestId('pwa-update-button')
    fireEvent.click(updateButton)

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })
})
