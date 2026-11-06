/**
 * Application Footer
 *
 * Minimal, professional footer.
 * Design: Consistent with header — deep navy. No gradients.
 */

import { Link } from 'react-router-dom'
import { APP_NAME } from '@/constants/app'
import { BrandLogo } from '@/components/common/BrandLogo'

const currentYear = new Date().getFullYear()

export function AppFooter() {
  return (
    <footer className="border-t border-navy-800 bg-navy-950 py-10 text-navy-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Brand & Tagline */}
          <div className="flex flex-col items-center sm:items-start gap-1.5">
            <div className="flex items-center gap-2.5">
              <BrandLogo size="xs" alt={APP_NAME} />
              <span className="text-base font-bold tracking-tight text-white">{APP_NAME}</span>
            </div>
            <p className="text-xs font-medium text-brand-300/90 tracking-wide">
              Ek Samaj • Ek Pehchaan • Ek Digital Record
            </p>
          </div>

          {/* Copyright */}
          <p className="text-center text-xs text-navy-400">
            &copy; {currentYear} {APP_NAME}. All rights reserved.
          </p>

          {/* Links */}
          <nav aria-label="Footer navigation">
            <ul className="flex items-center gap-5 text-xs font-medium text-navy-300">
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
