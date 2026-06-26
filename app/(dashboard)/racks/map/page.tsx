"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  LayoutGrid, List as ListIcon, Upload, Save, Calendar, Plus, MoreHorizontal,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid,
} from 'recharts'
import Header from '@/components/layout/Header'
import { OccupancyLegend, AiInsightCard } from '@/components/racks/ui'
import { FLOORS, racksOnFloor, type FloorId, type Rack } from '@/lib/racks'
import {
  bayStats, rackStat, floorPct, racksNearFull, bucketOf, CELL_STYLE, TILE_STYLE, BUCKET_HEX,
  type BayStat,
} from '@/lib/occupancy'
import { formatNumber } from '@/lib/utils'

type Metric = 'occupancy' | 'volume' | 'items'
type View = 'list' | 'grid'

const METRICS: { id: Metric; label: string }[] = [
  { id: 'occupancy', label: 'Occupancy %' },
  { id: 'volume',    label: 'Volume (m³)' },
  { id: 'items',     label: 'Item Count' },
]

interface Tip { x: number; y: number; zone: string; bay: BayStat }

export default function WarehouseMapPage() {
  const router = useRouter()
  const [floor, setFloor] = useState<FloorId>('first')
  const [metric, setMetric] = useState<Metric>('occupancy')
  const [view, setView] = useState<View>('list')
  const [zoneFilter, setZoneFilter] = useState<string>('ALL')
  const [tip, setTip] = useState<Tip | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const allRacks = useMemo(() => racksOnFloor(floor), [floor])
  const racks = useMemo(
    () => (zoneFilter === 'ALL' ? allRacks : allRacks.filter(r => r.name === zoneFilter)),
    [allRacks, zoneFilter],
  )

  const chartData = useMemo(
    () => allRacks.map(r => {
      const s = rackStat(r)
      return { rack: r.name, pct: s.pct, volume: s.volumeUsed, items: s.itemCount }
    }),
    [allRacks],
  )
  const chartKey = metric === 'occupancy' ? 'pct' : metric === 'volume' ? 'volume' : 'items'

  const utilization = floorPct(floor)
  const nearFull = racksNearFull(floor)

  function exportCsv() {
    const rows = [['Floor', 'Zone', 'Bay', 'Occupancy%', 'Volume_m3', 'Items', 'Status']]
    for (const r of allRacks) for (const b of bayStats(r)) {
      rows.push([FLOORS.find(f => f.id === floor)!.label, r.name, b.label, String(b.pct), String(b.volume), String(b.items), b.status])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `warehouse-map-${floor}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Header title="Warehouse Map Overview" breadcrumb="Warehouse Map" />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Metric tabs */}
        <div className="inline-flex rounded-xl bg-white border border-gray-100 shadow-sm p-1">
          {METRICS.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm transition-colors ${
                metric === m.id ? 'bg-gray-50 text-gray-900 font-medium shadow-sm' : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* List / Grid toggle */}
        <div className="inline-flex rounded-xl bg-white border border-gray-100 shadow-sm p-1">
          {(['list', 'grid'] as const).map(v => (
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

        {/* Floor filter */}
        <Select value={floor} onChange={v => setFloor(v as FloorId)} label="Floor"
          options={FLOORS.map(f => ({ value: f.id, label: f.label }))} />

        {/* View-by (zone) filter */}
        <Select value={zoneFilter} onChange={setZoneFilter} label="View by"
          options={[{ value: 'ALL', label: 'All Zones' }, ...allRacks.map(r => ({ value: r.name, label: `Zone ${r.name}` }))]} />

        {/* Export */}
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl px-4 py-2 shadow-sm transition-colors"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">Export Map Data</span>
        </button>
      </div>

      {/* Body: map + right rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="min-w-0">
          {view === 'list' ? (
            <ListView racks={racks} metric={metric} onHover={setTip} onPick={n => router.push(`/racks/map/${n}`)} />
          ) : (
            <GridView floor={floor} racks={racks} onPick={n => router.push(`/racks/map/${n}`)} />
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Overall warehouse utilization</h3>
              <MoreHorizontal className="w-4 h-4 text-gray-300" />
            </div>
            <p className="text-4xl font-bold text-gray-900 mt-3 tabular-nums">{utilization}%</p>
            <p className="text-xs text-gray-400 mb-3">{nearFull} zones near full capacity.</p>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="rack" tickLine={false} axisLine={false} fontSize={10} interval={0} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} />
                  <RTooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Bar dataKey={chartKey} radius={[4, 4, 0, 0]}>
                    {chartData.map(d => <Cell key={d.rack} fill={BUCKET_HEX[bucketOf(d.pct)]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[13px] text-gray-500 leading-relaxed mt-2">
              {nearFull > 0
                ? `${nearFull} zone${nearFull > 1 ? 's are' : ' is'} approaching maximum capacity. Consider redistributing inventory or scheduling transfers.`
                : 'All zones have healthy headroom on this floor.'}
            </p>
          </div>

          <AiInsightCard title="AI Insight">
            Based on current patterns, the highest-occupancy zone on the{' '}
            {FLOORS.find(f => f.id === floor)!.label} will exceed capacity soon. Suggest relocating
            low-turnover SKUs to a lower-occupancy zone.
          </AiInsightCard>
        </div>
      </div>

      {/* Shared hover tooltip (single node, portal — never clipped by scroll) */}
      {mounted && tip && createPortal(
        <div
          style={{ left: tip.x + 14, top: tip.y + 14 }}
          className="pointer-events-none fixed z-[60] rounded-xl bg-gray-900 px-3.5 py-2.5 text-xs text-white shadow-xl min-w-[150px]"
        >
          <Row k="Zone" v={tip.bay.label} />
          <Row k="Occupancy" v={`${tip.bay.pct}%`} />
          <Row k="Volume" v={`${tip.bay.volume} m³`} />
          <Row k="Items" v={formatNumber(tip.bay.items)} />
          <Row k="Status" v={tip.bay.status} />
        </div>,
        document.body,
      )}
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-6 leading-5">
      <span className="text-gray-400">{k}:</span>
      <span className="font-medium">{v}</span>
    </div>
  )
}

// ── List view: each rack a "zone" card with a row of bay cells ───────────────
function ListView({
  racks, metric, onHover, onPick,
}: {
  racks: Rack[]
  metric: Metric
  onHover: (t: Tip | null) => void
  onPick: (name: string) => void
}) {
  return (
    <div className="space-y-3">
      {racks.map(rack => {
        const bays = bayStats(rack)
        return (
          <div key={rack.name} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => onPick(rack.name)} className="text-sm font-semibold text-gray-800 hover:text-red-500 transition-colors">
                Zone {rack.name}
              </button>
              <OccupancyLegend className="hidden sm:flex" />
            </div>
            <div className="flex flex-wrap gap-2">
              {bays.map(b => {
                const bk = bucketOf(b.pct)
                const value = metric === 'occupancy' ? `${b.pct}%` : metric === 'volume' ? `${b.volume}` : formatNumber(b.items)
                return (
                  <button
                    key={b.bay}
                    onClick={() => onPick(rack.name)}
                    onMouseEnter={e => onHover({ x: e.clientX, y: e.clientY, zone: rack.name, bay: b })}
                    onMouseMove={e => onHover({ x: e.clientX, y: e.clientY, zone: rack.name, bay: b })}
                    onMouseLeave={() => onHover(null)}
                    className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-transform hover:scale-105 ${CELL_STYLE[bk]}`}
                  >
                    <span>{b.label}</span>
                    {metric !== 'occupancy' && <span className="text-[9px] font-normal opacity-80">{value}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Grid view: draggable rack tiles + "Drag New Rack" + Save Layout ──────────
function GridView({ floor, racks, onPick }: { floor: FloorId; racks: Rack[]; onPick: (name: string) => void }) {
  const storeKey = `rackLayout:${floor}`
  const [order, setOrder] = useState<string[]>(racks.map(r => r.name))
  const [saved, setSaved] = useState(false)
  const dragName = useRef<string | null>(null)

  useEffect(() => {
    let next = racks.map(r => r.name)
    try {
      const raw = localStorage.getItem(storeKey)
      if (raw) {
        const stored: string[] = JSON.parse(raw)
        const valid = stored.filter(n => next.includes(n))
        next = [...valid, ...next.filter(n => !valid.includes(n))]
      }
    } catch { /* ignore */ }
    setOrder(next)
  }, [storeKey, racks])

  const byName = useMemo(() => Object.fromEntries(racks.map(r => [r.name, r])), [racks])

  function drop(target: string) {
    const from = dragName.current
    dragName.current = null
    if (!from || from === target) return
    setOrder(prev => {
      const next = prev.filter(n => n !== from)
      next.splice(next.indexOf(target), 0, from)
      return next
    })
  }
  function saveLayout() {
    try { localStorage.setItem(storeKey, JSON.stringify(order)) } catch { /* ignore */ }
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-end gap-2 mb-4">
        <button onClick={saveLayout} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors">
          <Save className="w-4 h-4" /> {saved ? 'Saved ✓' : 'Save Layout'}
        </button>
        <button className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-sm rounded-xl px-4 py-2 hover:border-gray-300 transition-colors">
          <Calendar className="w-4 h-4" /> Preview
        </button>
        <button className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-sm rounded-xl px-4 py-2 hover:border-gray-300 transition-colors">
          <Plus className="w-4 h-4" /> Add New Layout
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {order.map(name => {
          const rack = byName[name]
          if (!rack) return null
          const bays = bayStats(rack)
          return (
            <div
              key={name}
              draggable
              onDragStart={() => { dragName.current = name }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => drop(name)}
              onClick={() => onPick(name)}
              className="group cursor-pointer rounded-2xl border border-gray-100 bg-gray-50/50 p-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700 font-mono">RACK {name}</span>
                <span className="text-[10px] text-gray-400">{rackStat(rack).pct}%</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {bays.slice(0, 12).map(b => (
                  <div key={b.bay} className={`aspect-square rounded-md ${TILE_STYLE[bucketOf(b.pct)]}`} />
                ))}
              </div>
            </div>
          )
        })}

        {/* Drag-new-rack dropzone */}
        <div className="rounded-2xl border-2 border-dashed border-red-200 bg-red-50/40 flex items-center justify-center text-red-500 text-sm font-medium min-h-[120px]">
          <Plus className="w-4 h-4 mr-1" /> Drag New Rack
        </div>
      </div>
    </div>
  )
}

// ── small native select styled like the reference ───────────────────────────
function Select({
  value, onChange, label, options,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex items-center gap-2 bg-white border border-gray-100 shadow-sm rounded-xl px-3 py-2 text-sm">
      <span className="text-gray-400 text-xs">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent text-gray-700 outline-none cursor-pointer max-w-[7.5rem]"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}
