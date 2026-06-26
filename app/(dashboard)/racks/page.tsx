"use client";

import React, { useMemo, useState } from 'react'
import { X, Minus, Plus, PackageSearch } from 'lucide-react'
import Header from '@/components/layout/Header'
import {
  FLOORS,
  racksOnFloor,
  floorTotals,
  locationCode,
  locationInfo,
  POSITIONS_PER_SHELF,
  TOTAL_SHELVES,
  TOTAL_LOCATIONS,
  type FloorId,
  type Rack,
  type LocationInfo,
} from '@/lib/racks'
import { formatNumber } from '@/lib/utils'

// ── one cell = one drawer (storage location) ─────────────────────────────────
function DrawerCell({
  code,
  active,
  onClick,
}: {
  code: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={code}
      className={`h-6 w-11 rounded border flex items-center justify-center text-[8px] font-mono
                  whitespace-nowrap transition-colors duration-100 ${
        active
          ? 'bg-red-500 text-white border-red-500'
          : 'bg-white text-gray-500 border-gray-200 hover:border-red-400 hover:text-red-500'
      }`}
    >
      {code}
    </button>
  )
}

// ── one rack: rows = levels (top → bottom), each shelf = 2 drawers ───────────
function RackBlock({
  rack,
  selectedCode,
  onPick,
}: {
  rack: Rack
  selectedCode: string | null
  onPick: (info: LocationInfo) => void
}) {
  const levels = Array.from({ length: rack.levels }, (_, i) => rack.levels - i) // high → 1
  const bays = Array.from({ length: rack.bays }, (_, i) => i + 1)

  return (
    <div className="flex flex-col flex-shrink-0">
      {/* Rack header */}
      <div className="mb-1.5 text-center">
        <div className="text-[11px] font-semibold text-gray-800 font-mono">RACK {rack.name}</div>
        <div className="text-[9px] text-gray-400">
          {rack.shelves} sh · {rack.locations} loc
        </div>
      </div>

      {/* Grid: each level row, bays separated, 2 drawers per bay */}
      <div className="flex flex-col gap-1">
        {levels.map(level => (
          <div key={level} className="flex gap-2">
            {bays.map(bay => (
              <div key={bay} className="flex gap-0.5">
                {Array.from({ length: POSITIONS_PER_SHELF }, (_, s) => {
                  const col = (bay - 1) * POSITIONS_PER_SHELF + s
                  const code = locationCode(rack.name, level, col)
                  return (
                    <DrawerCell
                      key={col}
                      code={code}
                      active={selectedCode === code}
                      onClick={() => onPick(locationInfo(rack, level, col))}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── side drawer: details for the clicked location ────────────────────────────
function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400">{k}</span>
      <span className="text-sm text-gray-800 font-medium font-mono">{v}</span>
    </div>
  )
}

function LocationDrawer({ info, onClose }: { info: LocationInfo; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/30" aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-50 w-[88vw] max-w-sm bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-lg font-bold text-gray-900 font-mono">{info.code}</div>
            <div className="text-xs text-gray-400">{info.floorLabel} · drawer location</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Address breakdown */}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Location</h3>
          <DetailRow k="Floor" v={info.floorLabel} />
          <DetailRow k="Rack" v={info.rack} />
          <DetailRow k="Level" v={String(info.level).padStart(2, '0')} />
          <DetailRow k="Bay" v={`${info.bay}`} />
          <DetailRow k="Position" v={info.position} />
          <DetailRow k="Side" v={info.side} />

          {/* Stock — placeholder until a per-location feed exists */}
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-6 mb-1">Stock</h3>
          <DetailRow k="EAN No." v="—" />
          <DetailRow k="Ref No." v="—" />
          <DetailRow k="Balance Qty" v="—" />

          <div className="flex items-start gap-2 mt-5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs text-gray-500">
            <PackageSearch className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>No stock feed linked to locations yet. EAN / Ref / Balance will populate once a per-drawer source is wired.</span>
          </div>
        </div>
      </aside>
    </>
  )
}

export default function RacksPage() {
  const [floor, setFloor] = useState<FloorId>('first')
  const [zoom, setZoom] = useState(90)
  const [selected, setSelected] = useState<LocationInfo | null>(null)

  const racks = useMemo(() => racksOnFloor(floor), [floor])
  const totals = useMemo(() => floorTotals(floor), [floor])

  return (
    <>
      <Header title="Rack Management" breadcrumb="Racks" />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden flex-1 min-h-[60vh]">
        {/* Top bar: floor tabs + totals */}
        <div className="flex items-center gap-1 px-3 py-2.5 border-b border-gray-100">
          {FLOORS.map(f => (
            <button
              key={f.id}
              onClick={() => setFloor(f.id)}
              className={`h-7 px-4 rounded-full text-[11px] font-medium transition-colors ${
                floor === f.id
                  ? 'bg-red-500 text-white'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-red-300'
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-[11px] text-gray-400 font-mono hidden sm:block">
            {totals.racks} racks · {formatNumber(totals.shelves)} sh · {formatNumber(totals.locations)} loc
          </span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-4">
          <div
            className="flex gap-5 min-w-max"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
          >
            {racks.map(rack => (
              <RackBlock
                key={rack.name}
                rack={rack}
                selectedCode={selected?.code ?? null}
                onPick={setSelected}
              />
            ))}
          </div>
        </div>

        {/* Footer: hint + grand totals + zoom */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 border-t border-gray-100">
          <span className="text-[11px] text-gray-500">
            Click a drawer to see its details. Each shelf = {POSITIONS_PER_SHELF} drawers.
          </span>
          <div className="flex-1" />
          <span className="text-[11px] text-gray-500 font-mono">
            Warehouse: {formatNumber(TOTAL_SHELVES)} shelves · {formatNumber(TOTAL_LOCATIONS)} locations
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setZoom(z => Math.max(50, z - 10))}
              className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-gray-50 rounded transition-colors"
              aria-label="Zoom out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-gray-500 w-9 text-center font-mono">{zoom}%</span>
            <button
              onClick={() => setZoom(z => Math.min(150, z + 10))}
              className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-gray-50 rounded transition-colors"
              aria-label="Zoom in"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {selected && <LocationDrawer info={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
