/**
 * Application Footer
 *
 * Minimal, professional footer.
 * Design: Consistent with header — deep navy. No gradients.
 */

import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { APP_NAME } from '@/constants/app'

const currentYear = new Date().getFullYear()

export function AppFooter() {
  return (
    <footer className="border-t border-navy-200 bg-navy-900 py-8 text-navy-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand-400" aria-hidden="true" />
            <span className="text-sm font-semibold text-white">{APP_NAME}</span>
          </div>

          {/* Copyright */}
          <p className="text-center text-xs">
            &copy; {currentYear} {APP_NAME}. All rights reserved.
          </p>

          {/* Links */}
          <nav aria-label="Footer navigation">
            <ul className="flex items-center gap-4 text-xs">
              <li>
                <Link
                  to="/privacy"
                  className="transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
                >
                  Terms
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
