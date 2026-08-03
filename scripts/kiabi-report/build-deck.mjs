// Builds the KIABI warehouse project report deck.
//
//   node scripts/kiabi-report/snapshot.mjs     # refresh live figures
//   node scripts/kiabi-report/build-deck.mjs   # → out/KIABI-Warehouse-Report-<date>.pptx
//
// Photos live in ./photos, captions and all wording in ./content.mjs, live
// figures in ./data/snapshot.json. No number in the deck is typed by hand.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pptxgen from 'pptxgenjs'
import sharp from 'sharp'
import { APPROVAL_50PCT, MEETING, PROCESS, ADDRESSING, DASHBOARD, CAPTIONS, NEXT_STEPS } from './content.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PHOTOS = path.join(HERE, 'photos')
const CACHE = path.join(HERE, 'build', 'img')
const OUTDIR = path.join(HERE, 'out')

const snap = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'snapshot.json'), 'utf8'))

// ── palette: taken from the warehouse itself — amber bins, red rack signage,
// grey steel uprights ────────────────────────────────────────────────────────
const C = {
  ink:    '1F2933',
  ink80:  '3E4C59',
  muted:  '7B8794',
  line:   'D9DDE3',
  paper:  'FFFFFF',
  soft:   'F4F5F7',
  amber:  'E8A33D',
  amberD: 'B87A1C',
  amberL: 'FBF0DC',
  red:    'C0392B',
  redL:   'FBE9E7',
  green:  '2E7D5B',
}
const HEAD = 'Cambria'
const BODY = 'Calibri'
const W = 13.333
const H = 7.5
const M = 0.62

const fmt = (n) => Number(n).toLocaleString('en-IN')
const asOn = new Date(snap.fetchedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
const fileDate = new Date(snap.fetchedAt).toISOString().slice(0, 10)

const floor = (id) => snap.floors.find(f => f.id === id)
const GF = floor('ground')
const F1 = floor('first')

// ── image prep: downscale once, keep the deck emailable ──────────────────────
async function prepImages() {
  fs.mkdirSync(CACHE, { recursive: true })
  const files = fs.readdirSync(PHOTOS).filter(f => /\.(jpe?g|png)$/i.test(f))
  for (const f of files) {
    const out = path.join(CACHE, f.replace(/\.[^.]+$/, '.jpg'))
    if (fs.existsSync(out)) continue
    await sharp(path.join(PHOTOS, f))
      .rotate()
      .resize({ width: 1500, height: 1500, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(out)
  }
  return files
}
const img = (name) => path.join(CACHE, name.replace(/\.[^.]+$/, '.jpg'))

// ── building blocks ──────────────────────────────────────────────────────────
function titleBar(slide, title, kicker) {
  if (kicker) {
    slide.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: 10, h: 0.26, margin: 0,
      fontFace: BODY, fontSize: 11, bold: true, charSpacing: 1.6, color: C.amberD,
    })
  }
  slide.addText(title, {
    x: M, y: kicker ? 0.7 : 0.5, w: W - M * 2, h: 0.7, margin: 0,
    fontFace: HEAD, fontSize: 30, bold: true, color: C.ink,
  })
}

function footer(slide, label) {
  slide.addText(label, {
    x: M, y: H - 0.52, w: W - M * 2, h: 0.3, margin: 0,
    fontFace: BODY, fontSize: 9, color: C.muted,
  })
}

function card(slide, { x, y, w, h, fill = C.paper, line = C.line }) {
  slide.addShape('roundRect', {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: fill },
    line: { color: line, width: 0.75 },
  })
}

function statTile(slide, { x, y, w, value, label, sub, accent = C.amber }) {
  card(slide, { x, y, w, h: 1.55, fill: C.soft, line: C.line })
  slide.addText(value, {
    x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.62, margin: 0,
    fontFace: HEAD, fontSize: 30, bold: true, color: accent,
  })
  slide.addText(label, {
    x: x + 0.22, y: y + 0.8, w: w - 0.44, h: 0.28, margin: 0,
    fontFace: BODY, fontSize: 12, bold: true, color: C.ink,
  })
  if (sub) {
    slide.addText(sub, {
      x: x + 0.22, y: y + 1.06, w: w - 0.44, h: 0.36, margin: 0,
      fontFace: BODY, fontSize: 9.5, color: C.muted,
    })
  }
}

// horizontal fill bar
function bar(slide, { x, y, w, pct, h = 0.16, color = C.amber }) {
  slide.addShape('roundRect', {
    x, y, w, h, rectRadius: 0.5, fill: { color: C.line }, line: { type: 'none' },
  })
  const fillW = Math.max(0.08, (w * Math.min(100, pct)) / 100)
  slide.addShape('roundRect', {
    x, y, w: fillW, h, rectRadius: 0.5, fill: { color }, line: { type: 'none' },
  })
}

function photo(slide, name, { x, y, w, h, caption, capColor = C.muted }) {
  slide.addImage({ path: img(name), x, y, w, h, sizing: { type: 'cover', w, h } })
  if (caption !== false) {
    slide.addText(caption ?? CAPTIONS[name] ?? '', {
      x, y: y + h + 0.08, w, h: 0.42, margin: 0,
      fontFace: BODY, fontSize: 9.5, color: capColor,
    })
  }
}

function numberedStep(slide, { x, y, w, n, t, d }) {
  const h = 1.5
  card(slide, { x, y, w, h, fill: C.paper, line: C.line })
  slide.addShape('ellipse', {
    x: x + 0.22, y: y + 0.22, w: 0.44, h: 0.44,
    fill: { color: C.amber }, line: { type: 'none' },
  })
  slide.addText(String(n), {
    x: x + 0.22, y: y + 0.22, w: 0.44, h: 0.44, margin: 0,
    align: 'center', valign: 'middle', fontFace: BODY, fontSize: 13, bold: true, color: C.ink,
  })
  slide.addText(t, {
    x: x + 0.78, y: y + 0.24, w: w - 1.0, h: 0.4, margin: 0, valign: 'middle',
    fontFace: BODY, fontSize: 13, bold: true, color: C.ink,
  })
  slide.addText(d, {
    x: x + 0.24, y: y + 0.76, w: w - 0.48, h: 0.62, margin: 0,
    fontFace: BODY, fontSize: 10, color: C.ink80,
  })
}

// ── the deck ─────────────────────────────────────────────────────────────────
async function build() {
  await prepImages()

  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE'
  // pptxgenjs escapes core.xml but writes <Company> into app.xml raw — an "&"
  // here produces XML PowerPoint rejects and LibreOffice crashes on. Keep doc
  // properties ampersand-free; on-slide text is escaped normally.
  pres.author = 'Manilal and Sons (Bombay) LLP'
  pres.company = 'Manilal and Sons (Bombay) LLP'
  pres.title = MEETING.title.replace(/&/g, 'and')

  // 1 ── cover
  {
    const s = pres.addSlide()
    s.background = { color: C.ink }
    s.addImage({
      path: img('gf-aisle-ge-gf.jpeg'), x: 6.6, y: 0, w: W - 6.6, h: H,
      sizing: { type: 'cover', w: W - 6.6, h: H },
    })
    s.addText(MEETING.site.toUpperCase(), {
      x: M, y: 1.55, w: 5.6, h: 0.3, margin: 0,
      fontFace: BODY, fontSize: 11, bold: true, charSpacing: 1.6, color: C.amber,
    })
    s.addText(MEETING.title, {
      x: M, y: 2.0, w: 5.7, h: 2.0, margin: 0,
      fontFace: HEAD, fontSize: 40, bold: true, color: C.paper, lineSpacingMultiple: 1.05,
    })
    s.addText(MEETING.subtitle, {
      x: M, y: 4.0, w: 5.5, h: 0.5, margin: 0,
      fontFace: BODY, fontSize: 15, color: 'C7CDD4',
    })
    s.addText(
      [
        { text: MEETING.preparedFor, options: { breakLine: true } },
        { text: MEETING.preparedBy, options: { breakLine: true } },
        { text: `Position as on ${asOn}`, options: {} },
      ],
      { x: M, y: 5.35, w: 5.5, h: 1.1, margin: 0, fontFace: BODY, fontSize: 11, color: '9AA5B1', lineSpacingMultiple: 1.35 },
    )
    s.addNotes(`Live position pulled ${asOn}. Rebuild the deck to refresh every figure.`)
  }

  // 2 ── where we stand
  {
    const s = pres.addSlide()
    titleBar(s, 'Where the work stands today', 'Status')

    const intro =
      `Racking is erected and in use across both floors. ${fmt(snap.totals.bins)} bins of ` +
      `${fmt(snap.totals.capacity)} now hold stock, and ${fmt(snap.totals.rackedUnits)} of ` +
      `${fmt(snap.totals.units)} pieces sit at a named bin address — the balance is in the working ` +
      `cage and on pallets awaiting put-away.`
    s.addText(intro, {
      x: M, y: 1.55, w: W - M * 2, h: 0.6, margin: 0,
      fontFace: BODY, fontSize: 13, color: C.ink80, lineSpacingMultiple: 1.25,
    })

    const tileW = (W - M * 2 - 0.36 * 3) / 4
    const tiles = [
      { value: '2', label: 'Floors racked', sub: `${snap.totals.racks} racks · ${fmt(snap.totals.shelves)} shelves` },
      { value: `${Math.round((snap.totals.bins / snap.totals.capacity) * 100)}%`, label: 'Bins in use', sub: `${fmt(snap.totals.bins)} of ${fmt(snap.totals.capacity)} locations` },
      { value: fmt(snap.totals.units), label: 'Pieces in stock', sub: `${fmt(snap.totals.eans)} live EANs` },
      { value: `${Math.round((snap.totals.rackedUnits / snap.totals.units) * 100)}%`, label: 'Stock at a bin address', sub: 'traceable to floor, rack, level, side' },
    ]
    tiles.forEach((t, i) => statTile(s, { ...t, x: M + i * (tileW + 0.36), y: 2.35, w: tileW }))

    // approval note — red while the wording is unconfirmed
    const pending = APPROVAL_50PCT.startsWith('[TO CONFIRM]')
    card(s, { x: M, y: 4.25, w: W - M * 2, h: 0.95, fill: pending ? C.redL : C.amberL, line: pending ? C.red : C.amber })
    s.addText(APPROVAL_50PCT, {
      x: M + 0.28, y: 4.42, w: W - M * 2 - 0.56, h: 0.6, margin: 0, valign: 'middle',
      fontFace: BODY, fontSize: 13, bold: true, color: pending ? C.red : C.ink,
    })

    photo(s, 'l1-aisle-lmno.jpeg', { x: M, y: 5.5, w: 4.0, h: 1.42, caption: false })
    photo(s, 'gf-rack-gd.jpeg', { x: M + 4.2, w: 4.0, y: 5.5, h: 1.42, caption: false })
    photo(s, 'sorting-labelling-station.jpeg', { x: M + 8.4, y: 5.5, w: W - M * 2 - 8.4, h: 1.42, caption: false })
    footer(s, `Live position as on ${asOn}`)
  }

  // 3 ── floor by floor
  {
    const s = pres.addSlide()
    titleBar(s, 'Both floors, rack by rack', 'Capacity')

    const cw = (W - M * 2 - 0.5) / 2
    ;[[F1, M], [GF, M + cw + 0.5]].forEach(([f, x]) => {
      card(s, { x, y: 1.6, w: cw, h: 3.72, fill: C.paper, line: C.line })
      s.addText(f.label, {
        x: x + 0.3, y: 1.82, w: cw - 0.6, h: 0.4, margin: 0,
        fontFace: HEAD, fontSize: 20, bold: true, color: C.ink,
      })
      s.addText(`${f.racksUsed} of ${f.racksTotal} racks in use`, {
        x: x + 0.3, y: 2.24, w: cw - 0.6, h: 0.3, margin: 0,
        fontFace: BODY, fontSize: 11.5, color: C.muted,
      })
      bar(s, { x: x + 0.3, y: 2.72, w: cw - 0.6, pct: f.pct, h: 0.2 })
      s.addText(`${f.pct}% of bins filled`, {
        x: x + 0.3, y: 2.98, w: cw - 0.6, h: 0.3, margin: 0,
        fontFace: BODY, fontSize: 10.5, bold: true, color: C.amberD,
      })

      const rows = [
        ['Bins in use', `${fmt(f.bins)} / ${fmt(f.capacity)}`],
        ['Shelves', fmt(f.shelves)],
        ['Pieces stored', fmt(f.units)],
        ['Distinct EANs', fmt(f.eans)],
      ]
      rows.forEach(([k, v], i) => {
        const y = 3.48 + i * 0.44
        s.addText(k, { x: x + 0.3, y, w: cw * 0.55, h: 0.32, margin: 0, fontFace: BODY, fontSize: 11.5, color: C.ink80 })
        s.addText(v, { x: x + cw * 0.55, y, w: cw * 0.4 - 0.3, h: 0.32, margin: 0, align: 'right', fontFace: BODY, fontSize: 11.5, bold: true, color: C.ink })
      })
    })

    const idle = GF.racksIdle
    const note = idle.length
      ? `Ground floor racks ${idle.join(', ')} are erected and standing empty — spare capacity of ` +
        `${fmt(snap.racks.filter(r => idle.includes(r.name)).reduce((a, r) => a + r.capacity, 0))} bins for the next intake.`
      : 'Every erected rack on both floors is carrying stock.'
    card(s, { x: M, y: 5.55, w: W - M * 2, h: 1.32, fill: C.soft, line: C.line })
    s.addText(note, {
      x: M + 0.32, y: 5.78, w: W - M * 2 - 0.64, h: 0.4, margin: 0,
      fontFace: BODY, fontSize: 12.5, bold: true, color: C.ink,
    })
    s.addText(
      `Across both floors ${fmt(snap.totals.bins)} of ${fmt(snap.totals.capacity)} bin locations are ` +
      `carrying stock — ${Math.round((snap.totals.bins / snap.totals.capacity) * 100)}% of built capacity, ` +
      `leaving room to absorb the next season without further racking.`,
      { x: M + 0.32, y: 6.2, w: W - M * 2 - 0.64, h: 0.5, margin: 0,
        fontFace: BODY, fontSize: 11.5, color: C.ink80 },
    )
    footer(s, `Live position as on ${asOn}`)
  }

  // 4, 5 ── rack schematics
  const rackMap = (f, kicker) => {
    const s = pres.addSlide()
    titleBar(s, `${f.label} — rack layout and occupancy`, kicker)
    const racks = snap.racks.filter(r => r.floor === f.id)
    const cols = 4
    const gap = 0.3
    const cw = (W - M * 2 - gap * (cols - 1)) / cols
    const ch = 1.02
    racks.forEach((r, i) => {
      const x = M + (i % cols) * (cw + gap)
      const y = 1.72 + Math.floor(i / cols) * (ch + 0.22)
      const idle = r.bins === 0
      card(s, { x, y, w: cw, h: ch, fill: idle ? C.soft : C.paper, line: idle ? C.line : C.amber })
      s.addText(r.name, {
        x: x + 0.22, y: y + 0.14, w: 1.2, h: 0.38, margin: 0,
        fontFace: HEAD, fontSize: 17, bold: true, color: idle ? C.muted : C.ink,
      })
      s.addText(idle ? 'empty' : `${r.pct}%`, {
        x: x + cw - 1.42, y: y + 0.16, w: 1.2, h: 0.34, margin: 0, align: 'right',
        fontFace: BODY, fontSize: 12, bold: true, color: idle ? C.muted : C.amberD,
      })
      bar(s, { x: x + 0.22, y: y + 0.58, w: cw - 0.44, pct: r.pct, h: 0.13, color: idle ? C.line : C.amber })
      s.addText(`${fmt(r.bins)}/${fmt(r.capacity)} bins · ${fmt(r.units)} pcs`, {
        x: x + 0.22, y: y + 0.74, w: cw - 0.44, h: 0.24, margin: 0,
        fontFace: BODY, fontSize: 9, color: C.muted,
      })
    })
    s.addText(
      'Schematic rack inventory and live fill — not a to-scale floor plan. Each rack carries 11 levels ' +
      '(Rack I: 8) with two labelled bins per shelf.',
      { x: M, y: H - 0.95, w: W - M * 2, h: 0.4, margin: 0, fontFace: BODY, fontSize: 9.5, color: C.muted },
    )
    footer(s, `Live position as on ${asOn}`)
  }
  rackMap(F1, 'Floor layout')
  rackMap(GF, 'Floor layout')

  // 6 ── addressing
  {
    const s = pres.addSlide()
    titleBar(s, ADDRESSING.heading, 'Traceability')
    ADDRESSING.body.forEach((p, i) => {
      s.addText(p, {
        x: M, y: 1.62 + i * 0.86, w: 6.1, h: 0.8, margin: 0,
        fontFace: BODY, fontSize: 13, color: C.ink80, lineSpacingMultiple: 1.3,
      })
    })

    card(s, { x: M, y: 3.5, w: 6.1, h: 2.3, fill: C.soft, line: C.line })
    s.addText(ADDRESSING.example, {
      x: M + 0.3, y: 3.72, w: 3.0, h: 0.8, margin: 0,
      fontFace: HEAD, fontSize: 42, bold: true, color: C.ink,
    })
    ADDRESSING.legend.forEach(([k, v], i) => {
      const y = 4.62 + i * 0.36
      s.addText(k, { x: M + 0.3, y, w: 0.7, h: 0.3, margin: 0, fontFace: HEAD, fontSize: 13, bold: true, color: C.amberD })
      s.addText(v, { x: M + 1.05, y, w: 4.6, h: 0.3, margin: 0, fontFace: BODY, fontSize: 12, color: C.ink80 })
    })
    s.addText(ADDRESSING.note, {
      x: M, y: 5.95, w: 6.1, h: 0.6, margin: 0,
      fontFace: BODY, fontSize: 10, color: C.muted,
    })

    photo(s, 'gf-rack-gd.jpeg', { x: 7.1, y: 1.62, w: W - 7.1 - M, h: 4.93 })
  }

  // 7, 8 ── process flow
  {
    const chunks = [
      { kicker: 'Process flow · inbound', title: 'From dock to shelf', steps: PROCESS.slice(0, 6), start: 1,
        photos: ['gf-dock-cage.jpeg', 'sorting-labelling-station.jpeg'] },
      { kicker: 'Process flow · outbound', title: 'From order to dispatch', steps: PROCESS.slice(6), start: 7,
        photos: ['l1-rack-j.jpeg', 'gf-rack-gc.jpeg'] },
    ]
    for (const ch of chunks) {
      const s = pres.addSlide()
      titleBar(s, ch.title, ch.kicker)
      // 4 steps read better 2-up than as a 3-wide row with one orphan below
      const cols = ch.steps.length % 3 === 0 ? 3 : 2
      const gap = 0.3
      const cw = (W - M * 2 - gap * (cols - 1)) / cols
      ch.steps.forEach((st, i) => {
        const x = M + (i % cols) * (cw + gap)
        const y = 1.68 + Math.floor(i / cols) * 1.72
        numberedStep(s, { x, y, w: cw, n: ch.start + i, t: st.t, d: st.d })
      })
      const rowCount = Math.ceil(ch.steps.length / cols)
      const py = 1.68 + rowCount * 1.72 + 0.16
      const pw = (W - M * 2 - 0.3) / 2
      const ph = Math.max(1.0, H - 0.5 - py)
      ch.photos.forEach((p, i) => photo(s, p, { x: M + i * (pw + 0.3), y: py, w: pw, h: ph, caption: false }))
      s.addNotes('Flow as circulated by Nakul Tanna, 30-Jul-2026.')
    }
  }

  // 9-12 ── photo sections
  const photoSlide = ({ kicker, title, lead, big, small }) => {
    const s = pres.addSlide()
    titleBar(s, title, kicker)
    if (lead) {
      s.addText(lead, {
        x: M, y: 1.55, w: W - M * 2, h: 0.42, margin: 0,
        fontFace: BODY, fontSize: 12, color: C.ink80,
      })
    }
    const top = lead ? 2.08 : 1.68
    const bigW = 7.3
    const bigH = H - top - 0.95
    photo(s, big, { x: M, y: top, w: bigW, h: bigH })
    const sx = M + bigW + 0.3
    const sw = W - M - sx
    const sh = (bigH - 0.62) / 2
    small.forEach((p, i) => photo(s, p, { x: sx, y: top + i * (sh + 0.62), w: sw, h: sh }))
    return s
  }

  photoSlide({
    kicker: 'Ground floor', title: 'Inward, sorting and labelling',
    lead: 'Goods enter at the dock, are booked in at the pallet alley, then sorted and labelled inside the working cage before put-away.',
    big: 'gf-dock-cage.jpeg', small: ['sorting-labelling-station.jpeg', 'gf-aisle-ge-gf.jpeg'],
  })

  photoSlide({
    kicker: 'Ground floor', title: 'Racked storage — ground floor',
    lead: `${GF.racksUsed} racks carrying ${fmt(GF.units)} pieces across ${fmt(GF.bins)} labelled bins. Stock is shelved loose, not left in cartons.`,
    big: 'gf-rack-gc-wide.jpeg', small: ['gf-rack-gd.jpeg', 'gf-rack-gc.jpeg'],
  })

  photoSlide({
    kicker: 'First floor', title: 'Racked storage — first floor',
    lead: `All ${F1.racksTotal} racks in use, ${fmt(F1.bins)} bins filled with ${fmt(F1.units)} pieces across ${fmt(F1.eans)} EANs.`,
    big: 'l1-aisle-lmno.jpeg', small: ['l1-rack-j.jpeg', 'l1-rack-n.jpeg'],
  })

  photoSlide({
    kicker: 'First floor', title: 'Aisles, access and holding area',
    lead: 'Aisles are kept clear for picking trolleys and ladder access; a side room holds free-standing shelving for slow-moving and damaged stock.',
    big: 'l1-racks-cd-floor.jpeg', small: ['l1-aisle-g-h.jpeg', 'l1-empty-shelving-room.jpeg'],
  })

  // 13 ── dashboard
  {
    const s = pres.addSlide()
    titleBar(s, DASHBOARD.heading, 'Visibility')
    s.addText(DASHBOARD.intro, {
      x: M, y: 1.6, w: 6.3, h: 0.7, margin: 0,
      fontFace: BODY, fontSize: 13, color: C.ink80, lineSpacingMultiple: 1.25,
    })
    s.addText(
      DASHBOARD.features.map((f, i) => ({
        text: f,
        options: { bullet: true, breakLine: i < DASHBOARD.features.length - 1 },
      })),
      { x: M, y: 2.45, w: 6.3, h: 2.4, margin: 0, fontFace: BODY, fontSize: 12.5, color: C.ink80, paraSpaceAfter: 8 },
    )
    const tw = (6.3 - 0.3) / 2
    statTile(s, { x: M, y: 5.1, w: tw, value: fmt(snap.totals.units), label: 'Pieces tracked live', sub: `${fmt(snap.totals.eans)} EANs` })
    statTile(s, { x: M + tw + 0.3, y: 5.1, w: tw, value: fmt(snap.totals.bins), label: 'Bin locations in use', sub: `of ${fmt(snap.totals.capacity)} built` })
    photo(s, 'l1-rack-j-wide.jpeg', { x: 7.3, y: 1.6, w: W - 7.3 - M, h: 5.05 })
  }

  // 14 ── next steps
  {
    const s = pres.addSlide()
    titleBar(s, 'Remaining works and next steps', 'To close out')
    const cols = 2
    const gap = 0.36
    const cw = (W - M * 2 - gap) / cols
    NEXT_STEPS.forEach((n, i) => {
      const x = M + (i % cols) * (cw + gap)
      const y = 1.68 + Math.floor(i / cols) * 1.5
      card(s, { x, y, w: cw, h: 1.28, fill: C.paper, line: C.line })
      slideDot(s, x + 0.24, y + 0.26)
      s.addText(n.t, {
        x: x + 0.66, y: y + 0.2, w: cw - 0.9, h: 0.34, margin: 0, valign: 'middle',
        fontFace: BODY, fontSize: 13, bold: true, color: C.ink,
      })
      s.addText(n.d, {
        x: x + 0.24, y: y + 0.62, w: cw - 0.48, h: 0.56, margin: 0,
        fontFace: BODY, fontSize: 10.5, color: C.ink80,
      })
    })
    card(s, { x: M, y: 4.8, w: W - M * 2, h: 1.05, fill: C.amberL, line: C.amber })
    s.addText(
      `Both floors are racked, labelled and live on the stock dashboard as on ${asOn}. ` +
      'The points above are the balance items to close out.',
      { x: M + 0.3, y: 4.98, w: W - M * 2 - 0.6, h: 0.7, margin: 0, valign: 'middle',
        fontFace: BODY, fontSize: 12.5, color: C.ink },
    )
    const stripW = (W - M * 2 - 0.3 * 2) / 3
    ;['gf-aisle-ge-gf.jpeg', 'l1-rack-n.jpeg', 'gf-rack-gc.jpeg'].forEach((p, i) =>
      photo(s, p, { x: M + i * (stripW + 0.3), y: 5.98, w: stripW, h: 0.82, caption: false }))
    footer(s, `${MEETING.preparedBy}  ·  ${asOn}`)
  }

  fs.mkdirSync(OUTDIR, { recursive: true })
  const out = path.join(OUTDIR, `KIABI-Warehouse-Report-${fileDate}.pptx`)
  await pres.writeFile({ fileName: out })
  console.log(`deck → ${out}`)
  if (APPROVAL_50PCT.startsWith('[TO CONFIRM]'))
    console.log('WARNING: the 50%-of-cartons line is still placeholder text — edit APPROVAL_50PCT in content.mjs before sending.')
}

function slideDot(slide, x, y) {
  slide.addShape('ellipse', { x, y, w: 0.3, h: 0.3, fill: { color: C.amber }, line: { type: 'none' } })
}

build().catch(err => { console.error(err); process.exit(1) })
