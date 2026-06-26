import React from 'react'
import { Sparkles, Info, type LucideIcon } from 'lucide-react'
import { BUCKETS, bucketOf, TILE_STYLE } from '@/lib/occupancy'

// Occupancy legend — three swatches (0-60 / 61-85 / 86-100).
export function OccupancyLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 sm:gap-4 ${className}`}>
      {BUCKETS.map(b => (
        <div key={b.id} className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded" style={{ background: b.hex }} />
          <span className="text-[11px] text-gray-500 whitespace-nowrap">{b.label}</span>
        </div>
      ))}
    </div>
  )
}

// KPI stat card.
export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="relative rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-5">
      <Info className="absolute top-4 right-4 w-4 h-4 text-gray-300" />
      <div className="flex items-center gap-2 text-gray-500 mb-3">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// AI insight / suggestion card (lavender, sparkle icon).
export function AiInsightCard({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-red-500" />
        <span className="text-sm font-semibold text-gray-800">{title}</span>
      </div>
      <div className="text-[13px] leading-relaxed text-gray-600 space-y-2">{children}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

// CSS-rendered 3D-ish bin rack (data-coloured per bin — see research: photos
// can't recolour per bin, so the interactive rack is drawn, not photographed).
export function BinRack({ bins }: { bins: { code: string; pct: number }[] }) {
  return (
    <div className="rounded-2xl bg-gray-900 p-3 shadow-inner">
      <div className="grid grid-cols-3 gap-2">
        {bins.map(b => {
          const bk = bucketOf(b.pct)
          return (
            <div
              key={b.code}
              className={`rounded-lg aspect-[5/4] flex flex-col items-center justify-center shadow ${TILE_STYLE[bk]}`}
            >
              <span className="text-sm font-bold leading-none">{b.code}</span>
              <span className="text-[10px] opacity-90 mt-1">{b.pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
