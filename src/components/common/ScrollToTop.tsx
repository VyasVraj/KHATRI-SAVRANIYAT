/**
 * ScrollToTop Component
 *
 * Automatically resets the vertical and horizontal scroll position to the top (0, 0)
 * whenever a user navigates from one page/route to another.
 *
 * Invariants & Requirements:
 * - Listens to React Router location changes.
 * - Triggers only on actual route/pathname transitions (page-to-page navigation).
 * - Resets standard browser window (`window.scrollTo({ top: 0, left: 0 })`).
 * - Resets root elements (`document.documentElement`, `document.body`).
 * - Resets any custom main page scroll container (`#main-content`).
 * - Preserves in-page scroll during query parameter changes, modals, dropdowns, or tabs.
 * - Respects destination anchor hashes (#section) when explicitly targeted.
 * - Uses requestAnimationFrame to guarantee the reset executes after the new route renders.
 */

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

export function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const prevPathnameRef = useRef(pathname)

  useEffect(() => {
    // Only execute when the route pathname actually changes (page-to-page navigation)
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname

      if (!hash) {
        const performScrollReset = () => {
          // 1. Reset standard browser window scroll position immediately
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
          }

          // 2. Reset document root and body scroll
          if (typeof document !== 'undefined') {
            document.documentElement.scrollTop = 0
            document.documentElement.scrollLeft = 0
            document.body.scrollTop = 0
            document.body.scrollLeft = 0

            // 3. Reset main content container if scrollable
            const mainContainer = document.getElementById('main-content')
            if (mainContainer) {
              mainContainer.scrollTop = 0
              mainContainer.scrollLeft = 0
            }
          }
        }

        // Run immediately
        performScrollReset()

        // Double check after paint to override any asynchronous browser history scroll restoration
        const frameId = requestAnimationFrame(performScrollReset)
        return () => cancelAnimationFrame(frameId)
      } else {
        // If an anchor hash is specified, allow scrolling to the target anchor element
        const frameId = requestAnimationFrame(() => {
          if (typeof document !== 'undefined') {
            const targetElement = document.getElementById(hash.replace(/^#/, ''))
            if (targetElement) {
              targetElement.scrollIntoView({ behavior: 'smooth' })
            }
          }
        })
        return () => cancelAnimationFrame(frameId)
      }
    }
  }, [pathname, hash])

  return null
}
