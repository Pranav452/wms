"use client";

import React, { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Gauge, Scale, Package, Clock, MoreHorizontal } from 'lucide-react'
import Header from '@/components/layout/Header'
import { KpiCard, AiInsightCard, OccupancyLegend } from '@/components/racks/ui'
import { RACKS, racksOnFloor, type Rack } from '@/lib/racks'
import { bayStats, rackStat, bucketOf, CELL_STYLE } from '@/lib/occupancy'
import { formatNumber } from '@/lib/utils'

export default function ZoneOverviewPage() {
  const params = useParams<{ rack: string }>()
  const router = useRouter()
  const name = decodeURIComponent(params.rack)
  const rack = useMemo<Rack | undefined>(() => RACKS.find(r => r.name === name), [name])

  if (!rack) {
    return (
      <>
        <Header title="Zone not found" breadcrumb="Warehouse Map" />
        <button onClick={() => router.push('/racks/map')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500">
          <ChevronLeft className="w-4 h-4" /> Back to Warehouse Map
        </button>
        <p className="mt-4 text-gray-500">No rack named “{name}”.</p>
      </>
    )
  }

  const s = rackStat(rack)
  const bays = bayStats(rack)
  const volPct = Math.round((s.volumeUsed / s.volumeTotal) * 100)

  // demo turnover split
  const highTurn = Math.round(s.itemCount * 0.62)
  const medTurn = s.itemCount - highTurn

  // pick a lower-occupancy zone on the same floor to suggest
  const target = racksOnFloor(rack.floor)
    .map(rackStat)
    .filter(r => r.name !== rack.name)
    .sort((a, b) => a.pct - b.pct)[0]

  return (
    <>
      <Header title={`Zone ${rack.name} Overview`} breadcrumb="Warehouse Map" />

      <button
        onClick={() => router.push('/racks/map')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Warehouse Map
      </button>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard icon={Gauge}   label="Occupancy"        value={`${s.pct}%`} sub={s.pct > 85 ? 'Approaching full' : 'Healthy'} />
        <KpiCard icon={Scale}   label="Volume Utilization (m³)" value={`${formatNumber(s.volumeUsed)} / ${formatNumber(s.volumeTotal)} m³`} sub={`Current Volume Utilization ${volPct}%`} />
        <KpiCard icon={Package} label="Item Count"       value={`${formatNumber(s.itemCount)} Items`} sub="Current Inventory Count" />
        <KpiCard icon={Clock}   label="Turnover Rate"    value={`${s.turnoverDays} days`} sub="Avg. Item duration" />
      </div>

      {/* Layout + right rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">Zone {rack.name}</h3>
            <OccupancyLegend className="hidden sm:flex" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {bays.map(b => {
              const bk = bucketOf(b.pct)
              return (
                <button
                  key={b.bay}
                  onClick={() => router.push(`/racks/detail?rack=${rack.name}`)}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`w-full h-20 rounded-2xl flex items-center justify-center text-base font-bold transition-transform group-hover:scale-[1.02] ${CELL_STYLE[bk]}`}>
                    {b.label}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{b.pct}%</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800">Zone {rack.name} layout</h3>
              <MoreHorizontal className="w-4 h-4 text-gray-300" />
            </div>
            <TurnoverBar label="High Turnover" count={highTurn} total={s.itemCount} hex="#7FA6BC" />
            <TurnoverBar label="Medium Turnover" count={medTurn} total={s.itemCount} hex="#2B1FB3" />
          </div>

          <AiInsightCard
            title="Optimization Insight"
            action={
              target && (
                <button
                  onClick={() => router.push(`/racks/map/${target.name}`)}
                  className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-1.5 hover:border-red-300 hover:text-red-500 transition-colors"
                >
                  View Zone {target.name}
                </button>
              )
            }
          >
            To manage capacity efficiently, redistribute low-turnover SKUs to{' '}
            {target ? `Zone ${target.name}` : 'a lighter zone'}
            {target ? `, which has ${100 - target.pct}% available space to balance.` : '.'}
          </AiInsightCard>
        </div>
      </div>
    </>
  )
}

function TurnoverBar({ label, count, total, hex }: { label: string; count: number; total: number; hex: string }) {
  const pct = Math.min(100, Math.round((count / total) * 100))
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="flex items-center gap-2 text-gray-700">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: hex }} /> {label}
        </span>
        <span className="font-semibold text-gray-900 tabular-nums">{formatNumber(count)}+</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hex }} />
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Current Inventory Count</p>
    </div>
  )
}
