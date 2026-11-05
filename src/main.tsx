/**
 * Application entry point
 *
 * Mounts the React application into the DOM.
 * Imports global styles before React tree renders.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { App } from '@/app/App'
import { registerServiceWorker } from '@/lib/pwa'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error(
    '[Community Roots] Root element #root not found. ' +
      'Check index.html — the <div id="root"> element must exist.'
  )
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Register production PWA service worker asynchronously
registerServiceWorker()
