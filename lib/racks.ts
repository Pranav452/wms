// Single source of truth for the physical warehouse rack layout.
//
// Source: current warehouse spec (2026). This SUPERSEDES the discarded A–P
// scheme from the 2024 KIABI email — same building, re-counted.
//
//   14 racks. Each shelf holds 2 storage locations — one per floor
//   (Ground + Level 1), which is why locations = 2 × shelves.
//     • 12 racks      → 88 shelves / 176 locations
//     • Racks 2 & 9   → 66 shelves / 132 locations
//   Totals: 1188 shelves · 2376 locations.
//
// GEOMETRY ASSUMPTION (confirm with warehouse): each rack is 11 shelves tall
// (levels 1–11, ground = level 1 at the bottom). Bays (columns) are then
// shelves ÷ 11 → 8 bays for an 88-shelf rack, 6 bays for a 66-shelf rack.
// If the real shape differs, change LEVELS_PER_BAY / SMALL_RACKS below only.

export const FLOORS = [
  { id: 'G',  label: 'Ground',  locations: 0 }, // locations filled in below
  { id: 'L1', label: 'Level 1', locations: 0 },
] as const
export type FloorId = (typeof FLOORS)[number]['id']

export const LEVELS_PER_BAY = 11 // shelf heights, bottom (1) → top (11)

export interface Rack {
  no: number      // 1..14
  shelves: number // physical shelf positions
  bays: number    // columns (shelves / LEVELS_PER_BAY)
}

// Racks with a reduced footprint (66 shelves instead of 88).
const SMALL_RACKS = new Set<number>([2, 9])

export const RACKS: Rack[] = Array.from({ length: 14 }, (_, i) => {
  const no = i + 1
  const shelves = SMALL_RACKS.has(no) ? 66 : 88
  return { no, shelves, bays: shelves / LEVELS_PER_BAY }
})

export const TOTAL_SHELVES = RACKS.reduce((s, r) => s + r.shelves, 0)   // 1188
export const LOCATIONS_PER_SHELF = FLOORS.length                        // 2
export const TOTAL_LOCATIONS = TOTAL_SHELVES * LOCATIONS_PER_SHELF      // 2376
export const LOCATIONS_PER_FLOOR = TOTAL_SHELVES                        // 1188

// A location's address, e.g. locationId('G', 7, 3, 9) → "G-07-3-09"
//   Floor · Rack · Bay · Shelf-height. Read left→right exactly how you walk:
//   floor → rack → bay → shelf.
export function locationId(floor: FloorId, rack: number, bay: number, level: number): string {
  return `${floor}-${String(rack).padStart(2, '0')}-${bay}-${String(level).padStart(2, '0')}`
}

// Human-readable form of the same address.
export function locationLabel(floor: FloorId, rack: number, bay: number, level: number): string {
  const f = FLOORS.find(x => x.id === floor)!.label
  return `${f} · Rack ${String(rack).padStart(2, '0')} · Bay ${bay} · Shelf ${String(level).padStart(2, '0')}`
}

// Occupancy status of a location. v1 has no data source, so everything reads
// 'empty'; the palette is kept ready for when a per-location feed exists.
export type SlotStatus = 'full' | 'partial' | 'empty' | 'blocked'
