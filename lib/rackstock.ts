// Live per-location stock from WMS_ITEM_STOCK_MASTER_COMMON_CONTR.
//
// rackNo in the DB is free text typed at put-away. Observed schemes:
//   First floor  (racks A–P):  <Rack><Shelf 01-55><Side A|B|C>   e.g. "H24A"
//     Shelf numbers are sequential per rack (max = bays × levels, verified
//     against every rack's geometry). A few shelves have a third bin "C".
//   Ground floor (racks GA–GN): <Rack><Level 01-11><Position A..> e.g. "GB01A"
//     Same scheme locationCode() already renders.
//   Zones (no rack grid): PLT* pallets, CAG*/CAGE* cages, CSD*, ROOM*, BOX*,
//     WL*, plus assorted junk ("." / "K3" / "AB34 F73") → OTHER.
//
// The ERP reads locations with WHERE RACKNO = @RACKNO (exact string), so
// binding here is also by exact normalized code.

import { RACKS, type Rack } from './racks'

export interface StockItem {
  ean: string
  sku: string
  name: string
  size: string
  color: string
  avail: number // computed balance = GRN − issued + returned (ERP method)
  recd: number  // GRN receipt qty
  iss: number   // issued qty
  rtn: number   // returned qty
  cont: string  // container number(s)
}

export interface CellStock {
  code: string
  rack: string | null // parsed rack name when the code maps to a rack grid
  units: number
  eans: number
  items: StockItem[]
}

export interface ZoneStock {
  zone: ZoneId
  label: string
  units: number
  eans: number
  cells: CellStock[]
}

export interface RackStockData {
  fetchedAt: string
  totals: { units: number; eans: number; rows: number }
  cells: CellStock[]   // rack-grid bins, code = exact normalized rackNo
  zones: ZoneStock[]   // non-rack storage, sorted by units desc
  unracked: CellStock | null // stock with no usable rackNo
}

export type ZoneId = 'PALLETS' | 'CAGES' | 'CSD' | 'ROOM' | 'BOX' | 'WL' | 'OTHER'
const ZONE_LABELS: Record<ZoneId, string> = {
  PALLETS: 'Pallets', CAGES: 'Cages', CSD: 'CSD', ROOM: 'Room',
  BOX: 'Boxes', WL: 'WL', OTHER: 'Other / unparsed',
}

export function normalizeRackNo(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = raw.replace(/[.\t]/g, ' ').trim().toUpperCase().replace(/\s+/g, ' ')
  return s
}

const FIRST_RE = /^([A-P])([0-9]{2})([A-Z])$/
const GROUND_RE = /^(G[A-N])([0-9]{2})([A-Z])$/

const rackByName = new Map<string, Rack>(RACKS.map(r => [r.name, r]))

export type CodeKind =
  | { kind: 'cell'; rack: string }
  | { kind: 'zone'; zone: ZoneId }
  | { kind: 'unracked' }

export function classifyCode(code: string): CodeKind {
  if (!code) return { kind: 'unracked' }

  const g = GROUND_RE.exec(code)
  if (g) {
    const rack = rackByName.get(g[1])
    const level = parseInt(g[2], 10)
    const col = g[3].charCodeAt(0) - 65
    if (rack && rack.floor === 'ground' && level >= 1 && level <= rack.levels && col < rack.cols) {
      return { kind: 'cell', rack: rack.name }
    }
    return { kind: 'zone', zone: 'OTHER' }
  }

  const f = FIRST_RE.exec(code)
  if (f) {
    const rack = rackByName.get(f[1])
    const shelf = parseInt(f[2], 10)
    if (rack && rack.floor === 'first' && shelf >= 1 && shelf <= rack.shelves) {
      return { kind: 'cell', rack: rack.name }
    }
    return { kind: 'zone', zone: 'OTHER' }
  }

  if (code.startsWith('PLT') || code.startsWith('PTL') || code.startsWith('PLR') || code.startsWith('PLY'))
    return { kind: 'zone', zone: 'PALLETS' }
  if (code.startsWith('CAG')) return { kind: 'zone', zone: 'CAGES' }
  if (code.startsWith('CSD')) return { kind: 'zone', zone: 'CSD' }
  if (code.startsWith('ROOM')) return { kind: 'zone', zone: 'ROOM' }
  if (code.startsWith('BOX')) return { kind: 'zone', zone: 'BOX' }
  if (code.startsWith('WL')) return { kind: 'zone', zone: 'WL' }
  return { kind: 'zone', zone: 'OTHER' }
}

// ── raw DB row → grouped payload ─────────────────────────────────────────────
export interface RawStockRow {
  rackNo: string | null
  EAN: string | null
  SKU: string | null
  ItemName: string | null
  Size: string | null
  color: string | null
  grnqty: number | null
  issqty: number | null
  rtnqty: number | null
  avail: number | null
  containerno: string | null
}

export function buildRackStock(rows: RawStockRow[]): RackStockData {
  type Acc = { code: string; rack: string | null; items: Map<string, StockItem> }
  const cellAcc = new Map<string, Acc>()
  const zoneAcc = new Map<ZoneId, Map<string, Acc>>()
  const unrackedItems = new Map<string, StockItem>()

  const addItem = (map: Map<string, StockItem>, r: RawStockRow) => {
    const ean = r.EAN ?? ''
    const prev = map.get(ean)
    const avail = r.avail ?? 0
    const recd = r.grnqty ?? 0
    const iss = r.issqty ?? 0
    const rtn = r.rtnqty ?? 0
    const cont = r.containerno ?? ''
    if (prev) { // same EAN received twice into the same location — merge
      prev.avail += avail
      prev.recd += recd
      prev.iss += iss
      prev.rtn += rtn
      if (cont && !prev.cont.includes(cont)) prev.cont += `, ${cont}`
    } else {
      map.set(ean, {
        ean,
        sku: r.SKU ?? '',
        name: r.ItemName ?? '',
        size: r.Size ?? '',
        color: r.color ?? '',
        avail, recd, iss, rtn, cont,
      })
    }
  }

  let totalUnits = 0
  const totalEans = new Set<string>()

  for (const r of rows) {
    totalUnits += r.avail ?? 0
    if (r.EAN) totalEans.add(r.EAN)

    const code = normalizeRackNo(r.rackNo)
    const c = classifyCode(code)

    if (c.kind === 'unracked') {
      addItem(unrackedItems, r)
    } else if (c.kind === 'cell') {
      let acc = cellAcc.get(code)
      if (!acc) { acc = { code, rack: c.rack, items: new Map() }; cellAcc.set(code, acc) }
      addItem(acc.items, r)
    } else {
      let zone = zoneAcc.get(c.zone)
      if (!zone) { zone = new Map(); zoneAcc.set(c.zone, zone) }
      let acc = zone.get(code)
      if (!acc) { acc = { code, rack: null, items: new Map() }; zone.set(code, acc) }
      addItem(acc.items, r)
    }
  }

  const finish = (a: Acc): CellStock => {
    const items = [...a.items.values()].sort((x, y) => y.avail - x.avail)
    return {
      code: a.code,
      rack: a.rack,
      units: items.reduce((s, i) => s + i.avail, 0),
      eans: items.length,
      items,
    }
  }

  const zones: ZoneStock[] = [...zoneAcc.entries()].map(([zone, cells]) => {
    const list = [...cells.values()].map(finish).sort((a, b) => b.units - a.units)
    return {
      zone,
      label: ZONE_LABELS[zone],
      units: list.reduce((s, c) => s + c.units, 0),
      eans: list.reduce((s, c) => s + c.eans, 0),
      cells: list,
    }
  }).sort((a, b) => b.units - a.units)

  const unracked = unrackedItems.size
    ? finish({ code: '', rack: null, items: unrackedItems })
    : null

  return {
    fetchedAt: new Date().toISOString(),
    totals: { units: totalUnits, eans: totalEans.size, rows: rows.length },
    cells: [...cellAcc.values()].map(finish),
    zones,
    unracked,
  }
}

// ── fill buckets for the grid, thresholds from the live distribution ─────────
export type FillBucket = 'empty' | 'low' | 'mid' | 'high'

export interface Bucketer {
  of: (units: number) => FillBucket
  t1: number // low ≤ t1 < mid
  t2: number // mid ≤ t2 < high
}

export function makeBucketer(unitCounts: number[]): Bucketer {
  const occupied = unitCounts.filter(u => u > 0).sort((a, b) => a - b)
  const q = (p: number) => occupied.length ? occupied[Math.min(occupied.length - 1, Math.floor(p * occupied.length))] : 0
  const t1 = Math.max(1, q(0.5))
  const t2 = Math.max(t1 + 1, q(0.85))
  return {
    t1, t2,
    of: (units: number) => units <= 0 ? 'empty' : units <= t1 ? 'low' : units <= t2 ? 'mid' : 'high',
  }
}
