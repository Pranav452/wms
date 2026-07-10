import { NextRequest, NextResponse } from 'next/server'
import { getPool, sql } from '@/lib/db'
import { buildRackStock, type RawStockRow } from '@/lib/rackstock'

// Available qty is COMPUTED the way the ERP does it (GRN − issued + returned
// per EAN + container). The table's currentstock column has drifted on ~780
// rows (e.g. 48 stored vs 20 real) and the ERP's own screens never read it.
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
SELECT S.rackNo, S.EAN, S.SKU, S.ItemName, S.Size, S.color,
       grnqty = ISNULL(G.QTY, 0),
       issqty = ISNULL(I.QTY, 0),
       rtnqty = ISNULL(R.QTY, 0),
       avail  = ISNULL(G.QTY, 0) - ISNULL(I.QTY, 0) + ISNULL(R.QTY, 0),
       S.containerno
FROM WMS_ITEM_STOCK_MASTER_COMMON_CONTR S
LEFT JOIN GRN G ON G.EAN = S.EAN AND G.CONTAINERNO = S.containerno
LEFT JOIN ISS I ON I.EAN = S.EAN AND I.CONTAINERNO = S.containerno
LEFT JOIN RTN R ON R.EAN = S.EAN AND R.CONTAINERNO = S.containerno
WHERE S.Cmpcode = @CMPCODE AND S.Citycode = @CITYCODE
  AND ISNULL(G.QTY, 0) - ISNULL(I.QTY, 0) + ISNULL(R.QTY, 0) > 0`

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cmpcode  = searchParams.get('cmpcode')  || '01'
  const citycode = searchParams.get('citycode') || 'MUM'

  try {
    const pool    = await getPool()
    const request = pool.request()
    request.input('CMPCODE',  sql.VarChar(3), cmpcode)
    request.input('CITYCODE', sql.VarChar(3), citycode)

    const result = await request.query(STOCK_SQL)
    const data = buildRackStock(result.recordset as RawStockRow[])

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
