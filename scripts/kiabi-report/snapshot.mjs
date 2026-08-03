// Point-in-time warehouse snapshot for the KIABI project report deck.
//
//   node scripts/kiabi-report/snapshot.mjs
//   → scripts/kiabi-report/data/snapshot.json
//
// Reads the same live figures the Racks page shows (bins consumed, units stored,
// EANs, per-rack rollup), so the deck never carries hand-typed numbers. Rerun it
// on the day the deck is sent and rebuild.
//
// Rack geometry comes from lib/racks.ts (single source of truth). The location-code
// classifier below mirrors lib/rackstock.ts — kept inline because that module's
// extensionless imports don't resolve under plain node.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sql from 'mssql'
import { RACKS, FLOORS } from '../../lib/racks.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const OUT = path.join(HERE, 'data', 'snapshot.json')

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) throw new Error('.env.local not found')
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

// ── same balance maths the dashboard uses: GRN − issued + returned per EAN+container
const STOCK_SQL = `
WITH GRN AS (
  SELECT EAN, CONTAINERNO, QTY = SUM(QTY)
  FROM TBL_IMP_WMS_GRN_DTLS D
  INNER JOIN TBL_IMP_WMS_GRN_MASTER M ON M.GRNNO = D.GRNNO
  GROUP BY EAN, CONTAINERNO),
ISS AS (
  SELECT EAN, CONTAINERNO, QTY = SUM(ISSUEQTY)
  FROM TBL_IMP_WMS_GOODSISSUE_DTLS D
  INNER JOIN TBL_IMP_WMS_GOODSISSUE_MST M ON M.GINNO = D.FK_GINNO
  GROUP BY EAN, CONTAINERNO),
RTN AS (
  SELECT EAN, CONTAINERNO, QTY = SUM(RETURNQTY)
  FROM TBL_IMP_WMS_GOODSRETURN_DTLS D
  INNER JOIN TBL_IMP_WMS_GOODSRETURN_MST M ON M.GRTNNO = D.FK_GRTNNO
  GROUP BY EAN, CONTAINERNO)
SELECT S.rackNo, S.EAN,
       avail = ISNULL(G.QTY, 0) - ISNULL(I.QTY, 0) + ISNULL(R.QTY, 0)
FROM WMS_ITEM_STOCK_MASTER_COMMON_CONTR S
LEFT JOIN GRN G ON G.EAN = S.EAN AND G.CONTAINERNO = S.containerno
LEFT JOIN ISS I ON I.EAN = S.EAN AND I.CONTAINERNO = S.containerno
LEFT JOIN RTN R ON R.EAN = S.EAN AND R.CONTAINERNO = S.containerno
WHERE S.Cmpcode = @CMPCODE AND S.Citycode = @CITYCODE
  AND ISNULL(G.QTY, 0) - ISNULL(I.QTY, 0) + ISNULL(R.QTY, 0) > 0`

const FIRST_RE = /^([A-P])([0-9]{2})([A-Z])$/
const GROUND_RE = /^(G[A-N])([0-9]{2})([A-Z])$/
const rackByName = new Map(RACKS.map(r => [r.name, r]))

const normalize = (raw) =>
  (raw ?? '').replace(/[.\t]/g, ' ').trim().toUpperCase().replace(/\s+/g, ' ')

// → { kind:'cell', rack } | { kind:'zone', zone } | { kind:'unracked' }
function classify(code) {
  if (!code) return { kind: 'unracked' }

  const g = GROUND_RE.exec(code)
  if (g) {
    const rack = rackByName.get(g[1])
    const level = parseInt(g[2], 10)
    const col = g[3].charCodeAt(0) - 65
    if (rack && rack.floor === 'ground' && level >= 1 && level <= rack.levels && col < rack.cols)
      return { kind: 'cell', rack: rack.name }
    return { kind: 'zone', zone: 'OTHER' }
  }

  const f = FIRST_RE.exec(code)
  if (f) {
    const rack = rackByName.get(f[1])
    const shelf = parseInt(f[2], 10)
    if (rack && rack.floor === 'first' && shelf >= 1 && shelf <= rack.shelves)
      return { kind: 'cell', rack: rack.name }
    return { kind: 'zone', zone: 'OTHER' }
  }

  if (/^(PLT|PTL|PLR|PLY)/.test(code)) return { kind: 'zone', zone: 'PALLETS' }
  if (code.startsWith('CAG')) return { kind: 'zone', zone: 'CAGES' }
  if (code.startsWith('CSD')) return { kind: 'zone', zone: 'CSD' }
  if (code.startsWith('ROOM')) return { kind: 'zone', zone: 'ROOM' }
  if (code.startsWith('BOX')) return { kind: 'zone', zone: 'BOX' }
  if (code.startsWith('WL')) return { kind: 'zone', zone: 'WL' }
  return { kind: 'zone', zone: 'OTHER' }
}

const ZONE_LABELS = {
  PALLETS: 'Pallets', CAGES: 'Cages', CSD: 'CSD', ROOM: 'Room',
  BOX: 'Boxes', WL: 'WL', OTHER: 'Other / unparsed',
}

async function main() {
  loadEnv()

  const pool = await new sql.ConnectionPool({
    server: process.env.MSSQL_MANILAL_HOST,
    port: parseInt(process.env.MSSQL_MANILAL_PORT || '1433'),
    user: process.env.MSSQL_MANILAL_USER,
    password: process.env.MSSQL_MANILAL_PASSWORD,
    database: process.env.MSSQL_MANILAL_DATABASE,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    connectionTimeout: 20000,
    requestTimeout: 180000,
  }).connect()

  const req = pool.request()
  req.input('CMPCODE', sql.VarChar(3), '01')
  req.input('CITYCODE', sql.VarChar(3), 'MUM')
  const { recordset } = await req.query(STOCK_SQL)
  await pool.close()

  // per-rack rollup: bins in use, units, distinct EANs
  const rackRoll = new Map(RACKS.map(r => [r.name, { bins: new Set(), units: 0, eans: new Set() }]))
  const floorEans = new Map(FLOORS.map(f => [f.id, new Set()])) // per-floor, deduped
  const zoneRoll = new Map()
  let unrackedUnits = 0, unrackedRows = 0
  let totalUnits = 0
  const totalEans = new Set()

  for (const row of recordset) {
    const units = row.avail ?? 0
    totalUnits += units
    if (row.EAN) totalEans.add(row.EAN)

    const code = normalize(row.rackNo)
    const c = classify(code)

    if (c.kind === 'cell') {
      const roll = rackRoll.get(c.rack)
      roll.bins.add(code)
      roll.units += units
      if (row.EAN) {
        roll.eans.add(row.EAN)
        floorEans.get(rackByName.get(c.rack).floor).add(row.EAN)
      }
    } else if (c.kind === 'zone') {
      let z = zoneRoll.get(c.zone)
      if (!z) { z = { bins: new Set(), units: 0, eans: new Set() }; zoneRoll.set(c.zone, z) }
      z.bins.add(code)
      z.units += units
      if (row.EAN) z.eans.add(row.EAN)
    } else {
      unrackedUnits += units
      unrackedRows++
    }
  }

  // bins beyond the nominal 2-per-shelf (a "C" side squeezed in) still count as capacity
  const racks = RACKS.map(r => {
    const roll = rackRoll.get(r.name)
    const bins = roll.bins.size
    const capacity = Math.max(r.locations, bins)
    return {
      name: r.name,
      floor: r.floor,
      bays: r.bays,
      levels: r.levels,
      shelves: r.shelves,
      capacity,
      bins,
      units: roll.units,
      eans: roll.eans.size,
      pct: capacity ? Math.min(100, Math.round((bins / capacity) * 100)) : 0,
    }
  })

  const floors = FLOORS.map(f => {
    const rs = racks.filter(r => r.floor === f.id)
    const bins = rs.reduce((s, r) => s + r.bins, 0)
    const capacity = rs.reduce((s, r) => s + r.capacity, 0)
    return {
      id: f.id,
      label: f.label,
      short: f.short,
      racksTotal: rs.length,
      racksUsed: rs.filter(r => r.bins > 0).length,
      shelves: rs.reduce((s, r) => s + r.shelves, 0),
      capacity,
      bins,
      pct: capacity ? Math.min(100, Math.round((bins / capacity) * 100)) : 0,
      units: rs.reduce((s, r) => s + r.units, 0),
      eans: floorEans.get(f.id).size, // deduped — an EAN split across racks counts once
      racksIdle: rs.filter(r => r.bins === 0).map(r => r.name),
    }
  })

  const zones = [...zoneRoll.entries()]
    .map(([zone, z]) => ({
      zone, label: ZONE_LABELS[zone] ?? zone,
      locations: z.bins.size, units: z.units, eans: z.eans.size,
    }))
    .sort((a, b) => b.units - a.units)

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    totals: {
      units: totalUnits,
      eans: totalEans.size,
      rows: recordset.length,
      racks: racks.length,
      shelves: racks.reduce((s, r) => s + r.shelves, 0),
      capacity: racks.reduce((s, r) => s + r.capacity, 0),
      bins: racks.reduce((s, r) => s + r.bins, 0),
      rackedUnits: racks.reduce((s, r) => s + r.units, 0),
    },
    floors,
    racks,
    zones,
    unracked: { units: unrackedUnits, rows: unrackedRows },
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2))

  const pct = Math.round((snapshot.totals.bins / snapshot.totals.capacity) * 100)
  console.log(`snapshot → ${OUT}`)
  console.log(`  units ${snapshot.totals.units.toLocaleString()} · EANs ${snapshot.totals.eans.toLocaleString()}`)
  console.log(`  bins  ${snapshot.totals.bins.toLocaleString()}/${snapshot.totals.capacity.toLocaleString()} (${pct}%)`)
  for (const f of snapshot.floors)
    console.log(`  ${f.short}: racks ${f.racksUsed}/${f.racksTotal} · bins ${f.bins.toLocaleString()}/${f.capacity.toLocaleString()} (${f.pct}%) · units ${f.units.toLocaleString()}`)
  console.log(`  zones: ${zones.map(z => `${z.label} ${z.units.toLocaleString()}`).join(' · ')}`)
  console.log(`  unracked: ${unrackedUnits.toLocaleString()} units in ${unrackedRows} rows`)
}

main().catch(err => { console.error(err.message); process.exit(1) })
