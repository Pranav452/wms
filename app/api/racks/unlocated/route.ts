import { NextRequest, NextResponse } from 'next/server'
import { getPool, sql } from '@/lib/db'

// Full-detail feed for stock sitting without a rack number — the export behind
// the "No location" drawer. Same available-qty maths as /api/racks/stock (GRN −
// issued + returned per EAN + container; the stored currentstock column has
// drifted and the ERP never reads it), plus the receipt trail that explains
// WHY a line was never put away: GRN no/date, container, who keyed the GRN,
// the rack the GRN itself carried, and whether the EAN ever had a rack at all.
//
// rackNo is free text typed at put-away; "no location" means blank, or the
// literal strings 'null' / 'na' / '-' / '0' that operators leave behind.
const BLANK = `(
  LTRIM(RTRIM(ISNULL(S.rackNo, ''))) = ''
  OR LOWER(LTRIM(RTRIM(S.rackNo))) IN ('null', 'na', 'n/a', '-', '0', '.')
)`

const UNLOCATED_SQL = `
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
  GROUP BY EAN, CONTAINERNO),
-- latest GRN line for the EAN + container, so each stock row carries its receipt.
-- GRNDATE_DT is unpopulated on ~46% of masters; GRNDATE is dd/MM/yyyy text and
-- MAKERDT (keying time) is the last resort.
GRNINFO AS (
  SELECT D.EAN, M.CONTAINERNO,
         M.GRNNO, M.ORDERNO, M.MAKERID, M.MAKERDT, M.MAKERIP,
         M.RackShlno, M.SHIPMENTTYPE, M.GRNTYPE, M.BOXNO,
         -- server predates TRY_CONVERT, so the dd/MM/yyyy text is reassembled
         -- into yyyymmdd and only converted when it validates
         GRNDATE = COALESCE(
           M.GRNDATE_DT,
           CASE WHEN LEN(RTRIM(ISNULL(M.GRNDATE, ''))) = 10
                 AND ISDATE(SUBSTRING(M.GRNDATE, 7, 4) + SUBSTRING(M.GRNDATE, 4, 2) + SUBSTRING(M.GRNDATE, 1, 2)) = 1
                THEN CONVERT(date, SUBSTRING(M.GRNDATE, 7, 4) + SUBSTRING(M.GRNDATE, 4, 2) + SUBSTRING(M.GRNDATE, 1, 2), 112)
           END,
           CAST(M.MAKERDT AS date)),
         GRNRACK = D.Rackno,
         rn = ROW_NUMBER() OVER (PARTITION BY D.EAN, M.CONTAINERNO ORDER BY M.MAKERDT DESC, M.ID DESC)
  FROM TBL_IMP_WMS_GRN_DTLS D
  INNER JOIN TBL_IMP_WMS_GRN_MASTER M ON M.GRNNO = D.GRNNO)
SELECT
  ean          = S.EAN,
  sku          = S.SKU,
  itemCode     = S.ItemCode,
  itemName     = S.ItemName,
  size         = S.Size,
  color        = S.color,
  origin       = S.ORIGINCOUNTRY,
  containerNo  = S.containerno,
  rackNoRaw    = S.rackNo,
  avail        = ISNULL(G.QTY, 0) - ISNULL(I.QTY, 0) + ISNULL(R.QTY, 0),
  recd         = ISNULL(G.QTY, 0),
  iss          = ISNULL(I.QTY, 0),
  rtn          = ISNULL(R.QTY, 0),
  storedStock  = S.currentstock,
  poNo         = S.PONO,
  supplier     = S.FK_SUPCODE,
  grnNo        = GI.GRNNO,
  grnDate      = GI.GRNDATE,
  grnOrderNo   = GI.ORDERNO,
  grnBoxNo     = GI.BOXNO,
  grnShipType  = GI.SHIPMENTTYPE,
  grnType      = GI.GRNTYPE,
  grnUser      = GI.MAKERID,
  grnEnteredAt = GI.MAKERDT,
  grnUserIp    = GI.MAKERIP,
  -- GRN-side rack columns are placeholder '0' on almost every line; only a real
  -- code counts as "a rack was recorded at receipt"
  grnRack      = NULLIF(NULLIF(LTRIM(RTRIM(ISNULL(GI.GRNRACK, ''))), ''), '0'),
  grnHdrRack   = NULLIF(NULLIF(LTRIM(RTRIM(ISNULL(GI.RackShlno, ''))), ''), '0'),
  daysSinceGrn = DATEDIFF(day, GI.GRNDATE, GETDATE()),
  lastRack     = H.rackno,
  lastRackAt   = H.makerdt,
  lastRackUser = H.makerid
FROM WMS_ITEM_STOCK_MASTER_COMMON_CONTR S
LEFT JOIN GRN G ON G.EAN = S.EAN AND G.CONTAINERNO = S.containerno
LEFT JOIN ISS I ON I.EAN = S.EAN AND I.CONTAINERNO = S.containerno
LEFT JOIN RTN R ON R.EAN = S.EAN AND R.CONTAINERNO = S.containerno
LEFT JOIN GRNINFO GI ON GI.EAN = S.EAN AND GI.CONTAINERNO = S.containerno AND GI.rn = 1
-- last rack this EAN ever held, from the put-away audit trail
OUTER APPLY (
  SELECT TOP 1 h.rackno, h.makerdt, h.makerid
  FROM wms_item_ean_rackno_history h
  WHERE h.ean = S.EAN
    AND LTRIM(RTRIM(ISNULL(h.rackno, ''))) <> ''
    AND LOWER(LTRIM(RTRIM(h.rackno))) <> 'null'
  ORDER BY h.makerdt DESC) H
WHERE S.Cmpcode = @CMPCODE AND S.Citycode = @CITYCODE
  AND ISNULL(G.QTY, 0) - ISNULL(I.QTY, 0) + ISNULL(R.QTY, 0) > 0
  AND ${BLANK}
ORDER BY GI.GRNDATE ASC, S.EAN`

export interface UnlocatedRow {
  ean: string | null
  sku: string | null
  itemCode: string | null
  itemName: string | null
  size: string | null
  color: string | null
  origin: string | null
  containerNo: string | null
  rackNoRaw: string | null
  avail: number
  recd: number
  iss: number
  rtn: number
  storedStock: number | null
  poNo: string | null
  supplier: string | null
  grnNo: string | null
  grnDate: string | null
  grnOrderNo: string | null
  grnBoxNo: number | null
  grnShipType: string | null
  grnType: string | null
  grnUser: number | null
  grnEnteredAt: string | null
  grnUserIp: string | null
  grnRack: string | null
  grnHdrRack: string | null
  daysSinceGrn: number | null
  lastRack: string | null
  lastRackAt: string | null
  lastRackUser: number | null
  reason: string
}

// Plain-English diagnosis of why the line has no bin. Order matters: the
// strongest evidence wins.
function diagnose(r: UnlocatedRow): string {
  const rawTyped = (r.rackNoRaw ?? '').trim()
  const grnRack = r.grnRack ?? r.grnHdrRack
  if (rawTyped && !['null', 'na', 'n/a', '-', '0', '.'].includes(rawTyped.toLowerCase()))
    return `Unusable rack value "${rawTyped}" typed at put-away`
  if (r.lastRack) {
    const when = r.lastRackAt ? ` on ${String(r.lastRackAt).slice(0, 10)}` : ''
    return `Was in rack ${r.lastRack}${when}, then the rack was cleared`
  }
  if (grnRack) return `Rack ${grnRack} was written on the GRN but never saved on the stock line`
  if (!r.grnNo) return 'No matching GRN for this EAN + container — receipt trail broken'
  if ((r.daysSinceGrn ?? 0) > 30) return `Received ${r.daysSinceGrn} days ago, never put away`
  return 'Received recently — put-away not done yet'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cmpcode = searchParams.get('cmpcode') || '01'
  const citycode = searchParams.get('citycode') || 'MUM'

  try {
    const pool = await getPool()
    const request = pool.request()
    request.input('CMPCODE', sql.VarChar(3), cmpcode)
    request.input('CITYCODE', sql.VarChar(3), citycode)

    const result = await request.query(UNLOCATED_SQL)
    const rows = (result.recordset as UnlocatedRow[]).map(r => ({ ...r, reason: diagnose(r) }))

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      totals: {
        rows: rows.length,
        units: rows.reduce((s, r) => s + (r.avail ?? 0), 0),
        eans: new Set(rows.map(r => r.ean)).size,
        containers: new Set(rows.map(r => r.containerNo).filter(Boolean)).size,
      },
      rows,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
