// Demo occupancy / volume / turnover data for the warehouse-map UI.
//
// The DB (USP_WMS_DASHBOARD_V3) has NO per-location stock mapping, so until a
// real feed exists every figure here is DETERMINISTIC demo data derived from a
// hash of the location/bay/rack code. Deterministic = stable across reloads and
// never flickers between renders, so the map looks "real" without a backend.
// Swap these helpers for a real source later; the UI consumes them unchanged.

import { RACKS, racksOnFloor, type Rack, type FloorId } from './racks'

// FNV-1a → 0..1
function hash01(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}
function span(seed: string, min: number, max: number): number {
  return Math.round(min + hash01(seed) * (max - min))
}

// ── occupancy buckets (Ware Sync legend, copied exactly) ─────────────────────
export type Bucket = 'low' | 'mid' | 'high'
export function bucketOf(pct: number): Bucket {
  if (pct <= 60) return 'low'
  if (pct <= 85) return 'mid'
  return 'high'
}

export const BUCKETS: { id: Bucket; label: string; hex: string }[] = [
  { id: 'low',  label: '0-60%',   hex: '#2EE6A8' }, // mint green
  { id: 'mid',  label: '61-85%',  hex: '#2B1FB3' }, // deep indigo
  { id: 'high', label: '86-100%', hex: '#7FA6BC' }, // slate blue
]
export const BUCKET_HEX: Record<Bucket, string> = { low: '#2EE6A8', mid: '#2B1FB3', high: '#7FA6BC' }

// Cell styles for Map / Zone views (literal classes → Tailwind v4 JIT keeps them).
// Matches the reference: low = solid mint, mid = indigo outline, high = slate outline.
export const CELL_STYLE: Record<Bucket, string> = {
  low:  'bg-[#2EE6A8] text-emerald-950 border-2 border-[#2EE6A8]',
  mid:  'bg-white text-[#2B1FB3] border-2 border-[#2B1FB3]',
  high: 'bg-white text-[#5E86A0] border-2 border-[#7FA6BC]',
}
// Grid-view / bin tiles: solid fill.
export const TILE_STYLE: Record<Bucket, string> = {
  low: 'bg-[#2EE6A8] text-emerald-950', mid: 'bg-[#2B1FB3] text-white', high: 'bg-[#7FA6BC] text-white',
}

// ── per-bay aggregate (the "cells" in a zone row) ────────────────────────────
export interface BayStat {
  bay: number
  label: string // e.g. "A1", "GA3"
  pct: number
  volume: number // m³
  items: number
  status: string
}
export function bayStats(rack: Rack): BayStat[] {
  return Array.from({ length: rack.bays }, (_, i) => {
    const bay = i + 1
    const pct = span(`${rack.name}|bay|${bay}`, 8, 99)
    return {
      bay,
      label: `${rack.name}${bay}`,
      pct,
      volume: span(`${rack.name}|vol|${bay}`, 40, 240),
      items: span(`${rack.name}|itm|${bay}`, 60, 900),
      status: pct > 85 ? 'Near full' : 'Normal',
    }
  })
}

// ── per-rack rollup ──────────────────────────────────────────────────────────
export interface RackStat {
  name: string
  pct: number
  itemCount: number
  volumeUsed: number
  volumeTotal: number
  turnoverDays: number
}
export function rackStat(rack: Rack): RackStat {
  const bays = bayStats(rack)
  const pct = Math.round(bays.reduce((s, b) => s + b.pct, 0) / bays.length)
  const volumeTotal = Math.round(rack.locations * 0.9)
  return {
    name: rack.name,
    pct,
    itemCount: Math.round(rack.locations * (pct / 100) * 4),
    volumeTotal,
    volumeUsed: Math.round(volumeTotal * (pct / 100)),
    turnoverDays: span(`${rack.name}|turn`, 5, 30),
  }
}

export function floorPct(floor: FloorId): number {
  const rs = racksOnFloor(floor).map(rackStat)
  return Math.round(rs.reduce((s, r) => s + r.pct, 0) / rs.length)
}
export function overallPct(): number {
  const rs = RACKS.map(rackStat)
  return Math.round(rs.reduce((s, r) => s + r.pct, 0) / rs.length)
}
export function racksNearFull(floor?: FloorId): number {
  const list = floor ? racksOnFloor(floor) : RACKS
  return list.map(rackStat).filter(r => r.pct > 85).length
}
