"use client";

import React, { useEffect, useMemo, useState } from 'react'
import { X, PackageSearch, Boxes, Layers, Box, Barcode, List as ListIcon, LayoutGrid, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import Header from '@/components/layout/Header'
import {
  FLOORS,
  racksOnFloor,
  locationInfo,
  colLetter,
  shelfNumber,
  POSITIONS_PER_SHELF,
  type FloorId,
  type Rack,
  type LocationInfo,
} from '@/lib/racks'
import {
  makeBucketer,
  type RackStockData,
  type CellStock,
  type ZoneStock,
  type FillBucket,
} from '@/lib/rackstock'
import { formatNumber } from '@/lib/utils'

type Metric = 'occupancy' | 'items' | 'eans'
type View = 'list' | 'grid'
const METRICS: { id: Metric; label: string }[] = [
  { id: 'occupancy', label: 'Occupancy' },
  { id: 'items',     label: 'Units' },
  { id: 'eans',      label: 'EANs' },
]

// fill colour scale — white = empty, green = light, amber = filling, red = heavy
const BUCKET_CELL: Record<FillBucket, string> = {
  empty: 'bg-white text-gray-300 border-gray-100 hover:border-gray-300',
  low:   'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400',
  mid:   'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400',
  high:  'bg-red-50 text-red-600 border-red-200 hover:border-red-400',
}
const BUCKET_BAR: Record<Exclude<FillBucket, 'empty'>, string> = {
  low: 'bg-emerald-400', mid: 'bg-amber-400', high: 'bg-red-400',
}

// per-rack rollup computed from live cells
interface RackRoll { units: number; eans: number; bins: number }
const EMPTY_ROLL: RackRoll = { units: 0, eans: 0, bins: 0 }

// A few shelves hold extra bins (C…) beyond the nominal 2, so occupied can
// exceed nominal capacity — clamp the percentage at 100.
function occupancyPct(rack: Rack, roll: RackRoll): number {
  return Math.min(100, Math.round((roll.bins / rack.locations) * 100))
}

function metricValue(rack: Rack, roll: RackRoll, metric: Metric): string {
  if (metric === 'occupancy') return `${occupancyPct(rack, roll)}%`
  if (metric === 'items') return formatNumber(roll.units)
  return formatNumber(roll.eans)
}

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

// ── rack picker tile (grid view) ─────────────────────────────────────────────
function RackTile({ rack, roll, metric, active, onClick }: { rack: Rack; roll: RackRoll; metric: Metric; active: boolean; onClick: () => void }) {
  const pct = occupancyPct(rack, roll)
  const bk: Exclude<FillBucket, 'empty'> = pct > 85 ? 'high' : pct > 60 ? 'mid' : 'low'
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border p-2.5 transition-all ${
        active ? 'border-red-400 bg-red-50/40 ring-1 ring-red-300' : 'border-gray-100 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-gray-800 font-mono">{rack.name}</span>
        <span className="text-[10px] text-gray-500 tabular-nums">{metricValue(rack, roll, metric)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${BUCKET_BAR[bk]}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[9px] text-gray-400 mt-1">{roll.bins}/{rack.locations} bins</div>
    </button>
  )
}

// ── rack picker row (list view) ──────────────────────────────────────────────
function RackRow({ rack, roll, metric, active, onClick }: { rack: Rack; roll: RackRoll; metric: Metric; active: boolean; onClick: () => void }) {
  const pct = occupancyPct(rack, roll)
  const bk: Exclude<FillBucket, 'empty'> = pct > 85 ? 'high' : pct > 60 ? 'mid' : 'low'
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all ${
        active ? 'border-red-400 bg-red-50/40 ring-1 ring-red-300' : 'border-gray-100 bg-white hover:border-gray-300'
      }`}
    >
      <span className="font-mono font-bold text-xs text-gray-800 w-6 text-left flex-shrink-0">{rack.name}</span>
      <div className="flex-1 min-w-0 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${BUCKET_BAR[bk]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-semibold text-gray-600 tabular-nums w-12 text-right flex-shrink-0">{metricValue(rack, roll, metric)}</span>
    </button>
  )
}

// ── focused rack grid — each shelf = a boxed pair of bins ────────────────────
const EXTRA_POSITIONS = ['C', 'D', 'E'] // rare third+ bins seen in DB data

function FocusedGrid({ rack, cellMap, bucketOf, onPick, selectedCode }: {
  rack: Rack
  cellMap: Map<string, CellStock>
  bucketOf: (units: number) => FillBucket
  onPick: (info: LocationInfo) => void
  selectedCode: string | null
}) {
  const levels = Array.from({ length: rack.levels }, (_, i) => rack.levels - i) // high → 1
  const bays = Array.from({ length: rack.bays }, (_, i) => i + 1)
  const sides = Array.from({ length: POSITIONS_PER_SHELF }, (_, s) => s)

  const bin = (info: LocationInfo) => {
    const cell = cellMap.get(info.code)
    const units = cell?.units ?? 0
    const bk = bucketOf(units)
    const active = selectedCode === info.code
    return (
      <button
        key={info.code}
        onClick={() => onPick(info)}
        title={cell ? `${info.code} — ${formatNumber(units)} units · ${cell.eans} EANs` : `${info.code} — empty`}
        className={`flex-1 min-w-0 h-10 rounded-md border flex flex-col items-center justify-center leading-none transition-colors ${
          active ? 'bg-red-500 text-white border-red-500 ring-2 ring-red-300' : BUCKET_CELL[bk]
        }`}
      >
        <span className="text-[10px] font-mono">{info.code}</span>
        {units > 0 && <span className="text-[9px] font-semibold tabular-nums mt-0.5">{formatNumber(units)}</span>}
      </button>
    )
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[520px] flex flex-col gap-2">
        {/* header: bay label + bin position letters */}
        <div className="flex items-end gap-2.5">
          <div className="w-7 flex-shrink-0" />
          {bays.map(bay => (
            <div key={bay} className="flex-1 flex flex-col items-center gap-0.5">
              <span className="text-[9px] font-mono text-gray-400">Bay {bay}</span>
              <div className="flex gap-1 w-full px-1">
                {sides.map(s => (
                  <span key={s} className="flex-1 text-center text-[8px] font-mono text-gray-300">
                    {rack.floor === 'first' ? colLetter(s) : colLetter((bay - 1) * POSITIONS_PER_SHELF + s)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* level rows */}
        {levels.map(level => (
          <div key={level} className="flex items-center gap-2.5">
            <div className="w-7 flex-shrink-0 text-right pr-1 text-[10px] font-mono text-gray-400">
              {String(level).padStart(2, '0')}
            </div>
            {bays.map(bay => {
              // extra bins (C…) exist on a few first-floor shelves — render only when the DB has them
              const extras = rack.floor === 'first'
                ? EXTRA_POSITIONS.filter(p => cellMap.has(`${rack.name}${String(shelfNumber(rack, level, bay)).padStart(2, '0')}${p}`))
                : []
              return (
                <div key={bay} className="flex-1 flex gap-1 p-1 rounded-lg bg-gray-50 border border-gray-200/70">
                  {sides.map(s => bin(locationInfo(rack, level, (bay - 1) * POSITIONS_PER_SHELF + s)))}
                  {extras.map(p => bin({
                    code: `${rack.name}${String(shelfNumber(rack, level, bay)).padStart(2, '0')}${p}`,
                    floor: rack.floor,
                    floorLabel: FLOORS.find(f => f.id === rack.floor)!.label,
                    rack: rack.name,
                    level,
                    shelf: shelfNumber(rack, level, bay),
                    position: p,
                    bay,
                    side: 'Right',
                  }))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── focused-rack panel (header + grid + legend) ──────────────────────────────
function FocusedPanel({ rack, roll, cellMap, bucketOf, thresholds, onPick, selectedCode }: {
  rack: Rack
  roll: RackRoll
  cellMap: Map<string, CellStock>
  bucketOf: (units: number) => FillBucket
  thresholds: { t1: number; t2: number }
  onPick: (info: LocationInfo) => void
  selectedCode: string | null
}) {
  const legend: [Exclude<FillBucket, 'empty'>, string][] = [
    ['low',  `1–${formatNumber(thresholds.t1)} units`],
    ['mid',  `${formatNumber(thresholds.t1 + 1)}–${formatNumber(thresholds.t2)} units`],
    ['high', `>${formatNumber(thresholds.t2)} units`],
  ]
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-mono">RACK {rack.name}</h2>
          <p className="text-xs text-gray-400">
            {rack.bays} bays · {rack.levels} levels · {rack.shelves} shelves · {rack.locations} bins
          </p>
        </div>
        <div className="flex gap-2">
          <MiniStat label="Occupied bins" value={`${roll.bins}/${rack.locations}`} />
          <MiniStat label="Units" value={formatNumber(roll.units)} />
          <MiniStat label="EANs" value={formatNumber(roll.eans)} />
        </div>
      </div>

      <FocusedGrid rack={rack} cellMap={cellMap} bucketOf={bucketOf} onPick={onPick} selectedCode={selectedCode} />

      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-white border border-gray-200" />
          <span className="text-[11px] text-gray-500">empty</span>
        </div>
        {legend.map(([b, l]) => (
          <div key={b} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${BUCKET_BAR[b]}`} />
            <span className="text-[11px] text-gray-500">{l}</span>
          </div>
        ))}
        <div className="flex-1" />
        <span className="text-[11px] text-gray-400">Click a bin for its EAN-wise stock.</span>
      </div>
    </div>
  )
}

// ── side drawer — EAN-wise stock of one location ─────────────────────────────
function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400">{k}</span>
      <span className="text-sm text-gray-800 font-medium font-mono">{v}</span>
    </div>
  )
}

export interface DrawerTarget {
  code: string
  subtitle: string
  cell: CellStock | null
  info: LocationInfo | null
}

function LocationDrawer({ target, onClose }: { target: DrawerTarget; onClose: () => void }) {
  const { code, subtitle, cell, info } = target
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/30" aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-50 w-[88vw] max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-lg font-bold text-gray-900 font-mono truncate">{code}</div>
            <div className="text-xs text-gray-400">{subtitle}</div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {cell && (
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{formatNumber(cell.units)}</div>
                <div className="text-[10px] text-gray-400 leading-none">units avl</div>
              </div>
            )}
            <button onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            Stock {cell ? `· ${cell.eans} EAN${cell.eans === 1 ? '' : 's'}` : ''}
          </h3>

          {!cell && (
            <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs text-gray-500">
              <PackageSearch className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>No available stock recorded at this location.</span>
            </div>
          )}

          {cell && (
            <div className="flex flex-col gap-2">
              {cell.items.map(it => (
                <div key={it.ean + it.cont} className="rounded-xl border border-gray-100 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-gray-900">{it.ean}</span>
                    <span className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">{formatNumber(it.avail)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-mono text-[11px] text-red-500 truncate">{it.sku}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">of {formatNumber(it.recd)} recd</span>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5" title={it.name}>{it.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {[it.size && `Size ${it.size}`, it.color, it.cont && `Cont ${it.cont}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          )}

          {info && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-6 mb-1">Location</h3>
              <DetailRow k="Floor" v={info.floorLabel} />
              <DetailRow k="Rack" v={info.rack} />
              {info.floor === 'first' && <DetailRow k="Shelf" v={String(info.shelf).padStart(2, '0')} />}
              <DetailRow k="Level" v={String(info.level).padStart(2, '0')} />
              <DetailRow k="Bay" v={`${info.bay}`} />
              <DetailRow k="Position" v={info.position} />
            </>
          )}
        </div>
      </aside>
    </>
  )
}

// ── other storage (pallets / cages / rooms — no rack grid) ───────────────────
function ZonePanel({ zone, onPick, selectedCode }: { zone: ZoneStock; onPick: (z: ZoneStock, c: CellStock) => void; selectedCode: string | null }) {
  const [query, setQuery] = useState('')
  const MAX = 48
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return q ? zone.cells.filter(c => c.code.includes(q)) : zone.cells
  }, [zone, query])

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{zone.label}</h3>
          <p className="text-[11px] text-gray-400">
            {formatNumber(zone.units)} units · {formatNumber(zone.eans)} EANs · {formatNumber(zone.cells.length)} locations
          </p>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Find location…"
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-36 focus:outline-none focus:border-red-300"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {filtered.slice(0, MAX).map(c => (
          <button
            key={c.code}
            onClick={() => onPick(zone, c)}
            title={`${c.code} — ${formatNumber(c.units)} units · ${c.eans} EANs`}
            className={`px-2 py-1 rounded-lg border text-[11px] font-mono transition-colors ${
              selectedCode === c.code
                ? 'bg-red-500 text-white border-red-500'
                : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-red-300'
            }`}
          >
            {c.code} <span className="font-semibold tabular-nums">{formatNumber(c.units)}</span>
          </button>
        ))}
        {filtered.length > MAX && (
          <span className="px-2 py-1 text-[11px] text-gray-400">+{formatNumber(filtered.length - MAX)} more — type to search</span>
        )}
        {filtered.length === 0 && <span className="px-2 py-1 text-[11px] text-gray-400">No match.</span>}
      </div>
    </div>
  )
}

export default function RacksPage() {
  const [floor, setFloor] = useState<FloorId>('first')
  const [metric, setMetric] = useState<Metric>('items')
  const [view, setView] = useState<View>('list')
  const [selectedRack, setSelectedRack] = useState<string | null>(null)
  const [target, setTarget] = useState<DrawerTarget | null>(null)

  const [data, setData] = useState<RackStockData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    fetch('/api/racks/stock')
      .then(r => r.json())
      .then(j => { if (!alive) return; if (j.error) setError(j.error); else setData(j) })
      .catch(e => { if (alive) setError(String(e)) })
    return () => { alive = false }
  }, [reload])

  const cellMap = useMemo(() => {
    const m = new Map<string, CellStock>()
    data?.cells.forEach(c => m.set(c.code, c))
    return m
  }, [data])

  const rackRoll = useMemo(() => {
    const m = new Map<string, RackRoll>()
    data?.cells.forEach(c => {
      if (!c.rack) return
      const r = m.get(c.rack) ?? { units: 0, eans: 0, bins: 0 }
      r.units += c.units; r.eans += c.eans; r.bins += 1
      m.set(c.rack, r)
    })
    return m
  }, [data])

  const bucketer = useMemo(() => makeBucketer(data ? data.cells.map(c => c.units) : []), [data])

  const racks = useMemo(() => racksOnFloor(floor), [floor])
  const active = useMemo(() => racks.find(r => r.name === selectedRack) ?? racks[0], [racks, selectedRack])

  const floorRoll = useMemo(() => {
    const rolls = racks.map(r => rackRoll.get(r.name) ?? EMPTY_ROLL)
    return {
      capacity: racks.reduce((s, r) => s + r.locations, 0),
      bins:     rolls.reduce((s, r) => s + r.bins, 0),
      units:    rolls.reduce((s, r) => s + r.units, 0),
      eans:     rolls.reduce((s, r) => s + r.eans, 0),
    }
  }, [racks, rackRoll])

  const pickGridCell = (info: LocationInfo) => setTarget({
    code: info.code,
    subtitle: `${info.floorLabel} · Rack ${info.rack} · bin`,
    cell: cellMap.get(info.code) ?? null,
    info,
  })
  const pickZoneCell = (zone: ZoneStock, cell: CellStock) => setTarget({
    code: cell.code, subtitle: zone.label, cell, info: null,
  })

  return (
    <>
      <Header title="Rack Management" breadcrumb="Racks" />

      {error && (
        <div className="flex items-center gap-2 mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Stock feed failed: {error}</span>
          <button onClick={() => { setError(null); setReload(n => n + 1) }} className="flex items-center gap-1 text-xs font-semibold hover:underline">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}
      {!data && !error && (
        <div className="flex items-center gap-2 mb-4 bg-white border border-gray-100 text-gray-500 text-sm rounded-xl px-4 py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading live stock…
        </div>
      )}

      {/* Floor + view + metric toggles */}
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

        {/* List / Grid view toggle */}
        <div className="inline-flex rounded-xl bg-white border border-gray-100 shadow-sm p-1">
          {(['list', 'grid'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${
                view === v ? 'bg-gray-50 text-gray-900 font-medium shadow-sm' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              {v === 'list' ? <ListIcon className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
              <span className="capitalize">{v}</span>
            </button>
          ))}
        </div>

        {/* Metric toggle */}
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

      {/* Floor metrics strip — live figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatTile icon={Boxes} label="Capacity" value={formatNumber(floorRoll.capacity)} sub={`${racks.length} racks · bins`} />
        <StatTile icon={Layers} label="Occupied bins" value={formatNumber(floorRoll.bins)} sub={`${floorRoll.capacity ? Math.round((floorRoll.bins / floorRoll.capacity) * 100) : 0}% of capacity`} />
        <StatTile icon={Box} label="Units available" value={formatNumber(floorRoll.units)} sub="on this floor's racks" />
        <StatTile icon={Barcode} label="EANs" value={formatNumber(floorRoll.eans)} sub="distinct per bin" />
      </div>

      {/* Body — side rail (rack picker, list or grid) + focused rack */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-start">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Racks ({racks.length})</p>
          {view === 'list' ? (
            <div className="flex flex-col gap-1.5">
              {racks.map(r => (
                <RackRow key={r.name} rack={r} roll={rackRoll.get(r.name) ?? EMPTY_ROLL} metric={metric} active={r.name === active.name} onClick={() => setSelectedRack(r.name)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 lg:grid-cols-2 gap-2">
              {racks.map(r => (
                <RackTile key={r.name} rack={r} roll={rackRoll.get(r.name) ?? EMPTY_ROLL} metric={metric} active={r.name === active.name} onClick={() => setSelectedRack(r.name)} />
              ))}
            </div>
          )}
        </div>
        <FocusedPanel
          rack={active}
          roll={rackRoll.get(active.name) ?? EMPTY_ROLL}
          cellMap={cellMap}
          bucketOf={bucketer.of}
          thresholds={bucketer}
          onPick={pickGridCell}
          selectedCode={target?.code ?? null}
        />
      </div>

      {/* Other storage — stock parked outside the rack grids */}
      {data && (data.zones.length > 0 || data.unracked) && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Other storage</h2>
              <p className="text-[11px] text-gray-400">Pallets, cages and rooms — locations outside the rack grids</p>
            </div>
            {data.unracked && (
              <button
                onClick={() => setTarget({ code: 'NO LOCATION', subtitle: 'Stock without a recorded rack number', cell: data.unracked, info: null })}
                className="text-xs text-red-500 font-semibold hover:underline"
              >
                {formatNumber(data.unracked.units)} units have no location →
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {data.zones.map(z => (
              <ZonePanel key={z.zone} zone={z} onPick={pickZoneCell} selectedCode={target?.code ?? null} />
            ))}
          </div>
        </div>
      )}

      {target && <LocationDrawer target={target} onClose={() => setTarget(null)} />}
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
