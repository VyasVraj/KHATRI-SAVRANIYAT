/**
 * InstallAppModal Component
 *
 * Professional, accessible modal providing seamless installation for KHATRI SARVANIYAT
 * across Android, iOS/iPadOS, Windows, and macOS devices.
 *
 * Capabilities:
 * - Triggers native beforeinstallprompt if available.
 * - Displays platform-tailored step-by-step instructions for iOS (Share -> Add to Home Screen),
 *   Android, Windows, and macOS browsers.
 * - Auto-detects device platform while allowing manual platform switching.
 */

import React, { useState, useEffect } from 'react'
import {
  Download,
  X,
  Share2,
  PlusSquare,
  Smartphone,
  Monitor,
  CheckCircle2,
  ExternalLink,
  Laptop,
} from 'lucide-react'
import {
  getInstallState,
  promptPwaInstall,
  onInstallStateChange,
  type PwaPlatform,
} from '@/lib/pwa'
import { BrandLogo } from '@/components/common/BrandLogo'

export interface InstallAppModalProps {
  isOpen: boolean
  onClose: () => void
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const [installState, setInstallState] = useState(getInstallState())
  const [activePlatform, setActivePlatform] = useState<PwaPlatform>(getInstallState().platform)
  const [isInstalling, setIsInstalling] = useState(false)
  const [installSuccess, setInstallSuccess] = useState(false)

  useEffect(() => {
    const unsubscribe = onInstallStateChange((state) => {
      setInstallState(state)
      if (state.platform !== 'other') {
        setActivePlatform(state.platform)
      }
    })
    return () => unsubscribe()
  }, [])

  if (!isOpen) return null

  const handleNativeInstall = async () => {
    setIsInstalling(true)
    const success = await promptPwaInstall()
    setIsInstalling(false)
    if (success) {
      setInstallSuccess(true)
      setTimeout(() => {
        onClose()
      }, 2000)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-app-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-navy-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-navy-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" alt="KHATRI SARVANIYAT" priority className="h-10 w-10 shrink-0" />
            <div>
              <h2 id="install-app-title" className="text-base font-bold tracking-tight text-white">
                Install KHATRI SARVANIYAT
              </h2>
              <p className="text-xs text-navy-200">Progressive Web Application</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-navy-300 hover:text-white hover:bg-navy-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {installSuccess ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto animate-bounce" />
              <h3 className="text-lg font-bold text-navy-900">Application Installed!</h3>
              <p className="text-sm text-slate-600 max-w-sm mx-auto">
                KHATRI SARVANIYAT is now installed on your device. You can open it directly from your home screen or application launcher.
              </p>
            </div>
          ) : (
            <>
              {/* Native 1-Click Install Button if supported by browser */}
              {installState.canPrompt && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 space-y-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-brand-900 font-semibold text-sm">
                    <Download className="h-4 w-4 text-brand-600" />
                    One-Click Quick Install
                  </div>
                  <p className="text-xs text-navy-700">
                    Your browser supports direct installation. Click below to add KHATRI SARVANIYAT to your device launcher.
                  </p>
                  <button
                    type="button"
                    onClick={handleNativeInstall}
                    disabled={isInstalling}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand-700 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {isInstalling ? 'Installing...' : 'Install Now'}
                  </button>
                </div>
              )}

              {/* Platform Selector Tabs */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-navy-700 mb-2">
                  Installation Guide by Platform
                </label>
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActivePlatform('android')}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 text-xs font-semibold rounded-lg transition-all ${
                      activePlatform === 'android'
                        ? 'bg-white text-brand-700 shadow-xs'
                        : 'text-slate-600 hover:text-navy-900'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>Android</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePlatform('ios')}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 text-xs font-semibold rounded-lg transition-all ${
                      activePlatform === 'ios'
                        ? 'bg-white text-brand-700 shadow-xs'
                        : 'text-slate-600 hover:text-navy-900'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>iPhone/iPad</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePlatform('windows')}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 text-xs font-semibold rounded-lg transition-all ${
                      activePlatform === 'windows'
                        ? 'bg-white text-brand-700 shadow-xs'
                        : 'text-slate-600 hover:text-navy-900'
                    }`}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    <span>Windows</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePlatform('macos')}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 text-xs font-semibold rounded-lg transition-all ${
                      activePlatform === 'macos'
                        ? 'bg-white text-brand-700 shadow-xs'
                        : 'text-slate-600 hover:text-navy-900'
                    }`}
                  >
                    <Laptop className="h-3.5 w-3.5" />
                    <span>macOS</span>
                  </button>
                </div>
              </div>

              {/* Step-by-Step Platform Guides */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3.5 text-xs text-navy-800">
                {activePlatform === 'ios' && (
                  <>
                    <h4 className="font-bold text-sm text-navy-900 flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-brand-600" />
                      Safari on iPhone & iPad
                    </h4>
                    <ol className="space-y-2.5 list-decimal list-inside text-slate-700">
                      <li className="leading-relaxed">
                        Open <strong>KHATRI SARVANIYAT</strong> in <strong>Apple Safari</strong>.
                      </li>
                      <li className="leading-relaxed">
                        Tap the <strong className="inline-flex items-center gap-1 text-navy-900 bg-white px-1.5 py-0.5 rounded border border-slate-200"><Share2 className="h-3 w-3 text-brand-600" /> Share</strong> icon at the bottom of the screen.
                      </li>
                      <li className="leading-relaxed">
                        Scroll down the menu and tap <strong className="inline-flex items-center gap-1 text-navy-900 bg-white px-1.5 py-0.5 rounded border border-slate-200"><PlusSquare className="h-3 w-3 text-brand-600" /> Add to Home Screen</strong>.
                      </li>
                      <li className="leading-relaxed">
                        Tap <strong>Add</strong> in the top-right corner to complete.
                      </li>
                    </ol>
                    <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200">
                      * On iOS 16.4+, adding to Home Screen also enables Web Push notifications.
                    </p>
                  </>
                )}

                {activePlatform === 'android' && (
                  <>
                    <h4 className="font-bold text-sm text-navy-900 flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-brand-600" />
                      Chrome / Samsung Internet on Android
                    </h4>
                    <ol className="space-y-2.5 list-decimal list-inside text-slate-700">
                      <li className="leading-relaxed">
                        Open the website in <strong>Google Chrome</strong> or your default browser.
                      </li>
                      <li className="leading-relaxed">
                        Tap the browser menu icon (<strong>⋮</strong> or <strong>⋯</strong> in the top or bottom corner).
                      </li>
                      <li className="leading-relaxed">
                        Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                      </li>
                      <li className="leading-relaxed">
                        Confirm <strong>Install</strong>. The app will appear in your app drawer and home screen.
                      </li>
                    </ol>
                  </>
                )}

                {activePlatform === 'windows' && (
                  <>
                    <h4 className="font-bold text-sm text-navy-900 flex items-center gap-1.5">
                      <Monitor className="h-4 w-4 text-brand-600" />
                      Chrome or Microsoft Edge on Windows
                    </h4>
                    <ol className="space-y-2.5 list-decimal list-inside text-slate-700">
                      <li className="leading-relaxed">
                        Look at the right side of the browser address bar for the <strong className="text-navy-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">Install App</strong> icon (computer with down arrow).
                      </li>
                      <li className="leading-relaxed">
                        Or click the browser menu (<strong>⋮</strong>) → <strong>Apps</strong> → <strong>Install this site as an app</strong>.
                      </li>
                      <li className="leading-relaxed">
                        Click <strong>Install</strong>. The app will launch in standalone window mode and create a Start Menu / Desktop shortcut.
                      </li>
                    </ol>
                  </>
                )}

                {activePlatform === 'macos' && (
                  <>
                    <h4 className="font-bold text-sm text-navy-900 flex items-center gap-1.5">
                      <Laptop className="h-4 w-4 text-brand-600" />
                      Chrome, Edge, or Safari on macOS (macOS Sonoma+)
                    </h4>
                    <ol className="space-y-2.5 list-decimal list-inside text-slate-700">
                      <li className="leading-relaxed">
                        In <strong>Chrome / Edge</strong>: Click the <strong>Install</strong> icon in the address bar.
                      </li>
                      <li className="leading-relaxed">
                        In <strong>Safari (macOS Sonoma+)</strong>: Choose <strong>File</strong> → <strong>Add to Dock...</strong>
                      </li>
                      <li className="leading-relaxed">
                        Launch directly from your <strong>macOS Dock</strong> or <strong>Launchpad</strong> without browser toolbars.
                      </li>
                    </ol>
                  </>
                )}
              </div>

              {/* Benefits list */}
              <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Standalone window display</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Offline shell protection</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Home screen launcher</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Fast and lightweight</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            Runs securely in your browser engine
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
