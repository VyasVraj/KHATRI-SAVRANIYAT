/**
 * Home Page
 *
 * The community landing and dashboard of Community Roots / KhatriSetu.
 * Matches Android reference design:
 * - Slogan: Ek Samaj • Ek Pehchaan • Ek Digital Record
 * - Pillars: Our People • Our Roots • Our Tomorrow
 * - Quick census action cards with guided tour hooks
 * - Multi-lingual support (English, Hindi, Gujarati)
 */

import { Link } from 'react-router-dom'
import { Users, Search, TreePine, Shield, ArrowRight, Sparkles, Bell } from 'lucide-react'
import { ROUTES } from '@/constants/app'
import { useLanguage } from '@/features/i18n'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { BrandLogo } from '@/components/common/BrandLogo'

export function HomePage() {
  const { t } = useLanguage()
  const { isAuthenticated } = useAuthContext()

  return (
    <div className="flex flex-col">
      {/* Community Branding Banner */}
      <div className="border-b border-navy-800 bg-navy-950 px-4 py-2.5 text-center text-xs font-medium text-navy-300">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 sm:gap-3 flex-wrap">
          <span className="font-semibold text-brand-300 tracking-wide">
            {t('app.slogan')}
          </span>
          <span className="hidden sm:inline text-navy-600">•</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-navy-900 px-2 py-0.5 text-[11px] font-semibold text-brand-200 border border-navy-800">
            <Sparkles className="h-3 w-3 text-amber-400" aria-hidden="true" />
            {t('app.three_pillars')}
          </span>
        </div>
      </div>

      {/* Hero Section */}
      <section className="bg-navy-900 py-16 text-white sm:py-20" aria-labelledby="hero-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex justify-center">
              <div className="relative inline-flex items-center justify-center p-2 rounded-2xl bg-[#081B55] border-2 border-[#D9A62E] shadow-xl">
                <BrandLogo
                  size="xl"
                  priority
                  className="h-24 w-24 sm:h-28 sm:w-28"
                  alt="KHATRI SARVANIYAT Official Emblem"
                />
              </div>
            </div>

            <h1
              id="hero-heading"
              className="mb-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl"
            >
              {t('home.hero_title')}
            </h1>

            <p className="mb-8 text-base text-navy-300 sm:text-lg leading-relaxed">
              {t('home.hero_description')}
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to={isAuthenticated ? ROUTES.FAMILIES : ROUTES.SIGN_UP}
                data-tour-target="census-start"
                className="w-full rounded-lg bg-brand-600 px-7 py-3 text-center font-bold text-white shadow-md transition-all hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 sm:w-auto"
              >
                {t('action.start_census')}
              </Link>
              <Link
                to={ROUTES.DISCOVER}
                className="w-full rounded-lg border border-navy-500 bg-navy-800/60 px-7 py-3 text-center font-semibold text-navy-100 transition-all hover:border-navy-300 hover:bg-navy-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 sm:w-auto"
              >
                {t('action.search_families')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Community Census Quick Action Cards (Android PDF parity) */}
      <section className="bg-navy-800/40 border-b border-navy-200/80 py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Card 1: Start Family Census */}
            <div
              className="flex flex-col justify-between rounded-xl border border-navy-200 bg-white p-5 shadow-xs hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="text-base font-bold text-navy-900">{t('action.start_census')}</h2>
                <p className="mt-1 text-xs text-navy-600 leading-relaxed">
                  {t('home.feature_census_desc')}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-navy-100">
                <Link
                  to={ROUTES.FAMILY_CREATE}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
                >
                  <span>{t('action.start_census')}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>

            {/* Card 2: View Family */}
            <div className="flex flex-col justify-between rounded-xl border border-navy-200 bg-white p-5 shadow-xs hover:border-brand-300 hover:shadow-sm transition-all">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <TreePine className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="text-base font-bold text-navy-900">{t('action.view_family')}</h2>
                <p className="mt-1 text-xs text-navy-600 leading-relaxed">
                  {t('home.feature_tree_desc')}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-navy-100">
                <Link
                  to={ROUTES.FAMILIES}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  <span>{t('action.view_family')}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>

            {/* Card 3: Search Families */}
            <div className="flex flex-col justify-between rounded-xl border border-navy-200 bg-white p-5 shadow-xs hover:border-brand-300 hover:shadow-sm transition-all">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <Search className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="text-base font-bold text-navy-900">{t('action.search_families')}</h2>
                <p className="mt-1 text-xs text-navy-600 leading-relaxed">
                  {t('home.feature_discover_desc')}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-navy-100">
                <Link
                  to={ROUTES.DISCOVER}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800"
                >
                  <span>{t('action.search_families')}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community Updates / Feed Highlight (Tour Step 2 Hook) */}
      <section
        data-tour-target="community-updates"
        className="bg-white py-12 px-4 sm:px-6 lg:px-8 border-b border-navy-100"
        aria-labelledby="updates-heading"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-6 pb-2 border-b border-navy-100">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
                <Bell className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="updates-heading" className="text-xl font-bold text-navy-900">
                  {t('tour.step2.title')}
                </h2>
                <p className="text-xs text-navy-500">
                  {t('tour.step2.desc')}
                </p>
              </div>
            </div>
            <Link
              to={ROUTES.COMMUNITY}
              className="text-xs font-semibold text-brand-600 hover:text-brand-800"
            >
              View all updates &gt;
            </Link>
          </div>

          <div className="rounded-xl border border-navy-200 bg-navy-50/50 p-6 text-center">
            <p className="text-sm text-navy-700 font-medium">
              A digital janganna (census) connects our roots, preserving lineage and family records.
            </p>
            <p className="mt-1 text-xs text-navy-500">
              Explore community announcements, events, and family trees in the Community tab.
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-navy-50/40" aria-labelledby="features-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2
              id="features-heading"
              className="mb-3 text-3xl font-bold tracking-tight text-navy-900"
            >
              {t('home.features_title')}
            </h2>
            <p className="text-navy-500">
              {t('home.features_subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-xs">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50">
                <Users className="h-6 w-6 text-brand-600" aria-hidden="true" />
              </div>
              <h3 className="mb-2 font-semibold text-navy-900">{t('home.feature_census_title')}</h3>
              <p className="text-sm text-navy-500">{t('home.feature_census_desc')}</p>
            </div>

            <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-xs">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-teal-50">
                <TreePine className="h-6 w-6 text-teal-700" aria-hidden="true" />
              </div>
              <h3 className="mb-2 font-semibold text-navy-900">{t('home.feature_tree_title')}</h3>
              <p className="text-sm text-navy-500">{t('home.feature_tree_desc')}</p>
            </div>

            <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-xs">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50">
                <Search className="h-6 w-6 text-amber-700" aria-hidden="true" />
              </div>
              <h3 className="mb-2 font-semibold text-navy-900">{t('home.feature_discover_title')}</h3>
              <p className="text-sm text-navy-500">{t('home.feature_discover_desc')}</p>
            </div>

            <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-xs">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50">
                <Shield className="h-6 w-6 text-emerald-700" aria-hidden="true" />
              </div>
              <h3 className="mb-2 font-semibold text-navy-900">{t('home.feature_verified_title')}</h3>
              <p className="text-sm text-navy-500">{t('home.feature_verified_desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-navy-200 bg-white py-16" aria-labelledby="cta-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="cta-heading"
              className="mb-4 text-2xl font-bold tracking-tight text-navy-900"
            >
              {t('app.tagline')}
            </h2>
            <p className="mb-6 text-navy-500">
              Join families across our community who have registered on KHATRI SARVANIYAT.
            </p>
            <Link
              to={ROUTES.SIGN_UP}
              className="inline-block rounded-lg bg-brand-600 px-8 py-3 font-semibold text-white shadow-sm transition-all hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Get Started — It&apos;s Free
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
