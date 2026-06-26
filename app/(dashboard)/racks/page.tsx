"use client";

import React, { useMemo, useState } from 'react'
import { X, PackageSearch, Boxes, Layers, Box, AlertTriangle } from 'lucide-react'
import Header from '@/components/layout/Header'
import {
  FLOORS,
  racksOnFloor,
  locationCode,
  locationInfo,
  colLetter,
  POSITIONS_PER_SHELF,
  type FloorId,
  type Rack,
  type LocationInfo,
} from '@/lib/racks'
import { rackStat, slotStat, floorRollup, bucketOf, type Bucket } from '@/lib/occupancy'
import { formatNumber } from '@/lib/utils'

type Metric = 'occupancy' | 'volume' | 'items'
const METRICS: { id: Metric; label: string }[] = [
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'volume',    label: 'Volume' },
  { id: 'items',     label: 'Items' },
]

// fill colour scale — green = space, amber = filling, red = near full
const BUCKET_CELL: Record<Bucket, string> = {
  low:  'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400',
  mid:  'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400',
  high: 'bg-red-50 text-red-600 border-red-200 hover:border-red-400',
}
const BUCKET_BAR: Record<Bucket, string> = { low: 'bg-emerald-400', mid: 'bg-amber-400', high: 'bg-red-400' }

// ── floor metric tile ────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, sub }: { icon: typeof Box; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-500 flex-shrink-0">
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-400 leading-none">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-tight tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 leading-none">{sub}</p>}
      </div>
    </div>
  )
}

// ── rack picker tile (left rail) ─────────────────────────────────────────────
function RackTile({ rack, metric, active, onClick }: { rack: Rack; metric: Metric; active: boolean; onClick: () => void }) {
  const s = rackStat(rack)
  const bk = bucketOf(s.pct)
  const value = metric === 'occupancy' ? `${s.pct}%` : metric === 'volume' ? `${formatNumber(s.volumeUsed)} m³` : formatNumber(s.itemCount)
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border p-2.5 transition-all ${
        active ? 'border-red-400 bg-red-50/40 ring-1 ring-red-300' : 'border-gray-100 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-gray-800 font-mono">{rack.name}</span>
        <span className="text-[10px] text-gray-500 tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${BUCKET_BAR[bk]}`} style={{ width: `${s.pct}%` }} />
      </div>
      <div className="text-[9px] text-gray-400 mt-1">{rack.locations} loc</div>
    </button>
  )
}

// ── the focused rack grid (big, readable, always fits width) ─────────────────
function FocusedRack({ rack, onPick, selectedCode }: { rack: Rack; onPick: (i: LocationInfo) => void; selectedCode: string | null }) {
  const levels = Array.from({ length: rack.levels }, (_, i) => rack.levels - i) // high → 1
  const cols = Array.from({ length: rack.cols }, (_, i) => i)

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-1.5 min-w-[480px]"
        style={{ gridTemplateColumns: `2rem repeat(${rack.cols}, minmax(2.75rem, 1fr))` }}
      >
        {/* header row: corner + position letters */}
        <div />
        {cols.map(c => (
          <div key={c} className="text-center text-[10px] font-mono text-gray-400 pb-0.5">{colLetter(c)}</div>
        ))}

        {/* level rows */}
        {levels.map(level => (
          <React.Fragment key={level}>
            <div className="flex items-center justify-end pr-1 text-[10px] font-mono text-gray-400">
              {String(level).padStart(2, '0')}
            </div>
            {cols.map(col => {
              const code = locationCode(rack.name, level, col)
              const bk = bucketOf(slotStat(code).pct)
              const active = selectedCode === code
              return (
                <button
                  key={col}
                  onClick={() => onPick(locationInfo(rack, level, col))}
                  title={code}
                  className={`h-9 rounded-lg border flex items-center justify-center text-[11px] font-mono transition-colors ${
                    active ? 'bg-red-500 text-white border-red-500 ring-2 ring-red-300' : BUCKET_CELL[bk]
                  }`}
                >
                  {code}
                </button>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ── side drawer ──────────────────────────────────────────────────────────────
function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400">{k}</span>
      <span className="text-sm text-gray-800 font-medium font-mono">{v}</span>
    </div>
  )
}
function LocationDrawer({ info, onClose }: { info: LocationInfo; onClose: () => void }) {
  const s = slotStat(info.code)
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/30" aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-50 w-[88vw] max-w-sm bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-lg font-bold text-gray-900 font-mono">{info.code}</div>
            <div className="text-xs text-gray-400">{info.floorLabel} · drawer location</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Location</h3>
          <DetailRow k="Floor" v={info.floorLabel} />
          <DetailRow k="Rack" v={info.rack} />
          <DetailRow k="Level" v={String(info.level).padStart(2, '0')} />
          <DetailRow k="Bay" v={`${info.bay}`} />
          <DetailRow k="Position" v={info.position} />
          <DetailRow k="Side" v={info.side} />

          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-6 mb-1">Stock</h3>
          <DetailRow k="EAN No." v="—" />
          <DetailRow k="Ref No." v="—" />
          <DetailRow k="Balance Qty" v="—" />

          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-6 mb-1">Occupancy (demo)</h3>
          <DetailRow k="Fill" v={`${s.pct}%`} />
          <DetailRow k="Status" v={s.occupied ? 'Occupied' : 'Empty'} />

          <div className="flex items-start gap-2 mt-5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs text-gray-500">
            <PackageSearch className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>EAN / Ref / Balance are blank until a per-drawer stock feed is wired. Occupancy figures are demo data.</span>
          </div>
        </div>
      </aside>
    </>
  )
}

export default function RacksPage() {
  const [floor, setFloor] = useState<FloorId>('first')
  const [metric, setMetric] = useState<Metric>('occupancy')
  const [selectedRack, setSelectedRack] = useState<string | null>(null)
  const [selected, setSelected] = useState<LocationInfo | null>(null)

  const racks = useMemo(() => racksOnFloor(floor), [floor])
  const roll = useMemo(() => floorRollup(floor), [floor])
  const active = useMemo(
    () => racks.find(r => r.name === selectedRack) ?? racks[0],
    [racks, selectedRack],
  )
  const aStat = useMemo(() => rackStat(active), [active])

  return (
    <>
      <Header title="Rack Management" breadcrumb="Racks" />

      {/* Floor + metric toggles */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-xl bg-white border border-gray-100 shadow-sm p-1">
          {FLOORS.map(f => (
            <button
              key={f.id}
              onClick={() => { setFloor(f.id); setSelectedRack(null) }}
              className={`px-3.5 py-1.5 rounded-lg text-sm transition-colors ${
                floor === f.id ? 'bg-red-500 text-white font-medium' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="inline-flex rounded-xl bg-white border border-gray-100 shadow-sm p-1">
          {METRICS.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                metric === m.id ? 'bg-gray-50 text-gray-900 font-medium shadow-sm' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Floor metrics strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatTile icon={Boxes} label="Capacity" value={formatNumber(roll.capacity)} sub={`${racks.length} racks · locations`} />
        <StatTile icon={Layers} label="Occupancy" value={`${roll.occupancyPct}%`} sub="demo" />
        <StatTile icon={Box} label="Volume used" value={`${formatNumber(roll.volumeUsed)} m³`} sub={`of ${formatNumber(roll.volumeTotal)} m³`} />
        <StatTile icon={AlertTriangle} label="Racks near full" value={String(roll.nearFull)} sub=">85% occupancy" />
      </div>

      {/* Body: rack picker + focused rack */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-start">
        {/* Rack picker — all racks visible, click to jump */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Racks</p>
          <div className="grid grid-cols-3 lg:grid-cols-2 gap-2">
            {racks.map(r => (
              <RackTile key={r.name} rack={r} metric={metric} active={r.name === active.name} onClick={() => setSelectedRack(r.name)} />
            ))}
          </div>
        </div>

        {/* Focused rack */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 font-mono">RACK {active.name}</h2>
              <p className="text-xs text-gray-400">
                {active.bays} bays · {active.levels} levels · {active.shelves} shelves · {active.locations} drawers
              </p>
            </div>
            <div className="flex gap-2">
              <MiniStat label="Occupancy" value={`${aStat.pct}%`} />
              <MiniStat label="Volume" value={`${formatNumber(aStat.volumeUsed)}/${formatNumber(aStat.volumeTotal)} m³`} />
              <MiniStat label="Items" value={formatNumber(aStat.itemCount)} />
            </div>
          </div>

          <FocusedRack rack={active} onPick={setSelected} selectedCode={selected?.code ?? null} />

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-gray-100">
            {([['low','0–60%'],['mid','61–85%'],['high','86–100%']] as [Bucket,string][]).map(([b,l]) => (
              <div key={b} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${BUCKET_BAR[b]}`} />
                <span className="text-[11px] text-gray-500">{l}</span>
              </div>
            ))}
            <div className="flex-1" />
            <span className="text-[11px] text-gray-400">Each shelf = {POSITIONS_PER_SHELF} drawers. Click a drawer for details.</span>
          </div>
        </div>
      </div>

      {selected && <LocationDrawer info={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-1.5 text-center">
      <p className="text-[10px] text-gray-400 leading-none">{label}</p>
      <p className="text-sm font-semibold text-gray-800 tabular-nums leading-tight mt-0.5">{value}</p>
    </div>
  )
}
