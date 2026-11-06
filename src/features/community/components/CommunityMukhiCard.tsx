/**
 * Component: CommunityMukhiCard
 *
 * Professional individual Mukhi card displaying official details from the 118-member register:
 * - Serial number badge
 * - Full Name
 * - Gram / City / Location
 * - Mobile Number with click-to-call
 */

import React from 'react'
import { Phone, MapPin, Shield, CheckCircle } from 'lucide-react'
import type { CommunityMukhi } from '../services/community-mukhis.service'

interface CommunityMukhiCardProps {
  mukhi: CommunityMukhi
}

export const CommunityMukhiCard: React.FC<CommunityMukhiCardProps> = ({ mukhi }) => {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-blue-400 hover:shadow-md transition-all">
      <div>
        {/* Top Header: Serial & Active Status */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
            <Shield className="h-3.5 w-3.5" />
            <span>#{mukhi.source_serial_number}</span>
          </span>

          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle className="h-3 w-3" />
            <span>Official Mukhi</span>
          </span>
        </div>

        {/* Full Name */}
        <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-2">
          {mukhi.full_name}
        </h3>

        {/* Gram / Location */}
        <div className="mt-3 flex items-start gap-1.5 text-xs text-slate-600">
          <MapPin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
          <span className="font-medium text-slate-700">{mukhi.gram}</span>
        </div>
      </div>

      {/* Footer: Mobile Number */}
      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
        {mukhi.mobile_number ? (
          <a
            href={`tel:${mukhi.mobile_number}`}
            className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition-colors"
            title={`Call ${mukhi.full_name}`}
          >
            <Phone className="h-3.5 w-3.5 text-blue-500" />
            <span>{mukhi.mobile_number}</span>
          </a>
        ) : (
          <span className="text-xs text-slate-400 italic">No mobile recorded</span>
        )}
      </div>
    </div>
  )
}
