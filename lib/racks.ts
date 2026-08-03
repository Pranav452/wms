// Single source of truth for the physical warehouse rack layout.
//
// Source: "RACK DETAILS .xls" (2026) + the hand-drawn location-code sketch.
// The warehouse has TWO floors, each with its OWN rack set:
//
//   First Floor  — 16 racks (A–P)   →  832 shelves / 1664 locations
//   Ground Floor — 14 racks (GA–GN) → 1080 shelves / 2160 locations
//     (10 usable levels — level 11 is physically there but never stocked)
//   ──────────────────────────────────────────────────────────────
//   Warehouse total                 → 1912 shelves / 3824 locations
//
// Every shelf = 2 side-by-side storage positions, so the addressable unit is
// the LOCATION (= 2 × shelves). The grid renders one cell per location:
// columns = bays × 2, rows = levels.
//
// Geometry (bays × levels) is derived from the per-rack shelf counts and the
// 2024 KIABI email; it factors exactly. First floor: 11 levels everywhere
// except Rack I (8 levels). Ground floor: 10 usable levels (see below).
// Confirm if any rack's real shape differs — only the
// [name, bays, levels] rows below need editing.

export type FloorId = 'first' | 'ground'

export interface Floor {
  id: FloorId
  label: string
  short: string
}

export const FLOORS: Floor[] = [
  { id: 'first',  label: 'First Floor',  short: '1F' },
  { id: 'ground', label: 'Ground Floor', short: 'GF' },
]

export const POSITIONS_PER_SHELF = 2 // 2 side-by-side positions per shelf

export interface Rack {
  name: string     // 'A', 'GA', …
  floor: FloorId
  bays: number     // physical bays (shelf columns)
  levels: number   // rows, 1 (bottom) → levels (top)
  shelves: number  // bays × levels
  cols: number     // grid columns = bays × 2 (one per position)
  locations: number
}

// [name, bays, levels] — order preserved for display.
const FIRST_FLOOR: [string, number, number][] = [
  ['A', 5, 11], ['B', 5, 11], ['C', 5, 11], ['D', 5, 11],
  ['E', 4, 11], ['F', 4, 11], ['G', 5, 11], ['H', 5, 11],
  ['I', 5,  8], ['J', 5, 11], ['K', 4, 11], ['L', 5, 11],
  ['M', 5, 11], ['N', 5, 11], ['O', 5, 11], ['P', 5, 11],
]

const GROUND_FLOOR: [string, number, number][] = [
  // Level 11 exists physically but is NOT used for storage, so it is excluded
  // from the grid and from capacity (verified: zero stock in level-11 bins).
  ['GA', 8, 10], ['GB', 6, 10], ['GC', 8, 10], ['GD', 8, 10],
  ['GE', 8, 10], ['GF', 8, 10], ['GG', 8, 10], ['GH', 8, 10],
  ['GI', 6, 10], ['GJ', 8, 10], ['GK', 8, 10], ['GL', 8, 10],
  ['GM', 8, 10], ['GN', 8, 10],
]

function build(rows: [string, number, number][], floor: FloorId): Rack[] {
  return rows.map(([name, bays, levels]) => {
    const shelves = bays * levels
    const cols = bays * POSITIONS_PER_SHELF
    return { name, floor, bays, levels, shelves, cols, locations: shelves * POSITIONS_PER_SHELF }
  })
}

export const RACKS: Rack[] = [...build(FIRST_FLOOR, 'first'), ...build(GROUND_FLOOR, 'ground')]

export function racksOnFloor(floor: FloorId): Rack[] {
  return RACKS.filter(r => r.floor === floor)
}

export interface FloorTotals {
  racks: number
  shelves: number
  locations: number
}

export function floorTotals(floor: FloorId): FloorTotals {
  const rs = racksOnFloor(floor)
  const shelves = rs.reduce((s, r) => s + r.shelves, 0)
  return { racks: rs.length, shelves, locations: shelves * POSITIONS_PER_SHELF }
}

const _all = RACKS.reduce((s, r) => s + r.shelves, 0)
export const TOTAL_SHELVES = _all                                 // 1912
export const TOTAL_LOCATIONS = _all * POSITIONS_PER_SHELF         // 3824

// Column index (0-based) → letter: 0 → 'A', 1 → 'B'…  (positions run A, B, C…)
export function colLetter(i: number): string {
  return String.fromCharCode(65 + i)
}

// Location code, per the hand-drawn sketch: <Rack><Level2><Position>
//   locationCode('A', 2, 3) → "A02D"  (Rack A, Level 02, position D)
export function locationCode(rack: string, level: number, col: number): string {
  return `${rack}${String(level).padStart(2, '0')}${colLetter(col)}`
}

// ── DB-matching bin codes ─────────────────────────────────────────────────────
// The WMS DB (WMS_ITEM_STOCK_MASTER_COMMON_CONTR.rackNo) addresses the two
// floors differently:
//   First floor:  <Rack><Shelf 01-55><Side A|B>  e.g. "H24A" — shelf numbers
//     are sequential per rack (max = bays × levels, verified per rack).
//     Numbering order across the grid is assumed level-major (shelf 1..bays on
//     level 1, then level 2, …) — placement is cosmetic, binding is by code.
//   Ground floor: <Rack><Level2><Position>       e.g. "GB01A" — locationCode().

export function shelfNumber(rack: Rack, level: number, bay: number): number {
  return (level - 1) * rack.bays + bay
}

export function cellCode(rack: Rack, level: number, col: number): string {
  if (rack.floor === 'first') {
    const bay = Math.floor(col / POSITIONS_PER_SHELF) + 1
    const side = colLetter(col % POSITIONS_PER_SHELF) // A | B
    return `${rack.name}${String(shelfNumber(rack, level, bay)).padStart(2, '0')}${side}`
  }
  return locationCode(rack.name, level, col)
}

// Structured detail for the side drawer.
export interface LocationInfo {
  code: string
  floor: FloorId
  floorLabel: string
  rack: string
  level: number
  shelf: number    // sequential shelf number (first-floor addressing)
  position: string // A, B, C…
  bay: number      // physical bay (1-based)
  side: 'Left' | 'Right'
}

export function locationInfo(rack: Rack, level: number, col: number): LocationInfo {
  const bay = Math.floor(col / POSITIONS_PER_SHELF) + 1
  return {
    code: cellCode(rack, level, col),
    floor: rack.floor,
    floorLabel: FLOORS.find(f => f.id === rack.floor)!.label,
    rack: rack.name,
    level,
    shelf: shelfNumber(rack, level, bay),
    position: rack.floor === 'first' ? colLetter(col % POSITIONS_PER_SHELF) : colLetter(col),
    bay,
    side: col % POSITIONS_PER_SHELF === 0 ? 'Left' : 'Right',
  }
}

// Occupancy status. v1 has no per-location feed, so everything reads 'empty';
// the palette is ready for when a live source exists.
export type SlotStatus = 'full' | 'partial' | 'empty' | 'blocked'
