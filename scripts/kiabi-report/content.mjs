// All wording for the KIABI warehouse project report deck lives here.
// Edit this file, rerun build-deck.mjs — nothing else needs touching.

// ── ⚠ CONFIRM BEFORE SENDING ─────────────────────────────────────────────────
// Nakul's 27-Jul instruction: "we will have to add the approval was given for
// 50% of the cartons". The exact scope of that approval was never spelled out,
// so it is NOT written into the deck as a claim. Replace the text below with the
// agreed wording; while it still starts with "[TO CONFIRM]" the build prints a
// warning and the slide renders it in red so it cannot go out unnoticed.
export const APPROVAL_50PCT =
  '[TO CONFIRM] Approval was given for 50% of the cartons.'

export const MEETING = {
  title: 'Warehouse Racking & Operations Report',
  subtitle: 'Completion status, floor layout and goods flow',
  site: 'Seaport Logistics Warehouse — Mumbai, India',
  preparedFor: 'Prepared for  ·  KIABI Retail International',
  preparedBy: 'Prepared by  ·  Manilal & Sons (Bombay) LLP',
}

// Ground-level operations flow, as circulated by Nakul Tanna on 30-Jul-2026.
export const PROCESS = [
  { t: 'Goods In',            d: 'Containers received and unloaded at Dock Level A.' },
  { t: 'Pallet Rack Alley',   d: 'Loose cartons staged on empty pallets in the Pallet Rack Alley (PRA).' },
  { t: 'Goods Receipt',       d: 'Inward GRN activity carried out in the PRA zone; cartons counted and booked in.' },
  { t: 'To Working Cage',     d: 'Pallets moved into the sorting and working cage.' },
  { t: 'Sort & Label',        d: 'Items sorted, labelled and barcoded at the working tables.' },
  { t: 'Put to Rack',         d: 'Labelled goods put away into their fixed bin locations on both floors.' },
  { t: 'Order from ITFAS',    d: 'Purchase order received from ITFAS triggers the picking list.' },
  { t: 'Pick from Rack',      d: 'Items picked bin-by-bin against the order; stock balance updates live.' },
  { t: 'Pack at Exit Room',   d: 'Goods moved to the exit store room for outward packing and checking.' },
  { t: 'Dispatch Out',        d: 'Consignment dispatched from Dock Level C exit.' },
]

export const ADDRESSING = {
  heading: 'Every item sits at a named address',
  body: [
    'Each shelf carries two fixed bins. Each bin is labelled and barcoded, and that label is the address the system stores against the stock.',
    'Because the address is captured at put-away, any EAN can be traced to a floor, a rack, a level and a side — and the picker is sent straight to it.',
  ],
  example: 'GD08A',
  legend: [
    ['GD', 'Rack GD'],
    ['08', 'Level 08'],
    ['A',  'Bin position A'],
  ],
  note: 'Ground floor bins read rack → level → position (GD08A). First floor bins read rack → shelf → side (H24A).',
}

export const DASHBOARD = {
  heading: 'Real-time stock dashboard',
  intro: 'The online dashboard shared with the KIABI team reads the warehouse live — no manual reporting cycle.',
  features: [
    'Stock on hand by EAN, SKU, size, colour and container',
    'Rack and bin occupancy for both floors, rack by rack',
    'Inward GRN, purchase orders, dispatch and returns',
    'MRP verification against the declared price file',
    'Excel export of the full shipment-wise stock statement',
  ],
}

// Photo captions. Keyed by file name in ./photos.
export const CAPTIONS = {
  'gf-dock-cage.jpeg':             'Ground floor inward area — dock shutter, marked floor lane and the enclosed working cage on the left.',
  'sorting-labelling-station.jpeg':'Working cage — sorting, labelling and packing station with barcode printer.',
  'gf-rack-gd.jpeg':               'Ground floor, Rack GD — every bin labelled and barcoded (GD03B … GD11C).',
  'gf-rack-gc.jpeg':               'Ground floor, Rack GC — garments stored loose in open bins, no cartons.',
  'gf-rack-gc-wide.jpeg':          'Ground floor, Rack GC in full elevation — 11 levels, bins addressed GC04A upward.',
  'gf-aisle-ge-gf.jpeg':           'Ground floor aisle between Racks GE and GF, with overhead rack signage.',
  'l1-aisle-g-h.jpeg':             'First floor aisle between Racks G and H.',
  'l1-rack-j.jpeg':                'First floor, Rack J — bins J03A to J07A, stock unpacked and shelf-ready.',
  'l1-rack-j-wide.jpeg':           'First floor, Rack J elevation — two labelled bins per shelf.',
  'l1-rack-n.jpeg':                'First floor, Rack N — full rack elevation with aisle signage.',
  'l1-aisle-lmno.jpeg':            'First floor aisles L, M, N and O.',
  'l1-racks-cd-floor.jpeg':        'First floor, Racks C and D with the clear working aisle alongside.',
  'l1-empty-shelving-room.jpeg':   'Side room with free-standing shelving held for slow-moving and damaged stock.',
}

// Anything still open — stated plainly rather than glossed over.
export const NEXT_STEPS = [
  { t: 'Ground floor racks GK–GN',
    d: 'Four ground floor racks are erected and empty, held as headroom for the next intake.' },
  { t: 'Dead stock zone to be marked',
    d: 'A dedicated, signed area for damaged and dead stock is to be demarcated and photographed.' },
  { t: 'Balance put-away',
    d: 'Remaining loose stock to be binned so that no saleable pieces sit in cartons.' },
  { t: 'Floor layout drawing',
    d: 'A to-scale floor plan of both levels to follow, alongside this rack schematic.' },
]
