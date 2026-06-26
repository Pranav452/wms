"use client";

import React, { useMemo, useState } from 'react'
import { Minus, Plus, Info } from 'lucide-react'
import Header from '@/components/layout/Header'
import {
  FLOORS,
  RACKS,
  LEVELS_PER_BAY,
  TOTAL_SHELVES,
  TOTAL_LOCATIONS,
  LOCATIONS_PER_FLOOR,
  locationId,
  locationLabel,
  type FloorId,
  type SlotStatus,
  type Rack,
} from '@/lib/racks'
import { formatNumber } from '@/lib/utils'

// ── one cell = one storage location on the active floor ──────────────────────
function SlotCell({
  status,
  level,
  id,
  label,
}: {
  status: SlotStatus
  level: number
  id: string
  label: string
}) {
  const styles: Record<SlotStatus, string> = {
    full:    'bg-[#C5C5C5] text-white border-[#C5C5C5]',
    partial: 'diagonal-pattern bg-white text-gray-500 border-gray-200',
    empty:   'bg-white text-gray-400 border-gray-200 hover:border-red-400 hover:text-red-500',
    blocked: 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed',
  }
  return (
    <div
      title={`${id} — ${label}`}
      className={`w-7 h-7 rounded border flex items-center justify-center text-[9px] font-mono
                  transition-colors duration-150 ${styles[status]}`}
    >
      {String(level).padStart(2, '0')}
    </div>
  )
}

// ── one rack = bays (columns) × levels (rows, top = highest) ─────────────────
function RackBlock({ rack, floor }: { rack: Rack; floor: FloorId }) {
  const levels = Array.from({ length: LEVELS_PER_BAY }, (_, i) => LEVELS_PER_BAY - i) // 11→1
  const bays = Array.from({ length: rack.bays }, (_, i) => i + 1)

  return (
    <div className="flex flex-col flex-shrink-0">
      {/* Rack header */}
      <div className="mb-1.5 text-center">
        <div className="text-[11px] font-semibold text-gray-800 font-mono">
          RACK {String(rack.no).padStart(2, '0')}
        </div>
        <div className="text-[9px] text-gray-400">
          {rack.shelves} sh · {rack.bays} bays
        </div>
      </div>

      {/* Bay headers */}
      <div className="flex gap-1 justify-center mb-1">
        {bays.map(b => (
          <div key={b} className="w-7 text-center text-[8px] text-gray-400 font-mono">
            B{b}
          </div>
        ))}
      </div>

      {/* Grid: rows = levels (top→bottom), cols = bays */}
      <div className="flex flex-col gap-1">
        {levels.map(level => (
          <div key={level} className="flex gap-1">
            {bays.map(bay => {
              const id = locationId(floor, rack.no, bay, level)
              return (
                <SlotCell
                  key={bay}
                  status="empty"
                  level={level}
                  id={id}
                  label={locationLabel(floor, rack.no, bay, level)}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RacksPage() {
  const [floor, setFloor] = useState<FloorId>('G')
  const [zoom, setZoom] = useState(80)

  const activeFloor = useMemo(() => FLOORS.find(f => f.id === floor)!, [floor])

  return (
    <>
      <Header title="Rack Management" breadcrumb="Racks" />

      {/* Assumption banner — remove once the layout is confirmed */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 mb-4 text-xs">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          Static layout · no live occupancy yet. Grid shape assumes <b>11 shelves tall</b> →
          bays = shelves ÷ 11 (8 or 6). Naming: <b>{locationId('G', 7, 3, 9)}</b> =
          {' '}{locationLabel('G', 7, 3, 9)}. Tell me if the real shape or floor split differs.
        </span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
        {/* Top bar: floor tabs */}
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
            {formatNumber(LOCATIONS_PER_FLOOR)} locations
          </span>
        </div>

        {/* Grid content */}
        <div className="overflow-auto p-4">
          <div
            className="flex gap-5 min-w-max"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
          >
            {RACKS.map(rack => (
              <RackBlock key={rack.no} rack={rack} floor={floor} />
            ))}
          </div>
        </div>

        {/* Legend + zoom + totals */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 bg-[#C5C5C5] rounded-sm" />
            <span className="text-[11px] text-gray-500">Full</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 diagonal-pattern bg-white border border-gray-200 rounded-sm" />
            <span className="text-[11px] text-gray-500">Partial</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 bg-white border border-gray-200 rounded-sm" />
            <span className="text-[11px] text-gray-500">Empty</span>
          </div>

          <div className="flex-1" />

          <span className="text-[11px] text-gray-500 font-mono">
            {RACKS.length} racks · {formatNumber(TOTAL_SHELVES)} shelves ·{' '}
            {formatNumber(TOTAL_LOCATIONS)} locations · {activeFloor.label}
          </span>

          {/* Zoom */}
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
    </>
  )
}
